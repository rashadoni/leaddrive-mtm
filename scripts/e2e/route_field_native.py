"""Bounded, private-output driver for the signed-out Route & Field Maestro check.

It admits the existing blank-password form or a signed-in agent's read-only
tab walk. Write journeys require a separate fixture and server reconciliation.
A YAML file alone is not a native pass.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import xml.etree.ElementTree as ET

from route_field_guard import agent_shell, auth_form, require, verify_apk, verify_auth_preserved, verify_observation_window, verify_owner_task_case

REPO = Path(__file__).resolve().parents[2]
APP = REPO / "MTMobileApp"
PACKAGE = "com.mtmobileapp"


def private_json(path):
    require(path.is_file() and not path.is_symlink() and path.stat().st_uid == os.getuid()
            and path.stat().st_mode & 0o077 == 0, "RF_PRIVATE_FILE_REFUSED")
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--maestro", required=True, type=Path)
    parser.add_argument("--java-home", required=True, type=Path)
    parser.add_argument("--protected-observation", required=True, type=Path)
    parser.add_argument("--locale", choices=("az", "ru", "en"), required=True)
    parser.add_argument("--flow", choices=("auth-entry", "employee-tabs", "task-start", "task-complete"), default="auth-entry")
    parser.add_argument("--task-case", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    # Refuse reuse: every attempt, including failures, keeps its original evidence.
    args.out.mkdir(mode=0o700)
    task_flow = args.flow in ("task-start", "task-complete")
    report = {"status": "FAIL", "flow": ("journeys/" if task_flow else "smoke/") + args.flow, "phase": "preflight"}
    started = datetime.now(timezone.utc)
    report["startedAt"] = started.isoformat()
    try:
        coordination = private_json(args.protected_observation)
        verify_observation_window(coordination, started)
        with (args.out.parent / "phone-ui.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Connect only to an existing local relay. Do not start/restart ADB.
            with socket.create_connection(("127.0.0.1", 5037), timeout=5):
                pass

            def adb(*cmd, timeout=30):
                done = subprocess.run(["adb", "-H", "127.0.0.1", "-P", "5037", *cmd],
                                      capture_output=True, timeout=timeout)
                require(done.returncode == 0, "RF_ADB_FAILED")
                return done.stdout.decode("utf-8", "replace")

            devices = adb("devices").splitlines()[1:]
            require(len([line for line in devices if line.strip()]) == 1
                    and any(line.rstrip().endswith("\tdevice") for line in devices), "RF_SINGLE_DEVICE_REQUIRED")
            require(adb("shell", "am", "get-current-user").strip() == "0", "RF_ANDROID_USER_REFUSED")
            expected = private_json(args.identity)
            package = adb("shell", "dumpsys", "package", PACKAGE)
            path = adb("shell", "pm", "path", PACKAGE).splitlines()[0].removeprefix("package:").strip()
            identity = {"package": PACKAGE, "versionCode": int(re.search(r"versionCode=(\d+)", package)[1]),
                        "apkSha256": adb("shell", "sha256sum", path).split()[0]}
            verify_apk(identity, expected)
            report.update(identity, sourceSha=expected["publishedSourceSha"])
            task_case = None
            if task_flow:
                require(args.task_case is not None, "RF_TASK_CASE_REQUIRED")
                task_case = private_json(args.task_case)
                verify_owner_task_case(task_case, expected["publishedSourceSha"], args.flow)
                report["taskId"] = task_case["taskId"]
                report["browserRunId"] = task_case["browserRunId"]
            words = json.loads((APP / f"src/i18n/locales/{args.locale}.json").read_text())
            placeholder = words["auth"]["passwordPlaceholder"]

            def ui():
                raw = adb("shell", "uiautomator dump /data/local/tmp/codex-route-field-ui.xml >/dev/null 2>&1; cat /data/local/tmp/codex-route-field-ui.xml", timeout=35)
                require("<?xml" in raw, "RF_UI_UNAVAILABLE")
                return raw[raw.index("<?xml"):]

            before_xml = ui()
            if task_flow and agent_shell(before_xml, home_required=False) is None:
                root = ET.fromstring(before_xml)
                tab = next(node for node in root.iter("node") if node.get("package") == PACKAGE
                           and node.get("resource-id") == "guide-spot-tab.Today")
                bounds = list(map(int, re.findall(r"\d+", tab.get("bounds", ""))))
                require(len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1], "RF_HOME_TAB_REFUSED")
                adb("shell", "input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                before_xml = ui()
            before = auth_form(before_xml, placeholder) if args.flow == "auth-entry" else agent_shell(before_xml)
            (args.out / "before-private.xml").write_text(before_xml)
            flow = APP / f".maestro/route-field/{'journeys' if task_flow else 'smoke'}/{args.flow}.yaml"
            labels = flow.parent.parent / "shared/labels.js"
            report["flowSha256"] = hashlib.sha256(flow.read_bytes()).hexdigest()
            report["labelsSha256"] = hashlib.sha256(labels.read_bytes()).hexdigest()
            report["phase"] = "maestro"
            env = os.environ.copy()
            env.update(JAVA_HOME=str(args.java_home), JAVA_OPTS="-Xmx512m", MAESTRO_CLI_NO_ANALYTICS="1",
                       MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="true")
            gate = "RF_AUTH_PREFLIGHT=blank-password-v1" if args.flow == "auth-entry" else "RF_SHELL_PREFLIGHT=agent-readonly-v1"
            if task_flow:
                gate = "RF_TASK_PREFLIGHT=owner-web-created-v1"
            command = [str(args.maestro), "test", "-e", "LOCALE=" + args.locale,
                       "-e", gate]
            if task_case:
                for key, value in (("TASK_ID", task_case["taskId"]), ("TASK_TITLE", task_case["title"]), ("TASK_RESULT", task_case["result"])):
                    command += ["-e", key + "=" + value]
            command += ["--format", "junit",
                       "--output", str(args.out / "report.xml"), "--debug-output", str(args.out), str(flow)]
            with (args.out / "runner-private.log").open("w") as log:
                process = subprocess.Popen(command, cwd=APP, env=env, stdout=log,
                                           stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    code = process.wait(timeout=300)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=5)
                    code = 124
            report["exitCode"] = code
            report["phase"] = "postflight"
            after_xml = ui()
            (args.out / "after-private.xml").write_text(after_xml)
            if args.flow == "auth-entry":
                verify_auth_preserved(before, auth_form(after_xml, placeholder))
                report["loginDraftPreserved"] = True
            else:
                require(before == agent_shell(after_xml), "RF_HOME_IDENTITY_CHANGED")
                report["sameSignedInGreeting"] = True
            require(code == 0, "RF_MAESTRO_FAILED")
            require((args.out / "report.xml").is_file(), "RF_JUNIT_MISSING")
            cases = list(ET.parse(args.out / "report.xml").getroot().iter("testcase"))
            require(bool(cases) and all(case.find("failure") is None and case.find("error") is None
                                       and case.find("skipped") is None for case in cases), "RF_JUNIT_FAILED")
            report["tests"] = [{"name": case.get("name"), "seconds": case.get("time"), "status": "PASS"} for case in cases]
            report["status"] = "PASS"
            report["phase"] = "complete"
    except Exception as error:
        # No raw exception (HTTP/ADB/XML/file failures may quote private data).
        code = str(error)
        report["code"] = code if re.fullmatch(r"RF_[A-Z_]+", code) else "RF_DRIVER_FAILED"
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    (args.out / "result-sanitized.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
