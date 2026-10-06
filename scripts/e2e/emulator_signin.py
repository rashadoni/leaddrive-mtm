#!/usr/bin/env python3
"""The published APK on a clean Android emulator, up to the sign-in form.

Owner, 2026-10-05, about build 382: «на эмуляторе проверь, сделай тест E2E».
jest and tsc never install anything, and the device checklist
(MTMobileApp/docs/e2e-adb-checklist.md) needs the owner's phone on a cable. This
is the part of that acceptance a machine can do alone: take the APK an agent
downloads, install it on a device that has never seen the app, and walk the way
in — company step, sign-in form, their refusals — against the production server.

With a field account in the repository's secrets it goes on: signs in, opens
every tab, a client's card and the «propose a change» form, the profile, and
signs out. It reads and never writes — no workday is started, nothing is
submitted — because the account lives in a real company.

THIS REPOSITORY IS PUBLIC, and so are its run logs, summaries and artifacts.
From the moment the account's company is typed, nothing read from the screen is
kept or printed: no screenshot, no UI dump, no device log. A failed check names
only the app's own words (those found in its dictionaries) and test ids; the
company, the email and the password are replaced wherever they would appear.

Every check is read from the device (`uiautomator dump`, `dumpsys`, the crash
log), not from a screenshot. Screenshots are kept as evidence only.

Usage: emulator_signin.py <apk>
  E2E_OUT               evidence directory (default e2e-out)
  E2E_EXPECTED_VERSION  versionName the APK must carry, e.g. 3.3.0
  E2E_REF               commit the APK was built from: its en.json names the texts
  E2E_COMPANY           company to connect to (default app)
  E2E_SCREEN            logical screen to test on, e.g. 720x1600@320 (a budget handset)
  E2E_AGENT_COMPANY, E2E_AGENT_EMAIL, E2E_AGENT_PASSWORD
                        a field account, from secrets; without all three the
                        walk stops at the sign-in form
"""
import functools
import html
import json
import os
import re
import shlex
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
RESOURCES_FILE = "MTMobileApp/src/i18n/mobile-resources.ts"
SCREENS_DIR = "MTMobileApp/src/screens"
CLIENT_CARD = "MTMobileApp/src/screens/base/RouteContactDetailScreen.android.tsx"
CHANGE_FORM = "MTMobileApp/src/screens/base/RouteContactChangeRequestScreen.android.tsx"
AGENT_COMPANY = os.environ.get("E2E_AGENT_COMPANY", "")
AGENT_EMAIL = os.environ.get("E2E_AGENT_EMAIL", "")
AGENT_PASSWORD = os.environ.get("E2E_AGENT_PASSWORD", "")
SECRETS = [value for value in (AGENT_PASSWORD, AGENT_EMAIL, AGENT_COMPANY) if value]
private = False  # True from the moment the account's company is typed: see the note on top

APP_LABEL = "LeadDrive"
results = []  # (ok, what, detail)
not_responding = []  # titles of the system's «isn't responding» dialogs that were dismissed
asked_by_system = []  # packages of Android's own prompts that were declined: the walk only reads


def adb(*args, timeout=180, check=True):
    done = subprocess.run(["adb", *args], capture_output=True, timeout=timeout)
    text = (done.stdout + done.stderr).decode("utf-8", "replace")
    if check and done.returncode != 0:
        # The command line may carry what was typed into a field.
        raise RuntimeError(redact(f"adb {' '.join(args)} -> {done.returncode}: {text.strip()[:400]}"))
    return text


def shell(command, **kwargs):
    return adb("shell", command, **kwargs)


