#!/usr/bin/env bash
# Drive and measure the field app on a real Android device over adb.
#
# Field UX audit, task D1. Written from the device acceptance of 2026-09-13/14
# (Samsung S23 Ultra, Android 16), where every check was a measurement taken
# from the device, not a guess from a screenshot:
#   - positions and texts come from `uiautomator dump`;
#   - unclipped layout frames come from `dumpsys activity <activity>` —
#     uiautomator clips bounds, and the tab bar that collapsed to 28 px (B18)
#     was only visible in the unclipped tree;
#   - network state comes from `dumpsys connectivity`, because on Samsung
#     airplane mode leaves Wi-Fi on and the phone stays online.
#
# The device may be local or behind an adb server forwarded over SSH:
#   ADB_SERVER_SOCKET=tcp:127.0.0.1:5037 MTMobileApp/scripts/e2e-adb.sh devices
#
# Usage: e2e-adb.sh <command> [args]
#   devices                       list devices
#   launch                        start the app (package $APP_PACKAGE)
#   shot <file.png> [scale]       screenshot; with scale (e.g. 0.4) also writes <file>-small.png
#   dump [file.xml]               UI tree (text, content-desc, bounds) to file or stdout
#   texts [regex]                 visible texts with bounds, optionally filtered
#   tap-text <regex>              tap the first clickable node whose text/content-desc matches
#   tap <x> <y> | swipe <x1> <y1> <x2> <y2> [ms] | key <keycode> | text <string>
#   frames                        unclipped view frames of the app's main activity
#   scroll-fit                    viewport vs content height of the first ScrollView
#   network                       "online" or "offline", from the system's default network
#   watch-offline [seconds]       log network state and the sync chip until the network
#                                 went away and came back (B4 acceptance)
#
# Never types passwords and never changes system settings: rotation, airplane
# mode and sign-in stay with the person holding the phone.
set -euo pipefail

ADB=${ADB:-adb}
APP_PACKAGE=${APP_PACKAGE:-com.mtmobileapp}
APP_ACTIVITY=${APP_ACTIVITY:-com.mtmobileapp/.MainActivity}
SYNC_CHIP_LABEL=${SYNC_CHIP_LABEL:-Sinxronizasiya Mərkəzini aç}

die() { echo "e2e-adb: $*" >&2; exit 1; }

dump_xml() {
  "$ADB" shell 'uiautomator dump /sdcard/e2e-ui.xml >/dev/null 2>&1; cat /sdcard/e2e-ui.xml; rm -f /sdcard/e2e-ui.xml'
}

# Prints "text|content-desc|clickable|x1 y1 x2 y2" per node.
nodes() {
  python3 -c '
import re, sys
x = sys.stdin.read()
for n in re.findall(r"<node [^>]*>", x):
    g = lambda a: (re.search(a + r"=\"([^\"]*)\"", n) or [None, ""])[1]
    b = re.search(r"bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"", n)
    if b:
        print("|".join([g(" text"), g("content-desc"), g("clickable"), " ".join(b.groups())]))
'
}

cmd=${1:-}; shift || true
case "$cmd" in
  devices)
    "$ADB" devices -l ;;
  launch)
    "$ADB" shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null ;;
  shot)
    out=${1:?shot <file.png> [scale]}; scale=${2:-}
    "$ADB" exec-out screencap -p > "$out"
    if [[ -n "$scale" ]]; then
      small="${out%.png}-small.png"
      if command -v sips >/dev/null 2>&1; then
        width=$(sips -g pixelWidth "$out" | awk '/pixelWidth/ {print $2}')
        sips --resampleWidth "$(python3 -c "print(int($width * $scale))")" "$out" --out "$small" >/dev/null
      else
        python3 -c "from PIL import Image; im = Image.open('$out'); im.resize((int(im.width*$scale), int(im.height*$scale))).save('$small')"
      fi
      echo "$small"
    fi ;;
  dump)
    if [[ -n "${1:-}" ]]; then dump_xml > "$1"; else dump_xml; fi ;;
  texts)
    pattern=${1:-.}
    dump_xml | nodes | awk -F'|' -v p="$pattern" '($1 != "" || $2 != "") && ($1 ~ p || $2 ~ p) { print "[" $4 "] " ($3 == "true" ? "C " : "  ") ($1 != "" ? $1 : $2) }' ;;
  tap-text)
    pattern=${1:?tap-text <regex>}
    coords=$(dump_xml | nodes | awk -F'|' -v p="$pattern" '$3 == "true" && ($1 ~ p || $2 ~ p) { split($4, b, " "); print int((b[1]+b[3])/2), int((b[2]+b[4])/2); exit }')
    [[ -n "$coords" ]] || die "no clickable node matches: $pattern"
    # shellcheck disable=SC2086
    "$ADB" shell input tap $coords
    echo "tapped $coords" ;;
  tap)   "$ADB" shell input tap "${1:?x}" "${2:?y}" ;;
  swipe) "$ADB" shell input swipe "${1:?x1}" "${2:?y1}" "${3:?x2}" "${4:?y2}" "${5:-400}" ;;
  key)   "$ADB" shell input keyevent "${1:?keycode}" ;;
  text)  "$ADB" shell input text "${1:?string}" ;;
  frames)
    "$ADB" shell dumpsys activity "$APP_ACTIVITY" | python3 -c '
