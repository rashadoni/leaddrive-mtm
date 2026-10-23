"""Render an owned-phone observer; this module never connects to a device.

The observer and a separate watchdog run on Android. A Mac/ADB reader is not
their heartbeat source. Only the already-audited owner0 Time UID may be restored;
no package-wide networking, credentials, application storage or radio writes.
"""
import re


def render_observer(*, lease_id, apk_sha256, boot_id, original_stay_awake,
                    radios, qualification=False):
    if type(qualification) is not bool:
        raise ValueError("OBSERVER_MODE_INVALID")
    if not re.fullmatch(r"[0-9a-f]{32}", lease_id):
        raise ValueError("LEASE_ID_INVALID")
    if not re.fullmatch(r"[0-9a-f]{64}", apk_sha256):
        raise ValueError("APK_HASH_INVALID")
    if not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", boot_id):
        raise ValueError("BOOT_ID_INVALID")
    if str(original_stay_awake) not in tuple(str(i) for i in range(8)):
        raise ValueError("DISPLAY_ORIGINAL_INVALID")
    if set(radios) != {"wifi_on", "mobile_data", "airplane_mode_on"} or any(
            str(v) not in ("0", "1") for v in radios.values()):
        raise ValueError("RADIO_BASELINE_INVALID")
    values = {
        "LEASE": lease_id, "APK": apk_sha256, "BOOT": boot_id,
        "STAY": str(original_stay_awake),
        "RADIOS": ":".join(str(radios[k]) for k in ("wifi_on", "mobile_data", "airplane_mode_on")),
        "INTERVAL": "2" if qualification else "30",
        "HEARTBEAT_TIMEOUT": "12" if qualification else "180",
        "HOLD": "180" if qualification else "86520",
        "KEEP_AWAKE": "false" if qualification else "true",
    }
    script = _TEMPLATE
    for key, value in values.items():
        script = script.replace("@" + key + "@", value)
    return script


