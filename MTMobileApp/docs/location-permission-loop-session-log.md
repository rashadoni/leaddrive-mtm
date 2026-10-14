# Android location permission re-entry — session log

## 2026-10-14 — observed defect and bounded repair

- Worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-location-permission-loop`;
  branch `codex/mtm-location-permission-loop`; reviewed main base
  `2ad9a5077c3dc4c36ce1a562ddbf4a2ad360ded5`; origin `rashadoni/leaddrive-mtm`.
- Android delivery remains reviewed main, hosted `ci.yml` tests/typecheck and
  signed `build-apk.yml`. No production shell or local Android/full RN build.
  Coordinator owns push/review/merge/release and all physical device actions.
- On the owned fictional FIELD account, the original pending START was accepted
  automatically at 03:35 UTC after the CRM repair. Queue became empty. The GPS
  permission was denied, preserving the test's no-location condition.
- Coordinator's bounded Android activity evidence showed 48 permission activity
  launches in 4.651 seconds: permission sheet return resumed MainActivity and
  immediately requested again. Android subsequently removed MainActivity; the
  process remained alive. This is not described as a native process crash.
  The app was force-stopped to stop the loop, retaining the one accepted START.
  Raw device logs and private device data are not included here.
- Approved repair: one automatic foreground-location attempt per current
  principal/session in the runtime, latched before the OS request and retained
  across foreground/effect/pause/remount churn. Recheck already granted access
  on foreground; existing explicit visit/settings permission actions remain.
  Fence stale async results by account/server generation and current workday;
  never grant permission, bypass denial or change attendance admission.
- Version target 3.8.5. Behavioral regression tests must cover permission-sheet
  lifecycle re-entry, denial, later manual grant, overlapping checks, cancellation
  and account change. Full RN/TypeScript/signed APK verification is NOT_RUN
  locally; only small sequential checks follow host resource preflight.

## 2026-10-14 — implementation and narrow verification

- Added a permission coordinator at AndroidApp module lifetime. The current
  principal's attempt is latched before requesting Android permission; effect
  cleanup, foreground transitions, pause/resume and component remount retain
  it. Every foreground pass may still check an existing OS grant. Explicit
  visit/settings permission flows remain unchanged.
- Account/server change or confirmed logout increments a generation. Pending
  checks/answers cannot start tracking for an old generation; an already open
  OS sheet occupies one shared slot until its answer. Auth hydration neither
  clears denial nor permits a request using a retained scope. Existing current
  account/workday and cancellation checks still guard service startup.
- Added ten behavioral coordinator tests and four tests rendering the actual
  AndroidApp orchestration with controlled RN/stores. The latter exercise its
  foregroundEpoch/effect cleanup, repeated lifecycle transitions, denied then
  manually granted access, pause/remount, account/server change and logout.
- Local bounded verification PASS: ten coordinator tests and five existing
  notification/profile checks, using installed Vitest with a Jest mock adapter
  and exact source copies in a temporary isolated mirror (15 tests, 637ms).
  The first attempt ran no tests because the absent RN tsconfig dependency
  prevented transformation; only the temporary runner setup was corrected.
  Six TS/TSX syntax checks, release-profile verification (3.8.5+53) and diff
  whitespace checks PASS. No broad dependency installation was performed.
- Actual RN/Jest orchestration, full TypeScript and signed APK build remain
  NOT_RUN locally and must pass hosted CI. The pure runner is not described as
  an RN or physical-device run. Physical denial/lifecycle acceptance awaits
  the signed updated APK and belongs exclusively to the coordinator.
- All version surfaces and existing assertions now agree on 3.8.5/local code53:
  package/lock, Gradle, runtime profile, legacy App Sentry code and API/profile
  tests. No application ID, signing, admission, GPS grant or durable queue
  identity changes. No push, merge, deployment or device action by this worker.
