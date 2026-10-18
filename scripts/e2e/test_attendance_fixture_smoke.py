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


def dump(*nodes):
    """A uiautomator dump of the app's window: (resource-id, text) per node, in tree order."""
    rows = "".join(f'<node index="0" text="{text}" resource-id="{rid}" class="android.view.ViewGroup" '
                   f'package="com.mtmobileapp" bounds="[0,{40 * at}][720,{40 * at + 40}]" />'
                   for at, (rid, text) in enumerate(nodes))
    return f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">{rows}</hierarchy>"


# The battery sheet as AppFeedbackHost draws it: the icon is a glyph of the
# icon font, the buttons keep their ask() index whatever order they are drawn in.
BATTERY_SHEET = dump(("app-choice-backdrop", ""), ("app-choice", ""), ("", "&#xf13b;"),
                     ("", "The phone may fall asleep"), ("", "The route would then be recorded with gaps."),
                     ("app-choice-button-1", ""), ("", "Open settings"), ("app-choice-button-0", ""), ("", "Not now"))
# The Route tab under it carries a card with the same title: not a question.
ROUTE_TAB = dump(("", "Route"), ("", "The phone may fall asleep"), ("", "Open settings"), ("", "Today"))


class AppQuestionTests(unittest.TestCase):
    """The app's own `ask()` sheet (battery since 3.11.32, location disclosure) is declined, never answered."""

    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))

    def run_nodes(self, screens, words):
        commands, screens = [], list(screens)

        def shell(command, **_):
            commands.append(command)
            return screens.pop(0) if command.startswith("uiautomator dump") else ""

        with patch.object(self.walk, "shell", shell), patch.object(self.walk.time, "sleep"), \
                patch.object(self.walk, "app_words", return_value=frozenset(words)), \
                contextlib.redirect_stdout(io.StringIO()) as printed:
            found, _ = self.walk.nodes()
        return found, [c for c in commands if not c.startswith("uiautomator dump")], printed.getvalue()

    def test_sheet_is_closed_with_back_and_named_by_its_title(self):
        words = {"Route", "Today", "The phone may fall asleep", "Open settings", "Not now"}
        found, commands, printed = self.run_nodes([BATTERY_SHEET, ROUTE_TAB], words)
        # BACK resolves ask() with its dismissValue — «Not now» — and no button is tapped.
        self.assertEqual(commands, ["input keyevent 4"])
        self.assertEqual(self.walk.asked_by_app, ["The phone may fall asleep"])
        self.assertIn("declined a question of the app («The phone may fall asleep»)", printed)
        self.assertTrue(self.walk.has_text(found, "Route"), "the walk goes on with the tab under the sheet")

    def test_the_tab_card_with_the_same_title_is_not_a_question(self):
        found, commands, _ = self.run_nodes([ROUTE_TAB], {"Route", "The phone may fall asleep", "Open settings"})
        self.assertEqual(commands, [])
        self.assertEqual(self.walk.asked_by_app, [])
        self.assertTrue(self.walk.has_text(found, "The phone may fall asleep"))

    def test_a_title_outside_the_app_words_is_never_printed(self):
        self.walk.private = True
        sheet = dump(("app-choice", ""), ("", "Customer 42 Ltd"), ("app-choice-button-0", ""))
        _, commands, printed = self.run_nodes([sheet, ROUTE_TAB], {"Route"})
        self.assertEqual(commands, ["input keyevent 4"])
        self.assertEqual(self.walk.asked_by_app, ["…"])
        self.assertNotIn("Customer 42", printed)

    def test_a_notice_is_not_a_question(self):
        notice = dump(("app-notice", ""), ("", "Saved"), ("", "Route"))
        _, commands, _ = self.run_nodes([notice], {"Route", "Saved"})
        self.assertEqual(commands, [])


if __name__ == "__main__":
    unittest.main()