_TEMPLATE = r'''#!/system/bin/sh
ts_dir=/data/local/tmp/attendance-soak-@LEASE@
ts_apk=@APK@
ts_boot=@BOOT@
ts_hold=@HOLD@
ts_interval=@INTERVAL@
ts_timeout=@HEARTBEAT_TIMEOUT@
ts_original_stay=@STAY@

ts_rule() {
  ts_rule_raw=$(service call connectivity 84 i32 9 i32 "$1" | tr -s '[:space:]' ' ')
  case "$ts_rule_raw" in
    *"00000000 00000001"*) echo 1 ;;
    *"00000000 00000002"*) echo 2 ;;
    *) echo invalid ;;
  esac
}

ts_denied_uids() {
  sed -n '/OEM_DENY_3_MATCH/s/^[[:space:]]*\([0-9][0-9]*\).*/\1/p'
}

ts_heartbeat() {
  date +%s > "$ts_dir/heartbeat.$$"
  mv "$ts_dir/heartbeat.$$" "$ts_dir/heartbeat"
}

ts_release() {
  mkdir "$ts_dir/recovery-lock" 2>/dev/null || return 0
  ts_release_reason=$1
  ts_restored=false
  if [ -f "$ts_dir/armed" ]; then
    for ts_try in 1 2 3; do
      # Exact installed Android36 binder contract, audited on this phone.
      service call connectivity 83 i32 9 i32 10565 i32 0 >/dev/null
      ts_traffic=$(dumpsys connectivity trafficcontroller)
      ts_denied=$(printf '%s' "$ts_traffic" | ts_denied_uids)
      if printf '%s' "$ts_traffic" | grep -q 'sUidOwnerMap:' &&
         [ -z "$ts_denied" ]; then
        cmd connectivity set-chain3-enabled false >/dev/null
      fi
      if [ "$(ts_rule 10565)" = 1 ]; then ts_restored=true; break; fi
      sleep 2
    done
    if [ -f "$ts_dir/display-owned" ] &&
       [ "$(settings get global stay_on_while_plugged_in)" = 7 ]; then
      settings put global stay_on_while_plugged_in "$ts_original_stay"
    fi
  else
    ts_restored=true
  fi
  printf '{"reason":"%s","networkAllowed":%s,"epoch":%s}\n' \
    "$ts_release_reason" "$ts_restored" "$(date +%s)" > "$ts_dir/restoration.json.tmp"
  mv "$ts_dir/restoration.json.tmp" "$ts_dir/restoration.json"
  if [ "$ts_restored" = true ]; then rm -f "$ts_dir/armed"; fi
  touch "$ts_dir/done"
}

case "$1" in
  observer)
    trap 'ts_release OBSERVER_EXIT' EXIT HUP INT TERM
    ts_heartbeat
    touch "$ts_dir/observer-ready"
    ts_wait=0
    while [ ! -f "$ts_dir/armed" ]; do
      [ -f "$ts_dir/done" ] && exit 0
      ts_wait=$((ts_wait + 1))
      [ "$ts_wait" -ge 60 ] && exit 1
      ts_heartbeat
      sleep 1
    done
    ts_epoch0=$(cat "$ts_dir/start-epoch")
    ts_up0=$(cat "$ts_dir/start-uptime")
    case "$ts_epoch0:$ts_up0" in *[!0-9:]*|:*) exit 1 ;; esac
    if [ @KEEP_AWAKE@ = true ]; then
      touch "$ts_dir/display-owned"
      settings put global stay_on_while_plugged_in 7
    fi
    # The arm marker precedes the host's exact-UID setter for safe recovery.
    sleep 5
    while [ ! -f "$ts_dir/done" ]; do
      ts_heartbeat
      ts_now=$(date +%s)
      ts_up=$(cut -d ' ' -f1 /proc/uptime); ts_up=${ts_up%%.*}
      ts_elapsed=$((ts_up - ts_up0))
      ts_wall=$((ts_now - ts_epoch0))
      ts_clock_delta=$((ts_wall - ts_elapsed))
      ts_same_boot=false; [ "$(cat /proc/sys/kernel/random/boot_id)" = "$ts_boot" ] && ts_same_boot=true
      ts_path=$(pm path --user 0 com.leaddrive.attendance | sed -n '1s/^package://p')
      ts_same_apk=false
      if [ -n "$ts_path" ] && [ "$(sha256sum "$ts_path" | cut -d ' ' -f1)" = "$ts_apk" ]; then ts_same_apk=true; fi
      ts_blocked=false
      if [ "$(ts_rule 10565)" = 2 ] && [ "$(cmd connectivity get-chain3-enabled)" = chain:enabled ]; then ts_blocked=true; fi
      ts_field_allowed=false; [ "$(ts_rule 10556)" = 1 ] && ts_field_allowed=true
      ts_protected_allowed=false; [ "$(ts_rule 9510565)" = 1 ] && ts_protected_allowed=true
      ts_actual_radios="$(settings get global wifi_on):$(settings get global mobile_data):$(settings get global airplane_mode_on)"
      ts_radios_same=false; [ "$ts_actual_radios" = '@RADIOS@' ] && ts_radios_same=true
      ts_traffic=$(dumpsys connectivity trafficcontroller)
      ts_denied=$(printf '%s' "$ts_traffic" | ts_denied_uids)
      ts_exact_scope=false
      if printf '%s' "$ts_traffic" | grep -q 'sUidOwnerMap:' && [ "$ts_denied" = 10565 ]; then ts_exact_scope=true; fi
      ts_clock_stable=false
      if [ "$ts_clock_delta" -ge -10 ] && [ "$ts_clock_delta" -le 10 ]; then ts_clock_stable=true; fi
      printf '{"epoch":%s,"deviceElapsedSeconds":%s,"wallElapsedSeconds":%s,"sameDeviceBoot":%s,"packageIdentityUnchanged":%s,"packageNetworkBlocked":%s,"ordinaryMtmNetworkAllowed":%s,"protectedProfileNetworkAllowed":%s,"radiosUnchanged":%s,"denyScopeExact":%s,"clockStable":%s}\n' \
        "$ts_now" "$ts_elapsed" "$ts_wall" "$ts_same_boot" "$ts_same_apk" "$ts_blocked" "$ts_field_allowed" "$ts_protected_allowed" "$ts_radios_same" "$ts_exact_scope" "$ts_clock_stable" >> "$ts_dir/device-samples.jsonl"
      ts_bad=''
      [ "$ts_same_boot" = true ] || ts_bad=SAME_DEVICE_BOOT
      [ "$ts_same_apk" = true ] || ts_bad=PACKAGE_IDENTITY
      [ "$ts_blocked" = true ] || ts_bad=NETWORK_BARRIER
      [ "$ts_field_allowed" = true ] || ts_bad=FIELD_NETWORK
      [ "$ts_protected_allowed" = true ] || ts_bad=PROTECTED_PROFILE_NETWORK
      [ "$ts_radios_same" = true ] || ts_bad=RADIOS_CHANGED
      [ "$ts_exact_scope" = true ] || ts_bad=DENY_SCOPE
      [ "$ts_clock_stable" = true ] || ts_bad=CLOCK_CHANGED
      if [ -n "$ts_bad" ]; then ts_release "$ts_bad"; exit 1; fi
      if [ -f "$ts_dir/cancel" ]; then ts_release CANCELLED; exit 1; fi
      if [ "$ts_elapsed" -ge "$ts_hold" ]; then
        touch "$ts_dir/window-elapsed"
        # Host/owned UI capture has five minutes to finish after the full hold.
        # The watchdog restores independently even if no Mac reconnects.
      fi
      sleep "$ts_interval"
    done
    ;;
  watchdog)
    touch "$ts_dir/watchdog-ready"
    while [ ! -f "$ts_dir/done" ]; do
      ts_now=$(date +%s)
      ts_last=$(cat "$ts_dir/heartbeat" 2>/dev/null)
      case "$ts_last" in ''|*[!0-9]*) ts_last=0 ;; esac
      if [ "$ts_last" -gt 0 ] && [ "$((ts_now - ts_last))" -ge "$ts_timeout" ]; then
        ts_release OBSERVER_HEARTBEAT_LOST; exit 1
      fi
      if [ -f "$ts_dir/armed" ]; then
        ts_epoch0=$(cat "$ts_dir/start-epoch")
        if [ "$((ts_now - ts_epoch0))" -ge "$((ts_hold + 300))" ]; then
          ts_release HARD_DEADLINE; exit 1
        fi
        if [ -f "$ts_dir/release" ]; then ts_release HOST_RELEASE; exit 0; fi
      fi
      sleep 2
    done
    ;;
  *) exit 2 ;;
esac
'''
