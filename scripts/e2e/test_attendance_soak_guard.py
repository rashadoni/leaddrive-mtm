import copy
import unittest
from datetime import datetime, timedelta, timezone

import attendance_soak_guard as guard

START = datetime(2026, 10, 21, 21, tzinfo=timezone.utc)


def iso(seconds):
    return (START + timedelta(seconds=seconds)).isoformat()


def samples():
    result = []
    for elapsed in [*range(0, 86401, 300), 86520]:
        sample = {"checkedAt": iso(elapsed), "hostElapsedSeconds": elapsed,
                  "deviceElapsedSeconds": elapsed,
                  **{key: True for key in ("sameDeviceBoot", "packageIdentityUnchanged",
                     "packageNetworkBlocked", "ordinaryMtmNetworkAllowed", "radiosUnchanged",
                     "serverHistoryUnchanged")}}
        if elapsed == 85800:
            sample.update(admissionAvailable=True, pendingVisible=True)
        if elapsed == 86520:
            sample.update(admissionAvailable=False, expiredGateVisible=True)
        result.append(sample)
    return result


class SoakWindowTests(unittest.TestCase):
    def test_full_elapsed_day_and_both_real_ui_observations(self):
        self.assertEqual(guard.verify_soak_window(iso(0), samples())["status"], "PASS")

    def test_shortened_run_cannot_pass(self):
        with self.assertRaisesRegex(ValueError, "FULL_DAY_NOT_ELAPSED"):
            guard.verify_soak_window(iso(0), samples()[:-1])

    def test_network_return_or_changed_history_invalidates_soak(self):
        for key in ("packageNetworkBlocked", "serverHistoryUnchanged", "sameDeviceBoot",
                    "packageIdentityUnchanged", "ordinaryMtmNetworkAllowed", "radiosUnchanged"):
            with self.subTest(key=key):
                data = samples(); data[50][key] = False
                with self.assertRaisesRegex(ValueError, key.upper()):
                    guard.verify_soak_window(iso(0), data)

    def test_missing_observation_interval_cannot_pass(self):
        data = samples(); del data[20:24]
        with self.assertRaisesRegex(ValueError, "OBSERVATION_GAP"):
            guard.verify_soak_window(iso(0), data)

    def test_wall_or_device_clock_jump_cannot_replace_real_time(self):
        for key, value, reason in [("checkedAt", iso(30000), "HOST_CLOCK_CHANGED"),
                                   ("deviceElapsedSeconds", 30000, "DEVICE_CLOCK_CHANGED")]:
            with self.subTest(key=key):
                data = samples(); data[2][key] = value
                with self.assertRaisesRegex(ValueError, reason):
                    guard.verify_soak_window(iso(0), data)

    def test_each_expiry_side_requires_explicit_ui_evidence(self):
        for index, reason in [(-4, "BEFORE_EXPIRY_NOT_OBSERVED"), (-1, "EXPIRY_NOT_OBSERVED")]:
            data = samples()
            target = next(s for s in data if s.get("pendingVisible")) if index == -4 else data[-1]
            target.pop("admissionAvailable")
            with self.assertRaisesRegex(ValueError, reason):
                guard.verify_soak_window(iso(0), data)


class SoakReplayTests(unittest.TestCase):
    def setUp(self):
        self.before = {"old": {"id": "old", "type": "START", "claimedAt": iso(-100)}}
        self.after = copy.deepcopy(self.before)
        for number, kind in enumerate(["PAUSE", "RESUME", "FINISH"]):
            key = str(number)
            self.after[key] = {"id": key, "type": kind, "claimedAt": iso(60 + number * 20),
                               "serverReceivedAt": iso(86600 + number)}

    def test_preserves_claims_after_a_real_day(self):
        result = guard.verify_delayed_replay(self.before, self.after, iso(0), iso(86520))
        self.assertEqual(result["newEvents"], 3)
        self.assertTrue(result["requiresServerReview"])

    def test_history_change_duplicate_or_early_delivery_cannot_pass(self):
        cases = []
        changed = copy.deepcopy(self.after); changed["old"]["type"] = "FINISH"
        cases.append((changed, "HISTORY_CHANGED"))
        duplicate = copy.deepcopy(self.after); duplicate["extra"] = copy.deepcopy(duplicate["2"])
        cases.append((duplicate, "REPLAY_SEQUENCE_INVALID"))
        early = copy.deepcopy(self.after); early["0"]["serverReceivedAt"] = iso(100)
        cases.append((early, "CLAIM_WINDOW_INVALID"))
        for events, reason in cases:
            with self.subTest(reason=reason), self.assertRaisesRegex(ValueError, reason):
                guard.verify_delayed_replay(self.before, events, iso(0), iso(86520))


if __name__ == "__main__":
    unittest.main()
