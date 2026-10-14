"""Small, device-free safety/flow contracts; these are not emulator evidence."""
import contextlib
import importlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from attendance_fixture_guard import account_settings, smoke_mode, verify_release, verify_workflow


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40
        self.env = {"E2E_SMOKE_MODE": "attendance_fixture", "GITHUB_EVENT_NAME": "workflow_dispatch",
                    "GITHUB_REF": "refs/heads/main", "EXPECTED_MAIN_SHA": self.sha,
                    "GITHUB_SHA": self.sha, "RELEASE_TAG": "v3.8.3-build469"}

    def test_default_full_account_is_unchanged(self):
        env = {"E2E_AGENT_COMPANY": "ordinary", "E2E_AGENT_EMAIL": "ordinary-email", "E2E_AGENT_PASSWORD": "ordinary-password"}
        self.assertEqual(smoke_mode(env), "full")
        self.assertEqual(account_settings(env), ("ordinary", "ordinary-email", "ordinary-password"))
        verify_workflow(env, "")

    def test_owned_fixture_credentials_have_no_old_account_fallback(self):
        env = dict(self.env, E2E_AGENT_COMPANY="ordinary", E2E_AGENT_EMAIL="ordinary-email", E2E_AGENT_PASSWORD="ordinary-password")
        with self.assertRaisesRegex(ValueError, "^E2E_ATTENDANCE_ACCOUNT_REFUSED$"):
            account_settings(env)
        env.update(E2E_ATTENDANCE_COMPANY="mtm-attendance-phone",
                   E2E_ATTENDANCE_EMAIL="field@mtm-attendance-phone.example.invalid", E2E_ATTENDANCE_PASSWORD="test-only-value")
        self.assertEqual(account_settings(env)[2], "test-only-value")
        for key, value in (("E2E_ATTENDANCE_EMAIL", "office@mtm-attendance-phone.example.invalid"),
                           ("E2E_ATTENDANCE_COMPANY", "another-company"), ("E2E_ATTENDANCE_PASSWORD", "")):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "^E2E_ATTENDANCE_ACCOUNT_REFUSED$"):
                account_settings(dict(env, **{key: value}))

    def test_manual_current_reviewed_main_and_exact_release_required(self):
        verify_workflow(self.env, self.sha)
        for key, value in (("GITHUB_EVENT_NAME", "workflow_run"), ("GITHUB_REF", "refs/heads/codex/feature"),
                           ("EXPECTED_MAIN_SHA", ""), ("GITHUB_SHA", "b" * 40), ("RELEASE_TAG", ""),
                           ("RELEASE_TAG", "v3.8.3-build469\nunsafe"), ("E2E_SMOKE_MODE", "other")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_workflow(dict(self.env, **{key: value}), self.sha)
        with self.assertRaises(ValueError):
            verify_workflow(self.env, "b" * 40)

    def test_published_tag_commit_must_be_main_ancestor_with_matching_metadata(self):
        tag = self.env["RELEASE_TAG"]
        metadata = {"tagName": tag, "targetCommitish": self.sha, "isDraft": False,
                    "body": f"CI build of {self.sha} (branch main). SHA-256: fictional"}
        verify_release(metadata, tag, self.sha, True)
        for key, value in (("tagName", "v3.8.3-build468"), ("targetCommitish", "main"), ("isDraft", True),
                           ("body", "(branch main)"), ("body", f"CI build of {self.sha} (branch feature).")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_release(dict(metadata, **{key: value}), tag, self.sha, True)
        with self.assertRaises(ValueError):
            verify_release(metadata, tag, "b" * 40, True)
        with self.assertRaises(ValueError):
            verify_release(metadata, tag, self.sha, False)


class WalkTests(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()
        self.walk.AGENT_COMPANY = "test-company"
        self.walk.AGENT_EMAIL = "test-email"
        self.walk.AGENT_PASSWORD = "test-password"
        self.walk.SECRETS = ["test-company", "test-email", "test-password"]
        self.walk.EXPECTED_VERSION = "3.8.3"

    def run_walk(self, mode):
        self.walk.SMOKE_MODE = mode
        tabs = {name: name.title() for name in ("today", "calendar", "route", "tasks", "more", "clients", "places")}
        profile = {"logout": "Log out", "logoutMessage": "Confirm logout", "logoutConfirm": "Confirm"}
        ids = ["tenant-input", "tenant-continue", "login-email", "login-password", "login-submit", "more-action-Profile"]
        found = [{"resource-id": name, "text": name, "box": (0, 0, 10, 10)} for name in ids]
        found += [{"text": text, "box": (0, 0, 10, 10)} for text in [*tabs.values(), *profile.values(), "v3.8.3"]]
        tapped_ids, tapped_texts, typed = [], [], []

        def type_private(value):
            self.assertTrue(self.walk.private, "Privacy guard must precede company, email and password entry")
            typed.append(value)

        def wait(what, check, timeout, name):
            self.walk.record(bool(check(found)), what)
            return found

        with contextlib.ExitStack() as stack:
            for name, value in (("words", lambda _: profile), ("tab_captions", lambda: tabs),
                                ("nodes", lambda: (found, "private-ui")), ("type_text", type_private),
                                ("hide_keyboard", lambda: None), ("crash_line", lambda: ""),
                                ("screen_faults", lambda _: []), ("wait_for", wait),
                                ("scroll_until", lambda _: found), ("shell", lambda _: ""),
                                ("tap", lambda node: tapped_ids.append(node["resource-id"])),
                                ("tap_text", lambda _, text: tapped_texts.append(text) or True)):
                stack.enter_context(patch.object(self.walk, name, value))
            stack.enter_context(patch.object(self.walk.time, "sleep"))
            client_walk = stack.enter_context(patch.object(self.walk, "client_card_walk"))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            self.walk.signed_in_walk({}, {"invalidCredentialsHelp": "Rejected"})
            client_called = client_walk.called
        self.assertEqual(typed, ["test-company", "test-email", "test-password"])
        self.assertEqual(set(tapped_ids), set(ids))
        self.assertEqual(set(tapped_texts), {tabs[key] for key in ("calendar", "route", "clients", "tasks", "more", "today")} | {"Log out", "Confirm"})
        self.assertTrue(any(what == "After logging out the app is back at the way in" and ok for ok, what, _ in self.walk.results))
        return client_called

    def test_fixture_signs_in_walks_tabs_and_profile_then_logs_out_without_business_controls(self):
        self.assertFalse(self.run_walk("attendance_fixture"))
        self.assertEqual(sum(row[0] is None for row in self.walk.results), 2)
        self.assertFalse(any(row[0] is False for row in self.walk.results))

    def test_full_mode_still_calls_client_flow_and_does_not_skip_it(self):
        self.assertTrue(self.run_walk("full"))
        self.assertFalse(any(row[0] is None for row in self.walk.results))

    def test_full_mode_empty_client_list_is_still_failure(self):
        with patch.object(self.walk, "screen_copy", return_value={}), patch.object(self.walk, "nodes", return_value=([], "")), \
                patch.object(self.walk, "tap_text"), patch.object(self.walk, "wait_for"), patch.object(self.walk.time, "sleep"), \
                patch.object(self.walk, "app_words", return_value=frozenset()), \
                contextlib.redirect_stdout(io.StringIO()):
            self.walk.client_card_walk("Clients", [])
        self.assertEqual(self.walk.results, [(False, "The list shows the clients attached to the account", "0 on screen")])

    def test_private_evidence_never_captures_screen(self):
        self.walk.private = True
        with patch.object(self.walk.subprocess, "run") as run, patch.object(self.walk, "nodes") as nodes:
            self.walk.evidence("private")
        run.assert_not_called()
        nodes.assert_not_called()

    def test_not_run_is_neither_pass_nor_failure_and_report_redacts(self):
        self.walk.private = True
        with tempfile.TemporaryDirectory() as out, patch.object(self.walk, "OUT", out), \
                patch.object(self.walk, "adb", return_value=""), \
                patch.object(self.walk, "shell", side_effect=["123", "mCurrentFocus=com.mtmobileapp/MainActivity"]), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            self.walk.record(None, "Unexecuted client flow", "test-email")
            self.walk.record(True, "Authenticated control", "test-password")
            self.assertEqual(self.walk.finish(), 0)
            report = Path(out, "report.md").read_text()
            self.assertIn("| NOT_RUN | Unexecuted client flow | ••• |", report)
            self.assertIn("4 of 4 checks passed; 1 NOT_RUN", printed.getvalue())
            self.assertNotIn("test-password", report)
            self.assertNotIn("test-email", report)
            self.assertFalse(Path(out, "logcat.log").exists())


if __name__ == "__main__":
    unittest.main()
