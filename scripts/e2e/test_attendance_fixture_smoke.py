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
        # «Log out» is pressed as a button that stands whole, not through its words.
        logout = ", Log out"
        found += [{"clickable": "true", "content-desc": logout, "box": (0, 20, 10, 30)}, {"text": "Log out", "box": (0, 22, 10, 28)}]
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
                                ("tap", lambda node: tapped_ids.append(node.get("resource-id") or node["content-desc"])),
                                ("tap_text", lambda _, text: tapped_texts.append(text) or True)):
                stack.enter_context(patch.object(self.walk, name, value))
            stack.enter_context(patch.object(self.walk.time, "sleep"))
            client_walk = stack.enter_context(patch.object(self.walk, "client_card_walk"))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            self.walk.signed_in_walk({}, {"invalidCredentialsHelp": "Rejected"})
            client_called = client_walk.called
        self.assertEqual(typed, ["test-company", "test-email", "test-password"])
        self.assertEqual(set(tapped_ids), {*ids, logout})
        self.assertEqual(set(tapped_texts), {tabs[key] for key in ("calendar", "route", "clients", "tasks", "more", "today")} | {"Confirm"})
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
    """A uiautomator dump of the app's window: (resource-id, text[, other attributes]) per node, in tree order.

    Nodes are stacked 40 px apart unless their attributes give `bounds`.
    """
    rows = ""
    for at, node in enumerate(nodes):
        attrs = {"bounds": f"[0,{40 * at}][720,{40 * at + 40}]", **(node[2] if len(node) > 2 else {})}
        bounds = attrs.pop("bounds")
        rows += (f'<node index="0" text="{node[1]}" resource-id="{node[0]}" class="android.view.ViewGroup" '
                 + "".join(f'{key}="{value}" ' for key, value in attrs.items())
                 + f'package="com.mtmobileapp" bounds="{bounds}" />')
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
        # The real app_words() holds "" too (every `""` in the sources): run 39169379126
        # printed «» for the battery sheet, the text of the first empty container.
        words = {"", "Route", "Today", "The phone may fall asleep", "Open settings", "Not now"}
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


def tab(name, chosen):
    """A tab of the sign-in screen: its words are its content-desc, the chosen one is `selected`."""
    word = {"signin": "Sign in", "first": "First sign-in"}[name]
    return (f"login-tab-{name}", "", {"content-desc": word, "selected": "true" if chosen else "false"})


# The sign-in screen of 3.11.32 on a clean phone (run 39161991009, 05-sign-in-form):
# no `login-email` anywhere, which is where every run of that release stopped.
SCREENS = {
    "company": dump(("tenant-input", ""), ("tenant-continue", ""), ("", "Connect")),
    "first": dump(("", "Step 2 of 2"), ("", "test-company"), ("switch-tenant", ""), ("", "Sign in to the app"),
                  tab("signin", False), ("", "Sign in"), tab("first", True), ("", "First sign-in"),
                  ("login-code-step-phone", ""), ("", "WhatsApp number"), ("login-code-phone", "+994 "),
                  ("login-code-send", ""), ("", "Get a code in WhatsApp")),
    # The same tab with the keyboard the phone field opens (`autoFocus`), as in
    # run 39170988424, 05-sign-in-form: the window ends at y=1090 and «Get a
    # code», right under the field, is not in the dump at all.
    "first-typing": dump(("com.mtmobileapp:id/action_bar_root", "", {"bounds": "[0,48][720,1090]"}),
                         ("", "Step 2 of 2"), ("", "test-company"), ("switch-tenant", ""), ("", "Sign in to the app"),
                           tab("signin", False), ("", "Sign in"), tab("first", True), ("", "First sign-in"),
                           ("login-code-step-phone", "", {"bounds": "[82,714][638,1090]"}), ("", "WhatsApp number"),
                           ("login-code-phone", "+994 ", {"bounds": "[159,951][635,1059]"}),
                           ("android:id/navigationBarBackground", "", {"bounds": "[0,1552][720,1600]"})),
    # The same screen while LoginScreen still reads the saved account, and after a press on «Sign in».
    "signin": dump(("", "Step 2 of 2"), ("", "test-company"), ("switch-tenant", ""), ("", "Sign in to the app"),
                   tab("signin", True), ("", "Sign in"), tab("first", False), ("", "First sign-in"),
                   ("login-email", ""), ("login-password", ""), ("login-submit", ""), ("", "Sign in")),
    # Before 3.11.3 the form had no tabs.
    "old": dump(("", "Step 2 of 2"), ("login-email", ""), ("login-password", ""), ("login-submit", "")),
    "refused": dump(("", "Sign in to the app"), ("", "Rejected")),
}
AUTH = {"tabSignIn": "Sign in", "tabFirst": "First sign-in", "codePhoneLabel": "WhatsApp number",
        "codeStart": "Get a code in WhatsApp", "invalidCredentialsHelp": "Rejected"}