def nodes():
    """Visible UI nodes. uiautomator refuses while the window is not idle, so ask again."""
    for _ in range(10):
        raw = shell("uiautomator dump /sdcard/e2e-ui.xml >/dev/null 2>&1; cat /sdcard/e2e-ui.xml; rm -f /sdcard/e2e-ui.xml", check=False)
        if "<hierarchy" in raw:
            found = []
            for tag in re.findall(r"<node [^>]*>", raw):
                attrs = {key: html.unescape(value) for key, value in re.findall(r'([\w-]+)="([^"]*)"', tag)}
                box = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", attrs.get("bounds", ""))
                if box:
                    attrs["box"] = tuple(int(part) for part in box.groups())
                    found.append(attrs)
            # A hosted emulator is slow right after boot, and Android puts «Pixel
            # Launcher isn't responding» over whatever is in front. uiautomator
            # then describes the dialog, not the app (second run, 2026-10-05:
            # the app was up in 2.7 s and five minutes were spent looking at
            # the dialog). Press «Wait» and look again — and keep the title:
            # the same dialog about OUR app is a finding, not noise.
            # Android's own permission prompt (notifications, on first sign-in):
            # the walk only reads, so decline and look again.
            deny = by_id(found, "permission_deny_button")
            # …and the Settings dialog «Let app always run in background?» that
            # the Route tab raises for tracking (first signed-in run: it took
            # the focus and every tab after it was «not on screen»).
            packages = {n.get("package", "") for n in found}
            if not deny and PKG not in packages and packages & {"com.android.settings", "com.google.android.permissioncontroller", "com.android.permissioncontroller"}:
                deny = by_id(found, "button2")
            if deny:
                asked_by_system.append(next(iter(packages - {""}), "?"))
                print(f"declined a system prompt ({asked_by_system[-1]})", flush=True)
                tap(deny)
                time.sleep(2)
                continue
            wait_button = by_id(found, "aerr_wait")
            if wait_button:
                title = next((n.get("text", "") for n in found if n.get("resource-id", "").endswith("alertTitle")), "?")
                not_responding.append(title)
                print(f"dismissed: {title}", flush=True)
                tap(wait_button)
                time.sleep(4)
                continue
            return found, raw
        time.sleep(1.5)
    return [], ""


def by_id(found, test_id):
    return next((n for n in found if n.get("resource-id") == test_id or n.get("resource-id", "").endswith(f":id/{test_id}")), None)


def has_text(found, text):
    return any(text in n.get("text", "") or text in n.get("content-desc", "") for n in found)


def redact(text):
    for value in SECRETS:
        text = text.replace(value, "•••")
    return text


@functools.lru_cache(maxsize=None)
def source_of(path):
    """A file of the app as it was in the build under test."""
    source = subprocess.run(["git", "show", f"{REF}:{path}"], capture_output=True, text=True).stdout if REF else ""
    return source or open(path, encoding="utf-8").read()


@functools.lru_cache(maxsize=None)
def app_words():
    """Every text the app itself can show: its dictionaries, and the words its screens carry inline."""
    def flatten(node):
        if isinstance(node, dict):
            for value in node.values():
                yield from flatten(value)
        elif isinstance(node, str):
            yield node
    known = set(flatten(json.loads(source_of(LOCALE_FILE))))
    literal = r'"((?:[^"\\]|\\.)*)"'
    known.update(re.findall(literal, source_of(RESOURCES_FILE)))
    listing = subprocess.run(["git", "ls-tree", "-r", "--name-only", REF or "HEAD", SCREENS_DIR], capture_output=True, text=True).stdout
    for path in listing.split():
        if path.endswith((".ts", ".tsx")):
            known.update(re.findall(literal, source_of(path)))
    return frozenset(known)


def screen_copy(path):
    """English words a screen keeps inline (`const COPY = { ru: …, az: …, en: … }`), by key."""
    source = source_of(path)
    opening = re.search(r"\ben:\s*\{", source[source.index("const COPY"):])
    start = source.index("const COPY") + opening.end()
    depth, end = 1, start
    while depth:
        depth += {"{": 1, "}": -1}.get(source[end], 0)
        end += 1
    return dict(re.findall(r'(\w+):\s*"((?:[^"\\]|\\.)*)"', source[start:end - 1]))


