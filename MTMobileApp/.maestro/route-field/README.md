# Route & Field Maestro

`com.mtmobileapp` is the shipping Route & Field package. These flows do not
clear application data, install an APK or change phone networking/settings.
The explicit manager-signin journey changes the signed-in account only after
the owner's authorization, a synced agent screen and reconciled test task.

- `smoke/auth-entry.yaml`: the already signed-out, blank-password form only.
  Local validation and switching/cancelling sign-in forms; no OTP or password
  is entered or sent. The native runner refuses an occupied password field.
- `smoke/employee-tabs.yaml`: already signed-in agent shell, read-only tab and
  profile navigation. May dismiss the local welcome guide and app choice
  sheet. Does not start/finish a workday/visit or change a task status.
- `journeys/task-start.yaml` and `task-complete.yaml`: only the exact reserved
  test task created through the owner-authorized CRM website. A private case
  binds its ID, title, result, initial status, browser run and installed source.
- `journeys/manager-signin.yaml`: explicit account switch after the agent's
  task is complete. Checks the manager's profile and absence of the old agent's
  identity. Credentials are read through a private wrapper, never CLI arguments.
- `smoke/manager-tabs.yaml`: independently verified manager, read-only team,
  planning/filter cancel, approvals and profile. No publish, send or decision.

The bounded runner is `scripts/e2e/route_field_native.py`. It requires private
JSON identifying the published APK bytes/source and the protected background
observation progress, plus explicit Maestro and Java paths. `--flow` selects
the corresponding preflight; task and manager journeys require their private
cases. It writes a new private attempt directory
and a sanitized result; existing attempts are never overwritten.

Keep APK provenance separate from test code. A test-only change does not
require rebuilding/installing the application or restarting Time's soak.
Maestro CLI currently used on the connected handset is 2.11.0 with Java 21.

The full matrix and remaining gates are in `docs/route-field-testing-plan.md`.
Broader write acceptance uses a fixture matching the fixed ownership marker,
organization, principal and server grants in `route_field_guard.py`. The one
explicitly authorized CRM task is a separately guarded exception, not permission
to create real workday or visit facts. Time's real24h tenant is never a fallback.
