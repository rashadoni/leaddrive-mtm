import subprocess
from pathlib import Path
import tempfile
import unittest

from attendance_device_observer import render_observer


def worker(**overrides):
    args = dict(lease_id="0" * 32, apk_sha256="a" * 64,
                boot_id="00000000-0000-0000-0000-000000000000",
                original_stay_awake="2",
                radios={"wifi_on": "1", "mobile_data": "1", "airplane_mode_on": "0"})
    args.update(overrides)
    return render_observer(**args)


class DeviceObserverTests(unittest.TestCase):
    def test_shell_parses_in_both_bounded_modes(self):
        for qualification in (True, False):
            subprocess.run(["sh", "-n"], input=worker(qualification=qualification),
                           text=True, check=True, capture_output=True)

    def test_shell_arguments_cannot_be_injected_through_metadata(self):
        for key, value in [("lease_id", "../../elsewhere"), ("apk_sha256", "a; echo private"),
                           ("boot_id", "`id`"), ("original_stay_awake", "2; id"),
                           ("radios", {"wifi_on": "1; id"})]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                worker(**{key: value})

    def test_only_the_audited_time_owner_uid_can_be_restored(self):
        text = worker()
        setters = [line.strip() for line in text.splitlines()
                   if "service call connectivity 83" in line]
        self.assertEqual(setters, ["service call connectivity 83 i32 9 i32 10565 i32 0 >/dev/null"])
        self.assertNotIn("set-package-networking-enabled", text)
        self.assertNotIn("settings put global wifi", text)
        self.assertNotIn("settings put global mobile_data", text)
        self.assertNotIn("pm grant", text)
        self.assertNotIn("pm revoke", text)

    def test_actual_shell_getter_parses_both_android_whitespace_layouts(self):
        definitions = worker().split('\ncase "$1" in', 1)[0]
        for result in (1, 2):
            for gap in (" ", "  \n\t"):
                prefix = "service() { printf '%s' 'Parcel(00000000" + gap + f"{result:08x})'; }}\n"
                done = subprocess.run(["sh", "-c", prefix + definitions + "\nts_rule 10565"],
                                      capture_output=True, text=True, check=True)
                self.assertEqual(done.stdout.strip(), str(result))

    def test_deny_scope_parser_preserves_a_secondary_profile_instead_of_modulo_matching(self):
        definitions = worker().split('\ncase "$1" in', 1)[0]
        probe = "printf '%s\\n' 'sUidOwnerMap:' 'Flags: OEM_DENY_3_MATCH' '  10565 OEM_DENY_3_MATCH' '  9510565 OEM_DENY_3_MATCH' | ts_denied_uids"
        done = subprocess.run(["sh", "-c", definitions + '\n' + probe],
                              capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.splitlines(), ["10565", "9510565"])

    def test_android_legend_alone_is_not_a_deny_rule(self):
        definitions = worker().split('\ncase "$1" in', 1)[0]
        probe = "printf '%s\\n' 'sUidOwnerMap:' 'Flags: OEM_DENY_3_MATCH' | ts_denied_uids"
        done = subprocess.run(["sh", "-c", definitions + '\n' + probe],
                              capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout, '')

    def test_tab_coordinates_come_only_from_the_named_attendance_tab(self):
        definitions = worker().split('\ncase "$1" in', 1)[0]
        fixture = '<node resource-id="unrelated" bounds="[1,2][3,4]"/><node package="com.leaddrive.attendance" resource-id="time-tab-OwnWorkday" bounds="[94,904][493,1058]"/>'
        probe = "printf '%s' '" + fixture + "' | ts_tab_bounds"
        done = subprocess.run(['sh', '-c', definitions + '\n' + probe],
                              capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip(), '94 904 493 1058')

    def test_recovery_disables_only_an_empty_known_chain_even_with_android_legend(self):
        definitions = worker().split('\ncase "$1" in', 1)[0]
        for extra_uid in ('', '  9510565 OEM_DENY_3_MATCH'):
            with self.subTest(extra_uid=extra_uid), tempfile.TemporaryDirectory() as temporary:
                folder = Path(temporary); (folder / 'armed').touch()
                mocks = "service() { printf '%s' 'Parcel(00000000 00000001)'; }\n"
                mocks += "dumpsys() { printf '%s\\n' 'sUidOwnerMap:' 'Flags: OEM_DENY_3_MATCH' '" + extra_uid + "'; }\n"
                mocks += 'cmd() { printf "%s\\n" "$*" >> "$ts_dir/commands"; }\n'
                subprocess.run(['sh', '-c', mocks + definitions + '\nts_dir=' + temporary + '\nts_release TEST'],
                               capture_output=True, text=True, check=True)
                commands = (folder / 'commands').read_text() if (folder / 'commands').exists() else ''
                self.assertEqual(bool(commands), not bool(extra_uid))
                if commands:
                    self.assertEqual(commands.strip(), 'connectivity set-chain3-enabled false')

    def test_qualification_does_not_hold_the_phone_awake_and_has_a_short_heartbeat(self):
        text = worker(qualification=True)
        self.assertIn("if [ false = true ]; then", text)
        self.assertIn("ts_timeout=12", text)
        self.assertIn("ts_hold=180", text)
        with self.assertRaisesRegex(ValueError, "OBSERVER_MODE_INVALID"):
            worker(qualification="false")

    def test_production_heartbeat_is_device_local_and_evidence_precedes_failure(self):
        text = worker()
        self.assertIn('mv "$ts_dir/heartbeat.$$" "$ts_dir/heartbeat"', text)
        self.assertIn("ts_hold=86520", text)
        self.assertIn("ts_timeout=180", text)
        self.assertLess(text.index('>> "$ts_dir/device-samples.jsonl"'),
                        text.index('if [ -n "$ts_bad" ]'))
        self.assertIn('if [ -f "$ts_dir/armed" ]; then', text)


if __name__ == "__main__":
    unittest.main()
