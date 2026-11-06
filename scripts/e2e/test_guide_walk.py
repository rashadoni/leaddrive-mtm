"""Device-free contracts of the first-run guide step; these are not emulator evidence."""
import contextlib
import importlib
import os
import unittest
from unittest.mock import patch

DIM = {"resource-id": "guide-dim", "box": (0, 0, 720, 1600)}
SKIP = {"resource-id": "guide-skip", "text": "Skip", "box": (40, 1300, 300, 1380)}


class GuideWalkTests(unittest.TestCase):
    def load(self, mode):
        with patch.dict(os.environ, {"E2E_SMOKE_MODE": mode}, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()

    def run_walk(self, screens, taps_close=True):
        """`screens`: what the phone shows before «Skip» is pressed, one list per look."""
        state = {"looks": 0, "closed": False}
        tapped = []

        def nodes():
            if state["closed"]:
                return [{"text": "Today", "box": (0, 1500, 144, 1600)}], "ui"
            screen = screens[min(state["looks"], len(screens) - 1)]
            state["looks"] += 1
            return list(screen), "ui"

        def tap(node):
            tapped.append(node.get("resource-id"))
            if taps_close and node.get("resource-id") == "guide-skip":
                state["closed"] = True

        with contextlib.ExitStack() as stack:
            for name, value in (("nodes", nodes), ("tap", tap), ("evidence", lambda _: None),
                                ("crash_line", lambda: None), ("finish", lambda: 1)):
                stack.enter_context(patch.object(self.walk, name, value))
            stack.enter_context(patch.object(self.walk.time, "sleep", lambda _: None))
            try:
                self.walk.guide_walk()
            except SystemExit:
                pass
        return tapped

    def test_the_guide_is_skipped_and_the_screen_given_back(self):
        self.load("full")
        tapped = self.run_walk([[], [DIM, SKIP]])
        self.assertEqual(tapped, ["guide-skip"])
        self.assertEqual([ok for ok, *_ in self.walk.results], [True, True])

    def test_a_skip_that_leaves_the_dim_up_fails(self):
        self.load("full")
        with patch.object(self.walk.time, "time", side_effect=[0, 1] + list(range(100, 200))):
            self.run_walk([[DIM, SKIP]], taps_close=False)
        self.assertEqual([ok for ok, *_ in self.walk.results], [True, False])

    def test_a_field_sign_in_without_the_guide_fails(self):
        self.load("full")
        self.run_walk([[]])
        self.assertEqual([ok for ok, *_ in self.walk.results], [False])

    def test_the_office_shell_has_no_guide_and_that_is_not_a_failure(self):
        env = {"E2E_SMOKE_MODE": "attendance_fixture", "GITHUB_EVENT_NAME": "workflow_dispatch",
               "E2E_ATTENDANCE_COMPANY": "mtm-attendance-phone",
               "E2E_ATTENDANCE_EMAIL": "field@mtm-attendance-phone.example.invalid", "E2E_ATTENDANCE_PASSWORD": "test-only-value"}
        with patch.dict(os.environ, env, clear=True):
            self.walk = importlib.reload(importlib.import_module("emulator_signin"))
        self.walk.results.clear()
        self.run_walk([[]])
        self.assertEqual(self.walk.results, [])


if __name__ == "__main__":
    unittest.main()
