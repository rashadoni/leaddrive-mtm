#!/usr/bin/env python3
"""The published APK on a clean Android emulator, up to the sign-in form.

Owner, 2026-10-05, about build 382: «на эмуляторе проверь, сделай тест E2E».
jest and tsc never install anything, and the device checklist
(MTMobileApp/docs/e2e-adb-checklist.md) needs the owner's phone on a cable. This
is the part of that acceptance a machine can do alone: take the APK an agent
downloads, install it on a device that has never seen the app, and walk the way
in — company step, sign-in form, their refusals — against the production server.

It never types a password. What comes after sign-in needs a field account, and
that stays with a person until the owner provides one for tests.

Every check is read from the device (`uiautomator dump`, `dumpsys`, the crash
log), not from a screenshot. Screenshots are kept as evidence only.

Usage: emulator_signin.py <apk>
  E2E_OUT               evidence directory (default e2e-out)
  E2E_EXPECTED_VERSION  versionName the APK must carry, e.g. 3.3.0
  E2E_REF               commit the APK was built from: its en.json names the texts
  E2E_COMPANY           company to connect to (default app)
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zipfile

PKG = "com.mtmobileapp"
OUT = os.environ.get("E2E_OUT", "e2e-out")
COMPANY = os.environ.get("E2E_COMPANY", "app")
EXPECTED_VERSION = os.environ.get("E2E_EXPECTED_VERSION", "")
REF = os.environ.get("E2E_REF", "")
LOCALE_FILE = "MTMobileApp/src/i18n/locales/en.json"

results = []  # (ok, what, detail)


def adb(*args, timeout=180, check=True):
    done = subprocess.run(["adb", *args], capture_output=True, timeout=timeout)
    text = (done.stdout + done.stderr).decode("utf-8", "replace")
    if check and done.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)} -> {done.returncode}: {text.strip()[:400]}")
    return text


def shell(command, **kwargs):
    return adb("shell", command, **kwargs)


def nodes():
    """Visible UI nodes. uiautomator refuses while the window is not idle, so ask again."""
    for _ in range(6):
        raw = shell("uiautomator dump /sdcard/e2e-ui.xml >/dev/null 2>&1; cat /sdcard/e2e-ui.xml; rm -f /sdcard/e2e-ui.xml", check=False)
        if "<hierarchy" in raw:
            found = []
            for tag in re.findall(r"<node [^>]*>", raw):
                attrs = {key: html.unescape(value) for key, value in re.findall(r'([\w-]+)="([^"]*)"', tag)}
                box = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attrs.get("bounds", ""))
                if box:
                    attrs["box"] = tuple(int(part) for part in box.groups())
                    found.append(attrs)
            return found, raw
        time.sleep(1.5)
    return [], ""


def by_id(found, test_id):
    return next((n for n in found if n.get("resource-id") == test_id or n.get("resource-id", "").endswith(f":id/{test_id}")), None)


def has_text(found, text):
    return any(text in n.get("text", "") or text in n.get("content-desc", "") for n in found)


def evidence(name):
    os.makedirs(OUT, exist_ok=True)
    png = subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=60).stdout
    with open(f"{OUT}/{name}.png", "wb") as file:
        file.write(png)
    found, raw = nodes()
    with open(f"{OUT}/{name}.xml", "w", encoding="utf-8") as file:
        file.write(raw)
    with open(f"{OUT}/{name}.txt", "w", encoding="utf-8") as file:
        for n in found:
            label = n.get("text") or n.get("content-desc")
            if label or n.get("resource-id"):
                file.write(f"{n['box']} id={n.get('resource-id', '')} {label}\n")


def crash_line():
    """First line of the app's own crash, or "" while it has not crashed."""
    log = adb("logcat", "-b", "crash", "-d", check=False)
    if PKG not in log:
        return ""
    lines = log.splitlines()
    at = next(index for index, line in enumerate(lines) if PKG in line)
    reason = lines[at + 1] if at + 1 < len(lines) else lines[at]
    return reason.split("AndroidRuntime:", 1)[-1].strip()[:200]


