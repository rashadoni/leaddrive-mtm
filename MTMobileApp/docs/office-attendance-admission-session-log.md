# Office attendance admission session log

## 2026-10-14 — confirmed physical-device contract mismatch

- Parent task is testing MTM attendance autonomously on the user's Samsung S23
  Ultra, using only the separately owned fictional phone-acceptance tenant.
- Android 3.8.2 authenticates the office employee but displays an unavailable
  screen. The coordinator verified HTTP 200 bootstrap with exact tenant/card
  identity, role EMPLOYEE, legacy route-field tenant module enabled, role-scoped
  manifest routeField disabled, no field streams, attendanceWorkday true and
  attendanceMarkVersion 1. No client/customer settings were changed.
- Source confirms the server's manifest restricts routeField by ROUTE_EXECUTE;
  EMPLOYEE has no field execution grant. The app incorrectly uses that separate
  field manifest flag to admit the office attendance screen.
- Worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-office-attendance-admission/leaddrive-mtm`;
  branch `codex/mtm-office-attendance-admission`; verified origin
  `https://github.com/rashadoni/leaddrive-mtm.git`; base main
  `9483676bb1d7aeef0ce01cdc34334983e4b18892`. The earlier connectivity worktree is
  preserved. README's old GitHub owner is superseded by the verified origin.
- Plan: keep strict parsed-manifest and tenant/principal/role binding; require
  the explicit own-attendance grant and supported mark protocol. Preserve field
  capabilities and streams unchanged. Add regressions from the real bootstrap
  shape, denial/revocation and cross-identity cases, then align version 3.8.3.
- Local heavy verification (full Jest/RN, TypeScript and Android build) is
  NOT_RUN under the Contabo host contract. Narrow pure checks are permitted;
  the coordinator owns review, push, hosted CI and physical installation.

## Implementation checkpoint

- The office guard now requires attendanceMarkVersion exactly 1 and the explicit
  attendanceWorkday boolean in addition to the existing parsed manifest and
  matching tenant/principal/role. It no longer confuses the separate field
  execution flag with office attendance. No field permission, stream, API,
  tracking, server setting or navigator route was added.
- The shared fictional office fixture now reflects the observed server contract:
  tenant route-field enabled, EMPLOYEE manifest routeField disabled and streams
  empty. Existing office screen/sync/location tests consequently exercise that
  shape. The field-agent fixture still has its separate execution grant.
- Added actual bootstrap mapping and permission/version/identity regressions;
  a bootstrap-store refresh must immediately close office admission after
  revocation. Existing AZ/RU/EN screen tests explicitly verify the disabled
  field manifest before exercising the office start control.
- Versions aligned to 3.8.3 and fallback code/profile 51 across package, lock,
  Gradle, profile and all four existing version assertions. Hosted APK workflow
  continues to supply its monotonic release versionCode.
- PASS: 24 bounded checks executing the actual seven pure TypeScript modules
  through isolated transpilation (no network/storage/native runtime); syntax
  for all eight changed TS/TSX files; package/lock/Gradle/profile version checks;
  `git diff --check`.
- Full Jest including React Native screen/store tests, semantic TypeScript and
  Android build are NOT_RUN locally (dependencies absent; Contabo heavy-work
  restriction). Required next gates are existing GitHub `CI` (scope/tests) and
  `build-apk.yml`, followed by the coordinator's physical S23 retest. No remote
  push, merge, production settings change or device action was performed here.

## Hosted regression gate — remaining mark admission corrected

- PR 127 initial hosted CI run 38486449362 and APK run 38486449397 stopped
  before publication: 218 suites passed and two suites failed (35 assertions).
  The realistic EMPLOYEE fixture exposed the same erroneous field-execution
  requirement in `attendanceMarkAvailable`; this is a production guard issue,
  not a reason to restore the old unrealistic fixture or weaken expectations.
- Moved only that field-manifest condition inside the AGENT branch. All roles
  still require exact current account/tenant/role, the supported mark protocol
  and explicit attendanceWorkday true. An AGENT still requires both an enabled
  field manifest and current field admission. Office access uses its existing
  separate strict own-attendance guard.
- The shared mark helper also fences installation and QR. Added regressions
  for real office mark admission with empty field streams, separate location,
  installation and QR grants, immediate workday-grant withdrawal, and both
  independent field-agent denial conditions. Existing consent/installation
  safety tests retain their assertions. Their fixture's parsed field state is
  now correctly asserted as disabled.
- Source inspection found no other direct field-manifest requirement in the
  own-attendance service chain. Canonical START/FINISH obtain a mark through
  this helper; QR requires its own protocol and permission. Location remains
  separately permitted, consent-bound and OFF in the physical fixture.
- PASS locally: 24 actual pure bootstrap/access checks plus 16 actual mark,
  location, installation and QR guard checks with in-memory store state and no
  network/storage/native effects; changed test syntax and diff whitespace.
  Full RN/Jest, semantic typecheck and APK build remain NOT_RUN locally and
  must be rerun in hosted CI on the new checkpoint. No physical result or
  finished APK is claimed by these local checks.

## Second hosted gate — canonical safe mark expectation

- Follow-up hosted CI 38487095204 passed 219 of 220 suites / 1829 assertions.
  The remaining assertion in office-attendance-sync combined a coordinate
  prohibition with an old blanket prohibition on attendanceMark/installationId.
  Real office admission now correctly emits the supported canonical mark.
- Updated that assertion to require the exact START and FINISH mark using the
  actual opaque installation ID, NO_CONSENT, null consent and null location.
  PAUSE/RESUME must still omit the mark and every event must omit latitude and
  longitude. This strengthens the explicit wire/privacy contract without any
  further application change.
- PASS: bounded changed-test syntax and diff checks. Jest/TypeScript/APK remain
  hosted gates; no local full run performed. Next: coordinator review/push and
  hosted CI, then physical office acceptance on the resulting exact APK.
