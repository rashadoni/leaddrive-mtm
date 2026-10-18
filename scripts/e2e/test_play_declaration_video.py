"""Device-free contracts of the Play declaration film; not emulator evidence."""
import contextlib
import importlib
import io
import os
import unittest
from unittest.mock import patch


def load(env):
    with patch.dict(os.environ, env, clear=True):
        importlib.reload(importlib.import_module("emulator_signin"))
        return importlib.reload(importlib.import_module("play_declaration_video"))


class RefusalTests(unittest.TestCase):
    """It starts and ends a workday and its film is public: only the demo company."""

    def refused(self, env):
        film = load(env)
        with patch.object(film.base, "adb", side_effect=AssertionError("touched the device")), \
                patch.object(film, "adb", side_effect=AssertionError("touched the device")), \
                patch.object(film, "shell", side_effect=AssertionError("touched the device")):
            return film.main("unused.apk")

    def test_another_company_is_refused_before_the_device(self):
        self.assertEqual(self.refused({"E2E_AGENT_COMPANY": "a-customer", "E2E_AGENT_EMAIL": "x", "E2E_AGENT_PASSWORD": "y"}), 2)

    def test_missing_credentials_are_refused(self):
        self.assertEqual(self.refused({"E2E_AGENT_COMPANY": "leaddrive", "E2E_AGENT_EMAIL": "", "E2E_AGENT_PASSWORD": ""}), 2)


class WordsTests(unittest.TestCase):
    def test_every_pressed_word_is_the_apps_own(self):
        film = load({})
        known = film.base.app_words()
        self.assertEqual([word for word in film.WORDS.values() if word not in known], [])

    def test_the_notification_it_looks_for_is_the_services_title(self):
        film = load({})
        self.assertEqual(film.base.words("location")["taskTitle"], "LeadDrive — workday")


def screen(*nodes):
    """A uiautomator dump: (resource-id, text) per node, in tree order."""
    rows = "".join(f'<node index="0" text="{text}" resource-id="{rid}" class="android.view.ViewGroup" '
                   f'package="com.mtmobileapp" bounds="[0,{40 * at}][720,{40 * at + 40}]" />'
                   for at, (rid, text) in enumerate(nodes))
    return f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">{rows}</hierarchy>"


TABS = (("login-tab-signin", ""), ("", "Sign in"), ("login-tab-first", ""), ("", "First sign-in"))
# The demo company's sign-in screen on a clean phone, 3.11.3 on: no `login-email`
# on «First sign-in», which is where the walk stopped (emulator run 39161991009).
SCREENS = {
    "company": screen(("tenant-input", ""), ("tenant-continue", ""), ("", "Connect")),
    "first": screen(("", "Step 2 of 2"), ("", "leaddrive"), *TABS, ("login-code-phone", "+994 "),
                    ("login-code-send", ""), ("", "Get a code in WhatsApp")),
    "signin": screen(("", "Step 2 of 2"), ("", "leaddrive"), *TABS,
                     ("login-email", ""), ("login-password", ""), ("login-submit", "")),
    "old": screen(("", "Step 2 of 2"), ("login-email", ""), ("login-password", ""), ("login-submit", "")),
    "notifications": screen(("permission_allow_button", "Allow"), ("permission_deny_button", "Don't allow")),
    "today": screen(("", "Today"), ("", "Start day")),
}
LEADS = {("signin", "login-submit"): "notifications", ("old", "login-submit"): "notifications",
         ("notifications", "permission_allow_button"): "today"}


class Device:
    """The app as sign_in() reads it: one screen per dump, and where a tap on a test id leads.

    `turns` is LoginScreen's late switch to «First sign-in» once the saved
    account reads empty: after the first look, unless a tab was pressed
    (`tabTouched`). With `tabs=False` a press on a tab changes nothing.
    """

    def __init__(self, after_company, turns=(), tabs=True):
        self.screen, self.turns, self.tabs = "company", dict(turns), tabs
        self.leads = {**LEADS, ("company", "tenant-continue"): after_company}
        self.taps, self.typed, self.touched = [], [], False

    def shell(self, command, **_):
        if not command.startswith("uiautomator dump"):
            raise AssertionError(f"the sign-in did more than read the screen: {command}")
        shown = SCREENS[self.screen]
        if self.screen in self.turns and not self.touched:
            self.screen = self.turns[self.screen]
        return shown

    def tap(self, node):
        test_id = node.get("resource-id", "")
        self.taps.append(test_id)
        if test_id.startswith("login-tab-") and self.tabs:  # LoginScreen.openTab
            self.touched, self.screen = True, test_id.removeprefix("login-tab-")
        self.screen = self.leads.get((self.screen, test_id), self.screen)

    def type_text(self, value):
        self.typed.append((self.screen, value))


