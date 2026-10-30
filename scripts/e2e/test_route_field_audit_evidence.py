"""Acceptance of Maestro's real nested private bundles, without hiding missing evidence."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from route_field_native import AUDIT_CAPTURE_NAMES, audit_capture_hashes


class AuditEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.captures = self.root / "artifacts" / "timestamp" / "flow name" / "takeScreenshot"
        self.captures.mkdir(parents=True)
        for name in AUDIT_CAPTURE_NAMES:
            (self.captures / (name + ".png")).write_bytes(b"private fixture screenshot")

    def test_nested_flow_bundle_is_accepted(self):
        self.assertEqual(set(audit_capture_hashes(self.root)), set(AUDIT_CAPTURE_NAMES))

    def test_missing_capture_is_not_a_native_pass(self):
        (self.captures / "clients.png").unlink()
        with self.assertRaises(Exception):
            audit_capture_hashes(self.root)

    def test_two_bundles_are_ambiguous(self):
        (self.root / "artifacts" / "second" / "takeScreenshot").mkdir(parents=True)
        with self.assertRaises(Exception):
            audit_capture_hashes(self.root)

    def test_symlink_does_not_import_another_attempt(self):
        capture = self.captures / "profile.png"
        capture.unlink()
        capture.symlink_to(self.captures / "today.png")
        with self.assertRaises(Exception):
            audit_capture_hashes(self.root)


if __name__ == "__main__":
    unittest.main()
