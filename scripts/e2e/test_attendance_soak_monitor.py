import json
import subprocess
import unittest

from attendance_soak_monitor import FLAGS, parse_status, status_command, verify_live, watch_window, watch_android_window

BOOT = "00000000-0000-0000-0000-000000000000"
START = 1792800000


def status(elapsed=0):
    return dict(bootId=BOOT, epoch=START + elapsed, heartbeat=START + elapsed,
                watchdogHeartbeat=START + elapsed, observer=True, watchdog=True,
                armed=True, done=False, frame=dict(epoch=START + elapsed,
                deviceElapsedSeconds=elapsed, **dict.fromkeys(FLAGS, True)))


class MonitorTests(unittest.TestCase):
    def test_rejects_dead_workers_reboot_and_ended_lease(self):
        for key, value, reason in [("observer", False, "OBSERVER_MISSING"),
                                  ("watchdog", False, "WATCHDOG_MISSING"),
                                  ("bootId", "another-boot", "DEVICE_REBOOTED"),
                                  ("armed", False, "LEASE_ENDED"), ("done", True, "LEASE_ENDED")]:
            sample = status(); sample[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, reason):
                verify_live(sample, BOOT, START)

    def test_alive_processes_do_not_prove_fresh_observation(self):
        for key in ("heartbeat", "watchdogHeartbeat"):
            sample = status(400); sample[key] = START
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "STALE"):
                verify_live(sample, BOOT, START)
        sample = status(400); sample["frame"] = status()["frame"]
        with self.assertRaisesRegex(ValueError, "DEVICE_FRAME_STALE"):
            verify_live(sample, BOOT, START)

    def test_no_bad_network_frame_can_pass(self):
        for flag in FLAGS:
            sample = status(); sample["frame"][flag] = False
            with self.subTest(flag=flag), self.assertRaisesRegex(ValueError, flag.upper()):
                verify_live(sample, BOOT, START)

    def test_invalid_and_rewound_frames_fail_closed(self):
        for value in (None, float("nan"), True, "1"):
            sample = status(); sample["frame"]["epoch"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify_live(sample, BOOT, START)
        with self.assertRaisesRegex(ValueError, "REWOUND"):
            verify_live(status(30), BOOT, START, START + 60)

    def test_capture_may_pause_frames_but_not_heartbeats(self):
        sample = status(200); sample["frame"] = status()["frame"]
        self.assertEqual(verify_live(sample, BOOT, START), START)

    def run_watch(self, read=None, complete=None, sleep_for=None, persist=None, cancel=None):
        self.elapsed = 0; self.receipts = []; self.server = []
        def sleep(seconds): self.elapsed += seconds if sleep_for is None else sleep_for
        watch_window(read_status=read or (lambda **kw: status(self.elapsed)),
                     persist=persist or self.receipts.append, boot_id=BOOT, started_epoch=START,
                     server_sample=lambda: self.server.append(self.elapsed),
                     complete=complete or (lambda: self.elapsed >= 600),
                     cancelled=cancel or (lambda: False), clock=lambda: self.elapsed, sleep=sleep)

    def test_original_nine_hour_failure_is_seen_on_next_poll_not_next_day(self):
        def read(**kw):
            sample = status(self.elapsed)
            if self.elapsed >= 9 * 3600: sample["observer"] = sample["watchdog"] = False
            return sample
        with self.assertRaisesRegex(ValueError, "OBSERVER_MISSING"):
            self.run_watch(read=read, complete=lambda: False)
        self.assertEqual(self.elapsed, 9 * 3600)
        self.assertEqual(self.receipts[-1]["failureCode"], "OBSERVER_MISSING")
        self.assertGreater(len(self.server), 100)

    def test_transport_loss_is_saved_once_and_never_retried_as_success(self):
        def read(**kw): raise TimeoutError("private payload")
        with self.assertRaisesRegex(ValueError, "DEVICE_STATUS_UNAVAILABLE"):
            self.run_watch(read=read)
        self.assertEqual(self.receipts, [{"status": "REJECTED", "failureCode": "DEVICE_STATUS_UNAVAILABLE"}])
        self.assertEqual(self.server, [])

    def test_monitor_suspend_and_ignored_probe_timeout_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "HOST_MONITOR_GAP"):
            self.run_watch(sleep_for=300)
        def slow(**kw): self.elapsed += 21; return status(self.elapsed)
        with self.assertRaisesRegex(ValueError, "DEVICE_READ_DEADLINE"):
            self.run_watch(read=slow)

    def test_complete_is_only_readiness_not_a_full_day_pass(self):
        self.run_watch()
        self.assertEqual(len(self.receipts), 21)
        self.assertTrue(all(row["status"] == "OBSERVED" for row in self.receipts))
        self.assertEqual(self.server, [0, 240, 480])

    def test_write_failure_stops_monitor_and_cancel_does_not_read_phone(self):
        def broken(row): raise OSError("disk full")
        with self.assertRaises(OSError): self.run_watch(persist=broken)
        def never(**kw): self.fail("cancelled run probed phone")
        with self.assertRaisesRegex(ValueError, "OPERATOR_STOP"):
            self.run_watch(read=never, cancel=lambda: True)

    def test_status_parser_and_bounded_shell_preserve_worker_order(self):
        original = status(30)
        raw = "\n".join([BOOT, str(START+30), str(START+30), str(START+30),
                         "live", "live", "yes", "no", json.dumps(original["frame"])])
        self.assertEqual(parse_status(raw), original)
        command = status_command("a"*32, {"watchdog": 12, "observer": 11})
        self.assertLess(command.index("/proc/11"), command.index("/proc/12"))
        subprocess.run(["sh", "-n"], input=command, text=True, check=True)
        with self.assertRaises(ValueError): parse_status(raw + "\nunexpected")
        with self.assertRaises(ValueError): parse_status(raw.replace("live", "missing", 1).replace(str(START+30), "bad", 1))
        for lease, pids in [("a; id", {"observer": 1, "watchdog": 2}),
                            ("a"*32, {"observer": True, "watchdog": 2})]:
            with self.assertRaises(ValueError): status_command(lease, pids)

    def test_concrete_adb_failure_escapes_into_owning_controller_cleanup(self):
        calls = []; receipts = []; cleaned = []
        def adb(*args, timeout):
            calls.append((args, timeout))
            raise TimeoutError("device disconnected")
        with self.assertRaisesRegex(ValueError, "DEVICE_STATUS_UNAVAILABLE"):
            try:
                watch_android_window(adb=adb, lease_id="a" * 32, pids={"observer": 11, "watchdog": 12},
                    persist=receipts.append, boot_id=BOOT, started_epoch=START,
                    server_sample=lambda: None, complete=lambda: False, cancelled=lambda: False)
            finally:
                cleaned.append(True)
        self.assertEqual(cleaned, [True])
        self.assertEqual(calls[0][0][0], "shell")
        self.assertEqual(calls[0][1], 20)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__": unittest.main()
