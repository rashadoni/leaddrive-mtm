import unittest
from unittest.mock import Mock

from attendance_soak_probe import read_probe


class SoakProbeTests(unittest.TestCase):
    def test_temporary_outage_requires_a_real_successful_response(self):
        read = Mock(side_effect=[RuntimeError("Transport failure"),
                                 RuntimeError("HTTP status 503"), {"events": 35}])
        sleep, retry = Mock(), Mock()
        self.assertEqual(read_probe(read, sleep=sleep, on_retry=retry), {"events": 35})
        self.assertEqual(read.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [10, 20])
        self.assertEqual(retry.call_count, 2)

    def test_persistent_outage_fails_instead_of_returning_cached_history(self):
        read = Mock(side_effect=RuntimeError("Transport failure"))
        sleep = Mock()
        with self.assertRaisesRegex(RuntimeError, "Transport failure"):
            read_probe(read, sleep=sleep)
        self.assertEqual(read.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_refusal_and_integrity_failures_are_never_retried(self):
        for error in [RuntimeError("HTTP status 401"), RuntimeError("HTTP status 403"),
                      RuntimeError("Unexpected fixture identity"),
                      ValueError("HISTORY_CHANGED"), AssertionError("Device wall clock changed")]:
            with self.subTest(error=str(error)):
                read, sleep = Mock(side_effect=error), Mock()
                with self.assertRaises(type(error)):
                    read_probe(read, sleep=sleep)
                self.assertEqual(read.call_count, 1)
                sleep.assert_not_called()

    def test_success_is_not_repeated(self):
        read, sleep, retry = Mock(return_value={"events": 35}), Mock(), Mock()
        self.assertEqual(read_probe(read, sleep=sleep, on_retry=retry), {"events": 35})
        read.assert_called_once()
        sleep.assert_not_called()
        retry.assert_not_called()


if __name__ == "__main__":
    unittest.main()
