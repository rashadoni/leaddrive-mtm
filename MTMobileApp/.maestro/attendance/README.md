# LeadDrive Time — physical Android acceptance

Target package: `com.leaddrive.attendance`. These flows never install, clear or sign out `com.mtmobileapp`. The default config selects only `smoke/*.yaml`; write journeys must be explicitly selected.

## Preparation

1. Build `.github/workflows/build-attendance.yml` on the candidate branch. Require green Jest, TypeScript, signed APK identity and manifest checks. Download its SHA-bound artifact and verify the APK checksum.
2. Install the separate package beside MTM. Record both installed package versions before and after acceptance.
3. Before entering credentials, run `journeys/first-launch.yaml` from the company selector. It rejects empty/unknown companies and empty credentials. From an already configured signed-out login, run `journeys/company-switch.yaml` instead; it also verifies company persistence after restart. Neither flow clears app data.
4. Sign in through the UI to the marker-owned `mtm-attendance-phone` fixture as `office@mtm-attendance-phone.example.invalid`. Obtain its credential through the existing recipient-encrypted access workflow. Never commit passwords, use real employee accounts or capture login secrets in screenshots/logs.
5. Select the UI locale, then pass `LOCALE=az`, `ru` or `en`. Every journey checks the fictional employee name before it can write. This UI guard supplements fixture ownership verification; it is not a substitute for it.
6. Record API baselines for the employee's day, requests and inbox. For write flows, confirm no other operator is using this fixture and that the requested date is free of overlapping requests. Never reset historical facts to make a test pass.

From `MTMobileApp`, with the official Maestro CLI on PATH (use `LOCALE=ru` on a Russian phone):

```sh
# Choose the flow that matches the signed-out screen.
maestro test -e LOCALE=ru .maestro/attendance/journeys/first-launch.yaml
# Or, from the configured company login:
maestro test -e LOCALE=ru .maestro/attendance/journeys/company-switch.yaml
```

After signing into the verified fixture:

```sh
maestro test -e LOCALE=az .maestro/attendance/smoke/employee.yaml
maestro test -e LOCALE=az .maestro/attendance/journeys/request-validation.yaml
maestro test -e LOCALE=az .maestro/attendance/journeys/workday.yaml
maestro test -e LOCALE=az -e RUN_ID=maestro-20261021-a -e REQUEST_DATE=2026-11-23 .maestro/attendance/journeys/request-submit.yaml
```

The workday journey requires a fresh fictional day; it checks start, pause, cold restart, resume, cancelled finish, confirmed finish and persistence. It must not be rerun over a completed day by clearing server facts. Request validation must leave the backend request count unchanged. Submission must create exactly one server request with the unique run marker; an outbox row alone is not a pass.

Review that exact request as the fixture HR administrator in CRM. Record whether this was a real browser action or an API operation. Then verify the decision in the installed app:

```sh
maestro test -e LOCALE=az -e RUN_ID=maestro-20261021-a -e REQUEST_ID=the-verified-request-id -e EXPECTED_STATUS=the-localized-status .maestro/attendance/journeys/request-decision.yaml
```

Do not mark a decision PASS without matching request ID, decision/status and a server receipt. Record the source SHA, APK SHA256, version/code, CLI version, device model/OS (no serial), exact executed flows and their exit codes. Keep credentials and unredacted device logs in a private temporary directory; commit only sanitized evidence.

## What these flows do not prove

The CRM E2E suite separately exercises HR permissions, requests/decisions, timesheets, exports and related configuration with isolated PostgreSQL. Passing that suite is not physical APK evidence. An emulator run of the existing Field release is also not evidence for this separate client.

External email delivery, overnight soak and disabled fixture capabilities (camera/QR/location) require separate explicit evidence. The new package currently uses the in-app inbox; Android push delivery is not configured for its package. Never describe an unrun gate as passed.

## Device approval and offline extension (2026-10-21)

The locale-aware physical fixture flows `installation-request.yaml` and `installation-decision.yaml` require the owned tenant's installation rule enabled and an exact pending request baseline. The request flow must not start or finish work. Review only its exact employee/request as HR, then run the decision flow with `EXPECTED_STATE=APPROVED` or `EXPECTED_STATE=REVOKED` with the app’s current `LOCALE`. Record browser/API transport honestly; restore the original rule after testing. Never approve a different employee's row.

`offline-access.yaml` reproduces the offline cold-start failure recorded on APK1012 and is now a required regression gate for the offline candidate. Candidate code alone does not supersede that physical FAIL. It belongs outside the default smoke. Run it only with an external harness that snapshots the existing radio states, confirms the fictional employee, disconnects networking, and restores the exact radio states in a bounded finally block even on failure. Do not assume that Samsung's `mobile_data` global setting alone proves radio disconnection. Verify online recovery and unchanged attendance/request data afterward. See `docs/attendance-offline-acceptance.md` for the desired contract and current gaps. A queue's existence does not prove a whole offline workday.