SECRETS = {"E2E_AGENT_COMPANY": "leaddrive", "E2E_AGENT_EMAIL": "test-email", "E2E_AGENT_PASSWORD": "test-password"}
THROUGH_THE_TAB = ["tenant-input", "tenant-continue", "login-tab-signin", "login-email", "login-password", "login-submit",
                   "permission_allow_button"]


class SignInTests(unittest.TestCase):
    """Since 3.11.3 a clean phone opens the sign-in screen on «First sign-in»; the password form is a tab away."""

    def signed_in(self, device):
        film = load(SECRETS)
        film.base.results.clear()
        clock = [0.0]

        def tick():
            clock[0] += 3
            return clock[0]

        def no_adb(*args, **_):
            raise AssertionError(f"a device-free test reached adb {args}")

        printed = io.StringIO()
        with contextlib.ExitStack() as stack:
            for target, name, value in ((film, "shell", device.shell), (film, "tap", device.tap),
                                        (film, "type_text", device.type_text), (film, "hide_keyboard", lambda: None),
                                        (film, "adb", no_adb), (film.base, "adb", no_adb),
                                        (film.base, "crash_line", lambda: ""),
                                        (film.time, "sleep", lambda _: None), (film.time, "time", tick)):
                stack.enter_context(patch.object(target, name, value))
            stack.enter_context(contextlib.redirect_stdout(printed))
            outcome = film.sign_in()
        for secret in SECRETS.values():
            self.assertNotIn(secret, printed.getvalue())
        self.assertNotIn("login-code-send", device.taps, "«Get a code» sends a WhatsApp message")
        return outcome, film.base.results

    def test_a_clean_phone_on_first_sign_in_signs_in_through_the_sign_in_tab(self):
        device = Device("first")
        outcome, results = self.signed_in(device)
        self.assertTrue(outcome)
        self.assertEqual(device.taps, THROUGH_THE_TAB)
        self.assertEqual(device.typed, [("company", "leaddrive"), ("signin", "test-email"), ("signin", "test-password")])
        self.assertEqual([row[:2] for row in results], [
            (True, "First launch opens the company step"),
            (True, "The demo company opens the sign-in screen"),
            (True, "…and «Sign in» shows the email and password form"),
            (True, "The demo agent signs in and «Today» opens"),
        ])

    def test_the_tab_is_pressed_even_when_the_form_is_up_for_a_moment(self):
        # Without the press the form would be gone by the time the email is typed.
        device = Device("signin", turns={"signin": "first"})
        outcome, _ = self.signed_in(device)
        self.assertTrue(outcome)
        self.assertEqual(device.taps, THROUGH_THE_TAB)
        self.assertEqual(device.typed, [("company", "leaddrive"), ("signin", "test-email"), ("signin", "test-password")])

    def test_a_build_without_tabs_goes_straight_to_the_form(self):
        device = Device("old")
        outcome, _ = self.signed_in(device)
        self.assertTrue(outcome)
        self.assertEqual(device.taps, [tap for tap in THROUGH_THE_TAB if tap != "login-tab-signin"])

    def test_a_form_that_never_comes_stops_before_anything_is_typed_and_names_no_secret(self):
        device = Device("first", tabs=False)
        outcome, results = self.signed_in(device)
        self.assertFalse(outcome)
        self.assertEqual(device.taps, ["tenant-input", "tenant-continue", "login-tab-signin"])
        self.assertEqual(device.typed, [("company", "leaddrive")])
        ok, what, detail = results[-1]
        self.assertEqual((ok, what), (False, "…and «Sign in» shows the email and password form"))
        self.assertTrue(detail.startswith("not seen in 30 s; on screen: "), detail)


if __name__ == "__main__":
    unittest.main()
