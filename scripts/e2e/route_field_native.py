"""Bounded, private-output driver for guarded Route & Field Maestro journeys.

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

from route_field_guard import (agent_shell, auth_form, fixture_auth_form, manager_shell, owner_permissions, require, verify_apk,
                               verify_auth_preserved, verify_manager_case,
                               verify_fixture_case, verify_zeytun_qa_case, verify_observation_window, verify_owner_task_case)

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
    parser.add_argument("--flow", choices=("auth-entry", "employee-tabs", "task-start", "task-complete", "manager-signin", "manager-tabs", "fixture-signin", "fixture-signin-resume", "fixture-missing-coordinates", "fixture-location-request", "fixture-visit-start", "fixture-visit-photo", "fixture-visit-complete", "zeytun-missing-coordinates", "zeytun-location-request", "zeytun-visit-start", "zeytun-visit-photo", "zeytun-visit-progress-read", "zeytun-visit-complete", "zeytun-offline-persistence"), default="auth-entry")
    parser.add_argument("--task-case", type=Path)
    parser.add_argument("--manager-case", type=Path)
    parser.add_argument("--fixture-case", type=Path)
    parser.add_argument("--qa-case", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    # Refuse reuse: every attempt, including failures, keeps its original evidence.
    args.out.mkdir(mode=0o700)
    task_flow = args.flow in ("task-start", "task-complete")
    manager_flow = args.flow in ("manager-signin", "manager-tabs")
    manager_switch = args.flow == "manager-signin"
    fixture_flow = args.flow.startswith("fixture-")
    qa_flow = args.flow.startswith("zeytun-")
    fixture_switch = args.flow in ("fixture-signin", "fixture-signin-resume")
    fixture_resume = args.flow == "fixture-signin-resume"
    flow_group = "qa" if qa_flow else "fixtures" if fixture_flow else "journeys" if task_flow or manager_switch else "smoke"
    flow_name = args.flow.removeprefix("zeytun-") if qa_flow else args.flow.removeprefix("fixture-") if fixture_flow else args.flow
    report = {"status": "FAIL", "flow": flow_group + "/" + flow_name, "phase": "preflight"}
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
            fixture_case = None
            if fixture_flow:
                require(args.fixture_case is not None, "RF_FIXTURE_CASE_REQUIRED")
                fixture_case = private_json(args.fixture_case)
                verify_fixture_case(fixture_case, expected["publishedSourceSha"])
                if args.flow.startswith("fixture-visit-") or args.flow == "fixture-location-request":
                    report["ownerPermissionsBefore"] = owner_permissions(package)
                    require(report["ownerPermissionsBefore"]["ACCESS_FINE_LOCATION"]["granted"],
                            "RF_LOCATION_PERMISSION_REQUIRED")
                if args.flow == "fixture-location-request":
                    require(fixture_case["bootstrap"].get("policies", {}).get("agentPermissions", {})
                            .get("customerLocationRequest") is True, "RF_LOCATION_REQUEST_DISABLED")
            qa_case = None
            if qa_flow:
                require(args.qa_case is not None, "RF_ZEYTUN_CASE_REQUIRED")
                qa_case = private_json(args.qa_case)
                verify_zeytun_qa_case(qa_case, expected["publishedSourceSha"])
                if args.flow.startswith("zeytun-visit-") or args.flow == "zeytun-location-request":
                    report["ownerPermissionsBefore"] = owner_permissions(package)
                    require(report["ownerPermissionsBefore"]["ACCESS_FINE_LOCATION"]["granted"],
                            "RF_LOCATION_PERMISSION_REQUIRED")
            manager_case = None
            if manager_flow:
                require(args.manager_case is not None, "RF_MANAGER_CASE_REQUIRED")
                manager_case = private_json(args.manager_case)
                verify_manager_case(manager_case, expected["publishedSourceSha"])
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
            # Retain the actual window even when a shell admission check fails.
            (args.out / "preflight-private.xml").write_text(before_xml)
            if (task_flow or manager_switch or (fixture_flow and not fixture_switch) or qa_flow) and agent_shell(before_xml, home_required=False) is None:
                root = ET.fromstring(before_xml)
                tab = next(node for node in root.iter("node") if node.get("package") == PACKAGE
                           and node.get("resource-id") == "guide-spot-tab.Today")
                bounds = list(map(int, re.findall(r"\d+", tab.get("bounds", ""))))
                require(len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1], "RF_HOME_TAB_REFUSED")
                adb("shell", "input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                before_xml = ui()
            if fixture_resume:
                before = fixture_auth_form(before_xml, placeholder)
            elif fixture_switch:
                before = manager_shell(before_xml)
            elif manager_switch:
                before = agent_shell(before_xml)
                require(before.endswith(", " + manager_case["priorAgent"]["name"]), "RF_MANAGER_PRIOR_AGENT_REFUSED")
                own_texts = [node.get("text") for node in ET.fromstring(before_xml).iter("node")
                             if node.get("package") == PACKAGE]
                require(manager_case.get("cleanSyncText") in own_texts, "RF_UNSYNCED_AGENT_REFUSED")
            elif args.flow == "manager-tabs":
                before = manager_shell(before_xml)
            else:
                before = auth_form(before_xml, placeholder) if args.flow == "auth-entry" else agent_shell(before_xml)
                if fixture_flow:
                    require(before.endswith(", " + fixture_case["expectedName"]), "RF_FIXTURE_IDENTITY_REFUSED")
            if qa_flow:
                require(before.endswith(", " + qa_case["agent"]["name"]), "RF_ZEYTUN_IDENTITY_REFUSED")
            (args.out / "before-private.xml").write_text(before_xml)
            flow = APP / f".maestro/route-field/{flow_group}/{flow_name}.yaml"
            labels = flow.parent.parent / "shared/labels.js"
            report["flowSha256"] = hashlib.sha256(flow.read_bytes()).hexdigest()
            report["labelsSha256"] = hashlib.sha256(labels.read_bytes()).hexdigest()
            dependencies = [Path(__file__), Path(__file__).with_name("route_field_guard.py"), flow, labels]
            if task_flow:
                dependencies += [flow.parent.parent / "shared/task-labels.js", flow.parent.parent / "shared/open-owner-test-task.yaml"]
            if manager_flow:
                dependencies.append(flow.parent.parent / "shared/manager-labels.js")
            if fixture_flow:
                dependencies.append(flow.parent.parent / "shared/fixture-labels.js")
                if fixture_switch:
                    dependencies.append(flow.parent.parent / "shared/fixture-auth.yaml")
                if args.flow.startswith("fixture-visit-"):
                    dependencies.append(flow.parent.parent / "shared/open-fixture-visits.yaml")
            if qa_flow:
                dependencies += [flow.parent.parent / "shared/qa-labels.js"]
                if args.flow.startswith("zeytun-visit-"):
                    dependencies.append(flow.parent.parent / "shared/open-fixture-visits.yaml")
            report["sourceFilesSha256"] = {str(path.relative_to(REPO)): hashlib.sha256(path.read_bytes()).hexdigest()
                                         for path in dependencies}
            report["phase"] = "maestro"
            env = os.environ.copy()
            env.update(JAVA_HOME=str(args.java_home), JAVA_OPTS="-Xmx512m", MAESTRO_CLI_NO_ANALYTICS="1",
                       MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="true")
            gate = "RF_AUTH_PREFLIGHT=blank-password-v1" if args.flow == "auth-entry" else "RF_SHELL_PREFLIGHT=agent-readonly-v1"
            if task_flow:
                gate = "RF_TASK_PREFLIGHT=owner-web-created-v1"
            if manager_flow:
                gate = "RF_MANAGER_PREFLIGHT=owner-verified-manager-readonly-v1"
            if fixture_flow:
                gate = "RF_FIXTURE_PREFLIGHT=separate-owned-route-field-v1"
            if qa_flow:
                gate = "RF_QA_PREFLIGHT=zeytun-owner-selected-qa-v1"
            command = [str(args.maestro), "test", "-e", "LOCALE=" + args.locale,
                       "-e", gate]
            if task_case:
                for key, value in (("TASK_ID", task_case["taskId"]), ("TASK_TITLE", task_case["title"]), ("TASK_RESULT", task_case["result"])):
                    command += ["-e", key + "=" + value]
            run_path = flow
            private_env = None
            if manager_case:
                # Keep credentials out of command lines, tracked flows and public
                # reports. Maestro reads a private wrapper inside this 0700 run.
                profile = words["profile"]
                private_env = {"RF_MANAGER_NAME": manager_case["manager"]["name"],
                               "RF_MANAGER_EMAIL": manager_case["manager"]["email"],
                               "RF_AGENT_NAME": manager_case["priorAgent"]["name"],
                               "RF_AGENT_ID": manager_case["priorAgent"]["id"],
                               "RF_LOGOUT": profile["logout"], "RF_LOGOUT_CONFIRM": profile["logoutConfirm"],
                               "RF_LOGOUT_MESSAGE": profile["logoutMessage"]}
                if manager_switch:
                    private_env["RF_MANAGER_PASSWORD"] = manager_case["login"]["password"]
            if fixture_case:
                profile = words["profile"]
                prior = fixture_case.get("priorManager") or {}
                require(bool(prior.get("name")) and bool(prior.get("email")), "RF_FIXTURE_PRIOR_ACCOUNT_REQUIRED")
                private_env = {"RF_FIXTURE_NAME": fixture_case["expectedName"],
                               "RF_FIXTURE_EMAIL": fixture_case["login"]["email"],
                               "RF_FIXTURE_COMPANY_NAME": fixture_case["companyName"],
                               "RF_PRIOR_MANAGER_NAME": prior["name"], "RF_PRIOR_MANAGER_EMAIL": prior["email"],
                               "RF_SWITCH_COMPANY": profile["switchServer"], "RF_SWITCH_CONFIRM": profile["switchConfirm"],
                               "RF_SWITCH_MESSAGE": profile["switchMessage"], "RF_NO_COORDINATES": words["visit"]["noCoordinatesTitle"],
                               "RF_VISIT_CHECKIN": words["visit"]["checkInButton"],
                               "RF_CUSTOMER_HERE": words["visit"]["customerIsHere"],
                               "RF_PHOTO_CAPTURE": words["photoCapture"]["capture"],
                               "RF_PHOTO_USE": words["photoCapture"]["usePhoto"],
                               "RF_PHOTO_ALLOW": words["photoCapture"]["allow"],
                               "RF_PHOTO_PERMISSION_BODY": words["photoCapture"]["permissionBody"],
                               "RF_NOTES_PLACEHOLDER": words["notesModal"]["placeholder"],
                               "RF_NOTES_SUBMIT": words["notesModal"]["submit"]}
                if fixture_switch:
                    require(re.fullmatch(r"RF-E2E-[0-9]{8}-[0-9]{4} CRM-mobile-CRM TEST",
                                         fixture_case.get("priorTaskTitle", "")), "RF_PRIOR_TASK_REQUIRED")
                    private_env["RF_FIXTURE_PASSWORD"] = fixture_case["login"]["password"]
                    private_env["RF_PRIOR_TASK_TITLE"] = fixture_case["priorTaskTitle"]
            if qa_case:
                private_env = {"RF_QA_CUSTOMER_NAME": qa_case["customer"]["name"],
                    "RF_QA_NO_COORDINATES": words["visit"]["noCoordinatesTitle"],
                    "RF_QA_CHECKIN": words["visit"]["checkInButton"],
                    "RF_QA_CUSTOMER_HERE": words["visit"]["customerIsHere"],
                    "RF_QA_PHOTO_CAPTURE": words["photoCapture"]["capture"],
                    "RF_QA_PHOTO_USE": words["photoCapture"]["usePhoto"],
                    "RF_QA_PHOTO_ALLOW": words["photoCapture"]["allow"],
                    "RF_QA_PHOTO_PERMISSION_BODY": words["photoCapture"]["permissionBody"],
                    "RF_QA_NOTES_PLACEHOLDER": words["notesModal"]["placeholder"],
                    "RF_QA_NOTES_SUBMIT": words["notesModal"]["submit"]}
            if private_env:
                run_path = args.out / "flow-private.yaml"
                run_path.write_text("appId: " + PACKAGE + "\nenv: " + json.dumps(private_env, ensure_ascii=False)
                                    + "\n---\n- runFlow: " + json.dumps(str(flow)) + "\n")
            command += ["--format", "junit",
                       "--output", str(args.out / "report.xml"), "--debug-output", str(args.out), str(run_path)]
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
            # Preserve the Maestro outcome even when a failed flow leaves a
            # detail screen/modal that cannot satisfy the shell postflight.
            cases = list(ET.parse(args.out / "report.xml").getroot().iter("testcase")) if (args.out / "report.xml").is_file() else []
            report["tests"] = [{"name": case.get("name"), "seconds": case.get("time"),
                                "status": "PASS" if all(case.find(key) is None for key in ("failure", "error", "skipped")) else "FAIL"}
                               for case in cases]
            after_xml = ui()
            (args.out / "after-private.xml").write_text(after_xml)
            require(code == 0, "RF_MAESTRO_FAILED")
            if args.flow == "auth-entry":
                verify_auth_preserved(before, auth_form(after_xml, placeholder))
                report["loginDraftPreserved"] = True
            elif qa_flow:
                require(agent_shell(after_xml).endswith(", " + qa_case["agent"]["name"]), "RF_ZEYTUN_IDENTITY_REFUSED")
                report["zeytunQaAgentShellVerified"] = True
                report["qaCustomerId"] = qa_case["customer"]["id"]
            elif fixture_flow:
                greeting = agent_shell(after_xml)
                require(greeting.endswith(", " + fixture_case["expectedName"]), "RF_FIXTURE_IDENTITY_REFUSED")
                report["fictionalAgentShellVerified"] = True
            elif manager_flow:
                manager_shell(after_xml)
                report["managerShellVerified"] = True
            else:
                require(before == agent_shell(after_xml), "RF_HOME_IDENTITY_CHANGED")
                report["sameSignedInGreeting"] = True
            require((args.out / "report.xml").is_file(), "RF_JUNIT_MISSING")
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
