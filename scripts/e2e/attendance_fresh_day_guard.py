"""Read-only gate for physical offline START acceptance; never seeds or resets data.

Feed fresh, authenticated bootstrap/rules/HR report snapshots on stdin. The
caller still verifies fixture ownership, APK identity and the account on screen.
Output is allowlisted metadata only. READY is permission to run the test, never
evidence that the test passed. No credentials, phone commands or HTTP writes.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ACCOUNTS = {
    "office": "Fictional office employee",
    "admin": "Fictional phone administrator",
}
TENANT = "mtm-attendance-phone"
MAX_AGE_SECONDS = 120
RUN_BUDGET_SECONDS = 600


def require(condition, code):
    if not condition:
        raise ValueError(code)


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(result.tzinfo is not None, "TIMESTAMP_INVALID")
    return result


def fresh(value, now):
    require(-5 <= (now - instant(value)).total_seconds() <= MAX_AGE_SECONDS,
            "SNAPSHOT_STALE")


def preflight(candidate, rules, now):
    account = candidate["fixtureAccount"]
    require(account in ACCOUNTS, "ACCOUNT_NOT_OWNED")
    boot, report = candidate["bootstrap"], candidate["report"]
    tenant, principal = boot["tenant"], boot["principal"]
    require(tenant["id"] == TENANT + "-v1" and tenant["slug"] == TENANT,
            "TENANT_NOT_OWNED")
    require(principal["email"] == account + "@" + TENANT + ".example.invalid"
            and principal["name"] == ACCOUNTS[account]
            and principal["role"] == "EMPLOYEE", "ACCOUNT_NOT_OWNED")
    require(boot["policies"]["agentPermissions"]["attendanceWorkday"] is True,
            "ATTENDANCE_DENIED")
    fresh(boot["serverTime"], now)
    fresh(report["asOf"], now)
    zone = ZoneInfo(boot["timezone"])
    today = instant(boot["serverTime"]).astimezone(zone).date().isoformat()
    require(now.astimezone(zone).date().isoformat() == today, "DATE_CHANGED")
    require(rules["today"] == today
            and rules["current"]["timezone"] == boot["timezone"]
            and rules["current"]["effectiveFrom"] <= today, "RULE_DATE_MISMATCH")
    query = report["snapshot"]["query"]
    require(report["form"] == "JOURNAL" and query["form"] == "JOURNAL"
            and query["employeeId"] == principal["id"]
            and report["from"] <= today <= report["to"], "REPORT_SCOPE_INVALID")
    require(all(row["employeeId"] == principal["id"] for row in report["rows"]),
            "REPORT_SCOPE_INVALID")
    rows = [row for row in report["rows"] if row["date"] == today]
    require(len(rows) <= 1, "REPORT_SCOPE_INVALID")
    require(all(row["timezone"] == boot["timezone"]
                and row["ruleId"] == rules["current"]["id"] for row in rows),
            "RULE_DATE_MISMATCH")
    result = {"fixtureAccount": account, "date": today, "timezone": boot["timezone"]}
    # A workday from yesterday can still be open; never abandon it for a test.
    day = boot.get("workday")
    occupied = any(row.get("workdayId") or row["events"] for row in rows)
    if day and (day["workDate"][:10] == today or day["status"] != "COMPLETED"):
        occupied = True
    if occupied:
        return dict(result, status="BLOCKED", reason="WORKDAY_OCCUPIED")
    if any(row.get("approvedRequests") for row in rows):
        return dict(result, status="BLOCKED", reason="APPROVED_REQUEST_PRESENT")
    if (now + timedelta(seconds=RUN_BUDGET_SECONDS)).astimezone(zone).date().isoformat() != today:
        return dict(result, status="BLOCKED", reason="DATE_BOUNDARY_TOO_CLOSE")
    return dict(result, status="READY", validUntil=(now + timedelta(seconds=30)).isoformat())


def evaluate(snapshot, now):
    fresh(snapshot["capturedAt"], now)
    candidates = snapshot["candidates"]
    require(1 <= len(candidates) <= len(ACCOUNTS)
            and len({c["fixtureAccount"] for c in candidates}) == len(candidates),
            "ACCOUNT_SET_INVALID")
    results = [preflight(c, snapshot["rules"], now) for c in candidates]
    return {"version": 1, "status": "READY" if any(r["status"] == "READY" for r in results) else "BLOCKED",
            "checkedAt": now.isoformat(), "candidates": results,
            "physicalShift": "NOT_RUN"}


def event_map(report):
    events = [event for row in report["rows"] for event in row["events"]]
    result = {event["id"]: event for event in events}
    require(len(result) == len(events), "DUPLICATE_EVENT")
    return result


def verify_replay(before, after, employee_id, date, offline_at, reconnect_at):
    """Independent HR receipt check, after caller proves no writes while offline.

    Compare the same employee/date range before and after; replay preserves all
    earlier events, and four new claims must precede network restoration. Run
    again after cold start to detect duplicates. This does not prove UI actions.
    """
    require((before["from"], before["to"]) == (after["from"], after["to"]), "REPORT_SCOPE_INVALID")
    for report in (before, after):
        require(report["form"] == "JOURNAL"
                and report["snapshot"]["query"]["employeeId"] == employee_id
                and all(row["employeeId"] == employee_id for row in report["rows"]),
                "REPORT_SCOPE_INVALID")
    previous, current = event_map(before), event_map(after)
    require(all(current.get(key) == value for key, value in previous.items()), "HISTORY_CHANGED")
    rows = [row for row in after["rows"] if row["date"] == date]
    require(len(rows) == 1 and rows[0]["factsState"] == "VALID"
            and rows[0]["completedAt"] and rows[0]["workdayId"], "HR_DAY_NOT_VALID")
    require(not any(row["date"] == date and (row.get("workdayId") or row["events"])
                    for row in before["rows"]), "WORKDAY_OCCUPIED")
    events = rows[0]["events"]
    require(len(current) == len(previous) + 4 and len(events) == 4
            and [e["type"] for e in events] == ["START", "PAUSE", "RESUME", "FINISH"],
            "REPLAY_SEQUENCE_INVALID")
    claims = [instant(e["claimedAt"]) for e in events]
    require(claims == sorted(claims) and len(set(claims)) == 4, "CLAIM_ORDER_INVALID")
    start, end = instant(offline_at), instant(reconnect_at)
    require(all(start <= claim < end <= instant(event["serverReceivedAt"])
                for claim, event in zip(claims, events)), "CLAIM_WINDOW_INVALID")
    return {"status": "PASS", "factsState": "VALID", "newEvents": 4,
            "priorEventsUnchanged": len(previous), "transport": "authenticated-http"}


def main():
    try:
        receipt = evaluate(json.load(sys.stdin), datetime.now(timezone.utc))
    except Exception:
        # Malformed snapshots and exceptions can contain private response data.
        print(json.dumps({"version": 1, "status": "REFUSED", "reason": "PREFLIGHT_INPUT_REFUSED",
                          "physicalShift": "NOT_RUN"}))
        return 1
    print(json.dumps(receipt))
    return 0 if receipt["status"] == "READY" else 2


if __name__ == "__main__":
    sys.exit(main())
