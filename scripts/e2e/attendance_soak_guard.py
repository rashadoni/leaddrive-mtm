"""Validate physical soak receipts; never shorten time or mutate a phone.

These checks complement physical UI execution and authenticated server reads.
Samples contain durations and booleans, never coordinates, credentials or UIDs.
"""
from datetime import datetime

DAY_SECONDS = 24 * 60 * 60
MAX_SAMPLE_GAP = 600


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(result.tzinfo is not None, "TIMESTAMP_INVALID")
    return result


def verify_soak_window(started_at, samples):
    require(len(samples) >= 2, "SAMPLES_MISSING")
    start = instant(started_at)
    previous = -1
    for sample in samples:
        elapsed = sample["hostElapsedSeconds"]
        wall = (instant(sample["checkedAt"]) - start).total_seconds()
        require(elapsed >= 0 and elapsed > previous, "SAMPLES_OUT_OF_ORDER")
        require(elapsed - max(0, previous) <= MAX_SAMPLE_GAP, "OBSERVATION_GAP")
        require(abs(wall - elapsed) <= 30, "HOST_CLOCK_CHANGED")
        require(abs(sample["deviceElapsedSeconds"] - elapsed) <= 30,
                "DEVICE_CLOCK_CHANGED")
        for key in ("sameDeviceBoot", "packageIdentityUnchanged", "packageNetworkBlocked",
                    "ordinaryMtmNetworkAllowed", "radiosUnchanged", "serverHistoryUnchanged"):
            require(sample.get(key) is True, key.upper())
        previous = elapsed
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