def unpack_handset_code(apk, device_abis):
    """Let a handset APK start on an Intel emulator, without touching the APK.

    The release carries ARM code only, stored inside the APK. The emulator
    translates arm64, and Android installs the app as arm64 — but React Native's
    loader then looks inside the APK under the DEVICE's first ABI (x86_64),
    finds nothing and the app dies in MainApplication.onCreate with «couldn't
    find DSO to load: libreactnative.so» (first run of this script, 2026-10-05).
    A handset never takes that path: its first ABI is the APK's.

    The loader looks in the app's own library directory first. Unpacking the
    APK's arm64 libraries there is what Android itself does for an app built
    with extractNativeLibs; the installed APK stays byte for byte the published one.
    """
    with zipfile.ZipFile(apk) as archive:
        packed = {name.split("/")[1] for name in archive.namelist() if name.startswith("lib/") and name.endswith(".so")}
        first = device_abis.split(",")[0]
        if first in packed:
            return None
        if "arm64-v8a" not in packed or "arm64-v8a" not in device_abis:
            return f"APK has {sorted(packed)}, device runs {device_abis}: nothing in common"
        with tempfile.TemporaryDirectory() as folder:
            names = [name for name in archive.namelist() if name.startswith("lib/arm64-v8a/") and name.endswith(".so")]
            for name in names:
                with open(os.path.join(folder, os.path.basename(name)), "wb") as file:
                    file.write(archive.read(name))
            adb("root", check=False)
            adb("wait-for-device")
            time.sleep(2)
            base = shell(f"pm path {PKG}").strip().splitlines()[0].replace("package:", "")
            target = os.path.dirname(base) + "/lib/arm64"
            shell("rm -rf /data/local/tmp/e2e-libs")
            adb("push", folder, "/data/local/tmp/e2e-libs", timeout=600)
            shell(f"mkdir -p {target} && cp /data/local/tmp/e2e-libs/*.so {target}/ && chown -R system:system {os.path.dirname(target)} "
                  f"&& chmod 755 {os.path.dirname(target)} {target} && chmod 644 {target}/*.so && restorecon -R {os.path.dirname(target)} && rm -rf /data/local/tmp/e2e-libs")
            count = shell(f"ls {target} | wc -l").strip()
            shell(f"am force-stop {PKG}")
            return f"{count} of {len(names)} arm64 libraries unpacked next to the unchanged APK"


def record(ok, what, detail=""):
    results.append((ok, what, detail))
    print(("PASS  " if ok else "FAIL  ") + what + (f" — {detail}" if detail else ""), flush=True)


def wait_for(what, check, timeout, name):
    """Poll the screen until `check(nodes)` holds; keep evidence either way."""
    started = time.time()
    found = []
    while time.time() - started < timeout:
        found, _ = nodes()
        detail = check(found)
        if detail:
            evidence(name)
            record(True, what, detail if isinstance(detail, str) else f"{time.time() - started:.0f} s")
            return found
        crashed = crash_line()
        if crashed:
            evidence(name)
            record(False, what, f"the app crashed: {crashed}")
            raise SystemExit(finish())
        time.sleep(2)
    evidence(name)
    seen = "; ".join(sorted({n.get("text", "") for n in found if n.get("text")}))[:300]
    record(False, what, f"not seen in {timeout} s; on screen: {seen or 'nothing readable'}")
    raise SystemExit(finish())


def tap(node):
    x1, y1, x2, y2 = node["box"]
    shell(f"input tap {(x1 + x2) // 2} {(y1 + y2) // 2}")


def keyboard_shown():
    return "mInputShown=true" in shell("dumpsys input_method", check=False)


def hide_keyboard():
    # BACK closes the keyboard — and leaves the app when there is none.
    if keyboard_shown():
        shell("input keyevent 4")
        time.sleep(1)


def clear_field(node, length):
    tap(node)
    shell("input keyevent 123 " + " ".join(["67"] * (length + 2)))


def words(section):
    source = subprocess.run(["git", "show", f"{REF}:{LOCALE_FILE}"], capture_output=True, text=True).stdout if REF else ""
    if not source:
        source = open(LOCALE_FILE, encoding="utf-8").read()
    return json.loads(source)[section]