import re, sys
lines = sys.stdin.read().split("\n")
start = next((i for i, l in enumerate(lines) if "View Hierarchy" in l), None)
if start is None: sys.exit("no view hierarchy (is the app in the foreground?)")
for l in lines[start:]:
    m = re.match(r"^(\s*)([A-Za-z0-9_.$]+)\{\S+ \S+ \S+ (-?\d+),(-?\d+)-(-?\d+),(-?\d+)", l)
    if m:
        x1, y1, x2, y2 = map(int, m.groups()[2:])
        print(" " * (len(m.group(1)) // 2) + m.group(2).split(".")[-1], f"{x1},{y1}-{x2},{y2}", f"h={y2-y1}")
' ;;
  scroll-fit)
    "$0" frames | python3 -c '
import re, sys
rows = [l for l in sys.stdin.read().split("\n") if l.strip()]
for i, l in enumerate(rows):
    if "ReactScrollView" in l and i + 1 < len(rows):
        vh = int(re.search(r"h=(\d+)", l).group(1)); ch = int(re.search(r"h=(\d+)", rows[i + 1]).group(1))
        print(f"viewport={vh} content={ch}", "scrolls" if ch > vh else "fits"); break
else:
    sys.exit("no ScrollView on screen")
' ;;
  network)
    if "$ADB" shell dumpsys connectivity | grep -m1 'Active default network' | grep -q 'none'; then echo offline; else echo online; fi ;;
  watch-offline)
    limit=${1:-480}; start=$(date +%s); went_offline=""; came_back=""; last=""
    while (( $(date +%s) - start < limit )); do
      t=$(( $(date +%s) - start ))
      net=$("$0" network)
      chip=$(dump_xml | python3 -c '
import re, sys
x = sys.stdin.read(); label = sys.argv[1]
i = x.find(label)
print(" ".join(re.findall(r" text=\"([^\"]+)\"", x[i:i + 1500])[:2]) if i >= 0 else "(no chip)")
' "$SYNC_CHIP_LABEL")
      row="net=$net chip=[$chip]"
      [[ "$row" != "$last" ]] && echo "t=${t}s $row" && last=$row
      [[ "$net" == offline && -z "$went_offline" ]] && went_offline=$t
      [[ -n "$went_offline" && "$net" == online && -z "$came_back" ]] && came_back=$t
      if [[ -n "$came_back" ]] && (( t - came_back >= 20 )); then break; fi
      sleep 1
    done
    echo "offline_at=${went_offline:-never} online_again_at=${came_back:-never}" ;;
  *)
    sed -n '2,32p' "$0"; [[ -z "$cmd" ]] || die "unknown command: $cmd" ;;
esac
