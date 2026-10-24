"""Fail fast while a physical soak runs; never infer a full-day PASS.

The v11 controller polled HR but only collected phone liveness at the end.
This loop requires a bounded, read-only phone probe every 30 seconds. Losing
ADB is a failed observation, not evidence that either phone worker survived.
The owning controller must restore its exact network/display lease in finally.
"""
import json
import math
import re
import time

POLL_SECONDS = 30
READ_TIMEOUT_SECONDS = 20
MAX_HOST_GAP = 90
MAX_HEARTBEAT_AGE = 90
# UI capture near expiry may occupy the observer for several dump/scroll tries.
MAX_FRAME_AGE = 300
FLAGS = ("sameDeviceBoot", "packageIdentityUnchanged", "packageNetworkBlocked",
         "ordinaryMtmNetworkAllowed", "protectedProfileNetworkAllowed",
         "radiosUnchanged", "denyScopeExact", "clockStable")


def status_command(lease_id, pids):
    """Read a fixed-size status, without launching, killing or changing a UID."""
    if not re.fullmatch(r"[a-f0-9]{32}", lease_id):
        raise ValueError("LEASE_ID_INVALID")
    if set(pids) != {"observer", "watchdog"} or any(
            type(pid) is not int or pid <= 0 for pid in pids.values()):
        raise ValueError("WORKER_PID_INVALID")
    folder = "/data/local/tmp/attendance-soak-" + lease_id
    lines = ["cat /proc/sys/kernel/random/boot_id", "date +%s"]
    for name in ("heartbeat", "watchdog-heartbeat"):
        lines.append(f"cat {folder}/{name} 2>/dev/null || echo missing")
    for mode in ("observer", "watchdog"):
        pid = pids[mode]
        # Match the complete argv. A recycled PID is not a live worker.
        expected = f"sh {folder}/worker.sh {mode} "
        lines.append(f'if [ "$(tr \'\\000\' \' \' </proc/{pid}/cmdline 2>/dev/null)" = "{expected}" ]; '
                     'then echo live; else echo missing; fi')
    for marker in ("armed", "done"):
        lines.append(f"if [ -f {folder}/{marker} ]; then echo yes; else echo no; fi")
    lines.append(f"tail -n 1 {folder}/device-samples.jsonl")
    return "\n".join(lines)


def parse_status(raw):
    lines = raw.strip().splitlines()
    if len(lines) != 9:
        raise ValueError("DEVICE_STATUS_INVALID")
    try:
        return dict(bootId=lines[0], epoch=int(lines[1]), heartbeat=int(lines[2]),
                    watchdogHeartbeat=int(lines[3]), observer=lines[4] == "live",
                    watchdog=lines[5] == "live", armed=lines[6] == "yes",
                    done=lines[7] != "no", frame=json.loads(lines[8]))
    except (ValueError, TypeError):
        raise ValueError("DEVICE_STATUS_INVALID") from None


def verify_live(status, boot_id, started_epoch, previous_epoch=None):
    def require(condition, reason):
        if not condition:
            raise ValueError(reason)
    def number(value):
        return type(value) in (int, float) and math.isfinite(value)
    require(status.get("bootId") == boot_id, "DEVICE_REBOOTED")
    for key in ("observer", "watchdog"):
        require(status.get(key) is True, key.upper() + "_MISSING")
    require(status.get("armed") is True and status.get("done") is False, "LEASE_ENDED")
    now = status.get("epoch")
    require(number(now) and now >= started_epoch, "DEVICE_CLOCK_CHANGED")
    for key in ("heartbeat", "watchdogHeartbeat"):
        value = status.get(key)
        require(number(value) and 0 <= now - value <= MAX_HEARTBEAT_AGE,
                key.upper() + "_STALE")
    frame = status.get("frame")
    require(isinstance(frame, dict), "DEVICE_FRAME_INVALID")
    epoch, elapsed = frame.get("epoch"), frame.get("deviceElapsedSeconds")
    require(number(epoch) and number(elapsed) and elapsed >= 0, "DEVICE_FRAME_INVALID")
    require(0 <= now - epoch <= MAX_FRAME_AGE, "DEVICE_FRAME_STALE")
    require(abs(epoch - started_epoch - elapsed) <= 10, "DEVICE_CLOCK_CHANGED")
    require(previous_epoch is None or epoch >= previous_epoch, "DEVICE_FRAME_REWOUND")
    for flag in FLAGS:
        require(frame.get(flag) is True, flag.upper())
    return epoch


def watch_window(*, read_status, persist, boot_id, started_epoch, server_sample,
                 complete, cancelled, clock=time.monotonic, sleep=time.sleep):
    """Return only when the caller has final UI evidence, or raise on a gap.

    read_status(timeout=20) MUST honor the timeout; the concrete ADB reader
    passes it to subprocess. No retry conceals a failed read. Persist receives
    only counters/booleans, never raw probe output or exception messages.
    complete() only signals readiness for the separate full-window verifier.
    """
    previous_host = previous_epoch = None
    next_server = clock()
    while True:
        receipt = {"status": "REJECTED"}
        try:
            if cancelled():
                raise ValueError("OPERATOR_STOP")
            start = clock()
            if previous_host is not None and start - previous_host > MAX_HOST_GAP:
                raise ValueError("HOST_MONITOR_GAP")
            try:
                status = read_status(timeout=READ_TIMEOUT_SECONDS)
            except Exception:
                raise ValueError("DEVICE_STATUS_UNAVAILABLE") from None
            finished = clock()
            if finished - start > READ_TIMEOUT_SECONDS:
                raise ValueError("DEVICE_READ_DEADLINE")
            epoch = verify_live(status, boot_id, started_epoch, previous_epoch)
            receipt.update(status="OBSERVED", deviceEpoch=epoch,
                           frameAgeSeconds=status["epoch"] - epoch,
                           hostGapSeconds=0 if previous_host is None else finished - previous_host)
            # Include time spent in the last probe, not only the wait interval.
            if receipt["hostGapSeconds"] > MAX_HOST_GAP:
                raise ValueError("HOST_MONITOR_GAP")
            previous_epoch, previous_host = epoch, finished
        except ValueError as error:
            receipt.update(status="REJECTED", failureCode=str(error))
            persist(receipt)
            raise
        persist(receipt)
        if finished >= next_server:
            server_sample()
            next_server = clock() + 240
        if complete():
            return
        sleep(POLL_SECONDS)


def watch_android_window(*, adb, lease_id, pids, **options):
    """Concrete controller adapter: the ADB subprocess receives a hard timeout.

    Called inside the owning controller's try/finally, after initial capture.
    Any failure escapes to its existing exact-UID cleanup; there is no detached
    successful-looking monitor beside a controller that continues sleeping.
    """
    command = status_command(lease_id, pids)
    def read_status(*, timeout):
        return parse_status(adb("shell", command, timeout=timeout))
    return watch_window(read_status=read_status, **options)
