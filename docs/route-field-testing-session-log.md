# Route & Field — E2E and Maestro session journal

## 2026-10-23T12:18:35.809855+04:00 — task started

- User explicitly requested the same E2E/Maestro treatment for Route & Field now, before Time's background real24h observation finishes.
- Scope: field employee and manager journeys; routes, visits, GPS/photo requirements, offline/restart/replay, CRM reconciliation and authorization boundaries.
- Dedicated worktree: `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-route-field-e2e`; branch `codex/route-field-e2e`; base `f1bcdcb2c0213eba73da8a10dfd89715b3e40a6d`; verified origin `https://github.com/rashadoni/leaddrive-mtm.git`. The canonical checkout has a stale retired owner and is preserved.
- Backend is the CRM repository `rashadoni/leaddrive-v2`, production `13.140.132.245:/opt/leaddrive-v2`, release through GitHub Actions from verified main. This test task does not imply a new production release.
- Preserve ordinary phone MTM 1710/session, protected Android profile 95 and Time APK1039/owner0. Time's exact-UID offline real24h v8 remains running; no changes to its tenant, policy, history or queue.
- Full builds/browser E2E/Android verification must run on GitHub CI or an established build worker, never Contabo. Only small sequential targeted checks here.
- Current stopping point: clean branch created; inspecting existing native test coverage, fixture tooling and safe runtime isolation before write journeys. No Route & Field native pass is claimed.

## 2026-10-23T12:45:00.114154+04:00 — native entry and owner steering

- Added bounded private-output native runner, three Maestro smoke flows and strict package/source/fixture/phone-window admission helpers. Initial 10 targeted guard tests passed before additional guard edits; rerun required for the final tree.
- Recorded ordinary installed APK1710 bytes matching published release `v3.11.49-build710`, source `f5d80b618a760347411532250b55e6e80aac74d8`, APK SHA256 `67762ba034cb1e246edd8e7ebfd8b633a68a295d43bd5752344d5d4078f0a1b4`.
- Native auth attempts v1/v2 failed on harness scrolling; v2 did pass the actual local missing-password validation. Saved login draft was independently unchanged for both. v3 failed when Android BACK (hideKeyboard without an open keyboard) left the app. v4 refused a foreign foreground window in preflight, before Maestro. No full auth flow PASS is claimed; original results are retained privately.
- Owner then explicitly said «вошел продолжай» and «продолжай». Switched focus to the signed-in field shell. No auth Maestro process remained active; captured five agent tabs with the welcome guide. Do not sign out, reset the app or overwrite that account.
- Employee-tabs v1 preflight refused a version mismatch before UI actions: the installed application changed during the owner's login/update. Next: resolve/pin current installed APK bytes and published source, then execute the signed-in read-only flow once on that identity.
- Time v8 remained RUNNING, queueCaptured=true, 10 samples at 12:32 Baku. No changes to its tenant/network rule/queue.
- Reserved separate backend worktree `/mnt/HC_Volume_106454338/codex-alt-data/worktrees/mtm-route-field-fixture`, branch `codex/route-field-acceptance-fixture`, base `e76620753f08e4ce716368f5ad3d249482134558`. No backend implementation or production mutations yet. It is for a distinct fictional fixture before visit/workday write journeys, not for customer data changes.

## 2026-10-23T13:03:10.755598+04:00 — actual CRM ↔ agent task cycle authorized

