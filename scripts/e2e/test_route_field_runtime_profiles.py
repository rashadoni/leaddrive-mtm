import unittest

from route_field_guard import runtime_permission_profiles


OWNER = """
    User 0: installed=true stopped=false
      runtime permissions:
        android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[ USER_SET|524288]
        android.permission.ACCESS_BACKGROUND_LOCATION: granted=true, flags=[ USER_SET|RESTRICTION_INSTALLER_EXEMPT]
"""
PROTECTED = """
    User 95: installed=true stopped=true
      runtime permissions:
        android.permission.ACCESS_FINE_LOCATION: granted=false, flags=[ USER_SENSITIVE_WHEN_DENIED]
"""
QUERY_SECTIONS = """
  Queries:
    User 0:
      [com.example.other.package]
    User 95:
      queryable via uses-library:
"""


class RuntimePermissionSnapshotTests(unittest.TestCase):
    def test_query_headings_do_not_erase_actual_user_states(self):
        profiles = runtime_permission_profiles(OWNER + PROTECTED + QUERY_SECTIONS)
        self.assertEqual(set(profiles), {"0", "95"})
        self.assertTrue(profiles["0"]["android.permission.ACCESS_FINE_LOCATION"]["granted"])
        self.assertFalse(profiles["95"]["android.permission.ACCESS_FINE_LOCATION"]["granted"])
        self.assertIn("RESTRICTION_INSTALLER_EXEMPT",
                      profiles["0"]["android.permission.ACCESS_BACKGROUND_LOCATION"]["flags"])

    def test_secondary_profile_cannot_stand_in_for_missing_owner(self):
        with self.assertRaises(ValueError):
            runtime_permission_profiles(PROTECTED + QUERY_SECTIONS)

    def test_two_real_owner_permission_blocks_are_ambiguous(self):
        with self.assertRaises(ValueError):
            runtime_permission_profiles(OWNER + PROTECTED + OWNER)


if __name__ == "__main__":
    unittest.main()
