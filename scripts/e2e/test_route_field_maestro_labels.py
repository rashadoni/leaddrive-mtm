"""A Maestro runScript shares output, not another file's helper functions."""
import json
from pathlib import Path
import subprocess
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "MTMobileApp/.maestro/route-field/shared/location-denial-labels.js"
ISOLATED = """
const fs = require('fs');
const vm = require('vm');
const context = { LOCALE: process.argv[2], output: {} };
vm.runInNewContext(fs.readFileSync(process.argv[1], 'utf8'), context);
process.stdout.write(JSON.stringify(context.output.denial));
"""


class MaestroLabelContextTests(unittest.TestCase):
    def run_labels(self, locale):
        return subprocess.run(["node", "-e", ISOLATED, str(SCRIPT), locale],
                              capture_output=True, text=True, timeout=10)

    def check_locale(self, locale, title):
        result = self.run_labels(locale)
        self.assertEqual(result.returncode, 0, "Labels require an unavailable helper from another runScript")
        labels = json.loads(result.stdout)
        self.assertEqual(set(labels), {"title", "decline", "issue", "body"})
        self.assertEqual(labels["title"], title)
        self.assertTrue(all(isinstance(text, str) and text for text in labels.values()))

    def test_azerbaijani_without_prior_script_globals(self):
        self.check_locale("az", "Tətbiq məkanınızdan istifadə edir")

    def test_russian_without_prior_script_globals(self):
        self.check_locale("ru", "Приложение использует ваше местоположение")

    def test_english_without_prior_script_globals(self):
        self.check_locale("en", "The app uses your location")

    def test_unconfigured_locale_is_refused(self):
        result = self.run_labels("fr")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("RF_LOCALE_REFUSED", result.stderr)


if __name__ == "__main__":
    unittest.main()