class Device:
    """The app as the walk reads it: one screen per dump, and the screen a tap on a test id leads to.

    `turns` is LoginScreen's late switch to «First sign-in» once the saved
    account reads empty: it happens after the first look, unless a tab was
    pressed before (`tabTouched`).

    `focus` names the screens whose field takes the focus as they appear
    (`autoFocus`): the keyboard opens, and the dump is the screen's
    «-typing» variant until BACK closes it. `backs` says what each BACK
    pressed: the keyboard, or — with none up — the screen, which a real
    phone would leave.
    """

    def __init__(self, screen, leads=(), turns=(), focus=()):
        self.screen, self.leads, self.turns, self.focus = screen, dict(leads), dict(turns), set(focus)
        self.taps, self.touched, self.backs = [], False, []
        self.keyboard = screen in self.focus

    def show(self, screen):
        if screen != self.screen and screen in self.focus:
            self.keyboard = True
        self.screen = screen

    def shell(self, command, **_):
        if command == "dumpsys input_method":
            return f"  mInputShown={'true' if self.keyboard else 'false'}\n"
        if command == "input keyevent 4":
            self.backs.append("keyboard" if self.keyboard else "screen")
            self.keyboard = False
            return ""
        if not command.startswith("uiautomator dump"):
            return ""
        shown = SCREENS[self.screen + "-typing" if self.keyboard and self.screen + "-typing" in SCREENS else self.screen]
        if self.screen in self.turns and not self.touched:
            self.show(self.turns[self.screen])
        return shown

    def tap(self, node):
        test_id = node.get("resource-id", "")
        self.taps.append(test_id)
        if test_id.startswith("login-tab-"):  # LoginScreen.openTab
            self.touched = True
            self.show(test_id.removeprefix("login-tab-"))
        self.show(self.leads.get((self.screen, test_id), self.screen))


