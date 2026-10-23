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


## 2026-10-23T17:24:11.311164+00:00 — bounded offline fix release and remaining acceptance (supersedes earlier pending snapshots)

- Target remains the owner's manually signed-in Seymur/Zeytun AGENT; preserve session and all unrelated facts. The single marked QA customer/visit/photo are existing; never replay accepted checkin, GPS proposal/approval, camera capture or completed task writes.
- Complete real website→app→website task cycle PASS, manager/employee native tab checks PASS on1730. New1787 signed in-place update PASS with sameUID/permissions, Time unchanged; newnativeprofile name/email/Zeytun and Today cleanqueue PASS. The older full visit-start Maestro assertion remainsFAIL after a successful canonical checkin; later active-card and photo readbacks corroborate it without replay.
- Server offline fix PR1013 exact70b approved by owner, all5requiredactualchecksPASS, mergedmain deb8de1c0b0c4a71d3ff565276699ddac846bc8f. Normal immutable productionworkflow39992858222 RUNNING; no direct deployment. App PR199 source096 full271suites/2406tests+TypeScript/contract/signedAPK PASS; candidate1787 nowinstalled from verified artifact12516994949, PRcheckoutba79 compiledtrees identical to096. No public appmainrelease claimed yet.
- Immediate gate: waitserverworkflow, exactpublicartifactSHA+ping and read-only fixtureagent/device grant, missing-device NULL and manager NULL. Then foregroundnewAPK online, only existingQA checkoutwhileRFUIDdenied, processrestart/pendingreceipt, canonicalstillCHECKED_IN whileblocked, exactnetworkrestore, CHECKED_OUT/exactnotes/onephoto/no duplicate and original5unchanged aftertwoforegrounds. Newoffline1787 NOT RUN. Independent900sRFnetworkrecovery; originalradios/Time/profile rules unchanged.
- Production/native release permission already explicitly given for this seven-day localdraft behavior. Keep ordinarycachedroles closed; everyserverwrite rechecks currentauth/RLS. Finish appPR/mainrelease only after exactchecks and newnative proof; publish finalscope/validation evidence without new businessactions.
- Known limits retained: original1730offlineFAIL; actualmanagerapprovalpageerror observed/retryrecovered, rootunconfirmed/notfixed; websiteQAcreation attempts did notsave and finalcustomerwasordinarymanagerAPI (do not claimwebsitecreationPASS); retiredHRMworkdaypositive testwas410 and correctednegative separatelyPASS; remainingoutside-zone/signature/large-text/landscape matrix is NOT RUN, no inventedPASS. Separate Time24hv8 FAIL, notrunning and not a Route releaseprerequisite.


## 2026-10-23T18:56:43.182882+00:00 — core acceptance finished; public app release pending

The existing oneQA visit and oneactualcamera photo completed the offline cycle on1788/source918: queuedcheckout-v4PASS, coldrestart/pending+photo-v6PASS, independentserverCHECKED_INwhileblocked→CHECKED_OUTafterrestore/foreground, exactnote/onephoto/no secondforegroundduplicate, five originals unchanged, cleanqueue/sameagent/permissions andexactnetworkrestore. RealmanagerCRMwebsitepostcompletionPASS. Priorviewport/modal/USB failuresremainretained; correctedcoldscrollDOWNprovedpendingoperationwasnotlost. No morebusinesswritesare needed.

Release only afterfinalevidenceheadCI, reviewedmainmergeandverifiedpublicsignedAPK. Backend1013isalreadydeployeddeb8. Broadoutside-zone/signature/large-text/landscape cases andseparateTime24h-v8failureare notclosedbythiscoreacceptance.


## 2026-10-23T19:14:17.878469+00:00 — completed core scope and explicit follow-up boundary

BackendPR1013 is released atmain deb8 via39992858222 withpublicSHA/grantsmokePASS. AppPR199 ismergedatmain7bab; publicAPK3.11.52/code1790 fromsuccessfulmainrun40007847247 isverifiedandinstalledinplace. Actualcurrentprofile/queueandreadonlyserver/network/powerfinalchecksPASS. Nativecoreofflineacceptanceoncodetested918/1788iscomposedcheckout-v4+coldpersistence-v6; public1790compiledruntimeequalandpostupdatesmokePASS. No newbusinessactionsnecessaryforrelease.

Initialmatrixpendingstatusesabovearehistoricalandsupersededforactualtask/GPSrequest/camera/offlinecycle/updatecasesonly. Fulloriginalvisit-startMaestroremainsFAILdespiteseparatecanonicalstartconfirmation; outside-zone/inaccuratefix/deniedpermissions/signature/large-text/landscape/cross-accountnativecasesremainNOTRUN. SeparateTime24h-v8FAILremainsopen/notrunning. Do notreplaycompletedQAvisit/task/photo/approval. Follow-upusesisolatednegativepolicy/accesscasesandread-onlyUIchecks; actualmainreleaseissuccessful, no pendingbuildordeploygate. Seeappend-onlysessionjournalandevidencephaseUpdatesforfullprovenance.

## 2026-10-23 20:49 UTC — extended phase and new customer-radius correction

The prior native-denial/large-text/landscape NOT RUN snapshot is superseded for the actual candidate1792 cases: denied-grant/app-disclosure refusal PASS85.715s with complete permission restoration; 130% text PASS98.362s with full sync state visible; corrected landscape flow PASS103.825s. Original harness failures remain retained. Thirteen fictional API negatives passed without an accepted visit; temporary fictional coordinates were restored. This does not claim native boundary movement, Android system-deny or approximate-only proof.

New confirmed finding: unplanned Visit screen ignored the customer's radius while the server enforced it. The four affected decisions now consume the existing customer override; targeted3suites/32tests PASS. Remaining release steps: checkpoint/publish PR200; full hosted CI/contract/signed new APK; provenance-checked in-place update preserving the manual actor and Time; read-only QA customer screen with no check-in; exact-head final gates/merge; normal main public APK and post-update identity/queue/permission/network/power readbacks. Candidate1792 cannot certify this new runtime. Do not replay the completed QA visit/task/photo/GPS approval.


## 2026-10-23T21:03:19.112684+00:00 — radius implementation acceptance finished; release remains

Full hosted CI/contract/signed793 and new native read-only customer flow PASS on1793/source79853cb. Sameactor/profile/queue/fullpermissions/Time/network and existing6visits/onephoto verified. No physicalboundary check-in claimed. Remaining work is finaldocsheadchecks→PR200mainmerge→normalpublic3.11.53APK→inplaceupdate/profile/canonical/network/powerrestoration. Do not replay completed business actions or repeat unrelated accepted tests.
