"""Fail-closed admission for the manual, owned FIELD fixture smoke.

This checks public identity/routing only. Never print environment values or
release bodies on refusal; credentials are consumed only by emulator_signin.
"""
import json
import os
import re
import subprocess
import sys

FIXTURE_COMPANY = "mtm-attendance-phone"
FIXTURE_EMAIL = "field@mtm-attendance-phone.example.invalid"


def smoke_mode(env):
    mode = env.get("E2E_SMOKE_MODE", "full")
    if mode not in ("full", "attendance_fixture"):
        raise ValueError("E2E_MODE_INVALID")
    return mode


def account_settings(env):
    if smoke_mode(env) == "full":
        return tuple(env.get(f"E2E_AGENT_{key}", "") for key in ("COMPANY", "EMAIL", "PASSWORD"))
    account = tuple(env.get(f"E2E_ATTENDANCE_{key}", "") for key in ("COMPANY", "EMAIL", "PASSWORD"))
    if account[0] != FIXTURE_COMPANY or account[1] != FIXTURE_EMAIL or not account[2]:
        raise ValueError("E2E_ATTENDANCE_ACCOUNT_REFUSED")
    return account


def verify_workflow(env, main_sha):
    if smoke_mode(env) == "full":
        return
    expected = env.get("EXPECTED_MAIN_SHA", "")
    if (env.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
            or env.get("GITHUB_REF") != "refs/heads/main"
            or not re.fullmatch(r"[0-9a-f]{40}", expected)
            or expected != env.get("GITHUB_SHA") or expected != main_sha
            or not re.fullmatch(r"v\d+\.\d+\.\d+-build\d+", env.get("RELEASE_TAG", ""))):
        raise ValueError("E2E_ATTENDANCE_WORKFLOW_REFUSED")


def verify_release(metadata, tag, tag_sha, ancestor):
    sha = metadata.get("targetCommitish", "")
    if (metadata.get("tagName") != tag or metadata.get("isDraft") is not False
            or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha)
            or not isinstance(metadata.get("body"), str)
            or f"CI build of {sha} (branch main)." not in metadata["body"]
            or sha != tag_sha or not ancestor):
        raise ValueError("E2E_ATTENDANCE_RELEASE_REFUSED")


def main():
    if smoke_mode(os.environ) == "full":
        return
    main_sha = subprocess.check_output(["git", "rev-parse", "origin/main"], text=True).strip()
    verify_workflow(os.environ, main_sha)
    if len(sys.argv) == 2 and sys.argv[1] == "release":
        with open(os.environ["RELEASE_METADATA"], encoding="utf-8") as source:
            metadata = json.load(source)
        tag = os.environ["RELEASE_TAG"]
        tag_sha = subprocess.check_output(["git", "rev-parse", f"refs/tags/{tag}^{{commit}}"], text=True).strip()
        ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", tag_sha, main_sha], capture_output=True).returncode == 0
        verify_release(metadata, tag, tag_sha, ancestor)
    elif len(sys.argv) != 2 or sys.argv[1] != "workflow":
        raise ValueError("E2E_ATTENDANCE_COMMAND_REFUSED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Git/file/JSON errors can quote data. Refusals expose no inputs.
        sys.exit("E2E_ATTENDANCE_GUARD_REFUSED")