def own_words(found):
    """What is on screen, safe to print: the app's words stay, everything else is «…»."""
    known = app_words()
    seen = [n.get("text", "") for n in found if n.get("text")]
    return "; ".join(text if text in known else "…" for text in seen)[:400]


def evidence(name):
    if private:
        return
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
    reason = (lines[at + 1] if at + 1 < len(lines) else lines[at]).split("AndroidRuntime:", 1)[-1].strip()
    # Once the account is in use, name the exception and leave its message out.
    return redact(reason.split(":", 1)[0] if private else reason)[:200]


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
    what, detail = redact(what), redact(detail)
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
    seen = own_words(found) if private else "; ".join(sorted({n.get("text", "") for n in found if n.get("text")}))[:300]
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
    return json.loads(source_of(LOCALE_FILE))[section]


def tab_captions():
    """English captions of the bottom tabs; they live in mobile-resources.ts, not in en.json."""
    for block in re.findall(r"navV2:\s*\{([^}]*)\}", source_of(RESOURCES_FILE)):
        pairs = dict(re.findall(r'(\w+):\s*"([^"]*)"', block))
        if pairs.get("home") == "Home":
            return pairs
    raise RuntimeError("no English navV2 block in mobile-resources.ts")


def type_text(value):
    # `input text` reads %s as a space; the device shell needs the rest quoted.
    shell("input text " + shlex.quote(value.replace(" ", "%s")))


def tap_text(found, text):
    """Tap the lowest node carrying exactly this text (a tab caption sits under any same-named title)."""
    matches = [n for n in found if n.get("text") == text or n.get("content-desc") == text]
    if not matches:
        return False
    tap(max(matches, key=lambda n: n["box"][1]))
    return True


KEY_LIKE = re.compile(r"^([a-z][A-Za-z0-9]*)(\.[A-Za-z0-9_]+)+$")
RAW_MARKERS = ("undefined", "[object Object]", "NaN", "TypeError")


def namespaces():
    """First words of the app's dictionary keys: «visit», «navV2», … A domain or a file name starts with none of them."""
    found = set(json.loads(source_of(LOCALE_FILE)).keys())
    found.update(re.findall(r"^\s{4}(\w+):\s*\{", source_of(RESOURCES_FILE), re.MULTILINE))
    return found


def screen_faults(found):
    """Things a person should never read: a dictionary key, or a raw value."""
    faults = []
    known = namespaces()
    for n in found:
        text = n.get("text", "")
        key = KEY_LIKE.match(text)
        if key and key.group(1) in known:
            faults.append(f"key «{text}»")
        for marker in RAW_MARKERS:
            if re.search(rf"(?<![\w]){re.escape(marker)}(?![\w])", text):
                faults.append(f"raw «{marker}»")
    return sorted(set(faults))


def scroll_until(check, swipes=6):
    """Swipe the page up until `check(nodes)` holds; the nodes then, or None."""
    for _ in range(swipes):
        seen, _ = nodes()
        if check(seen):
            return seen
        shell("input swipe 360 1100 360 500 300")
        time.sleep(1.5)
    return None


def client_rows(found, captions):
    """Clients in the list. A row is announced as «name. specialty» — the only pressable thing here that is not the app's own words."""
    search = by_id(found, "route-contacts-search")
    top = search["box"][3] if search else 0
    known = app_words()
    return [n for n in found
            if n.get("clickable") == "true" and ". " in n.get("content-desc", "") and n["box"][1] >= top
            and n["content-desc"] not in known and not n["content-desc"].startswith(tuple(captions))]


