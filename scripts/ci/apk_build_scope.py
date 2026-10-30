"""Skip APK production for test/prose-only diffs; build on uncertain input.

Jest and TypeScript remain unconditional in the build workflow. This flag only
controls packaging/signing/publication, never those required checks.
"""
import os
from pathlib import PurePosixPath
import re
import subprocess


def requires_apk(paths):
    if not paths:
        return True
    for path in paths:
        parts = PurePosixPath(path).parts
        if not parts or path.startswith("/") or ".." in parts:
            return True
        if path in (".github/workflows/build-apk.yml", "scripts/ci/apk_build_scope.py"):
            continue
        if path.startswith(("MTMobileApp/.maestro/", "MTMobileApp/__tests__/", "MTMobileApp/docs/",
                            "docs/", "scripts/e2e/")):
            continue
        if path.startswith("MTMobileApp/") and path.endswith((".md", ".mdx")):
            continue
        return True
    return False


def main():
    base, head = os.environ.get("BASE_SHA", ""), os.environ.get("HEAD_SHA", "")
    build = True
    if (os.environ.get("EVENT_NAME") in ("pull_request", "push")
            and all(re.fullmatch(r"[a-f0-9]{40}", sha) and sha != "0" * 40 for sha in (base, head))):
        result = subprocess.run(["git", "diff", "--name-only", "-z", base, head], capture_output=True, timeout=30)
        if result.returncode == 0:
            build = requires_apk([path for path in result.stdout.decode("utf-8", "replace").split("\0") if path])
    print("build=" + str(build).lower())


if __name__ == "__main__":
    main()