class SignInTabsTests(unittest.TestCase):
    """Since 3.11.3 a clean phone opens the sign-in screen on «First sign-in»; the password form is a tab away."""

    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()
        self.walk.private = True  # no screenshots from a test
        self.clock = 0.0

    def tick(self):
        self.clock += 3
        return self.clock

    def on(self, device, *extra):
        def no_adb(*args, **_):
            raise AssertionError(f"a device-free test reached adb {args}")

        stack = contextlib.ExitStack()
        # A failed wait ends the walk through finish(), which reads the device.
        for name, value in (("shell", device.shell), ("tap", device.tap), ("crash_line", lambda: ""),
                            ("adb", no_adb), ("finish", lambda: 1),
                            ("app_words", lambda: frozenset([*AUTH.values(), "Step 2 of 2", "Sign in to the app", "Connect"])), *extra):
            stack.enter_context(patch.object(self.walk, name, value))
        stack.enter_context(patch.object(self.walk.time, "sleep"))
        stack.enter_context(patch.object(self.walk.time, "time", self.tick))
        stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        return stack

    def parsed(self, screen):
        with self.on(Device(screen)):
            return self.walk.nodes()[0]

    def test_the_build_is_known_to_have_the_tabs_from_its_own_sign_in_screen(self):
        # The real LoginScreen.tsx of this checkout (no E2E_REF), not a fixture.
        self.assertTrue(self.walk.has_sign_in_tabs())
        with patch.object(self.walk, "source_of", return_value='<TextInput testID="login-email" />'):
            self.assertFalse(self.walk.has_sign_in_tabs())

    def test_either_tab_is_the_sign_in_screen_and_the_company_step_is_not(self):
        for screen in ("first", "signin", "old"):
            with self.subTest(screen=screen):
                self.assertTrue(self.walk.sign_in_open(self.parsed(screen)))
        self.assertFalse(self.walk.sign_in_open(self.parsed("company")))

    def test_a_phone_on_first_sign_in_is_taken_to_the_password_form(self):
        device = Device("first")
        with self.on(device):
            found = self.walk.open_password_form("form", "")
        self.assertEqual(device.taps, ["login-tab-signin"])
        self.assertTrue(self.walk.by_id(found, "login-email"))
        self.assertEqual(self.walk.results, [(True, "form", "form shown")])

    def test_the_tab_is_pressed_even_when_the_form_is_up_for_a_moment(self):
        # Without the press the form would be gone by the next look.
        device = Device("signin", turns={"signin": "first"})
        with self.on(device):
            found = self.walk.open_password_form("form", "")
        self.assertEqual(device.taps, ["login-tab-signin"])
        self.assertTrue(self.walk.by_id(found, "login-email"))

    def test_a_build_without_tabs_goes_straight_to_the_form(self):
        device = Device("old")
        with self.on(device):
            self.walk.open_password_form("form", "")
        self.assertEqual(device.taps, [])
        self.assertEqual(self.walk.results, [(True, "form", "form shown")])

    def test_a_clean_phone_on_first_sign_in_is_recorded_in_the_apps_words_and_no_code_is_asked(self):
        device = Device("signin", turns={"signin": "first"})
        with self.on(device):
            self.walk.first_sign_in_checks(self.walk.nodes()[0], AUTH)
        self.assertEqual(self.walk.results, [
            (True, "The sign-in screen has the tabs «Sign in» and «First sign-in»", ""),
            (True, "A phone with no saved account opens on «First sign-in»", "«WhatsApp number» and «Get a code in WhatsApp»"),
        ])
        self.assertEqual(device.taps, [], "«Get a code» would send a WhatsApp message")

    def test_a_phone_field_that_opened_the_keyboard_is_read_with_the_keyboard_closed(self):
        # Run 39170988424: «First sign-in» chosen, and still a FAIL — the
        # keyboard hid «Get a code», so the step looked unfinished for 15 s.
        self.assertEqual(self.walk.first_sign_in_offered(self.parsed("first-typing"), AUTH), "")
        for start, turns in (("first", {}), ("signin", {"signin": "first"})):
            with self.subTest(start=start):
                self.walk.results.clear()
                device = Device(start, turns=turns, focus={"first"})
                with self.on(device):
                    self.walk.first_sign_in_checks(self.walk.nodes()[0], AUTH)
                self.assertEqual(self.walk.results[-1], (
                    True, "A phone with no saved account opens on «First sign-in»",
                    "«WhatsApp number» and «Get a code in WhatsApp», read with the keyboard closed"))
                self.assertEqual(device.backs, ["keyboard"], "one BACK, for the keyboard: with none up it leaves the screen")
                self.assertEqual(device.taps, [], "«Get a code» would send a WhatsApp message")

    def test_a_phone_that_stays_on_sign_in_is_a_failure_that_names_the_tab(self):
        device = Device("signin")
        with self.on(device):
            self.walk.first_sign_in_checks(self.walk.nodes()[0], AUTH)
        ok, what, detail = self.walk.results[-1]
        self.assertFalse(ok)
        self.assertEqual(what, "A phone with no saved account opens on «First sign-in»")
        self.assertTrue(detail.startswith("chosen tab: «Sign in»; on screen: "), detail)
        self.assertNotIn("test-company", detail)
        self.assertEqual(device.backs, [], "no keyboard was up, so BACK would have left the sign-in screen")

    def test_the_field_account_types_its_email_only_on_the_password_form_and_nothing_private_is_printed(self):
        walk = self.walk
        walk.AGENT_COMPANY, walk.AGENT_EMAIL, walk.AGENT_PASSWORD = "test-company", "test-email", "test-password"
        walk.SECRETS = ["test-company", "test-email", "test-password"]
        walk.private = False
        device = Device("company", leads={("company", "tenant-continue"): "first",
                                          ("signin", "login-submit"): "refused"})
        typed = []

        def type_text(value):
            typed.append((device.screen, value))

        with self.on(device, ("type_text", type_text), ("hide_keyboard", lambda: None),
                     ("words", lambda _: {}), ("tab_captions", lambda: {k: k for k in ("today", "calendar", "route", "tasks", "more")})) as stack:
            printed = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            walk.signed_in_walk({}, AUTH)
        self.assertEqual(device.taps, ["tenant-input", "tenant-continue", "login-tab-signin", "login-email", "login-password", "login-submit"])
        self.assertEqual(typed, [("company", "test-company"), ("signin", "test-email"), ("signin", "test-password")])
        self.assertEqual([row[:2] for row in walk.results], [
            (True, "The account's company opens the sign-in screen"),
            (True, "…and «Sign in» shows the email and password form"),
            (False, "The field account signs in and the tabs appear"),
        ])
        for secret in walk.SECRETS:
            self.assertNotIn(secret, printed.getvalue())


GLYPH = "&#xf1a2;"  # a glyph of the icon font, as uiautomator writes it
CAPTIONS = ["Today", "Calendar", "Route", "Clients", "Tasks", "More"]


def node_xml(box, attrs):
    extra = "".join(f'{key}="{value}" ' for key, value in attrs.items())
    return f'<node index="0" {extra}package="com.mtmobileapp" bounds="[{box[0]},{box[1]}][{box[2]},{box[3]}]" />'


