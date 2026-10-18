#!/usr/bin/env python3
"""Google Play's background-location declaration video, filmed on the emulator.

Play asks for a short video of the feature that uses location in the
background: from the app's own disclosure to Android's «Allow all the time»,
and the feature at work with the app closed. Owner, 2026-10-18: film it on the
emulator with a new demo agent of the demo company LeadDrive Inc., without
touching his phone.

What is filmed, in segments (the sign-in is not):
  A «Start day» → the app's disclosure → «Continue» → Android's location sheet
    → «While using the app» (→ notifications «Allow»)
  B the Today card «Allow location all the time» → Android's page → «Allow all
    the time» → back to the app
  C Home: the app is closed, the shade shows «LeadDrive — workday»
  D back in the app → «Break» → the shade: the notification is gone
  E «End day» → «End workday»
The segments are joined into one file; idle waits fall between them.

IT WRITES: one workday of the demo agent is started and ended. So it refuses
any company but the demo one — and the repository, its logs and artifacts are
public, which the demo company may be in (the video goes to YouTube anyway).
Nothing typed is printed; the sign-in is never on film.

Usage: play_declaration_video.py <apk>
  E2E_AGENT_COMPANY, E2E_AGENT_EMAIL, E2E_AGENT_PASSWORD  the demo agent, from secrets
  E2E_OUT, E2E_REF, E2E_SCREEN, E2E_EXPECTED_VERSION      as for emulator_signin.py
"""
import html
import os
import re
import subprocess
import sys
import time

import emulator_signin as base
from emulator_signin import PKG, adb, by_id, hide_keyboard, record, shell, tap, type_text

DEMO_COMPANY = "leaddrive"
OUT = base.OUT
# The app's English words the walk presses or waits for. Checked against the
# build's own dictionaries first: a renamed button fails here, not mid-film.
WORDS = {
    "start": "Start day",
    "start_without_qr": "Start without QR",
    "return": "Return to work",
    "disclosure_title": "The app uses your location",
    "continue": "Continue",
    "always_card": "Allow location «all the time»",
    "allow": "Allow",
    "break": "Break",
    "resume": "Resume",
    "end": "End day",
    "end_confirm": "End workday",
    "finished": "Day finished",
}
PERMISSION_IDS = {
    "foreground": "permission_allow_foreground_only_button",
    "allow": "permission_allow_button",
    "always": "allow_always_radio_button",
}


def dump():
    """The screen as it is — unlike emulator_signin.nodes(), nothing is declined here."""
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
            return found
        time.sleep(1.5)
    return []


def text_node(found, text):
    """The lowest node of the app carrying exactly this text (a button sits below a same-named title)."""
    matches = [n for n in found if n.get("text") == text or n.get("content-desc") == text]
    return max(matches, key=lambda n: n["box"][1]) if matches else None


def wait(what, check, timeout=90, prompts=False):
    """Poll until check(nodes) holds; the nodes then, or None. Records the outcome, never the screen.

    With prompts, Android's notifications prompt is allowed on the way: the
    workday asks for it right after location, and the film needs the shade."""
    started = time.time()
    while time.time() - started < timeout:
        found = dump()
        if prompts and allow_notifications_if_asked(found):
            continue
        if check(found):
            record(True, what, f"{time.time() - started:.0f} s")
            return found
        crashed = base.crash_line()
        if crashed:
            record(False, what, f"the app crashed: {crashed}")
            return None
        time.sleep(1.5)
    record(False, what, f"not seen in {timeout} s; on screen: {base.own_words(dump()) or 'nothing readable'}")
    return None


def allow_notifications_if_asked(found):
    button = by_id(found, PERMISSION_IDS["allow"])
    if button:
        tap(button)
        time.sleep(2)
        return True
    return False


