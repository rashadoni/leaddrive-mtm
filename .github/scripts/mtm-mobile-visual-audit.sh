#!/usr/bin/env bash
set -euo pipefail

APP_ID="com.mtmobileapp"
APK="android/app/build/outputs/apk/release/app-release.apk"
OUT="visual-audit-artifacts"
mkdir -p "$OUT"

require_secret() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required audit secret: %s\n' "$name" >&2
    exit 1
  fi
}

require_secret MTM_AUDIT_TENANT
require_secret MTM_AUDIT_EMAIL
require_secret MTM_AUDIT_PASSWORD

capture() {
  local name="$1"
  adb exec-out screencap -p > "$OUT/${name}.png"
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/window.xml "$OUT/${name}.xml" >/dev/null 2>&1 || true
}

node_center() {
  local needle="$1"
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || true
  adb pull /sdcard/window.xml "$OUT/current.xml" >/dev/null 2>&1 || true
  python3 - "$OUT/current.xml" "$needle" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

path, needle = sys.argv[1], sys.argv[2].casefold()
try:
    root = ET.parse(path).getroot()
except Exception:
    raise SystemExit(1)

def score(node):
    attrs = node.attrib
    values = {
        "resource": attrs.get("resource-id", ""),
        "text": attrs.get("text", ""),
        "desc": attrs.get("content-desc", ""),
    }
    folded = {key: value.casefold() for key, value in values.items()}
    if folded["resource"].endswith(needle):
        return 0
    if folded["text"] == needle or folded["desc"] == needle:
        return 1
    if needle in folded["text"] or needle in folded["desc"] or needle in folded["resource"]:
        return 2
    return 99

matches = sorted(
    ((score(node), node) for node in root.iter("node") if score(node) < 99),
    key=lambda item: item[0],
)
if not matches:
    raise SystemExit(1)
bounds = matches[0][1].attrib.get("bounds", "")
numbers = [int(value) for value in re.findall(r"\d+", bounds)]
if len(numbers) != 4:
    raise SystemExit(1)
print((numbers[0] + numbers[2]) // 2, (numbers[1] + numbers[3]) // 2)
PY
}

tap_any() {
  local coordinates=""
  local needle
  for needle in "$@"; do
    if coordinates="$(node_center "$needle" 2>/dev/null)"; then
      adb shell input tap $coordinates
      sleep 2
      return 0
    fi
  done
  return 1
}

wait_for_node() {
  local needle="$1"
  local attempts="${2:-30}"
  local index
  for ((index = 0; index < attempts; index++)); do
    if node_center "$needle" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

input_into() {
  local node="$1"
  local value="$2"
  local coordinates
  coordinates="$(node_center "$node")"
  adb shell input tap $coordinates
  adb shell input keyevent KEYCODE_MOVE_END
  adb shell input text "$value"
  sleep 1
}

tap_fraction() {
  local x_fraction="$1"
  local y_fraction="$2"
  local size width height x y
  size="$(adb shell wm size | tail -n 1 | tr -d '\r')"
  width="$(sed -nE 's/.* ([0-9]+)x([0-9]+).*/\1/p' <<<"$size")"
  height="$(sed -nE 's/.* ([0-9]+)x([0-9]+).*/\2/p' <<<"$size")"
  x="$(awk -v width="$width" -v fraction="$x_fraction" 'BEGIN { printf "%d", width * fraction }')"
  y="$(awk -v height="$height" -v fraction="$y_fraction" 'BEGIN { printf "%d", height * fraction }')"
  adb shell input tap "$x" "$y"
  sleep 2
}

adb install -r "$APK"

# Prefer Azerbaijani for the real walkthrough. The app falls back safely if
# the image ignores this test-device locale command.
adb shell settings put system system_locales az-AZ || true
adb shell settings put secure system_locales az-AZ || true

adb shell pm grant "$APP_ID" android.permission.ACCESS_COARSE_LOCATION || true
adb shell pm grant "$APP_ID" android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS || true
adb shell pm grant "$APP_ID" android.permission.CAMERA || true

adb shell am force-stop "$APP_ID"
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
wait_for_node tenant-input 40
capture 01-company-phone

input_into tenant-input "$MTM_AUDIT_TENANT"
tap_any tenant-continue
wait_for_node login-email 40
capture 02-login-phone

input_into login-email "$MTM_AUDIT_EMAIL"
input_into login-password "$MTM_AUDIT_PASSWORD"
adb shell input keyevent KEYCODE_BACK || true
tap_any login-submit
sleep 12
capture 03-manager-home-phone

# Walk every manager tab using the five stable bottom-tab positions. Captures
# include UI trees so a failed label lookup can be diagnosed without a rerun.
if ! tap_any "Komanda" "Team" "Команда"; then
  tap_fraction 0.30 0.935
fi
capture 04-team-phone
if ! tap_any "Planlama" "Planning" "Планирование"; then
  tap_fraction 0.50 0.935
fi
capture 05-planning-calendar-phone

# Open the planner if the current localized label is exposed to accessibility.
if tap_any "Marşrut yarat" "Marşrut planlaşdır" "Create route" "Создать маршрут"; then
  sleep 4
  capture 06-planning-builder-phone
  adb shell input keyevent KEYCODE_BACK || true
  sleep 2
fi

if ! tap_any "Təsdiqlər" "Approvals" "Согласования"; then
  tap_fraction 0.70 0.935
fi
capture 07-approvals-phone
if ! tap_any "Daha çox" "More" "Ещё"; then
  tap_fraction 0.90 0.935
fi
capture 08-more-phone

# Re-open planning before adapting to an expanded tablet. This validates that
# the same authenticated app reflows rather than merely scaling a screenshot.
if ! tap_any "Planlama" "Planning" "Планирование"; then
  tap_fraction 0.50 0.935
fi
sleep 3
adb shell wm size 1600x2560
adb shell wm density 320
adb shell am force-stop "$APP_ID"
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 10
capture 09-manager-home-tablet

# Tablet navigation is a left rail. Use localized accessibility labels first,
# then a conservative second-rail-item coordinate as fallback.
if ! tap_any "Komanda" "Team" "Команда"; then
  tap_fraction 0.035 0.22
fi
capture 10-team-tablet

if ! tap_any "Planlama" "Planning" "Планирование"; then
  tap_fraction 0.035 0.34
fi
capture 11-planning-calendar-tablet

if tap_any "Marşrut yarat" "Marşrut planlaşdır" "Create route" "Создать маршрут"; then
  sleep 4
  capture 12-planning-builder-tablet
fi

# Keep credentials out of retained state even though the emulator is ephemeral.
adb shell pm clear "$APP_ID" >/dev/null || true
rm -f android/app/mtm-release.keystore