class ClientCard:
    """The client list, a card and its change form on the run's 720x1600 screen, as uiautomator reports them.

    The card's page scrolls between a fixed header and the tab bar — or, with
    `overlay`, on under it. uiautomator cuts each node to the visible part of
    the page and leaves out what is not visible at all; with `flagged` off it
    does not say the page scrolls. The «Propose a change»
    button is a Pressable around an icon and a label, so its content-desc is
    «<glyph>, Propose a change» whatever part of it shows. Taps land by
    coordinates, as `input tap` does.
    """

    TOP, TABS = 400, 1417  # the page starts under the header; the tab bar starts at 1417

    def __init__(self, card, form, button_at, overlay=False, tail=True, flagged=True):
        self.form, self.screen, self.offset, self.flagged = form, "list", 0, flagged
        self.taps, self.swipes, self.typed = [], [], []
        self.bottom = 1552 if overlay else self.TABS - 1
        b = button_at  # where the button starts on the page
        self.content = [
            ((48, 32, 672, 152), {"text": "This app shows route information only."}, None),
            ((48, 184, 672, 208), {"text": card["profile"]}, None),
            ((48, 216, 672, 280), {"text": "Customer specialty"}, None),
            ((48, b - 56, 672, b - 32), {"text": card["change"]}, None),
            ((48, b, 672, b + 88), {"clickable": "true", "content-desc": f"{GLYPH}, {card['propose']}"}, "propose"),
            ((250, b + 21, 290, b + 67), {"text": GLYPH}, None),
            ((300, b + 24, 520, b + 64), {"text": card["propose"]}, None),
            ((48, b + 104, 672, b + 170), {"text": card["proposeHint"]}, None),
        ]
        if tail:
            self.content.append(((48, b + 200, 672, b + 288), {"clickable": "true", "content-desc": "Call, +994 00 000 00 00"}, "call"))
        height = max(box[3] for box, _, _ in self.content) + 40
        self.most = max(0, height - (self.bottom - self.TOP))

    def tab_bar(self):
        rows = []
        for at, caption in enumerate(CAPTIONS):
            x = at * 120
            rows += [node_xml((x, self.TABS, x + 120, 1552), {"clickable": "true", "content-desc": f"{GLYPH}, {caption}"}),
                     node_xml((x + 40, 1440, x + 80, 1480), {"text": GLYPH}),
                     node_xml((x + 10, 1490, x + 110, 1520), {"text": caption})]
        return rows

    def on_page(self, box):
        x1, y1, x2, y2 = box
        return x1, self.TOP + y1 - self.offset, x2, self.TOP + y2 - self.offset

    def dump(self):
        rows = []
        if self.screen == "list":
            rows += [node_xml((16, 300, 704, 380), {"resource-id": "route-contacts-search"}),
                     node_xml((0, 400, 720, 520), {"clickable": "true", "content-desc": "Customer 42 Ltd. Cardiology"}),
                     node_xml((0, 520, 720, 640), {"clickable": "true", "content-desc": "Customer 43 Ltd. Surgery"})]
        elif self.screen == "card":
            rows += [node_xml((32, 70, 200, 158), {"clickable": "true", "content-desc": "Back"}),
                     node_xml((100, 90, 180, 140), {"text": "Back"}),
                     node_xml((32, 190, 688, 220), {"text": "Route contact"}),
                     node_xml((32, 230, 688, 300), {"text": "Customer 42 Ltd"}),
                     node_xml((0, self.TOP, 720, self.bottom), {"class": "android.widget.ScrollView", "scrollable": "true" if self.most and self.flagged else "false"})]
            for box, attrs, _ in self.content:
                x1, y1, x2, y2 = self.on_page(box)
                y1, y2 = max(y1, self.TOP), min(y2, self.bottom)
                if y1 < y2:
                    rows.append(node_xml((x1, y1, x2, y2), attrs))
        else:
            rows += [node_xml((32, 200, 688, 240), {"text": self.form["title"]}),
                     node_xml((32, 250, 688, 320), {"text": self.form["hint"]}),
                     node_xml((32, 340, 688, 600), {"resource-id": "contact-change-classes"}),
                     node_xml((32, 640, 688, 720), {"resource-id": "contact-change-first-name", "text": "Customer"}),
                     node_xml((32, 740, 688, 820), {"resource-id": "contact-change-last-name", "text": "42"}),
                     node_xml((32, 1200, 688, 1290), {"resource-id": "contact-change-submit", "clickable": "true"})]
            if self.screen == "refused":
                rows.append(node_xml((32, 1150, 688, 1190), {"text": self.form["nothing"]}))
        if self.screen in ("list", "card"):
            rows += self.tab_bar()
        return f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">{''.join(rows)}</hierarchy>"

    def hit(self, x, y):
        """What a finger at (x, y) presses: the tab bar is drawn over everything under it."""
        if self.screen in ("list", "card") and self.TABS <= y < 1552:
            return f"tab {CAPTIONS[x // 120]}"
        if self.screen == "list" and 400 <= y < 640:
            return "row"
        if self.screen == "card" and self.TOP <= y < self.bottom:
            for box, _, name in self.content:
                x1, y1, x2, y2 = self.on_page(box)
                if name and x1 <= x < x2 and y1 <= y < y2:
                    return name
        if self.screen == "form" and 32 <= x < 688 and 1200 <= y < 1290:
            return "submit"
        return "nothing"

    def shell(self, command, **_):
        words = command.split()
        if command.startswith("uiautomator dump"):
            return self.dump()
        if words[:2] == ["input", "tap"]:
            pressed = self.hit(int(words[2]), int(words[3]))
            self.taps.append(pressed)
            self.screen = {"row": "card", "propose": "form", "submit": "refused"}.get(pressed, self.screen)
        elif words[:2] == ["input", "swipe"]:
            self.swipes.append(command)
            if self.screen == "card":
                self.offset = min(max(self.offset + int(words[3]) - int(words[5]), 0), self.most)
        elif words[:2] == ["input", "text"]:
            self.typed.append(command)
        elif command == "input keyevent 4":
            self.screen = {"form": "card", "refused": "card", "card": "list"}.get(self.screen, self.screen)
        return ""