class Film:
    """screenrecord in segments: each stays under its 180 s limit and holds only the action."""

    def __init__(self):
        self.parts = []
        self.process = None

    def start(self, name):
        path = f"/sdcard/play-{len(self.parts) + 1:02d}-{name}.mp4"
        self.process = subprocess.Popen(["adb", "shell", "screenrecord", "--bit-rate", "6000000", "--time-limit", "170", path],
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.parts.append(path)
        time.sleep(1.5)

    def stop(self, hold=1.5):
        time.sleep(hold)
        shell("pkill -2 screenrecord", check=False)
        if self.process:
            try:
                self.process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None
        time.sleep(1.5)

    def join(self):
        os.makedirs(f"{OUT}/segments", exist_ok=True)
        local = []
        for path in self.parts:
            target = f"{OUT}/segments/{os.path.basename(path)}"
            adb("pull", path, target, check=False)
            if os.path.exists(target) and os.path.getsize(target) > 0:
                local.append(target)
        if not local:
            return None
        listing = f"{OUT}/segments/list.txt"
        with open(listing, "w", encoding="utf-8") as file:
            file.writelines(f"file '{os.path.abspath(path)}'\n" for path in local)
        video = f"{OUT}/play-background-location-declaration.mp4"
        done = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                               "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30", "-an", video],
                              capture_output=True, text=True)
        if done.returncode != 0:
            print("ffmpeg: " + done.stderr.strip()[:300], flush=True)
            return None
        return video


def duration(video):
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video],
                           capture_output=True, text=True).stdout.strip()
    try:
        return float(probe)
    except ValueError:
        return 0.0


def sign_in():
    """The way in, off camera. Notifications asked on the first sign-in are allowed: the film needs the shade."""
    found = wait("First launch opens the company step", lambda seen: by_id(seen, "tenant-input"), 300)
    if not found:
        return False
    base.private = True
    tap(by_id(found, "tenant-input"))
    type_text(DEMO_COMPANY)
    hide_keyboard()
    tap(by_id(dump(), "tenant-continue"))
    found = wait("The demo company opens the sign-in form", lambda seen: by_id(seen, "login-email"), 120)
    if not found:
        return False
    tap(by_id(found, "login-email"))
    type_text(base.AGENT_EMAIL)
    hide_keyboard()
    tap(by_id(dump(), "login-password"))
    type_text(base.AGENT_PASSWORD)
    hide_keyboard()
    tap(by_id(dump(), "login-submit"))
    started = time.time()
    while time.time() - started < 150:
        found = dump()
        if allow_notifications_if_asked(found):
            continue
        if any(text_node(found, WORDS[key]) for key in ("start", "start_without_qr", "return", "finished", "end")):
            record(True, "The demo agent signs in and «Today» opens", f"{time.time() - started:.0f} s")
            return True
        if base.has_text(found, base.words("auth")["invalidCredentialsHelp"]):
            record(False, "The demo agent signs in", "the server refused the email and password kept in the secrets")
            return False
        time.sleep(2)
    record(False, "The demo agent signs in and «Today» opens", f"no workday button in 150 s; on screen: {base.own_words(dump()) or 'nothing readable'}")
    return False


