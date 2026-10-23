# Route & Field native acceptance plan

Requested by the owner on 2026-10-23. Employee and manager acceptance are
separate from Time's real24h observation (v8 retained FAIL; not running). Every result must name the
installed APK version, source SHA, APK digest, flow digest and actual device
or emulator. A source test, parsed YAML or successful build is not a native
journey result.

## Working sequence

1. Pin the installed release and preserve the owner's signed-in session.
2. Read the employee shell: Today, Route/day/month, Clients/Places, Tasks,
   More/Profile; cancel local sheets and return to Today.
3. Verify the fixture controller on isolated PostgreSQL and CI; only then
   prepare the separately marked `route-field-acceptance` company.
4. Use its employee, manager and outside-scope employee for write journeys;
   never create test attendance/visits under the owner's real account.
5. Reconcile every mutation with the CRM API, record exact-once replay and
   unchanged outside-scope records, then retain the result and checkpoints.

## Acceptance matrix

| Area | Employee check | Manager / server check | Current gate |
| --- | --- | --- | --- |
| Sign-in | Existing email survives local missing-password validation; both sign-in modes and reset cancel remain reachable; no code is sent | Wrong/missing credentials do not create a session | Partial old-APK steps only; full auth flow NOT RUN on current APK after owner signed in |
| Shell | Five tabs, route day/month, task filters/order cancel, profile, clients and return to Today | Server role and capability open the intended shell | PASS: employee-tabs-v5 on APK1730; agent identity independently matched before task execution |
| Tasks | Exact manager-site task received, started and completed with a reserved result | Site confirms same task/version/result, one creation/start/completion, unchanged non-test facts | PASS: native start/completion + independent API + actual website; manager site review ACCEPTED/version4 also PASS |
| Team | Employee never sees manager decisions | Manager sees own subordinate and cannot access outside-scope employee/day/visit | PASS: manager sign-in, team/exact agent card and read-only tabs; outside-scope denial still requires fixture |
| Planning | Employee sees assigned current/future route and honest approval state | Draft, publish, edit/reassign/cancel within permitted scope; employee receives the actual version | Fixture pending; no route publication yet |
| Visit lifecycle | Start planned and unplanned visits; only one active visit; complete with canonical times | One visit, correct customer/agent/route-point/status in CRM | Fixture pending |
| GPS | Foreground dialog, denial/retry, missing coordinates, inside/outside radius and inaccurate fix | Exact submitted evidence and an honest exception state; no invented coordinates | Fixture pending; Time GPS results do not count |
| Photos | Actual camera dialog/capture; permission denial; policy-required minimum and upload state | Correct visit attachment, no duplicate upload, private evidence | Fixture pending; no synthetic image substituted for camera proof |
| Required actions | Notes/tasks/presentation/signature block completion when the actual policy requires them | Server rejects bypass, and accepts only completed requirements | Fixture pending; policy must be inspected, not assumed |
| Offline | Pending visit/actions survive process restart; visible pending/rejected status; reconnect and retry | Original identifiers/times retained, exactly one canonical result, no lost/duplicate photo or task action | Fixture pending; no global phone outage or clock manipulation |
| Manager actions | Employee sees the task/decision correctly | Create a fictional task, inspect visit, evaluate/decide only within scope; no sends to real recipients | Fixture pending |
| Isolation | Account/tenant switch cannot reveal prior account cache | Own/team/other employee and cross-tenant negative API cases | Fixture pending; no use of Time's real24h tenant for writes |
| Layout | Current handset, dark mode, large text, landscape, reachable cancel/retry controls | No hidden action inferred from a source file | Initial native handset only; additional layouts NOT RUN |
| Update | Pending work survives a verified in-place update | Release certificate/version/provenance match and replay preserved | NOT RUN; requires empty real-account queue or the isolated fixture |

## Evidence and completion

- Private native output lives outside Git, with private directory/file modes.
  Public evidence contains versions, hashes, counts and outcomes only.
- Retain original FAIL/NOT RUN results. Fix a diagnosed step and rerun only
  the relevant journey; do not erase an earlier attempt or label it PASS.
- Native navigation reading does not prove immutable server history. Before
  write acceptance, establish authenticated fixture identity and before/after
  server baselines independently of the UI.
- No full Android build, emulator or browser suite runs on Contabo. Hosted
  Linux CI runs the heavy gates. Full tests/build/typecheck remain NOT RUN
  until their exact run is recorded.
- Protect Time's package, queue and tenant. The native runner refuses to take
  the shared phone during its final scheduled observation window.


## Owner-authorized task exception and current stop (2026-10-23)

The owner explicitly requested one real-account test task through the CRM
website and authorized switching the app to the manager. That one reserved
`RF-E2E` task is now COMPLETED/version3 and confirmed through the actual site.
This exception does not permit real-account visit/workday writes. All broader
GPS/photo/offline/isolation write journeys remain behind the fictional fixture.
The agent read-only five-tab smoke passed. Manager switch/read-only checks are
PASS on APK1730. Manager accepted the result through the site: version4,
ACCEPTED. The phone remains signed in as the manager. Do not repeat the
completed task or claim the full matrix passed.

Prepared backend fixture checkpoint: `cd4892333`, branch
`codex/route-field-acceptance-fixture`. Five unit checks passed; isolated
PostgreSQL integration (two tests), full hosted checks and operational fixture
execution are NOT RUN. No source push/merge/deploy was performed.


## 2026-10-23T13:54:11.990597+00:00 — current execution status (supersedes initial pending snapshot)

Backend PR1003 is merged and main06e7 deployed successfully through workflow39952082312. Isolated PostgreSQL/controller7 and all required checks passed; the static gate retains18 unchanged known failures. Fictional company preparation39957479723 actually passed with one owner, three field principals, three places and no seeded visit/workday history. Do not recreate/reset it.

Protected read-only encrypted access PR1007 is awaiting required static/typecheck39962906981 on exactb7; narrow10 crypto/controller tests and runner/scan passed. After green merge and provenance-checked private delivery, run20 scope/snapshot cases and the six prepared native flows. These remain NOT RUN; the phone channel does not answer and one reconnection question is pending.

App draft PR199 exact72 has hosted270 suites/2386 tests+TypeScript,71 contract checks and test-only packaging-skip proof PASS. Installed APK/runtime unchanged. The previously accepted real website task is complete and must not be replayed. The broader matrix, original source hypotheses and the separate Time24h failure remain open.


## 2026-10-23T15:08:05.533895+00:00 — user-selected target supersedes fictional handset plan

User explicitly requested Zeytun testing and said they completed sign-in. Preserve that session and identify its actual actor/role without retyping login. Fictional handset journeys are superseded, none passed; server-only fixture/security results remain retained. Continue the requested manager/agent CRM→app→CRM cycle in Zeytun using clear QA entities, within normal scope, preserving unrelated visits/workdays/routes/customer coordinates. Do not bypass fixed fictional guards with a substituted real-tenant manifest. Display lease is restored to original2; no phone network lease entered.
