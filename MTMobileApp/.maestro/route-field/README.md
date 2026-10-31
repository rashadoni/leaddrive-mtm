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
- `smoke/manager-joint-visit.yaml`: the same verified manager, read-only joint
  visits: the list (never «no joint visits yet» above a listed one), a rating
  form left without saving, the plan form with an agent chosen and left
  without saving. Gate `RF_MANAGER_PREFLIGHT`, like manager-tabs.

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


### Previously uploaded photos during offline acceptance

After installing a corrected APK, run the guarded `zeytun-visit-progress-read` journey online against the existing marked QA visit. This reads its confirmed workspace/count and returns to Today; it does not start a visit or take another photo. Only then enter the bounded RF-UID-only offline lease for completion and process-restart persistence. An existing failed attempt must keep its original result and directory. The cache requires the current server-issued offline grant and exact tenant/principal/server/installation/login binding; answered permission denials invalidate it.


## Extended accessibility and refusal checks

`smoke/employee-accessibility.yaml` is read-only. The guarded native driver
accepts it as `--flow employee-accessibility`, retaining nine screenshots in
the attempt's private Maestro artifact directory. It scrolls to the clients
search on short windows. A screenshot bundle may be nested by timestamp and
flow name; the collector requires one complete bundle and refuses ambiguous
folders or symlinks. Navigation success does not prove absence of visual text
truncation: inspect the actual captures.

The operator must record and bound temporary font/orientation settings and
restore their exact original values. A failed first-viewport assertion must
not be called a product defect before testing ordinary scrolling.

`qa/location-denied.yaml` is admitted only as
`--flow zeytun-location-denied --location-denial-lease /private/lease.json`
with the existing manually authenticated QA case. The driver requires both RF
owner0 location grants denied, unchanged permission flags/camera, a source-bound
cold process, and a live independent 900-second recovery worker. At least
420 seconds must remain for the full native deadline and termination margin.
Recovery must stop RF before restoring COARSE, FINE and BACKGROUND location;
a pending check-in promise must never resume after the grants return. Compare
all RF and Time runtime permission profiles/flags afterward. This flow declines
the app disclosure, asserts the location explanation and returns to Today. It
must not submit another visit, GPS proposal, photo, task or approval.

`scripts/e2e/route_field_negative_api.py` is a separate API-layer check. It
accepts `--access-root` for the already prepared private fictional-company
credentials/cookie and `--out` for a new private directory outside the checkout.
The host, principals and customers are fixed to the owned fictional fixture;
fresh tenant/role binding and an empty visit snapshot are prerequisites. It
runs 13 refusal cases through both direct and offline-sync visit APIs,
temporarily setting and restoring only the fictional GPS customer's pin.
Refused operations can retain fictional conflict/audit rows and in-app alerts;
no visit may be accepted. These requests use synthetic fixture coordinates and
are not physical phone GPS or OS permission evidence. Never substitute a real
company manifest or erase accepted business records to satisfy the empty-fixture
precondition.