def film(f):
    # A — the start of the day, the disclosure, Android's sheet.
    found = dump()
    start = text_node(found, WORDS["start"]) or text_node(found, WORDS["start_without_qr"]) or text_node(found, WORDS["return"])
    if not start:
        record(False, "«Today» offers to start the day", f"on screen: {base.own_words(found)}")
        return
    record(start.get("text") == WORDS["start"], "«Today» offers «Start day»", start.get("text", ""))
    f.start("start-day")
    tap(start)
    disclosure = wait("The app's disclosure comes before Android's location sheet",
                      lambda seen: text_node(seen, WORDS["disclosure_title"]) and not by_id(seen, PERMISSION_IDS["foreground"]), 120)
    if not disclosure:
        f.stop()
        return
    time.sleep(5)  # time to read it on film
    accept = text_node(dump(), WORDS["continue"])
    if not accept:
        record(False, "The disclosure offers «Continue»")
        f.stop()
        return
    tap(accept)
    sheet = wait("«Continue» opens Android's location sheet", lambda seen: by_id(seen, PERMISSION_IDS["foreground"]), 60)
    if not sheet:
        f.stop()
        return
    time.sleep(2)
    tap(by_id(sheet, PERMISSION_IDS["foreground"]))
    card = wait("The workday runs and «Today» asks for location «all the time»",
                lambda seen: text_node(seen, WORDS["always_card"]) and not by_id(seen, PERMISSION_IDS["allow"]), 90, prompts=True)
    f.stop(hold=2.5)
    if not card:
        return

    # B — «all the time», on Android's own page.
    f.start("all-the-time")
    found = dump()
    allow = [n for n in found if n.get("text") == WORDS["allow"] and n.get("package") == PKG]
    tap(max(allow, key=lambda n: n["box"][1]) if allow else text_node(found, WORDS["allow"]))
    page = wait("Android's page offers «Allow all the time»", lambda seen: by_id(seen, PERMISSION_IDS["always"]), 30)
    if page:
        time.sleep(2)
        tap(by_id(page, PERMISSION_IDS["always"]))
        time.sleep(2.5)
        shell("input keyevent 4")
        wait("Back in the app, the card is gone", lambda seen: text_node(seen, WORDS["break"]) and not text_node(seen, WORDS["always_card"]), 30)
    f.stop()

    # C — the app closed, the workday still recorded: the shade says so.
    f.start("closed-app")
    shell("input keyevent 3")
    time.sleep(2.5)
    shell("cmd statusbar expand-notifications")
    time.sleep(1)
    shade = dump()
    record(base.has_text(shade, base.words("location")["taskTitle"]), "With the app closed the shade shows the workday notification",
           base.words("location")["taskTitle"])
    time.sleep(4)
    shell("cmd statusbar collapse")
    f.stop(hold=1)

    # D — «Break»: recording stops, the notification goes.
    f.start("break")
    shell(f"am start -n {PKG}/.MainActivity")
    found = wait("The app opens on «Today» with «Break»", lambda seen: text_node(seen, WORDS["break"]), 60)
    if not found:
        f.stop()
        return
    time.sleep(1.5)
    tap(text_node(found, WORDS["break"]))
    paused = wait("«Break» pauses the day", lambda seen: text_node(seen, WORDS["resume"]), 60)
    time.sleep(3)
    shell("cmd statusbar expand-notifications")
    time.sleep(1.5)
    shade = dump()
    record(paused is not None and not base.has_text(shade, base.words("location")["taskTitle"]),
           "On a break the workday notification is gone")
    time.sleep(3)
    shell("cmd statusbar collapse")
    f.stop(hold=1)

    # E — «End day».
    f.start("end-day")
    found = dump()
    end = text_node(found, WORDS["end"])
    if end:
        tap(end)
        confirm = wait("«End day» asks to confirm", lambda seen: text_node(seen, WORDS["end_confirm"]), 30)
        if confirm:
            time.sleep(2)
            tap(text_node(confirm, WORDS["end_confirm"]))
            wait("The day ends", lambda seen: text_node(seen, WORDS["finished"]) or text_node(seen, WORDS["return"]), 90)
    else:
        record(False, "«End day» is on screen", base.own_words(found))
    f.stop(hold=2.5)


def main(apk):
    os.makedirs(OUT, exist_ok=True)
    if base.AGENT_COMPANY != DEMO_COMPANY or not base.AGENT_EMAIL or not base.AGENT_PASSWORD:
        # Before anything is installed or filmed: a workday is written and the film is public.
        print("Refused: the secrets do not name the demo agent of the demo company — nothing filmed, nothing written.", flush=True)
        return 2
    missing = [word for word in WORDS.values() if word not in base.app_words()]
    if missing:
        print(f"Refused: the build's dictionaries do not have {missing}", flush=True)
        return 2

    shell("settings put global hide_error_dialogs 1", check=False)
    screen = os.environ.get("E2E_SCREEN", "")
    if screen:
        size, _, density = screen.partition("@")
        shell(f"wm size {size}")
        if density:
            shell(f"wm density {density}")
        time.sleep(8)
    abis = shell("getprop ro.product.cpu.abilist").strip()
    installed = adb("install", "-r", apk, timeout=600, check=False)
    record("Success" in installed, "The published APK installs", installed.strip().splitlines()[-1][:120])
    if "Success" not in installed:
        return base.finish()
    unpacked = base.unpack_handset_code(apk, abis)
    if unpacked and "unpacked" not in unpacked:
        record(False, "Handset (ARM) code made loadable", unpacked)
        return base.finish()
    # Baku, so the tracking service has fixes to record.
    adb("emu", "geo", "fix", "49.8671", "40.4093", check=False)
    time.sleep(20)
    adb("logcat", "-c", check=False)
    shell(f"monkey -p {PKG} -c android.intent.category.LAUNCHER 1")
    if sign_in():
        f = Film()
        try:
            film(f)
        finally:
            if f.process:
                f.stop(hold=0)
            video = f.join()
        seconds = duration(video) if video else 0.0
        record(bool(video), "The declaration video is joined", f"{os.path.basename(video)}, {seconds:.0f} s" if video else "no segment was pulled")
    return base.finish()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