def finish():
    crash = adb("logcat", "-b", "crash", "-d", check=False)
    with open(f"{OUT}/crash.log", "w", encoding="utf-8") as file:
        file.write(crash)
    crashed = PKG in crash
    with open(f"{OUT}/logcat.log", "w", encoding="utf-8") as file:
        file.write(adb("logcat", "-d", check=False))
    alive = shell(f"pidof {PKG}", check=False).strip()
    focus = re.search(r"mCurrentFocus=.*", shell("dumpsys window", check=False))
    record(not crashed, "The app did not crash", crash_line() if crashed else "the crash log does not name it")
    record(bool(alive) and bool(focus) and PKG in focus.group(0), "The app is still running in the foreground", (focus.group(0) if focus else "no focused window")[:120])

    failed = [row for row in results if not row[0]]
    lines = ["| | Check | Measured |", "|---|---|---|"]
    lines += [f"| {'✅' if ok else '❌'} | {what} | {detail.replace('|', '/')} |" for ok, what, detail in results]
    report = "\n".join(lines) + "\n"
    with open(f"{OUT}/report.md", "w", encoding="utf-8") as file:
        file.write(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as file:
            file.write(f"### {len(results) - len(failed)} of {len(results)} checks passed\n\n{report}")
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed", flush=True)
    return 1 if failed else 0


def main(apk):
    os.makedirs(OUT, exist_ok=True)
    server, sign_in = words("server"), words("auth")

    android = shell("getprop ro.build.version.release").strip()
    abis = shell("getprop ro.product.cpu.abilist").strip()
    print(f"device: Android {android}, ABIs {abis}", flush=True)

    installed = adb("install", "-r", apk, timeout=600, check=False)
    record("Success" in installed, "The published APK installs on a clean device", f"Android {android}, {abis}: {installed.strip().splitlines()[-1][:160]}")
    if "Success" not in installed:
        return finish()

    package = shell(f"dumpsys package {PKG}")
    version = (re.search(r"versionName=(\S+)", package) or [None, "?"])[1]
    abi = (re.search(r"primaryCpuAbi=(\S+)", package) or [None, "?"])[1]
    record(not EXPECTED_VERSION or version == EXPECTED_VERSION, "It is the version the release says", f"versionName {version}, runs as {abi}")

    unpacked = unpack_handset_code(apk, abis)
    if unpacked:
        ok = "unpacked" in unpacked
        record(ok, "Handset (ARM) code made loadable on this Intel emulator", unpacked)
        if not ok:
            return finish()

    adb("logcat", "-c", check=False)
    started = time.time()
    shell(f"monkey -p {PKG} -c android.intent.category.LAUNCHER 1")
    found = wait_for("First launch opens the company step", lambda seen: by_id(seen, "tenant-input") and f"{time.time() - started:.0f} s after the tap", 300, "01-company-step")
    for key in ("stepProgress", "companyTitle", "connectButton"):
        record(has_text(found, server[key]), f"Company step says «{server[key]}»")

    # An empty company is refused in words, without a request.
    tap(by_id(found, "tenant-input"))
    shell("input keyevent 66")
    wait_for("An empty company is refused in words", lambda seen: has_text(seen, server["validationMissing"]), 30, "02-company-empty")

    # A company that does not exist: the refusal comes from the server.
    unknown = "e2e-no-such-company"
    tap(by_id(found, "tenant-input"))
    shell(f"input text {unknown}")
    shell("input keyevent 66")
    refusals = (server["serverNotFoundHelp"], server["couldNotConnectHelp"])
    wait_for("An unknown company is refused, not accepted", lambda seen: next((text for text in refusals if has_text(seen, text)), None), 120, "03-company-unknown")

    # A real company, through the button this time.
    found, _ = nodes()
    clear_field(by_id(found, "tenant-input"), len(unknown))
    shell(f"input text {COMPANY}")
    hide_keyboard()
    found = wait_for("The connect button is on screen with the keyboard closed", lambda seen: by_id(seen, "tenant-continue") and "found", 30, "04-company-typed")
    tap(by_id(found, "tenant-continue"))
    connected = time.time()
    found = wait_for("A real company leads to the sign-in form", lambda seen: by_id(seen, "login-email") and f"{time.time() - connected:.0f} s to answer", 120, "05-sign-in-form")
    hide_keyboard()
    found, _ = nodes()
    domain = f"{COMPANY}.leaddrivecrm.org"
    record(has_text(found, sign_in["stepProgress"]), f"Sign-in step says «{sign_in['stepProgress']}»")
    record(has_text(found, domain), "The form names the company it will sign in to", domain)
    for test_id in ("login-email", "login-password", "login-submit"):
        record(bool(by_id(found, test_id)), f"Sign-in form has «{test_id}»")

    # B20 of the field audit: both fields and the button without scrolling.
    height = int(re.search(r"(\d+)x(\d+)", shell("wm size")).group(2))
    submit = by_id(found, "login-submit")
    if submit:
        record(submit["box"][3] <= height, "The sign-in button is above the fold", f"bottom edge {submit['box'][3]} of {height} px")
        tap(submit)
        wait_for("Signing in with nothing typed is refused in words", lambda seen: has_text(seen, sign_in["validationMissing"]), 30, "06-sign-in-empty")

    # The way back to another company.
    found, _ = nodes()
    switch = by_id(found, "switch-tenant")
    record(bool(switch), "The form offers to change the company")
    if switch:
        tap(switch)
        wait_for("Changing the company returns to the company step", lambda seen: by_id(seen, "tenant-input") and "back on step 1", 60, "07-company-again")
    return finish()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
