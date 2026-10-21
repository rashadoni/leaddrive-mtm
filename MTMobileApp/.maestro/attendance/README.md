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
