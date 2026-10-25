"""Fixture-safety/receipt checks, not physical device evidence."""
import contextlib
import copy
import io
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import attendance_fresh_day_guard as guard

NOW = datetime(2026, 10, 21, 17, 24, 0, tzinfo=timezone.utc)


def fixture():
    report = {"from": "2026-10-21", "to": "2026-10-26", "asOf": NOW.isoformat(),
              "form": "JOURNAL", "snapshot": {"query": {"employeeId": "fictional-card", "form": "JOURNAL"}}, "rows": []}
    boot = {"tenant": {"id": guard.TENANT + "-v1", "slug": guard.TENANT},
            "principal": {"id": "fictional-card", "email": "office@" + guard.TENANT + ".example.invalid",
                          "name": guard.ACCOUNTS["office"], "role": "EMPLOYEE"},
            "policies": {"agentPermissions": {"attendanceWorkday": True}},
            "serverTime": NOW.isoformat(), "timezone": "Asia/Baku", "workday": None}
    return {"capturedAt": NOW.isoformat(), "rules": {"today": "2026-10-21", "current": {
        "id": "mtm-default-v1", "timezone": "Asia/Baku", "effectiveFrom": "0001-01-01"}},
        "candidates": [{"fixtureAccount": "office", "bootstrap": boot, "report": report}]}


