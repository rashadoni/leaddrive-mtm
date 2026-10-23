"""Admission tests; these do not stand in for running the native journeys."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from xml.sax.saxutils import quoteattr

from route_field_guard import (
    FIXTURE_MARKER, FIXTURE_ORG, FIXTURE_SLUG, PACKAGE, agent_shell, auth_form,
    verify_apk, verify_auth_preserved, verify_fixture, verify_manager_case,
    verify_observation_window, verify_owner_task_case, manager_shell,
)


def xml_form(password="Password", package=PACKAGE, overlay=False):
    def node(rid, text="", secret=False):
        return (f'<node package={quoteattr(package)} resource-id={quoteattr(rid)} '
                f'text={quoteattr(text)} password="{str(secret).lower()}" selected="true"/>')
    return ('<hierarchy>' + node("login-tab-signin") + node("login-email", "saved@example.invalid")
            + node("login-password", password, True) + node("login-submit")
            + (node("app-choice") if overlay else "") + '</hierarchy>')


class ApkAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.expected = {"package": PACKAGE, "versionCode": 1710, "apkSha256": "a" * 64,
                         "publishedSourceSha": "b" * 40}

    def test_installed_bytes_must_match_published_identity(self):
        verify_apk(self.expected, self.expected)
        for patch in ({"package": "com.leaddrive.attendance"}, {"versionCode": 1709},
                      {"apkSha256": "c" * 64}, {"apkSha256": "a" * 63}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                verify_apk(dict(self.expected, **patch), self.expected)

    def test_unpinned_source_and_malformed_version_are_refused(self):
        for patch in ({"publishedSourceSha": "main"}, {"publishedSourceSha": "b" * 40 + "\n"},
                      {"versionCode": True}, {"versionCode": "1710"}, {"apkSha256": "a" * 64 + "\n"}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                expected = dict(self.expected, **patch)
                verify_apk(expected, expected)


class AuthDraftTests(unittest.TestCase):
    def test_empty_and_placeholder_passwords_are_admitted(self):
        for value in ("", "Password"):
            self.assertTrue(auth_form(xml_form(value), "Password")["passwordBlank"])

    def test_passwords_masks_foreign_windows_and_overlays_are_refused(self):
        for xml in (xml_form("••••••••"), xml_form("some-real-password"),
                    xml_form(package="com.leaddrive.attendance"), xml_form(overlay=True),
                    xml_form().replace('</hierarchy>', '<node package="com.android.permissioncontroller"/></hierarchy>')):
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                auth_form(xml, "Password")

    def test_restored_email_and_original_form_selection_are_required(self):
        before = auth_form(xml_form(), "Password")
        verify_auth_preserved(before, deepcopy(before))
        for patch in ({"email": "another@example.invalid"}, {"passwordBlank": False}, {"signinSelected": "false"}):
            with self.subTest(patch=patch), self.assertRaisesRegex(ValueError, "^RF_AUTH_DRAFT_CHANGED$"):
                verify_auth_preserved(before, dict(before, **patch))


class FixtureAdmissionTests(unittest.TestCase):
    def fixture(self, role="AGENT"):
        principal = {"id": "rf-agent-v1" if role == "AGENT" else "rf-manager-v1", "role": role}
        manifest = {"marker": FIXTURE_MARKER, "organizationId": FIXTURE_ORG, "slug": FIXTURE_SLUG,
                    "principals": {role: principal["id"]}}
        bootstrap = {"tenant": {"id": FIXTURE_ORG}, "principal": principal,
                     "manifest": {"tenant": {"id": FIXTURE_ORG}, "principal": dict(principal),
                                  "modules": {"routeField": {"enabled": True}}},
                     "capabilities": ["FIELD_EXECUTE" if role == "AGENT" else "TEAM_READ"]}
        return manifest, bootstrap

    def test_agent_and_manager_require_their_own_server_grants(self):
        for role in ("AGENT", "MANAGER"):
            verify_fixture(*self.fixture(role), role)

    def test_time_fixture_and_customer_tenants_are_refused_even_with_right_role(self):
        for org in ("mtm-attendance-phone-v1", "customer", "", None):
            manifest, bootstrap = self.fixture()
            manifest["organizationId"] = org
            bootstrap["tenant"]["id"] = org
            bootstrap["manifest"]["tenant"]["id"] = org
            with self.subTest(org=org), self.assertRaises(ValueError):
                verify_fixture(manifest, bootstrap, "AGENT")

    def test_stale_other_user_or_incomplete_manifest_cannot_admit_a_role(self):
        for change in ("principal", "manifest-principal", "manifest-tenant", "capability", "role", "marker"):
            manifest, bootstrap = self.fixture()
            if change == "principal": bootstrap["principal"]["id"] = "another-user"
            if change == "manifest-principal": bootstrap["manifest"]["principal"]["id"] = "previous-session"
            if change == "manifest-tenant": bootstrap["manifest"]["tenant"]["id"] = "another-tenant"
            if change == "capability": bootstrap["capabilities"] = []
            if change == "role": bootstrap["principal"]["role"] = "ADMIN"
            if change == "marker": manifest["marker"] = "unowned"
            with self.subTest(change=change), self.assertRaises(ValueError):
                verify_fixture(manifest, bootstrap, "AGENT")

    def test_agent_role_and_field_capability_do_not_override_disabled_module(self):
        manifest, bootstrap = self.fixture()
        bootstrap["manifest"]["modules"]["routeField"]["enabled"] = False
        with self.assertRaisesRegex(ValueError, "^RF_ROUTE_MODULE_REFUSED$"):
            verify_fixture(manifest, bootstrap, "AGENT")


class SharedPhoneTests(unittest.TestCase):
    def test_time_final_ui_window_includes_the_whole_route_field_deadline(self):
        start = datetime(2026, 10, 23, 7, 48, 40, tzinfo=timezone.utc)
        progress = {"status": "RUNNING", "offlineAt": start.isoformat()}
        verify_observation_window(progress, start + timedelta(minutes=30))
        for now in (start + timedelta(hours=23, minutes=45), start + timedelta(hours=24, minutes=10)):
            with self.subTest(now=now), self.assertRaisesRegex(ValueError, "^RF_PROTECTED_UI_WINDOW$"):
                verify_observation_window(progress, now)
        verify_observation_window(progress, start + timedelta(hours=25))

    def test_ambiguous_timestamps_do_not_bypass_phone_coordination(self):
        with self.assertRaises(ValueError):
            verify_observation_window({"status": "RUNNING", "offlineAt": "2026-10-23T07:48:40"},
                                      datetime.now(timezone.utc))


class OwnerTaskTests(unittest.TestCase):
    def test_only_the_named_ui_created_test_task_can_be_started_or_completed(self):
        case = {"version": 1, "marker": "rf-owner-web-task-v1", "createdViaUi": True, "sourceSha": "a" * 40,
                "taskId": "fictional-task-1", "title": "RF-E2E-20261023-1301 CRM-mobile-CRM TEST",
                "result": "RF-E2E-20261023-1301 OK", "statusBefore": "PENDING", "browserRunId": "b" * 36}
        verify_owner_task_case(case, "a" * 40, "task-start")
        verify_owner_task_case(dict(case, statusBefore="IN_PROGRESS"), "a" * 40, "task-complete")
        for patch in ({"createdViaUi": False}, {"sourceSha": "c" * 40}, {"title": "ordinary customer task"},
                      {"taskId": "../other-task"}, {"result": "ordinary result"}, {"statusBefore": "COMPLETED"}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                verify_owner_task_case(dict(case, **patch), "a" * 40, "task-start")

    def test_agent_tabs_alone_do_not_prove_the_current_account_identity(self):
        ids = ''.join(f'<node package="{PACKAGE}" resource-id="guide-spot-tab.{tab}"/>'
                      for tab in ("Today", "Route", "Clients", "Tasks", "More"))
        xml = '<hierarchy>' + ids + '</hierarchy>'
        self.assertIsNone(agent_shell(xml, home_required=False))
        with self.assertRaisesRegex(ValueError, "^RF_HOME_IDENTITY_UNAVAILABLE$"):
            agent_shell(xml)


class ManagerSwitchTests(unittest.TestCase):
    def test_customer_account_switch_requires_owner_scope_and_reconciled_task(self):
        case = {"version": 1, "marker": "rf-owner-manager-switch-v1", "ownerAuthorized": True,
                "sourceSha": "a" * 40, "manager": {"id": "manager", "organizationId": "org", "role": "MANAGER",
                "name": "Fictional manager", "email": "manager@example.invalid"},
                "login": {"email": "manager@example.invalid", "password": "fictional-input"},
                "priorAgent": {"id": "agent", "organizationId": "org", "name": "Fictional agent"},
                "completedTask": {"id": "test-task", "agentId": "agent", "status": "COMPLETED", "version": 3,
                                  "title": "RF-E2E-20261023-1301 CRM-mobile-CRM TEST", "result": "RF-E2E-20261023-1301 OK"},
                "nonTestTasksUnchanged": True, "cleanSyncText": "Synced"}
        verify_manager_case(case, "a" * 40)
        for field, patch in [("ownerAuthorized", False), ("sourceSha", "b" * 40),
                             ("login", {"email": "other@example.invalid", "password": "fictional-input"}),
                             ("priorAgent", {"id": "agent", "organizationId": "other", "name": "Fictional agent"}),
                             ("completedTask", dict(case["completedTask"], status="IN_PROGRESS")),
                             ("completedTask", dict(case["completedTask"], title="ordinary task")),
                             ("cleanSyncText", None),
                             ("nonTestTasksUnchanged", False)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                verify_manager_case(dict(case, **{field: patch}), "a" * 40)

    def test_agent_or_foreign_windows_cannot_be_reported_as_manager_shell(self):
        def shell(tabs):
            return '<hierarchy>' + ''.join(f'<node package="{PACKAGE}" resource-id="guide-spot-tab.{tab}"/>'
                                           for tab in tabs) + '</hierarchy>'
        manager_shell(shell(("Team", "Planning", "Approvals", "More")))
        for xml in (shell(("Today", "Route", "Clients", "Tasks", "More")),
                    shell(("Team", "Planning", "Approvals", "More", "Tasks")),
                    shell(("Team", "Planning", "Approvals", "More")).replace('</hierarchy>',
                              '<node package="com.android.permissioncontroller"/></hierarchy>')):
            with self.assertRaises(ValueError):
                manager_shell(xml)


if __name__ == "__main__":
    unittest.main()