- Owner explicitly requested task synchronization through the CRM website, with manager and agent personas, and authorized switching the mobile app to the manager account. Manager access was supplied in chat and saved only in a 0600 private temporary file outside Git; credentials are deliberately absent from this journal.
- Current phone release changed to APK1730 / 3.11.51 during owner interaction. Its bytes match published `v3.11.51-build730`, source `f1bcdcb2c0213eba73da8a10dfd89715b3e40a6d`, APK SHA256 `2d8646113c7cc881b4dccc43ce4350e1ba551e89827e3202a29e0b1110cd00e9`. No task-installed update was performed.
- Native tab steps have exercised route day/month, task filters/order/cancel, More and profile. The full smoke attempts remain FAIL: v1 stale-version preflight; v2 unnecessary centering; v3 an incorrect profile-title assertion; v4 More restored its previous Profile stack screen instead of MoreHome. Preserve these findings and fix the remaining navigation-state assumption before calling the full smoke PASS. Do not rerun all tabs as a prerequisite to the newly requested task cycle.
- New primary sequence: create one clearly marked test task via manager's actual CRM website UI; agent receives/accepts/completes it in the still-signed-in app; website confirms result; only then switch to manager in the app. Keep the agent session until its side is completed. No real workday or visit creation is authorized/needed by this task cycle.
- Browser automation started externally (no full browser suite on Contabo): run `30895178-fa20-47bc-bfab-c3bd12c7a63b`. Unique test title `RF-E2E-20261023-1301 CRM-mobile-CRM TEST`, low priority, standalone, no real visit/photo/GPS requirement. Search-before-create and exact assignee matching required; existing non-test tasks remain outside scope. This is an explicit owner-authorized task write, not a backend code deploy.
- The separate fixture controller/source/workflow is prepared but NOT RUN against production or real PostgreSQL. Its broader visit/offline/negative-scope work is deferred while completing the owner's requested site/app cycle. No new push/merge/deploy authorization is inferred.

## 2026-10-23T13:18:35.848253+04:00 — website sign-in resolved

- First website run refused the owner-typed spelling of the manager address. Compared it with the pre-existing saved phone login; the saved spelling differs by one letter. Owner-visible progress explained the correction. No password reset or guessing was performed.
- Second website run `36d8cb32-b14b-4c8d-b91d-5954a67aa78e` successfully signed in as the expected manager, opened Field Tasks, searched the unique test title and reached the new task form. It stopped at the assignee selector on its 420-second budget. Returned created=false; no task write is claimed. Browser profile `prof_169e6cec311a483c` now contains the owner-authorized CRM session.
- Next: inspect the exact assignee selector contract, verify the intended agent identity independently, then complete the same single test task through UI. Always search the unique title first to prevent a duplicate after an interrupted browser run.
- Final current-tree Python guards: 13 PASS; three locale scripts PASS; seven Maestro YAML files parse PASS. Backend fixture guards: 5 PASS, PostgreSQL tests 2 skipped/NOT RUN because heavy DB gate belongs to CI.

## 2026-10-23T13:31:10.025722+04:00 — task created through website; native write started

- Browser run `f2847d66-9815-40ff-bb3e-ce93646c768a` created exactly one task through the actual quick-add UI, then opened its card: `cmvkrklyi05t5kp6kzdlirfnv`, title `RF-E2E-20261023-1301 CRM-mobile-CRM TEST`. The quick-add form accepts recipient/title/due only; optional description/priority assumptions from the first browser goal were removed. Due choice is no deadline.
- Independently authenticated the supplied manager via the ordinary mobile login: role MANAGER, expected tenant, exact current phone agent matched uniquely by name and email. Credentials/tokens remain private.
- Important correction to the initial baseline: legacy `/mtm/tasks` under a mobile manager JWT pins the list to that manager regardless of requested agentId. Its empty list was not proof of the agent's tasks. Task detail by exact ID was correctly readable and confirmed expected agent/PENDING. Original empty results retained and superseded for agent-baseline purposes.
- Established an independent ordinary web-manager session, verified same tenant and web role manager. Correct web-scoped baseline before mobile execution: exactly one matching test task, zero non-test tasks for this agent, version1/PENDING, accepted/started/completed timestamps null. No task creation/status mutation was made through the probe API.
- `task-start-v1` refused a missing private case during preflight, before Maestro or any write; retained. `task-start-v2` is now executing the exact UI-created task on APK1730, with source/byte/owner0/Time-window/case guards. Next: independently confirm IN_PROGRESS before starting completion flow.
- Standalone fixture-controller bundle and sanitized-output validator PASS; manual-only operational workflow guard and YAML parse PASS. No fixture preparation, push, merge or deploy performed.
