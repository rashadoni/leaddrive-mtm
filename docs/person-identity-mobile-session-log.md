# Person identity mobile continuation

## 2026-10-25 — dedicated client worktree

Owner requested completion of same-person/same-phone Time and Field registration, without repeated permission to continue. Server work remains in crm-person-identity/codex/person-identity, draft PR1028; journal there contains full server history. Existing Time1048 public release and its worktree are preserved.

Resolved native repository rashadoni/leaddrive-mtm, created this clean worktree from origin/main32fe203 on codex/person-identity-mobile. There is no production SSH destination for the app. Verified release routes are build-attendance.yml (signed standalone Time artifact), build-apk.yml (signed Field artifact), followed by reviewed release/website promotion; do not copy to an inferred server. Existing private signing credentials stay in Actions. Read CLAUDE.md and docs/DELIVERY-ARCHITECTURE.md; visible release review remains required after verification.

Implement explicit immutable installed-product selection in login requests, preserving the existing endpoint and credential/queue storage. Old servers ignore this additive field; canonical server uses it to select the independently granted Time/Field card. No server migration, real account change, OTP send, APK release or production action in this phase. Native dependencies are absent here; full Jest/TypeScript/Android/Emulator belong to hosted CI under the Contabo workload limit.

## 2026-10-25 — installed-product login request prepared

clientApplication selects TIME from native AttendanceIdentity or the installed Time package ID, and ROUTE_FIELD for the existing Field product. Login adds that application to the existing tenant-scoped phone/email/password request, preserving token storage, actor-based offline scope and queues. Native package fallback prevents missing version metadata from mislabeling Time as Field. Extended native identity and HTTP request tests, including the same phone requesting the Time card.

Validation: git diff --check PASS. Jest/TypeScript/Android/Maestro NOT RUN locally: native dependencies are absent and heavy checks belong to hosted CI. No dependency install or Android build on Contabo. Prepare draft PR and run hosted gates; server PR1028 remains required for canonical behavior. No APK published or user registration claimed complete.

## 2026-10-25 — draft PR204 and native module import correction

Published eaf19d5, draft PR https://github.com/rashadoni/leaddrive-mtm/pull/204 attached. Hosted tests40213607938 ran2620 tests successfully but three suites could not load because the new eager DeviceInfo import instantiated a missing NativeEventEmitter in test/metadata-unavailable environments. Corrected to the repository’s existing lazy metadata lookup pattern; Native AttendanceIdentity still takes priority, and company-discovery/API modules can load without a native metadata bridge. Build40213607853 stopped at the same tests; no APK was produced or published. New exact-source CI required.