class ProposeChangeTests(unittest.TestCase):
    """The card's «Propose a change» is pressed whole, above the tab bar — or the walk says why it was not."""

    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()
        self.walk.private = True  # no screenshots from a test
        # The app's own words, from the screens of this checkout.
        self.card, self.form = self.walk.screen_copy(self.walk.CLIENT_CARD), self.walk.screen_copy(self.walk.CHANGE_FORM)
        self.clock = 0.0

    def tick(self):
        self.clock += 3
        return self.clock

    def walk_card(self, device):
        def no_adb(*args, **_):
            raise AssertionError(f"a device-free test reached adb {args}")

        known = frozenset([*CAPTIONS, *self.card.values(), *self.form.values()])
        with contextlib.ExitStack() as stack:
            for name, value in (("shell", device.shell), ("crash_line", lambda: ""), ("adb", no_adb),
                                ("finish", lambda: 1), ("app_words", lambda: known)):
                stack.enter_context(patch.object(self.walk, name, value))
            stack.enter_context(patch.object(self.walk.time, "sleep"))
            stack.enter_context(patch.object(self.walk.time, "time", self.tick))
            printed = stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            self.walk.client_card_walk("Clients", CAPTIONS)
        self.assertNotIn("Customer", printed.getvalue(), "nothing read from the screen but the app's words")
        self.assertEqual(device.typed, [], "the walk types nothing into the form")
        return printed.getvalue()

    def test_the_words_are_found_on_a_button_that_peeks_over_the_tab_bar_but_no_node_says_them_whole(self):
        # Run 39167518113: the button's top 3 px over the tab bar, its icon and label under it.
        device = ClientCard(self.card, self.form, button_at=1013)
        device.screen = "card"
        with patch.object(self.walk, "shell", device.shell), patch.object(self.walk.time, "sleep"):
            found, _ = self.walk.nodes()
            self.assertTrue(self.walk.has_text(found, self.card["propose"]))
            self.assertFalse(self.walk.tap_text(found, self.card["propose"]))
        self.assertEqual(device.taps, [], "this is where the walk waited 60 s for a form nobody had asked for")
        self.assertEqual(self.walk.button_saying(found, self.card["propose"])["box"], (48, 1413, 672, 1416))

    def test_a_button_at_the_tab_bar_is_scrolled_up_whole_then_pressed_and_the_form_opens(self):
        device = ClientCard(self.card, self.form, button_at=1013)
        self.walk_card(device)
        self.assertEqual(device.taps, ["tab Clients", "row", "propose", "submit"])
        self.assertTrue(device.swipes, "the button was brought up before the press")
        self.assertEqual([row[:2] for row in self.walk.results], [
            (True, "The client list has its search field"),
            (True, "The list shows the clients attached to the account"),
            (True, "A client's card opens"),
            (True, "The card shows words, not keys or raw values"),
            (True, "The card offers «Propose a change»"),
            (True, "…and it opens the form"),
            (True, "The form offers the client classes"),
            (True, "The form starts from the client's current name"),
            (True, f"The form has «{self.form['submit']}»"),
            (True, "Sending with nothing changed is refused in words"),
        ])
        self.assertEqual(device.screen, "list", "back from the form and the card to the list")

    def test_without_the_scrolling_view_the_label_must_show_before_the_press(self):
        # Then only the tab bar marks the edge, and the 3 px over it would pass for a whole button.
        device = ClientCard(self.card, self.form, button_at=1013, flagged=False)
        self.walk_card(device)
        self.assertEqual(device.taps, ["tab Clients", "row", "propose", "submit"])
        self.assertTrue(device.swipes, "the label was brought on screen, not a 3 px edge pressed")

    def test_a_button_already_whole_is_pressed_without_scrolling(self):
        device = ClientCard(self.card, self.form, button_at=600)
        self.walk_card(device)
        self.assertEqual(device.taps, ["tab Clients", "row", "propose", "submit"])
        self.assertEqual(device.swipes, [])
        self.assertIn((True, "…and it opens the form", "form shown"), self.walk.results)

    def test_a_button_left_under_a_tab_bar_drawn_over_the_page_is_a_failure_and_no_tab_is_pressed(self):
        # The app bug this walk would have to report: the page cannot scroll the button out from under the bar.
        device = ClientCard(self.card, self.form, button_at=1030, overlay=True, tail=False)
        self.walk_card(device)
        self.assertEqual(device.taps, ["tab Clients", "row"], "neither the tab bar nor the button under it was pressed")
        ok, what, detail = self.walk.results[-1]
        self.assertEqual((ok, what), (False, "…and it opens the form"))
        self.assertTrue(detail.startswith("the button never stood whole above the tab bar: (48, "), detail)
        self.assertTrue(detail.endswith("page ends at 1417"), detail)
        self.assertEqual(device.screen, "list")


