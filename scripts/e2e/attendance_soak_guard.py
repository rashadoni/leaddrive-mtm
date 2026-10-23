"""Validate physical soak receipts; never shorten time or mutate a phone.

These checks complement physical UI execution and authenticated server reads.
Samples contain durations and booleans, never coordinates, credentials or UIDs.
"""
from datetime import datetime
import math

DAY_SECONDS = 24 * 60 * 60
MAX_SAMPLE_GAP = 600
INVARIANTS = ("sameDeviceBoot", "packageIdentityUnchanged", "packageNetworkBlocked",
              "ordinaryMtmNetworkAllowed", "radiosUnchanged", "serverHistoryUnchanged")


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def instant(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        raise ValueError("TIMESTAMP_INVALID") from None
    require(result.tzinfo is not None, "TIMESTAMP_INVALID")
    return result


def verify_soak_sample(started_at, sample, previous_elapsed=-1):
    elapsed, device = sample.get("hostElapsedSeconds"), sample.get("deviceElapsedSeconds")
    require(all(type(v) in (int, float) and math.isfinite(v) for v in (elapsed, device)),
            "SAMPLE_INVALID")
    wall = (instant(sample.get("checkedAt")) - instant(started_at)).total_seconds()
    require(elapsed >= 0 and elapsed > previous_elapsed, "SAMPLES_OUT_OF_ORDER")
    require(elapsed - max(0, previous_elapsed) <= MAX_SAMPLE_GAP, "OBSERVATION_GAP")
    require(abs(wall - elapsed) <= 30, "HOST_CLOCK_CHANGED")
    require(abs(device - elapsed) <= 30, "DEVICE_CLOCK_CHANGED")
    for key in INVARIANTS:
        require(sample.get(key) is True, key.upper())


def record_soak_sample(started_at, sample, persist, previous_elapsed=-1):
    """Persist failed observations too; do not leak arbitrary probe payloads.

    A failed v8 observation raised before append/save, losing the condition
    that stopped the run. The caller supplies its durable, task-owned writer.
    Persistence errors also stop the run rather than creating an evidence gap.
    """
    receipt = {}
    try:
        receipt["checkedAt"] = instant(sample.get("checkedAt")).isoformat()
    except ValueError:
        pass
    for key in ("hostElapsedSeconds", "deviceElapsedSeconds"):
        value = sample.get(key)
        if type(value) in (int, float) and math.isfinite(value):
            receipt[key] = value
    for key in (*INVARIANTS, "admissionAvailable", "pendingVisible", "expiredGateVisible"):
        if type(sample.get(key)) is bool:
            receipt[key] = sample[key]
    try:
        verify_soak_sample(started_at, sample, previous_elapsed)
    except ValueError as error:
        receipt.update(status="REJECTED", failureCode=str(error))
        persist(receipt)
        raise
    receipt["status"] = "PASS"
    persist(receipt)


def verify_soak_window(started_at, samples):
    require(len(samples) >= 2, "SAMPLES_MISSING")
    previous = -1
    for sample in samples:
        verify_soak_sample(started_at, sample, previous)
        previous = sample["hostElapsedSeconds"]
    require(previous >= DAY_SECONDS + 120, "FULL_DAY_NOT_ELAPSED")
    before = [s for s in samples if DAY_SECONDS - 900 <= s["hostElapsedSeconds"] < DAY_SECONDS - 60]
    require(any(s.get("admissionAvailable") is True and s.get("pendingVisible") is True
                for s in before), "BEFORE_EXPIRY_NOT_OBSERVED")
    after = [s for s in samples if s["hostElapsedSeconds"] >= DAY_SECONDS + 120]
    require(any(s.get("admissionAvailable") is False and s.get("expiredGateVisible") is True
                for s in after), "EXPIRY_NOT_OBSERVED")
    return {"status": "PASS", "observedSeconds": previous, "samples": len(samples),
            "beforeExpiryAdmission": True, "afterExpiryBlocked": True}


def verify_delayed_replay(before, after, offline_at, reconnect_at):
    """Three queued actions on an already running owned day, not a fresh START."""
    require(all(after.get(key) == value for key, value in before.items()), "HISTORY_CHANGED")
    events = [event for key, event in after.items() if key not in before]
    events.sort(key=lambda event: (event["claimedAt"], event["id"]))
    require([e["type"] for e in events] == ["PAUSE", "RESUME", "FINISH"], "REPLAY_SEQUENCE_INVALID")
    start, reconnect = instant(offline_at), instant(reconnect_at)
    require((reconnect - start).total_seconds() >= DAY_SECONDS + 120, "FULL_DAY_NOT_ELAPSED")
    claims = [instant(event["claimedAt"]) for event in events]
    require(len(set(claims)) == 3, "CLAIM_ORDER_INVALID")
    require(all(start <= claim < reconnect <= instant(event["serverReceivedAt"])
                for claim, event in zip(claims, events)), "CLAIM_WINDOW_INVALID")
    require(all((instant(e["serverReceivedAt"]) - claim).total_seconds() > 900
                for claim, e in zip(claims, events)), "DELAYED_CLAIM_NOT_PROVED")
    return {"status": "PASS", "newEvents": 3, "priorEventsUnchanged": len(before),
            "requiresServerReview": True}


def verify_independent_soak_window(started_at, device_samples, server_samples, before_ui, after_ui):
    """Verify separate phone observations and HR reads during an ADB outage.

    Neither stream supplies missing observations for the other. The phone must
    retain every frame, including failures; HR reads continue on the host while
    USB is absent. UI receipts are captured on the same phone under the barrier.
    """
    start = instant(started_at).timestamp()
    require(len(device_samples) >= 2 and len(server_samples) >= 2, "SAMPLES_MISSING")
    previous = -1
    flags = (*INVARIANTS[:-1], "protectedProfileNetworkAllowed", "denyScopeExact", "clockStable")
    for frame in device_samples:
        elapsed, epoch = frame.get("deviceElapsedSeconds"), frame.get("epoch")
        require(all(type(v) in (int, float) and math.isfinite(v) for v in (elapsed, epoch)),
                "DEVICE_SAMPLE_INVALID")
        require(elapsed >= 0 and elapsed > previous, "SAMPLES_OUT_OF_ORDER")
        require(elapsed - max(0, previous) <= MAX_SAMPLE_GAP, "DEVICE_OBSERVATION_GAP")
        require(abs(epoch - start - elapsed) <= 10, "DEVICE_CLOCK_CHANGED")
        for key in flags:
            require(frame.get(key) is True, key.upper())
        previous = elapsed
    require(previous >= DAY_SECONDS + 120, "FULL_DAY_NOT_ELAPSED")
    last_device_epoch = device_samples[-1]["epoch"]
    previous = -1
    for read in server_samples:
        elapsed = read.get("hostElapsedSeconds")
        require(type(elapsed) in (int, float) and math.isfinite(elapsed), "SERVER_SAMPLE_INVALID")
        require(elapsed >= 0 and elapsed > previous, "SAMPLES_OUT_OF_ORDER")
        require(elapsed - max(0, previous) <= MAX_SAMPLE_GAP, "SERVER_OBSERVATION_GAP")
        require(abs(instant(read.get("checkedAt")).timestamp() - start - elapsed) <= 30,
                "HOST_CLOCK_CHANGED")
        require(read.get("serverHistoryUnchanged") is True, "SERVER_HISTORY_CHANGED")
        previous = elapsed
    require(previous >= DAY_SECONDS + 120, "SERVER_FULL_DAY_NOT_OBSERVED")
    for receipt in (before_ui, after_ui):
        require(type(receipt.get("epoch")) in (int, float)
                and math.isfinite(receipt["epoch"]), "UI_TIMESTAMP_INVALID")
        require(receipt.get("passed") is True, "UI_CAPTURE_FAILED")
        require(receipt["epoch"] <= last_device_epoch + MAX_SAMPLE_GAP, "UI_DEVICE_WINDOW_MISMATCH")
    before = before_ui["epoch"] - start
    after = after_ui["epoch"] - start
    require(before_ui.get("kind") == "before" and before_ui.get("pendingVisible") is True
            and DAY_SECONDS - 900 <= before < DAY_SECONDS - 60, "BEFORE_EXPIRY_NOT_OBSERVED")
    require(after_ui.get("kind") == "after" and after >= DAY_SECONDS + 120,
            "EXPIRY_NOT_OBSERVED")
    require(instant(server_samples[-1]["checkedAt"]).timestamp() >= after_ui["epoch"],
            "SERVER_READ_BEFORE_FINAL_UI")
    return {"status": "PASS", "observedSeconds": device_samples[-1]["deviceElapsedSeconds"],
            "deviceSamples": len(device_samples), "serverSamples": len(server_samples),
            "beforeExpiryAdmission": True, "afterExpiryBlocked": True}