class PreflightTests(unittest.TestCase):
    def test_real_current_empty_day_is_ready_without_claiming_acceptance(self):
        result = guard.evaluate(fixture(), NOW)
        self.assertEqual((result["status"], result["physicalShift"]), ("READY", "NOT_RUN"))

    def test_completed_or_pending_today_and_previous_open_shift_block_start(self):
        for date, state in [("2026-10-21", "COMPLETED"), ("2026-10-21", "STARTED"), ("2026-10-20", "PAUSED")]:
            value = fixture()
            value["candidates"][0]["bootstrap"]["workday"] = {"workDate": date, "status": state}
            self.assertEqual(guard.evaluate(value, NOW)["candidates"][0]["reason"], "WORKDAY_OCCUPIED")

    def test_hr_history_blocks_even_if_mobile_bootstrap_looks_empty(self):
        value = fixture()
        value["candidates"][0]["report"]["rows"] = [{"date": "2026-10-21", "employeeId": "fictional-card",
            "timezone": "Asia/Baku", "ruleId": "mtm-default-v1", "workdayId": "existing", "events": []}]
        self.assertEqual(guard.evaluate(value, NOW)["status"], "BLOCKED")

    def test_timezone_only_workaround_is_refused(self):
        value = fixture()
        value["candidates"][0]["bootstrap"]["timezone"] = "Pacific/Kiritimati"
        with self.assertRaisesRegex(ValueError, "RULE_DATE_MISMATCH"):
            guard.evaluate(value, NOW)

    def test_mismatching_hr_calendar_is_refused(self):
        value = fixture()
        value["candidates"][0]["report"]["rows"] = [{"date": "2026-10-21", "employeeId": "fictional-card",
            "timezone": "Pacific/Kiritimati", "ruleId": "mtm-default-v1", "events": []}]
        with self.assertRaisesRegex(ValueError, "RULE_DATE_MISMATCH"):
            guard.evaluate(value, NOW)

    def test_wrong_tenant_role_permission_and_hr_scope_are_refused(self):
        mutations = [lambda c: c["bootstrap"]["tenant"].update(id="another-tenant"),
                     lambda c: c["bootstrap"]["principal"].update(role="AGENT"),
                     lambda c: c["bootstrap"]["policies"]["agentPermissions"].update(attendanceWorkday=False),
                     lambda c: c["report"]["snapshot"]["query"].update(employeeId="someone-else"),
                     lambda c: c["report"].update(to="2026-10-20")]
        for mutation in mutations:
            value = fixture()
            mutation(value["candidates"][0])
            with self.assertRaises(ValueError):
                guard.evaluate(value, NOW)

    def test_old_snapshot_and_date_boundary_never_launch_write_flow(self):
        with self.assertRaisesRegex(ValueError, "SNAPSHOT_STALE"):
            guard.evaluate(fixture(), NOW.replace(minute=27))
        value = fixture()
        late = NOW.replace(hour=19, minute=55)
        value["capturedAt"] = value["candidates"][0]["bootstrap"]["serverTime"] = late.isoformat()
        value["candidates"][0]["report"]["asOf"] = late.isoformat()
        self.assertEqual(guard.evaluate(value, late)["candidates"][0]["reason"], "DATE_BOUNDARY_TOO_CLOSE")

    def test_admin_remains_an_office_principal_and_must_have_exact_identity(self):
        value = fixture()
        c = value["candidates"][0]
        c["fixtureAccount"] = "admin"
        c["bootstrap"]["principal"].update(email="admin@" + guard.TENANT + ".example.invalid", name=guard.ACCOUNTS["admin"])
        self.assertEqual(guard.evaluate(value, NOW)["status"], "READY")
        c["bootstrap"]["principal"]["role"] = "admin"
        with self.assertRaisesRegex(ValueError, "ACCOUNT_NOT_OWNED"):
            guard.evaluate(value, NOW)

    def test_cli_refusal_does_not_print_input_or_exceptions(self):
        output = io.StringIO()
        with patch("sys.stdin", io.StringIO('{"private-token":"must-not-appear"}')), contextlib.redirect_stdout(output):
            self.assertEqual(guard.main(), 1)
        self.assertNotIn("must-not-appear", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["physicalShift"], "NOT_RUN")


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.before = fixture()["candidates"][0]["report"]
        self.after = copy.deepcopy(self.before)
        events = [{"id": str(i), "type": kind, "claimedAt": f"2026-10-21T17:25:0{i}Z",
                   "serverReceivedAt": f"2026-10-21T17:26:0{i}Z"}
                  for i, kind in enumerate(["START", "PAUSE", "RESUME", "FINISH"])]
        self.after["rows"] = [{"employeeId": "fictional-card", "date": "2026-10-21", "events": events,
                               "factsState": "VALID", "completedAt": events[-1]["claimedAt"], "workdayId": "fictional-day"}]

    def verify(self):
        return guard.verify_replay(self.before, self.after, "fictional-card", "2026-10-21",
                                   "2026-10-21T17:25:00Z", "2026-10-21T17:26:00Z")

    def test_four_offline_claims_with_later_receipts_and_valid_hr(self):
        self.assertEqual(self.verify()["status"], "PASS")

    def test_capture_delivery_without_valid_hr_cannot_pass(self):
        self.after["rows"][0]["factsState"] = "INVALID"
        with self.assertRaisesRegex(ValueError, "HR_DAY_NOT_VALID"):
            self.verify()

    def test_duplicates_reordering_and_online_claims_are_rejected(self):
        original = copy.deepcopy(self.after)
        mutations = [lambda e: e.append(copy.deepcopy(e[-1])), lambda e: e.reverse(),
                     lambda e: e[0].update(claimedAt="2026-10-21T17:26:01Z"),
                     lambda e: e[0].update(serverReceivedAt="2026-10-21T17:25:30Z")]
        for mutation in mutations:
            self.after = copy.deepcopy(original)
            mutation(self.after["rows"][0]["events"])
            with self.assertRaises(ValueError):
                self.verify()

    def test_unchanged_earlier_history_is_required(self):
        old = {"employeeId": "fictional-card", "date": "2026-10-20", "events": [{"id": "old", "type": "FINISH"}]}
        self.before["rows"].append(old)
        self.after["rows"].append(copy.deepcopy(old))
        self.assertEqual(self.verify()["priorEventsUnchanged"], 1)
        self.after["rows"][1]["events"][0]["type"] = "START"
        with self.assertRaisesRegex(ValueError, "HISTORY_CHANGED"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