class Profile:
    """«More», the profile and its logout confirmation on the run's 720x1600 screen, as uiautomator reports them.

    The profile is one page, its header included, scrolling from the top of the
    screen down to the tab bar: the navigator lays screens out above the bar.
    With `overlay` the page runs on under the bar with nothing to clear it —
    the app bug the walk would have to report. As in ClientCard, uiautomator
    cuts each node to the visible part of the page and leaves out what is not
    visible at all. «Log out» is a Pressable around an icon and a label, so its
    content-desc is «<glyph>, Log out» whatever part of it shows. The
    confirmation is a Modal: its own window, and the dump is the sheet alone.
    """

    TABS = 1417

    def __init__(self, profile, overlay=False):
        self.profile, self.screen, self.offset = profile, "tab", 0
        self.taps, self.swipes, self.typed = [], [], []
        self.bottom = 1552 if overlay else self.TABS - 1
        a, b = 1450, 1562  # where «Switch company» and «Log out» start on the page
        self.content = [
            ((32, 80, 104, 152), {"clickable": "true", "content-desc": profile["back"]}, "back"),
            ((136, 90, 688, 130), {"text": "Agent 7"}, None),
            ((136, 172, 688, 202), {"text": "Company 42 Ltd"}, None),
            ((32, 360, 688, 400), {"text": profile["contactInfoTitle"]}, None),
            ((32, 420, 688, 480), {"text": "agent7@example.invalid"}, None),
            ((32, 640, 688, 680), {"text": profile["language"]}, None),
            ((32, 700, 240, 780), {"clickable": "true", "content-desc": profile["languageEn"]}, "language"),
            ((32, 860, 688, 900), {"text": profile["hintsTitle"]}, None),
            ((560, 920, 688, 980), {"clickable": "true", "checkable": "true"}, "hints"),
            ((32, a, 688, a + 96), {"clickable": "true", "content-desc": f"{GLYPH}, {profile['switchServer']}"}, "switch"),
            ((220, a + 28, 260, a + 68), {"text": GLYPH}, None),
            ((272, a + 28, 500, a + 68), {"text": profile["switchServer"]}, None),
            ((32, b, 688, b + 96), {"clickable": "true", "content-desc": f"{GLYPH}, {profile['logout']}"}, "logout"),
            ((270, b + 28, 310, b + 68), {"text": GLYPH}, None),
            ((322, b + 28, 450, b + 68), {"text": profile["logout"]}, None),
            ((0, b + 128, 720, b + 150), {"text": "Route &amp; Field v3.11.32"}, None),
        ]
        # The version's margin and the page's bottom padding, which `overlay` leaves out.
        height = max(box[3] for box, _, _ in self.content) + (0 if overlay else 72)
        self.most = max(0, height - self.bottom)

    def tab_bar(self):
        rows = []
        for at, caption in enumerate(CAPTIONS):
            x = at * 120
            rows += [node_xml((x, self.TABS, x + 120, 1552), {"clickable": "true", "content-desc": f"{GLYPH}, {caption}"}),
                     node_xml((x + 40, 1440, x + 80, 1480), {"text": GLYPH}),
                     node_xml((x + 10, 1490, x + 110, 1520), {"text": caption})]
        return rows

    def on_page(self, box):
        x1, y1, x2, y2 = box
        return x1, y1 - self.offset, x2, y2 - self.offset

    def dump(self):
        rows = []
        if self.screen == "tab":
            rows += [node_xml((32, 200, 688, 240), {"text": "Today"})]
        elif self.screen == "more":
            rows += [node_xml((0, 600, 720, 720), {"resource-id": "more-action-Profile", "clickable": "true", "content-desc": "Profile"}),
                     node_xml((100, 640, 400, 680), {"text": "Profile"})]
        elif self.screen == "profile":
            rows.append(node_xml((0, 0, 720, self.bottom), {"class": "android.widget.ScrollView", "scrollable": "true"}))
            for box, attrs, _ in self.content:
                x1, y1, x2, y2 = self.on_page(box)
                y1, y2 = max(y1, 0), min(y2, self.bottom)
                if y1 < y2:
                    rows.append(node_xml((x1, y1, x2, y2), attrs))
        elif self.screen == "confirm":
            rows += [node_xml((0, 0, 720, 1600), {"clickable": "true"}),
                     node_xml((32, 900, 688, 950), {"text": self.profile["logoutTitle"]}),
                     node_xml((32, 970, 688, 1060), {"text": self.profile["logoutMessage"].replace("'", "&apos;")}),
                     node_xml((32, 1100, 344, 1196), {"clickable": "true", "content-desc": "Cancel"}),
                     node_xml((120, 1128, 256, 1168), {"text": "Cancel"}),
                     node_xml((376, 1100, 688, 1196), {"clickable": "true", "content-desc": self.profile["logoutConfirm"]}),
                     node_xml((464, 1128, 600, 1168), {"text": self.profile["logoutConfirm"]})]
        elif self.screen == "signed-out":
            rows += [node_xml((32, 300, 344, 380), {"resource-id": "login-tab-signin", "clickable": "true", "content-desc": "Sign in"}),
                     node_xml((376, 300, 688, 380), {"resource-id": "login-tab-first", "clickable": "true", "selected": "true", "content-desc": "First sign-in"}),
                     node_xml((32, 500, 688, 580), {"resource-id": "login-code-phone", "text": "+994 "}),
                     node_xml((32, 620, 688, 716), {"resource-id": "login-code-send", "clickable": "true"})]
        if self.screen in ("tab", "more", "profile"):
            rows += self.tab_bar()
        return f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">{''.join(rows)}</hierarchy>"

    def hit(self, x, y):
        """What a finger at (x, y) presses: the tab bar is drawn over everything under it."""
        if self.screen in ("tab", "more", "profile") and self.TABS <= y < 1552:
            return f"tab {CAPTIONS[x // 120]}"
        if self.screen == "more" and 600 <= y < 720:
            return "profile entry"
        if self.screen == "profile" and 0 <= y < self.bottom:
            for box, _, name in self.content:
                x1, y1, x2, y2 = self.on_page(box)
                if name and x1 <= x < x2 and y1 <= y < y2:
                    return name
        if self.screen == "confirm":
            return "confirm" if 376 <= x < 688 and 1100 <= y < 1196 else "cancel"
        if self.screen == "signed-out" and 32 <= x < 688 and 620 <= y < 716:
            return "send a code"
        return "nothing"

    def shell(self, command, **_):
        words = command.split()
        if command.startswith("uiautomator dump"):
            return self.dump()
        if words[:2] == ["input", "tap"]:
            pressed = self.hit(int(words[2]), int(words[3]))
            self.taps.append(pressed)
            if pressed.startswith("tab "):
                self.screen = "more" if pressed == "tab More" else "tab"
            elif pressed == "profile entry":
                self.screen, self.offset = "profile", 0
            else:
                self.screen = {"logout": "confirm", "switch": "switch", "confirm": "signed-out", "cancel": "profile"}.get(pressed, self.screen)
        elif words[:2] == ["input", "swipe"]:
            self.swipes.append(command)
            if self.screen == "profile":
                self.offset = min(max(self.offset + int(words[3]) - int(words[5]), 0), self.most)
        elif words[:2] == ["input", "text"]:
            self.typed.append(command)
        elif command == "input keyevent 4":
            self.screen = {"confirm": "profile", "profile": "more"}.get(self.screen, self.screen)
        return ""


