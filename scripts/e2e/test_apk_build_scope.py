"""Tests must not publish an unchanged APK; runtime edits must still build."""
import os
from pathlib import Path
import runpy
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "ci/apk_build_scope.py"
requires_apk = runpy.run_path(str(SCRIPT))["requires_apk"]


class ApkBuildScopeTests(unittest.TestCase):
    def test_test_and_prose_only_changes_do_not_require_a_new_package(self):
        self.assertFalse(requires_apk(["MTMobileApp/.maestro/route-field/smoke/employee-tabs.yaml",
                                      "scripts/e2e/route_field_native.py", "scripts/ci/apk_build_scope.py",
                                      "docs/evidence/route-field-native-20261023.json",
                                      ".github/workflows/build-apk.yml", "MTMobileApp/docs/checklist.md"]))

    def test_any_runtime_native_dependency_or_release_edit_still_requires_packaging(self):
        for path in ("MTMobileApp/src/services/task-outbox.ts", "MTMobileApp/android/app/build.gradle",
                     "MTMobileApp/package-lock.json", "MTMobileApp/index.js", "MTMobileApp/.maestro-runtime/file",
                     ".github/actions/sign/action.yml", "scripts/unknown.py"):
            with self.subTest(path=path):
                self.assertTrue(requires_apk(["MTMobileApp/.maestro/test.yaml", path]))

    def test_unknown_empty_or_unsafe_diffs_fail_closed(self):
        for paths in ([], ["../docs/test.md"], ["/docs/test.md"], [""], [".maestro/test.yaml"]):
            with self.subTest(paths=paths):
                self.assertTrue(requires_apk(paths))

    def test_dispatch_missing_and_malformed_commits_never_skip_packaging(self):
        for patch in ({"EVENT_NAME": "workflow_dispatch"}, {"BASE_SHA": ""},
                      {"BASE_SHA": "0" * 40}, {"HEAD_SHA": "main"}, {"BASE_SHA": "a" * 40 + "\n"}):
            env = dict(os.environ, EVENT_NAME="pull_request", BASE_SHA="a" * 40, HEAD_SHA="b" * 40)
            env.update(patch)
            result = subprocess.run([sys.executable, "-B", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=5)
            self.assertEqual((result.returncode, result.stdout.strip()), (0, "build=true"))


if __name__ == "__main__":
    unittest.main()