def client_card_walk(clients_caption, captions):
    """One client's card and the «propose a change» form, as far as they go without sending anything."""
    card, form = screen_copy(CLIENT_CARD), screen_copy(CHANGE_FORM)
    found, _ = nodes()
    tap_text(found, clients_caption)
    found = wait_for("The client list has its search field", lambda seen: by_id(seen, "route-contacts-search") and "shown", 30, "")
    time.sleep(3)
    found, _ = nodes()
    rows = client_rows(found, captions)
    record(len(rows) > 0, "The list shows the clients attached to the account", f"{len(rows)} on screen")
    if not rows:
        return
    tap(rows[0])
    found = wait_for("A client's card opens", lambda seen: has_text(seen, card["profile"]) and "essentials shown", 60, "")
    faults = screen_faults(found)
    record(not faults, "The card shows words, not keys or raw values", "; ".join(faults) if faults else "clean")

    seen = scroll_until(lambda page: has_text(page, card["propose"]) or has_text(page, card["requestPending"]))
    if seen and has_text(seen, card["propose"]):
        record(True, f"The card offers «{card['propose']}»")
        tap_text(seen, card["propose"])
        found = wait_for("…and it opens the form", lambda page: by_id(page, "contact-change-first-name") and "form shown", 60, "")
        hide_keyboard()
        found, _ = nodes()
        first, last = by_id(found, "contact-change-first-name"), by_id(found, "contact-change-last-name")
        record(bool(first and first.get("text") and last and last.get("text")), "The form starts from the client's current name")
        seen = scroll_until(lambda page: by_id(page, "contact-change-submit"))
        record(bool(seen), f"The form has «{form['submit']}»")
        if seen:
            # Nothing was changed, so the app refuses before asking the server:
            # the check comes first in the handler, and no request is made.
            tap(by_id(seen, "contact-change-submit"))
            wait_for("Sending with nothing changed is refused in words", lambda page: has_text(page, form["nothing"]) and "refused, nothing sent", 30, "")
        shell("input keyevent 4")
        time.sleep(2)
    elif seen:
        record(True, "The card says a request is already with the manager", "no second request can be proposed")
    else:
        record(False, f"The card offers «{card['propose']}»", "neither the button nor a pending request is on the card")
    # Back from the card to the list.
    for _ in range(3):
        found, _ = nodes()
        if by_id(found, "route-contacts-search"):
            break
        shell("input keyevent 4")
        time.sleep(2)