`qr-unavailable.yaml` verifies that the scan control and its explanation remain visible when QR is disabled. `qr-camera.yaml` requires the fictional QR policy temporarily enabled, a fresh/running day, and a permitted installation; it requests the camera through the real OS dialog and checks closure on backgrounding. It does not submit a time mark or prove optical decoding. Its harness restores the QR rule and this app's original camera grant. The camera visibility threshold is10% because the preview can exceed the landscape viewport; see the official Maestro scrollUntilVisible reference. Never convert this camera-only PASS into a successful QR attendance claim.

`location-policy-off.yaml` checks the loaded absence of a published policy and that the employee cannot accept a nonexistent consent. It is not a physical GPS measurement. All fixture launch helpers explicitly deny permissions; omitting a map in Maestro grants them by default. The camera flow explicitly retains its granted camera permission on foreground return and uses `stopApp: false`. Permission/dialog and camera-preview success do not prove optical decoding or a server-verified branch mark.

`qr-optical-mark.yaml` launches with explicit CAMERA, ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION denial; it leaves other grants unchanged. This avoids Maestro downloading the whole APK over remote ADB to enumerate `all` permissions. The map must not be omitted, which would grant all permissions by default. It is an explicit write journey requiring a running or paused fictional day, an assigned test branch, and QR enabled. It resumes a paused day, requests camera permission, waits up to five minutes for a real camera scan from another display, confirms FINISH and requires a verified branch receipt. Pass `QR_VERIFIED_TEXT` in the selected locale and the exact `QR_BRANCH_NAME` (Maestro text selectors are regular expressions). Keep a fresh server-issued code visible: its lifetime is 60 seconds. The external harness must verify the new HR FINISH event and its VERIFIED QR evidence, preserve every earlier event and request, and record that the scan was physically assisted. A decoded payload submitted through an API, clipboard or test hook is not optical evidence. Never rerun this over a completed day or silently reopen a day to obtain a pass. If no one can aim the camera, record the optical journey as NOT RUN and keep the configured QR feature available.

`offline-shift.yaml` is an explicit write journey for a fresh owned workdate. It checks START → PAUSE → RESUME → FINISH with process restarts between actions and after FINISH. Pass `LOCALE`; the external harness must disable both network paths, verify no server writes before reconnection, restore the exact original radio states, then verify exactly four ordered events with the original claim times and unchanged earlier history. Never reset a completed day or change the phone clock. Keep the tenant timezone unchanged for full HR acceptance.

A fresh-day preflight must verify the **effective frozen attendance rule timezone**, not only the mutable MTM timezone. Changing the latter alone can produce a synthetic future workdate that the HR report correctly marks WORKDAY_INCONSISTENT. Such a run proves capture/delivery only, not a valid timesheet; retain the evidence and never rewrite history to force a pass. `offline-existing-shift.yaml` separately verifies PAUSE/RESUME/FINISH and restarts on a running current-day fixture with matching timezones. Its external harness must retain the prior events, verify no writes before reconnection, then require a VALID HR row and unchanged original claim times. This supplementary journey does not claim to test offline START.

### Repeatable fresh-day gate

`scripts/e2e/attendance_fresh_day_guard.py` (repository root) accepts a private JSON snapshot on stdin: `capturedAt`, the authenticated HR `rules` response's `data`, and `candidates`. Each candidate contains `fixtureAccount` (`office` or `admin`), mobile `bootstrap.data`, and the same employee's HR JOURNAL `report.data` covering today. Obtain these only after verifying marker ownership through the fixture access workflow. Do not commit the input snapshots.

Run the guard immediately before disconnecting. Exit 0 means a candidate is READY for 30 seconds; exit 2 means all days are occupied or the date boundary is too close; exit 1 refuses malformed, stale, incorrectly scoped or inconsistent snapshots. READY does not mean the shift passed. The guard rejects stale samples, field principals, mismatched calendars, existing days/events and a previous unfinished shift. Recheck the phone's identity, server time, queue and online admission before launching; on any change obtain a new snapshot.

The second fixture account is the fictional HR administrator's mobile **EMPLOYEE** card. After ordinary UI sign-in, `offline-shift.yaml` accepts `FIXTURE_ACCOUNT=admin`; the default remains `office`. Its UI guard accepts exactly these two names. Never change the field account's role, add a fourth user to the fixed three-user fixture, or delete prior workdays to obtain a free date.

After reconnection, `verify_replay` in that module independently checks the exact employee and report range, four ordered original claims within the disconnected window, later server receipts, a VALID completed HR day, and unchanged earlier events. Also compare server snapshots before reconnection, requests, permissions and radio state externally; repeat the HR read after cold start to reject duplicates. These pure checks do not replace Maestro or prove physical execution by themselves.


