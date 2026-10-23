"""Admission tests; these do not stand in for running the native journeys."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from xml.sax.saxutils import quoteattr

from route_field_guard import (
    FIXTURE_MARKER, FIXTURE_ORG, FIXTURE_SLUG, PACKAGE, agent_shell, auth_form, fixture_auth_form,
    verify_apk, verify_auth_preserved, verify_fixture, verify_fixture_case, verify_manager_case,
    verify_observation_window, verify_owner_task_case, verify_zeytun_qa_case, manager_shell, owner_permissions,
)


def xml_form(password="Password", package=PACKAGE, overlay=False):
    def node(rid, text="", secret=False):
        return (f'<node package={quoteattr(package)} resource-id={quoteattr(rid)} '
                f'text={quoteattr(text)} password="{str(secret).lower()}" selected="true"/>')
    return ('<hierarchy>' + node("login-tab-signin") + node("login-email", "saved@example.invalid")
            + node("login-password", password, True) + node("login-submit")
            + (node("app-choice") if overlay else "") + '</hierarchy>')


class OwnerPermissionTests(unittest.TestCase):
    def test_a_secondary_profile_grant_never_admits_the_owner(self):
        own = "User 0: installed=true\n  android.permission.CAMERA: granted=false, flags=[ USER_SET ]\n"
        secondary = "User 95: installed=true\n  android.permission.CAMERA: granted=true, flags=[ USER_SET ]\n"
        for text in (own + secondary, secondary + own):
            with self.subTest(order=text[:7]):
                result = owner_permissions(text)
                self.assertFalse(result["CAMERA"]["granted"])
                self.assertEqual(result["CAMERA"]["flags"], "[ USER_SET ]")

    def test_a_missing_owner_profile_is_refused(self):
        with self.assertRaisesRegex(ValueError, "RF_PERMISSION_PROFILE_UNAVAILABLE"):
            owner_permissions("User 95: installed=true\n  android.permission.CAMERA: granted=true")

    def test_missing_runtime_grants_are_never_inferred_from_requested_permissions(self):
        result = owner_permissions("requested permissions:\n  android.permission.CAMERA\nUser 0: installed=true\n")
        self.assertTrue(all(not value["granted"] and value["flags"] is None for value in result.values()))


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
    def fixture_form(self, host=FIXTURE_SLUG + ".leaddrivecrm.org", password="Password", package=PACKAGE):
        return xml_form(password).replace('</hierarchy>',
            f'<node package={quoteattr(package)} text={quoteattr(FIXTURE_SLUG)}/>'
            f'<node package={quoteattr(package)} text={quoteattr(host)}/></hierarchy>')

    def test_fixture_resume_requires_the_exact_owned_host(self):
        self.assertTrue(fixture_auth_form(self.fixture_form(), "Password")["passwordBlank"])
        for host in ("zeytun.leaddrivecrm.org", FIXTURE_SLUG + ".leaddrivecrm.org.other.invalid", ""):
            with self.subTest(host=host), self.assertRaisesRegex(ValueError, "RF_FIXTURE_AUTH_HOST_REFUSED"):
                fixture_auth_form(self.fixture_form(host), "Password")

    def test_fixture_resume_never_accepts_a_password_draft_or_foreign_tenant_label(self):
        for xml in (self.fixture_form(password="masked-secret"), self.fixture_form(password="••••"),
                    self.fixture_form(package="com.android.systemui")):
            with self.subTest(xml=xml), self.assertRaises(ValueError):
                fixture_auth_form(xml, "Password")

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


class ZeytunQaAdmissionTests(unittest.TestCase):
    def case(self):
        org = "cmu9ih71e01vbkpd4fvgjhlba"
        return {"version": 1, "marker": "rf-zeytun-qa-20261023-v1", "ownerAuthorized": True,
                "sourceSha": "a" * 40, "targetTenant": "zeytun", "organizationId": org,
                "agent": {"id": "test-agent", "name": "Test Agent", "email": "qa@example.invalid",
                          "organizationId": org, "role": "AGENT"},
                "nativeProfileBound": True, "ordinaryManagerWebBound": True,
                "createdViaWebsite": True, "browserRunId": "b" * 36,
                "customerName": "RF-E2E-ZEY-20261023 QA GPS",
                "customer": {"id": "test-place", "name": "RF-E2E-ZEY-20261023 QA GPS",
                             "organizationId": org, "assignedAgentIds": ["test-agent"]}}

    def test_website_qa_customer_and_existing_agent_context_are_admitted(self):
        verify_zeytun_qa_case(self.case(), "a" * 40)

    def test_other_tenants_roles_and_unverified_native_sessions_are_refused(self):
        for key, value in (("organizationId", FIXTURE_ORG), ("targetTenant", "other"),
                           ("nativeProfileBound", False), ("ordinaryManagerWebBound", False)):
            case = self.case(); case[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_zeytun_qa_case(case, "a" * 40)
        case = self.case(); case["agent"]["role"] = "MANAGER"
        with self.assertRaises(ValueError): verify_zeytun_qa_case(case, "a" * 40)

    def test_real_customers_outside_assignments_and_credential_input_are_refused(self):
        for change in ("name", "assignment", "provenance", "credentials"):
            case = self.case()
            if change == "name": case["customer"]["name"] = "Existing real customer"
            if change == "assignment": case["customer"]["assignedAgentIds"] = ["other-agent"]
            if change == "provenance": case["createdViaWebsite"] = False
            if change == "credentials": case["login"] = {"email": "qa@example.invalid"}
            with self.subTest(change=change), self.assertRaises(ValueError):
                verify_zeytun_qa_case(case, "a" * 40)


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


class FictionalNativeCaseTests(unittest.TestCase):
    def case(self):
        manifest, bootstrap = FixtureAdmissionTests().fixture()
        return {"version": 1, "marker": "rf-native-fictional-v1", "ownerAuthorized": True,
                "sourceSha": "a" * 40, "preparation": {"status": "PASS", "tenant": FIXTURE_SLUG,
                "artifactSha": "b" * 40, "users": 1, "agents": 3, "customers": 3},
                "manifest": manifest, "bootstrap": bootstrap,
                "login": {"email": "agent@route-field-acceptance.example.invalid", "password": "p" * 64},
                "expectedName": "RF QA fictional field employee", "companyName": "Route Field Native Acceptance (fictional)"}

    def test_generated_fixture_credentials_cannot_be_replaced_with_customer_access(self):
        case = self.case()
        verify_fixture_case(case, "a" * 40)
        for patch in ({"ownerAuthorized": False}, {"sourceSha": "c" * 40},
                      {"login": {"email": "actual@example.invalid", "password": "p" * 64}},
                      {"login": dict(case["login"], password=None)},
                      {"expectedName": "Actual employee"}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                verify_fixture_case(dict(case, **patch), "a" * 40)

    def test_operational_success_does_not_replace_the_fresh_server_identity_and_grant(self):
        case = self.case()
        for change in ("preparation", "principal", "capability", "tenant"):
            changed = deepcopy(case)
            if change == "preparation": changed["preparation"]["status"] = "FAIL"
            if change == "principal": changed["bootstrap"]["principal"]["id"] = "previous-agent"
            if change == "capability": changed["bootstrap"]["capabilities"] = []
            if change == "tenant": changed["bootstrap"]["tenant"]["id"] = "mtm-attendance-phone-v1"
            with self.subTest(change=change), self.assertRaises(ValueError):
                verify_fixture_case(changed, "a" * 40)


if __name__ == "__main__":
    unittest.main()