def signed_in_walk(server, sign_in):
    """Sign in with the field account, open every tab and the profile, sign out. Reads only."""
    global private
    if not (AGENT_COMPANY and AGENT_EMAIL and AGENT_PASSWORD):
        print("No field account in the secrets: the walk ends at the sign-in form.", flush=True)
        return
    profile, tabs = words("profile"), tab_captions()
    private = True
    print("Signing in with the field account. Nothing read from the screen is kept from here on.", flush=True)

    found, _ = nodes()
    tap(by_id(found, "tenant-input"))
    type_text(AGENT_COMPANY)
    hide_keyboard()
    found, _ = nodes()
    tap(by_id(found, "tenant-continue"))
    found = wait_for("The account's company opens the sign-in form", lambda seen: by_id(seen, "login-email") and "form shown", 120, "")
    tap(by_id(found, "login-email"))
    type_text(AGENT_EMAIL)
    hide_keyboard()
    found, _ = nodes()
    tap(by_id(found, "login-password"))
    type_text(AGENT_PASSWORD)
    hide_keyboard()
    found, _ = nodes()
    tap(by_id(found, "login-submit"))

    pressed = time.time()
    expected = [tabs["today"], tabs["calendar"], tabs["route"], tabs["tasks"], tabs["more"]]
    outcome, found = None, []
    while outcome is None and time.time() - pressed < 150:
        found, _ = nodes()
        if all(has_text(found, caption) for caption in expected):
            outcome = "in"
        elif has_text(found, sign_in["invalidCredentialsHelp"]):
            outcome = "refused"
        elif crash_line():
            outcome = "crashed"
        else:
            time.sleep(2)
    what = "The field account signs in and the tabs appear"
    if outcome != "in":
        reason = {"refused": "the server refused the email and password kept in the secrets",
                  "crashed": f"the app crashed: {crash_line()}"}.get(outcome, f"no tabs in 150 s; on screen: {own_words(found) or 'nothing readable'}")
        record(False, what, reason)
        return
    record(True, what, f"{time.time() - pressed:.0f} s after the button")

    clients = tabs["clients"] if has_text(found, tabs["clients"]) else tabs["places"]
    record(has_text(found, clients), "All six tabs are there", ", ".join([tabs["today"], tabs["calendar"], tabs["route"], clients, tabs["tasks"], tabs["more"]]))

    for caption in (tabs["calendar"], tabs["route"], clients, tabs["tasks"], tabs["more"], tabs["today"]):
        found, _ = nodes()
        if not tap_text(found, caption):
            record(False, f"«{caption}» opens", "its caption is not on screen")
            continue
        time.sleep(5)
        found, _ = nodes()
        crashed = crash_line()
        faults = screen_faults(found)
        texts = sum(1 for n in found if n.get("text"))
        record(not crashed and not faults and texts >= 3, f"«{caption}» opens and shows words, not keys or raw values",
               f"crashed: {crashed}" if crashed else "; ".join(faults) if faults else f"{texts} texts on screen")
        if crashed:
            return

    if clients == tabs["clients"]:
        client_card_walk(clients, list(tabs.values()))
        if crash_line():
            return

    found, _ = nodes()
    tap_text(found, tabs["more"])
    found = wait_for("«More» lists the profile", lambda seen: by_id(seen, "more-action-Profile") and "entry found", 30, "")
    tap(by_id(found, "more-action-Profile"))
    version = f"v{EXPECTED_VERSION}" if EXPECTED_VERSION else "Route & Field v"

    def scrolled_to(text):
        return scroll_until(lambda page: has_text(page, text))

    seen = scrolled_to(profile["logout"])
    record(bool(seen), "The profile opens and offers to log out")
    if not seen:
        return
    below, _ = nodes()
    shell("input swipe 360 1100 360 400 300")
    time.sleep(1.5)
    bottom, _ = nodes()
    record(has_text(below, version) or has_text(bottom, version), "The profile names the version of this build", version)

    seen = scrolled_to(profile["logout"])
    if seen and tap_text(seen, profile["logout"]):
        found = wait_for("Logging out asks to confirm", lambda again: has_text(again, profile["logoutMessage"]) and "confirmation shown", 30, "")
        tap_text(found, profile["logoutConfirm"])
        wait_for("After logging out the app is back at the way in", lambda again: (by_id(again, "login-email") or by_id(again, "tenant-input")) and "signed out", 60, "")