### Real GPS and a 24-hour offline hold

`location-finish.yaml` is an explicit write journey for the owned office fixture on a completed current day: accept the operator-approved test policy, reopen normally, then run `location-finish-running.yaml` to answer Android's precise foreground permission and finish. The continuation can recover an already reopened test day without rewriting its history. `location-finish-granted.yaml` separately tests a previously granted OS permission. UI completion is not GPS success: the host must independently require an INSIDE location mark for the intended branch, unchanged prior history/requests, and record every earlier UNAVAILABLE or failed attempt. Keep exact phone coordinates and raw UI artifacts private.

`offline-soak-capture.yaml` captures PAUSE/RESUME/FINISH with restarts on an already running current-day fixture. It requires prior approved consent and foreground GPS permission. Its host harness must hold the separate app offline for a real 24 hours, preserve the clock and other apps' connectivity, observe provisional access and the durable queue before expiry, then observe admission closed after expiry. Only then restore networking and verify original delayed claims and the server review flag. A device-side recovery deadline must restore the app's networking even if the host tunnel is lost. No clearState, artificial clock advance or deletion of prior events is allowed.

`scripts/e2e/attendance_soak_guard.py` checks timestamped physical observations and authenticated event maps. Its unit tests do not prove a physical soak. Gaps, changed clocks, early delivery, duplicate events or missing expiry UI observations prevent PASS. A real run must report RUNNING until the full interval and post-reconnect checks actually complete.


### Delivery receipts, own evidence and correction context (2026-10-22)

`own-mark-details.yaml` requires a completed fictional day created by the new APK after the canonical delivery receipts feature was installed, and the new server GET marks endpoint. It opens saved evidence with permissions denied, closes it, restarts, and verifies that delivery receipts persist while the private report stays closed. It does not prove a GPS fix or camera scan; verify the exact event IDs/times, permission baseline and absence of new events through the authenticated harness.

`correction-from-day.yaml` requires a completed, delivered fictional day and no existing request draft. Pass `EXPECTED_WORK_DATE`, `EXPECTED_START_TIME`, `EXPECTED_END_TIME` from that canonical day in the company timezone. It verifies contextual prefill and closes without submitting. Compare the requests baseline afterward to prove no accidental request. Submission, HR review and employee decision are separate checks; the server browser E2E exercises a real mobile correction submission, HR comparison/rejection and the employee’s returned decision.

Both new journeys are prepared but NOT RUN on the physical phone as of this change. Finish the running real24h test before replacing its APK or changing permissions. The backend browser/PG gates and the new APK must pass on the new source before these physical flows run.


Physical update, 2026-10-22: APK1022 is installed; these new journeys are not yet accepted. The first receipt journey was stopped too early before the OS location answer; its flow now waits for the actual completed/delivered state. Subsequent attempts lost the device/tunnel. Prior failures remain in the session journal and first-package evidence. `receipt-existing-day.yaml` uses a completed marker-owned day as a supplementary receipt check; it does not substitute a fresh START test. The shared fixture now denies the three relevant permissions explicitly (avoids APK transfer over remote ADB) and accepts only the existing office/admin fixture allowlist. Use `FIXTURE_ACCOUNT=admin` for correction prefill on the real-date admin day; the office day preserves an earlier synthetic date mismatch and must not be rewritten to make this test pass.


Physical continuation, 2026-10-22: workday status can update before the screen finishes its request and enables the next button. The receipt and location continuations now wait for the action to be enabled before finishing; receipt restart waits for the break operation to settle. Confirm the FINISH dialog before selecting its confirmation. Android may expose either `permission_deny_button` or `permission_deny_and_dont_ask_again_button` after prior denials; the receipt flow accepts both actual system controls. These waits do not turn an unavailable GPS fix into INSIDE or replace the authenticated event/history comparison. Maestro state selectors are documented at https://docs.maestro.dev/maestro-flows/flow-control-and-logic/how-to-use-selectors.md.


### Compact standalone workday (2026-10-22)

The standalone navigator now uses the compact layout; ordinary MTM keeps its
existing presentation. `smoke/compact-workday.yaml` checks discovery, disclosure
and closing of receipt/evidence details, then verifies that private details
remain closed after restart. It does not request historical coordinates, make
a time mark or prove optical/GPS success. The fixture permission baseline still
requires an external restore harness. Physical execution is NOT RUN until the
matching new APK is installed after recovery of the interrupted soak queue.

Updated journeys use `shared/expand-disclosure.yaml` and the visible chevron
state to avoid closing an already open section. Consent acceptance waits for
the confirmed active summary before reopening withdrawal controls. Full policy
text and explicit consent are still required. Do not run new-layout journeys
on the older1025 APK or change the APK during an active real-day hold.
