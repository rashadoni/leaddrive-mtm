from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from attendance_soak_guard import INVARIANTS, verify_independent_soak_window


class IndependentSoakTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 24, tzinfo=timezone.utc)
        self.device = []
        self.server = []
        for elapsed in range(0, 86701, 300):
            epoch = self.start.timestamp() + elapsed
            self.device.append(dict(epoch=epoch, deviceElapsedSeconds=elapsed,
                                    **{k: True for k in INVARIANTS[:-1]},
                                    protectedProfileNetworkAllowed=True, denyScopeExact=True, clockStable=True))
            self.server.append(dict(checkedAt=(self.start + timedelta(seconds=elapsed)).isoformat(),
                                    hostElapsedSeconds=elapsed, serverHistoryUnchanged=True))
        self.before = dict(kind='before', epoch=self.start.timestamp() + 85800, passed=True, pendingVisible=True)
        self.after = dict(kind='after', epoch=self.start.timestamp() + 86520, passed=True, pendingVisible=False)

    def verify(self):
        return verify_independent_soak_window(self.start.isoformat(), self.device, self.server,
                                              self.before, self.after)

    def test_separate_real_device_and_hr_streams_pass(self):
        self.assertEqual(self.verify()['status'], 'PASS')

    def test_shortened_real_time_is_rejected(self):
        self.device.pop()
        with self.assertRaisesRegex(ValueError, 'FULL_DAY_NOT_ELAPSED'):
            self.verify()

    def test_protected_profile_and_exact_scope_fail_even_if_owner_is_blocked(self):
        for flag in ['protectedProfileNetworkAllowed', 'denyScopeExact']:
            original = deepcopy(self.device)
            self.device[10][flag] = False
            with self.assertRaisesRegex(ValueError, flag.upper()): self.verify()
            self.device = original

    def test_one_bad_phone_frame_cannot_be_hidden_by_later_recovery(self):
        self.device[10]['packageNetworkBlocked'] = False
        with self.assertRaisesRegex(ValueError, 'PACKAGENETWORKBLOCKED'): self.verify()

    def test_phone_and_server_gaps_are_checked_independently(self):
        for stream, message in [(self.device, 'DEVICE'), (self.server, 'SERVER')]:
            saved = deepcopy(stream)
            del stream[10:13]
            with self.assertRaisesRegex(ValueError, message + '_OBSERVATION_GAP'): self.verify()
            stream[:] = saved

    def test_server_history_cannot_be_inferred_from_phone_isolation(self):
        del self.server[10]['serverHistoryUnchanged']
        with self.assertRaisesRegex(ValueError, 'SERVER_HISTORY_CHANGED'): self.verify()

    def test_device_clock_and_host_clock_are_independently_checked(self):
        self.device[10]['epoch'] += 60
        with self.assertRaisesRegex(ValueError, 'DEVICE_CLOCK_CHANGED'): self.verify()
        self.device[10]['epoch'] -= 60
        self.server[10]['checkedAt'] = self.server[11]['checkedAt']
        with self.assertRaisesRegex(ValueError, 'HOST_CLOCK_CHANGED'): self.verify()

    def test_ui_before_and_after_expiry_cannot_be_replaced_by_an_early_capture(self):
        self.before['epoch'] = self.start.timestamp() + 86000
        self.after['epoch'] = self.start.timestamp() + 86400
        with self.assertRaisesRegex(ValueError, 'EXPIRY_NOT_OBSERVED'): self.verify()

    def test_pending_claims_must_survive_until_the_before_capture(self):
        self.before['pendingVisible'] = False
        with self.assertRaisesRegex(ValueError, 'BEFORE_EXPIRY_NOT_OBSERVED'): self.verify()

    def test_final_hr_read_must_follow_expired_ui(self):
        self.after['epoch'] = self.start.timestamp() + 86580
        self.server[-1]['checkedAt'] = (self.start + timedelta(seconds=86550)).isoformat()
        self.server[-1]['hostElapsedSeconds'] = 86550
        with self.assertRaisesRegex(ValueError, 'SERVER_READ_BEFORE_FINAL_UI'): self.verify()


if __name__ == '__main__': unittest.main()
