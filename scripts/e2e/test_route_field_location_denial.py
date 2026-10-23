from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from route_field_guard import verify_location_denial_lease


class LocationDenialAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.source = "a" * 40
        original = {name: {"granted": True, "flags": "[ USER_SET ]"}
                    for name in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "CAMERA")}
        marker = "/data/local/tmp/rf-permission-denial-" + "b" * 32
        self.lease = {"status": "ACTIVE", "package": "com.mtmobileapp", "uid": 10556,
                      "androidUser": 0, "sourceSha": self.source, "maximumSeconds": 900,
                      "marker": marker, "worker": marker + ".sh", "recoveryPid": 123,
                      "coldPid": 456, "startedAt": self.now.isoformat(),
                      "restoresBackgroundLocation": True,
                      "restorePermissionNames": ["android.permission.ACCESS_COARSE_LOCATION",
                                                 "android.permission.ACCESS_FINE_LOCATION",
                                                 "android.permission.ACCESS_BACKGROUND_LOCATION"],
                      "originalPermissions": original}
        self.permissions = deepcopy(original)
        for name in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"):
            self.permissions[name]["granted"] = False

    def verify(self):
        verify_location_denial_lease(self.lease, self.permissions, self.source, self.now)

    def test_only_both_denied_under_live_owner_lease_is_admitted(self):
        self.verify()

    def test_protected_android_profile_is_refused(self):
        self.lease["androidUser"] = 95
        with self.assertRaises(ValueError):
            self.verify()

    def test_a_granted_location_permission_cannot_run_the_negative_flow(self):
        self.permissions["ACCESS_FINE_LOCATION"]["granted"] = True
        with self.assertRaises(ValueError):
            self.verify()

    def test_expired_recovery_is_refused(self):
        self.lease["startedAt"] = (self.now - timedelta(seconds=900)).isoformat()
        with self.assertRaises(ValueError):
            self.verify()

    def test_remaining_lease_must_cover_the_whole_native_timeout(self):
        self.lease["startedAt"] = (self.now - timedelta(seconds=500)).isoformat()
        with self.assertRaises(ValueError):
            self.verify()

    def test_changed_flags_or_camera_are_refused(self):
        self.permissions["ACCESS_COARSE_LOCATION"]["flags"] = "[ USER_FIXED ]"
        with self.assertRaises(ValueError):
            self.verify()
        self.setUp()
        self.permissions["CAMERA"]["granted"] = False
        with self.assertRaises(ValueError):
            self.verify()

    def test_other_app_or_unbounded_recovery_is_refused(self):
        self.lease["package"] = "com.leaddrive.attendance"
        with self.assertRaises(ValueError):
            self.verify()
        self.setUp()
        self.lease["maximumSeconds"] = 86400
        with self.assertRaises(ValueError):
            self.verify()

    def test_forged_path_or_future_lease_is_refused(self):
        self.lease["marker"] = "/data/local/tmp/unrelated"
        with self.assertRaises(ValueError):
            self.verify()
        self.setUp()
        self.lease["startedAt"] = (self.now + timedelta(seconds=20)).isoformat()
        with self.assertRaises(ValueError):
            self.verify()

    def test_background_grant_restoration_cannot_be_forgotten(self):
        self.lease["restoresBackgroundLocation"] = False
        with self.assertRaises(ValueError):
            self.verify()


if __name__ == "__main__":
    unittest.main()
