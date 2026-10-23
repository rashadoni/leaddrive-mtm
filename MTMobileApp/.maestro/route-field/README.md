# Route & Field Maestro

`com.mtmobileapp` is the shipping Route & Field package. These flows do not
clear data, log out, install an APK or change phone networking/settings.

- `smoke/auth-entry.yaml`: the already signed-out, blank-password form only.
  Local validation and switching/cancelling sign-in forms; no OTP or password
  is entered or sent. The native runner refuses an occupied password field.
- `smoke/employee-tabs.yaml`: already signed-in agent shell, read-only tab and
  profile navigation. May dismiss the local welcome guide and app choice
  sheet. Does not start/finish a workday/visit or change a task status.
- `smoke/manager-tabs.yaml`: prepared for an independently verified fictional
  manager. **NOT RUN; not admitted by the native runner yet.**

The bounded runner is `scripts/e2e/route_field_native.py`. It requires private
JSON identifying the published APK bytes/source and the protected background
observation progress, plus explicit Maestro and Java paths. `--flow` admits
only the two implemented preflights. It writes a new private attempt directory
and a sanitized result; existing attempts are never overwritten.

Keep APK provenance separate from test code. A test-only change does not
require rebuilding/installing the application or restarting Time's soak.
Maestro CLI currently used on the connected handset is 2.11.0 with Java 21.

The full matrix and remaining gates are in `docs/route-field-testing-plan.md`.
Fixtures must match the fixed ownership marker, organization, principal and
server grants in `route_field_guard.py`. Neither a customer tenant nor Time's
real24h fixture is a fallback for write acceptance.
