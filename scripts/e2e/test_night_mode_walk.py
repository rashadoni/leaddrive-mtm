"""Device-free contracts of the day/night step; these are not emulator evidence."""
import contextlib
import importlib
import io
import os
import struct
import types
import unittest
from unittest.mock import patch


def framebuffer(width, height, rgb, header=16):
    head = struct.pack("<IIII", width, height, 1, 0)[:header]
    return head + bytes([*rgb, 255]) * (width * height)


class BrightnessTests(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))

    def brightness(self, raw, bottom=None):
        done = types.SimpleNamespace(stdout=raw)
        with patch.object(self.walk.subprocess, "run", return_value=done):
            return self.walk.screen_brightness(bottom)

    def test_reads_white_and_black_from_the_raw_framebuffer(self):
        self.assertAlmostEqual(self.brightness(framebuffer(48, 96, (255, 255, 255))), 1.0)
        self.assertAlmostEqual(self.brightness(framebuffer(48, 96, (0, 0, 0))), 0.0)
        # Android 8–9 wrote a 12-byte header.
        self.assertAlmostEqual(self.brightness(framebuffer(48, 96, (255, 255, 255), header=12)), 1.0)

    def test_measures_only_above_the_given_line(self):
        width, height = 48, 96
        top = bytes([255, 255, 255, 255]) * (width * (height // 2))
        rest = bytes([0, 0, 0, 255]) * (width * (height - height // 2))
        raw = struct.pack("<IIII", width, height, 1, 0) + top + rest
        self.assertAlmostEqual(self.brightness(raw, bottom=height // 2), 1.0)
        self.assertLess(self.brightness(raw), 0.6)

    def test_says_nothing_for_a_broken_capture(self):
        self.assertIsNone(self.brightness(b""))
        self.assertIsNone(self.brightness(struct.pack("<IIII", 48, 96, 1, 0) + b"\0" * 10))


class NightModeWalkTests(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": "full"}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()

    def run_walk(self, follows, keeps_text):
        """`follows`: the app takes the phone's theme; `keeps_text`: the field survives the switch."""
        state = {"night": False, "typed": ""}
        commands = []

        def shell(command, **_):
            commands.append(command)
            if command.startswith("cmd uimode night "):
                state["night"] = command.endswith("yes")
                if not keeps_text:
                    state["typed"] = ""
            return "4242" if command.startswith("pidof") else ""

        def nodes():
            return [{"resource-id": "tenant-input", "text": state["typed"], "box": (0, 300, 720, 380)}], "ui"

        def type_text(value):
            state["typed"] += value

        def brightness(bottom=None):
            self.assertEqual(bottom, 300, "the keyboard under the field follows the system theme by itself")
            return 0.08 if follows and state["night"] else 0.9

        with contextlib.ExitStack() as stack:
            for name, value in (("shell", shell), ("nodes", nodes), ("type_text", type_text), ("tap", lambda _: None),
                                ("keyboard_shown", lambda: True), ("hide_keyboard", lambda: None),
                                ("clear_field", lambda node, length: state.update(typed="")),
                                ("evidence", lambda _: None), ("screen_brightness", brightness)):
                stack.enter_context(patch.object(self.walk, name, value))
            stack.enter_context(patch.object(self.walk.time, "sleep"))
            clock = iter(range(0, 10_000, 5))
            stack.enter_context(patch.object(self.walk.time, "time", lambda: next(clock)))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            self.walk.night_mode_walk()
        return commands, state

    def outcomes(self):
        return [(ok, what) for ok, what, _ in self.walk.results]

    def test_passes_when_the_open_screen_turns_dark_and_light_keeping_the_text(self):
        commands, state = self.run_walk(follows=True, keeps_text=True)
        self.assertEqual([c for c in commands if c.startswith("cmd uimode")], ["cmd uimode night no", "cmd uimode night yes", "cmd uimode night no"])
        self.assertEqual(len(self.walk.results), 4)
        self.assertTrue(all(ok for ok, _ in self.outcomes()), self.walk.results)
        # The walk leaves the field empty and the phone in day for the steps after it.
        self.assertEqual(state["typed"], "")
        self.assertFalse(state["night"])

    def test_fails_when_the_screen_keeps_its_theme(self):
        self.run_walk(follows=False, keeps_text=True)
        night = [ok for ok, what in self.outcomes() if what.startswith("The phone switched to night")]
        self.assertEqual(night, [False])

    def test_fails_when_a_restart_empties_the_field(self):
        self.run_walk(follows=True, keeps_text=False)
        kept = [ok for ok, what in self.outcomes() if "typed text is still in the field" in what]
        self.assertEqual(kept, [False, False])


if __name__ == "__main__":
    unittest.main()