def finish():
    crash = adb("logcat", "-b", "crash", "-d", check=False)
    crashed = PKG in crash
    with open(f"{OUT}/crash.log", "w", encoding="utf-8") as file:
        # Stack frames only once the account was used: an exception message may quote data.
        file.write("\n".join(line for line in crash.splitlines() if "\tat " in line or "at com." in line) if private else crash)
    if not private:
        with open(f"{OUT}/logcat.log", "w", encoding="utf-8") as file:
            file.write(adb("logcat", "-d", check=False))
    alive = shell(f"pidof {PKG}", check=False).strip()
    focus = re.search(r"mCurrentFocus=.*", shell("dumpsys window", check=False))
    record(not crashed, "The app did not crash", crash_line() if crashed else "the crash log does not name it")
    # The system's dialogs are switched off on this emulator (see main), so the
    # activity manager's own log line is the witness.
    frozen = re.findall(r"ANR in (\S+)", adb("logcat", "-d", check=False))
    ours = [name for name in frozen if name.startswith(PKG)] + [title for title in not_responding if APP_LABEL in title]
    others = sorted({name for name in frozen if not name.startswith(PKG)})
    record(not ours, "Android never reported the app as not responding",
           (f"{len(ours)} time(s)" if ours else "no ANR of the app in the log") + (f"; the emulator's own: {', '.join(others)}" if others else ""))
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

    # A hosted emulator renders in software, and its launcher freezes often
    # enough for Android to keep «Pixel Launcher isn't responding» on top of
    # whatever is in front (third run: 35 dialogs in five minutes, none about
    # the app). The device is disposable: switch the dialogs off and read
    # freezes from the log instead.
    shell("settings put global hide_error_dialogs 1", check=False)

    # The audit's «above the fold» rule (B20) was measured on a flagship. Agents
    # carry cheaper phones; measure on the screen one of those has.
    screen = os.environ.get("E2E_SCREEN", "")
    if screen:
        size, _, density = screen.partition("@")
        shell(f"wm size {size}")
        if density:
            shell(f"wm density {density}")
        time.sleep(8)

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

    # Let the freshly booted system finish its own start-up before timing ours.
    time.sleep(20)
    nodes()
    adb("logcat", "-c", check=False)
    started = time.time()
    shell(f"monkey -p {PKG} -c android.intent.category.LAUNCHER 1")
    found = wait_for("First launch opens the company step", lambda seen: by_id(seen, "tenant-input") and f"{time.time() - started:.0f} s after the tap", 300, "01-company-step")
    for key in ("stepProgress", "companyTitle"):
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
    outcome, deadline = None, time.time() + 120
    while outcome is None and time.time() < deadline:
        seen, _ = nodes()
        outcome = next((text for text in refusals if has_text(seen, text)), None) or ("accepted" if by_id(seen, "login-email") else None)
        if outcome is None:
            time.sleep(2)
    evidence("03-company-unknown")
    what = "A company that does not exist is refused"
    if outcome == "accepted":
        # Fourth run, 2026-10-05: the server's ping answers «success» under any
        # *.leaddrivecrm.org name, so a misspelt company reaches the sign-in
        # form and the agent is later told to check the password.
        record(False, what, f"«{unknown}» was accepted: the sign-in form opened for {unknown}.leaddrivecrm.org")
        seen, _ = nodes()
        tap(by_id(seen, "switch-tenant"))
        wait_for("…and the form lets the agent go back to choose again", lambda again: by_id(again, "tenant-input") and "back on step 1", 60, "03b-company-again")
    elif outcome:
        record(True, what, outcome)
    else:
        record(False, what, "neither a refusal nor the sign-in form in 120 s")
        return finish()

    # A real company, through the button this time.
    found, _ = nodes()
    clear_field(by_id(found, "tenant-input"), len(unknown))
    shell(f"input text {COMPANY}")
    hide_keyboard()
    found = wait_for("The connect button is on screen with the keyboard closed", lambda seen: by_id(seen, "tenant-continue") and "found", 30, "04-company-typed")
    record(has_text(found, server["connectButton"]), f"The button says «{server['connectButton']}»")
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
    # `wm size` prints the physical size first and the override after it; the
    # screen the app lays out on is the last one. The system's navigation bar
    # takes the bottom of it.
    height = int(re.findall(r"(\d+)x(\d+)", shell("wm size"))[-1][1])
    bar = by_id(found, "navigationBarBackground")
    fold = bar["box"][1] if bar else height
    submit = by_id(found, "login-submit")
    if submit:
        record(submit["box"][3] <= fold, "The sign-in button is above the fold", f"bottom edge {submit['box'][3]}, screen ends at {fold} of {height} px")
        tap(submit)
        wait_for("Signing in with nothing typed is refused in words", lambda seen: has_text(seen, sign_in["validationMissing"]), 30, "06-sign-in-empty")

    # The way back to another company.
    found, _ = nodes()
    switch = by_id(found, "switch-tenant")
    record(bool(switch), "The form offers to change the company")
    if switch:
        tap(switch)
        wait_for("Changing the company returns to the company step", lambda seen: by_id(seen, "tenant-input") and "back on step 1", 60, "07-company-again")
        signed_in_walk(server, sign_in)
    return finish()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
