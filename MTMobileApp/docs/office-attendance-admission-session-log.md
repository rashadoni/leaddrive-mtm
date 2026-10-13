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
