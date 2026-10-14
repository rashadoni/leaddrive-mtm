# Attendance inbox language — session log

## 2026-10-14 — confirmed cause and authorized scope

- Dedicated worktree `mtm-inbox-language`, branch `codex/mtm-inbox-language`,
  origin `https://github.com/rashadoni/leaddrive-mtm.git`; clean reviewed main
  base `d8bf95c5b1eb7eae5841ca54c2e43603cfc7163b`. No repository AGENTS.md exists;
  the supplied Contabo host rules and current hosted workflows apply. Old README
  owner/debug APK instructions are superseded by the verified remote and signed
  `.github/workflows/build-apk.yml` process. Coordinator owns publication.
- Actual S23 evidence: the office inbox heading and controls were Azerbaijani,
  while stored decision titles were Russian. Read-state persistence passed;
  the visual language mismatch is a separate issue.
- CRM `requireAttendanceReviewer` reads the recipient's `preferredLanguage`.
  The owned fictional users have Russian profile language. Creation stores that
  localized title. Mobile Profile stores its independent language in
  `@mtm_locale`; it does not update the server preference. The notification GET
  already includes metadata, but the mobile attendance DTO drops metadata and
  the screen renders the stored title verbatim. Reviewer locale is not the cause.
- Authorized repair: derive finite presentation keys from known attendance
  metadata, render translations in the current app language, and retain stored
  text for unknown/legacy notices. Do not parse human text, rewrite notification
  history or language preferences, expose metadata, or change read/admission
  guards. Existing notifications must work without resubmission. Version 3.8.6.
- The existing APPROVED metadata is also used by HR-recorded days; this ambiguity
  must remain explicit in the presentation design. Employee reminder metadata
  has distinct supported kinds. Arbitrary metadata-provided translation keys
  are never trusted.
- No device/browser/API mutations, push or release in this worktree. Full RN,
  TypeScript and Android build checks are NOT_RUN locally and belong to hosted
  CI. Small checks run sequentially after RAM/disk/pressure inspection.

## 2026-10-14 — implementation and narrow verification

- Added a pure finite presentation classifier for `domain=route` with a valid
  attendance request/reminder UUID and a recognized status/kind. Conflicting,
  missing, malformed and unknown metadata retains the original title/body.
  Metadata-supplied title keys are ignored; request IDs, reasons and coordinates
  never enter the presentation DTO. Existing ownership/admission/read guards
  remain unchanged before and after the transport call.
- APPROVED uses neutral copy valid for both employee requests and HR-recorded
  days: `Uçot dəyişikliyi təsdiqləndi`, `Изменение учёта подтверждено`,
  `Attendance change approved`. Rejected/revoked titles are localized, as are
  the two known employee reminders and their fully static body. Other body
  content remains unchanged. No human title parsing or CRM/API changes.
- The screen calls the existing reactive translator during render, so changing
  the app language updates already loaded generated notices without loading,
  writing or changing read state. Stored server text and user preferences are
  untouched. Package/lock/Gradle/profile/API test versions agree at 3.8.6+54;
  published build code remains assigned by the hosted signed-build workflow.
- PASS: 31 narrow tests (22 finite presentation/copy cases, six inbox transport
  and guard tests, three existing profile cases), 884ms. Exact source files ran
  in a temporary isolated mirror using installed Vitest and a Jest mock adapter;
  `jest.mock` was translated to equivalent hoisted `vi.mock` in the temporary
  test copy only. The first run passed 25 tests but could not load the inbox
  suite because the mirror omitted the imported `fieldTheme` file. Copying that
  exact dependency repaired the harness; no product/test assertions were weakened.
- PASS: syntax transpilation for all nine changed TS/TSX files, three JSON locale
  files and version consistency, plus `git diff --check`. RAM was ~18.9GiB
  available with zero current memory PSI; checks were sequential and capped.
- Four new actual React Native screen tests cover live AZ/RU/EN change, retained
  fallback/body content, no language-triggered request/write, selected notice
  read state and localized reminder rendering. These, full RN Jest, TypeScript
  and signed Android build are NOT_RUN locally because RN dependencies are not
  installed and the Contabo contract places heavy checks in hosted CI.
- Stop: ready for coordinator source review and checkpoint publication. Physical
  verification of existing notices on 3.8.6, clean logout and saved phone setting
  restoration remain with the coordinator; no device actions occurred here.