class LogoutTests(unittest.TestCase):
    """The profile's «Log out» is pressed whole, above the tab bar — or the walk records why it was not, instead of skipping the logout."""

    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()
        self.walk.private = True  # no screenshots from a test
        self.walk.EXPECTED_VERSION = "3.11.32"
        # The app's own words, from the dictionary of this checkout.
        self.profile = self.walk.words("profile")
        self.clock = 0.0

    def tick(self):
        self.clock += 3
        return self.clock

    def on(self, device):
        def no_adb(*args, **_):
            raise AssertionError(f"a device-free test reached adb {args}")

        known = frozenset([*CAPTIONS, *self.profile.values(), "Profile", "Cancel", "Sign in", "First sign-in"])
        stack = contextlib.ExitStack()
        for name, value in (("shell", device.shell), ("crash_line", lambda: ""), ("adb", no_adb),
                            ("finish", lambda: 1), ("app_words", lambda: known)):
            stack.enter_context(patch.object(self.walk, name, value))
        stack.enter_context(patch.object(self.walk.time, "sleep"))
        stack.enter_context(patch.object(self.walk.time, "time", self.tick))
        return stack

    def walked(self, device, walk):
        with self.on(device):
            printed = io.StringIO()
            with contextlib.redirect_stdout(printed):
                walk()
        for private in ("Agent 7", "Company 42", "agent7@"):
            self.assertNotIn(private, printed.getvalue(), "nothing read from the screen but the app's words")
        self.assertEqual(device.typed, [])
        self.assertNotIn("switch", device.taps, "«Switch company» is never pressed")
        self.assertNotIn("send a code", device.taps, "«Get a code» would send a WhatsApp message")
        return printed.getvalue()

    def test_the_words_are_found_on_a_log_out_button_cut_by_the_tab_bar_but_no_node_says_them_whole(self):
        # Where the walk used to skip the logout without a word: words «found», nothing to tap.
        device = Profile(self.profile)
        device.screen, device.offset = "profile", 149
        with self.on(device):
            found, _ = self.walk.nodes()
            self.assertTrue(self.walk.has_text(found, self.profile["logout"]))
            self.assertFalse(self.walk.tap_text(found, self.profile["logout"]))
        self.assertEqual(device.taps, [])
        self.assertEqual(self.walk.button_saying(found, self.profile["logout"])["box"], (32, 1413, 688, 1416))

    def test_the_profile_is_walked_and_log_out_is_pressed_confirmed_and_back_at_the_way_in(self):
        device = Profile(self.profile)
        self.walked(device, lambda: self.walk.profile_walk("More", CAPTIONS))
        self.assertEqual(device.taps, ["tab More", "profile entry", "logout", "confirm"])
        self.assertEqual([row[:2] for row in self.walk.results], [
            (True, "«More» lists the profile"),
            (True, "The profile opens and offers to log out"),
            (True, "The profile names the version of this build"),
            (True, "Logging out asks to confirm"),
            (True, "After logging out the app is back at the way in"),
        ])
        self.assertEqual(device.screen, "signed-out")

    def test_a_label_cut_at_the_tab_bar_is_scrolled_up_whole_then_pressed(self):
        device = Profile(self.profile)
        device.screen, device.offset = "profile", 149
        self.walked(device, lambda: self.walk.logout_walk(self.profile, CAPTIONS))
        self.assertTrue(device.swipes, "the button was brought up before the press")
        self.assertEqual(device.taps, ["logout", "confirm"])
        self.assertEqual(self.walk.results, [
            (True, "Logging out asks to confirm", "confirmation shown"),
            (True, "After logging out the app is back at the way in", "signed out"),
        ])

    def test_a_log_out_left_under_a_tab_bar_drawn_over_the_page_is_a_failure_and_no_tab_is_pressed(self):
        device = Profile(self.profile, overlay=True)
        self.walked(device, lambda: self.walk.profile_walk("More", CAPTIONS))
        self.assertEqual(device.taps, ["tab More", "profile entry"], "neither the tab bar nor the button under it was pressed")
        ok, what, detail = self.walk.results[-1]
        self.assertEqual((ok, what), (False, "Logging out asks to confirm"))
        self.assertEqual(detail, "«Log out» never stood whole above the tab bar: (32, 1402, 688, 1498), page ends at 1417")
        self.assertEqual(device.screen, "profile", "still signed in: the walk says so instead of passing")

    def test_no_log_out_on_screen_is_a_failure_too(self):
        device = Profile(self.profile)
        device.screen = "more"
        self.walked(device, lambda: self.walk.logout_walk(self.profile, CAPTIONS))
        self.assertEqual(device.taps, [])
        self.assertEqual(self.walk.results, [(False, "Logging out asks to confirm", "«Log out» never stood whole above the tab bar: it went off the screen")])


if __name__ == "__main__":
    unittest.main()
