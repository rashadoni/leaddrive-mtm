"""Device-free contracts of the Play declaration film; not emulator evidence."""
import importlib
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


if __name__ == "__main__":
    unittest.main()
