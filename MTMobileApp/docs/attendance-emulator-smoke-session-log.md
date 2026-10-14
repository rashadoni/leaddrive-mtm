# Owned attendance fixture emulator smoke — session journal

## 2026-10-14 — isolated manual mode prepared

- User authorized autonomous attendance validation; coordinator requested a
  separate manual smoke for the already owned fictional FIELD account after
  ordinary emulator credentials were refused. Existing secrets must remain
  unchanged. No workday or request writes, and no physical S23 control here.
- Worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-attendance-emulator-smoke/leaddrive-mtm`,
  branch `codex/mtm-attendance-emulator-smoke`, base mobile main
  `643e56259ba86874ca35e9d1b3de6c7ecab8c7e8`, origin
  `https://github.com/rashadoni/leaddrive-mtm.git`. `codex-project-context`
  confirms Contabo, no mobile production directory. Existing APK release
  workflow is `.github/workflows/build-apk.yml`; no server deployment here.
- Added `attendance_fixture` choice only to manual emulator dispatch. Default
  `full`, automatic build follow-ups and their existing credentials retain
  the full client flow. New mode accepts only the exact public owned fixture
  company and FIELD email and three separate `E2E_ATTENDANCE_*` secrets. Missing
  or wrong fixture credentials fail closed with no fallback to ordinary ones.
- Manual fixture admission requires the exact current reviewed `main` SHA,
  `workflow_dispatch` from `refs/heads/main`, and an explicit published release
  tag. The release must name its exact main-build commit, match its Git tag,
  and be an ancestor of that reviewed main. Existing APK checksum verification
  remains. The prerelease flag is allowed because the official APK workflow
  publishes main builds as GitHub prereleases.
- The device walk covers FIELD authentication, six tabs, profile/version,
  confirmation and logout. Client-card/change form and attendance workday/request
  actions are explicit **NOT_RUN**, excluded from PASS counts. The fixture is
  deliberately empty of clients; ordinary full mode still fails an empty list.
- Private evidence guard remains before typing the account company; no signed-in
  screenshots/UI dumps/full logcat. Password/email/company are redacted. This
  is absence of deliberate business writes, not a read-only database guarantee:
  authentication, installations, logout and app startup sync can write metadata.
- Initial narrow Python contracts: **9 PASS**. Tests prove separate credential
  selection, wrong/missing credentials, exact main/release admission, private
  capture suppression, completed login/tabs/profile/logout, no business control
  presses, full-flow retention, empty full-mode client failure, and NOT_RUN
  counting/redaction. These mocked device contracts are **not emulator evidence**.
- Added a small hosted PR contract workflow; full RN tests, TypeScript, APK build
  and emulator execution are **NOT RUN locally**, per Contabo workload contract.
  No APK code changed and no new version/build is required. Actual manual smoke
  remains **NOT RUN** until coordinator review, merge and private provisioning
  of the three new secrets. No push, merge, secret read/write, or dispatch here.

### Coordinator dispatch after review/merge

Use workflow `e2e-emulator.yml` on `main`, `mode=attendance_fixture`, explicit
`release_tag=v3.8.3-build469` (or another verified main release) and
`expected_main_sha=<full current reviewed mobile main SHA>`. Provision only
`E2E_ATTENDANCE_COMPANY`, `E2E_ATTENDANCE_EMAIL`, `E2E_ATTENDANCE_PASSWORD` through
private secret input. Never paste credentials into commands, logs or this journal.
The source SHA of the smoke and the APK SHA can differ; both must satisfy the
reviewed-main checks. Preserve the produced mode-labelled sanitized report.

## 2026-10-14 — checkpoint verification

- Final focused Python contracts: **9/9 PASS** (0.013 s); tests use fake UI nodes
  and temporary artifacts only, no ADB/device, authentication or network call.
- Both workflow YAML files parse, every embedded shell block passes `bash -n`,
  hosted runner declarations are Ubuntu 24.04; `git diff --check` **PASS**.
- Resource preflight: about 14.3 GiB available RAM, 232 GiB disk free, zero
  current memory pressure. Full RN/TypeScript/build/emulator gates remain
  **NOT RUN locally**. Source is ready for coordinator review; nothing pushed.
