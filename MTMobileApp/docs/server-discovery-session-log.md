# Server discovery connection errors — session log

## 2026-10-14 — physical S23 finding and bounded repair

- Coordinator reproduced on a Samsung S23 Ultra running source `11401a8`: with
  no default network, lookup of a known company shows the Azerbaijani company
  not-found message. The company selector remains intact. Network was restored.
- Current authoritative `rashadoni/leaddrive-mtm` main is the same `11401a8`.
  Source confirms `pingServer` folds transport failures into `success: false`,
  and ServerScreen maps every false result to `serverNotFoundHelp`.
- Work is isolated at
  `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-server-connectivity/leaddrive-mtm`,
  branch `codex/mtm-server-connectivity`, origin
  `https://github.com/rashadoni/leaddrive-mtm.git`. The clean but stale canonical
  checkout and its retired origin are preserved. No verified server deployment
  target exists for this mobile repository; no push/build/release is authorized
  for this subtask yet.
- Plan: return an explicit not-found versus unreachable result; recognize a
  missing company only from the backend's HTTP 404 + `MTM_COMPANY_NOT_FOUND`
  response. Reuse the existing AZ/RU/EN connection messages, retain the entered
  company, and test offline, timeout, server failure, actual not-found and retry.
- Local work is limited to source review and small sequential checks. Full RN
  Jest, semantic TypeScript and Android build belong in existing GitHub CI.
  Initial status: diagnosis confirmed; next implement and checkpoint the bounded
  change. Parent continues the physical phone and separate CRM E2E workflow.

## 2026-10-14 — implementation and bounded verification

- `pingServer` now returns a discriminated discovery result. Offline/timeout,
  non-JSON and ambiguous/server-error responses are unreachable; only HTTP 404
  with `success: false` and `MTM_COMPANY_NOT_FOUND` means a missing company.
  Success additionally requires a successful HTTP response. ServerScreen selects
  the existing localized connection or missing-company guidance accordingly.
  No login, token, company selection or persistence behavior was changed.
- Added ten API regression cases and six real RN screen cases covering AZ/RU/EN
  failure messages, input retention, enabled retry and successful recovery.
- PASS: syntax-only parse of four changed TS/TSX files. PASS: ten controlled
  discovery behaviors executed against the actual ApiClient module, with fetch
  and timers controlled and unrelated native imports inert. No real network or
  storage writes. This is not a substitute for the RN test runner or a phone.
- NOT RUN locally: RN Jest (app dependencies/preset absent), semantic TypeScript,
  Android build/signing and physical verification of the change. Existing
  `.github/workflows/ci.yml` runs required scope/tests/Jest/tsc; existing
  `.github/workflows/build-apk.yml` builds and verifies signed APK/AAB in CI.
  No app version bump or release is claimed in this preparation checkpoint.
- The README's hook template and installed scanner were absent. Provisioned only
  official task-local Gitleaks v8.30.1, verified archive SHA256
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`,
  and installed a fail-closed staged-diff pre-commit hook in this isolated clone.
  No broad dependencies or system packages were installed.
- Current result: bounded fix ready for coordinator review and required CI.
  Last completed action: controlled behavior and source verification. Stopping
  point: path-scoped checkpoint; next coordinator may publish a PR, await exact
  required checks and signed build, then coordinate release and S23 retest.
