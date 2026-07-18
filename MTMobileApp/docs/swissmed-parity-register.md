# SwissMed → LeadDrive MTM parity register

**Version:** 0.2
**Date:** 2026-07-18
**Scope:** the 18 supplied SwissMed/QuadraSoft CRM 3.1 photographs, in attachment order
**Target:** LeadDrive MTM for Agent and Manager, tablet-first with smartphone support
**Out of scope:** LeadShelf planograms and shelf-management functions

## Purpose and evidence

This is the working contract for functional parity. A row is not complete merely because a similarly named API, database table, or mock screen exists. Completion requires the role permissions, user workflow, responsive UI, offline behavior where applicable, audit trail, and acceptance scenario described here.

The current-state labels below are based on inspection of this Android repository, specifically:

- `src/navigation/AppNavigatorAndroidV2.tsx`: role-derived Android workspaces. Agent receives `Home`, `Route`, `Visits`, `Tasks`, and `Profile`; Supervisor/Manager/Admin receive `Overview`, `Team`, `Planning`, `Approvals`, and `Profile`; an unknown role is blocked by an explicit unsupported-role screen;
- `src/screens/route/RouteScreen.tsx`: assigned route consumption, ordered points, external navigation, check-in, active visit, notes, and photos;
- `src/screens/visit/VisitScreen.tsx`: nearby customer search, GPS/geofence check-in, check-out, notes, visit photo, and today's visit list;
- `src/screens/tasks/TasksScreen.tsx`: basic task list and `PENDING → IN_PROGRESS → COMPLETED` transition with result notes;
- `src/screens/dashboard/DashboardScreen.android.tsx`, `src/screens/dashboard/dashboard-layout.ts`, and `src/store/dashboard-layout.ts`: role-derived Agent/Manager homes with one to six persistent widgets, deterministic phone/tablet grids, ordering, reset, and a focused widget view. Layout storage is scoped by tenant, user, workspace, and device class. Manager release data remains explicitly unavailable rather than simulated;
- `src/runtime/AndroidApp.tsx`, `src/store/workday.ts`, and `src/services/location.android.ts`: an explicit client-local persisted Agent workday start/end gate controls heartbeat and background location. It is not yet a server-authoritative workday record or enforcement boundary. Manager roles cannot start field tracking. Android location/camera permission prompts begin from the Agent workday flow rather than silently at login;
- `src/store/kpi.ts`: only the presently connected Agent `/visits`, `/tasks`, and `/photos` aggregates can populate real dashboard values, without a server-authoritative period query. Manager team KPI, coverage, GPS quality, promotion, approval, period, formula, and drill-down data are not yet connected;
- `src/services/api.ts`: mobile routes, visits, tasks, customers, photos, alerts, profile, and location history endpoints;
- `src/screens/profile/ProfileScreen.tsx`: profile, daily summary, alerts, RU/AZ/EN language choice, hints, server switch;
- `docs/mtm-offline-qa-scenarios.md`: a legacy target document that references an absent WatermelonDB/`SyncManager` architecture and a removed Orders flow. The inspected tree has no WatermelonDB/SQLite dependency, local entity database, durable outbox, or sync implementation, so the document is neither a current executable test plan nor evidence that offline-first is implemented;
- `package.json`: no map library and no local database/sync dependency, so map/replay and durable offline parity are not present in this build.

This document does **not** claim the state of separate web/backend repositories. Any backend or web item must be verified in its own tree before being marked complete.

The role shell, configurable home, and client-local workday lifecycle gate are foundation progress only. They do not make any photographed SWM workflow complete without its real data, server authorization, audit, offline, and acceptance paths.

## Status legend

| Status | Meaning |
|---|---|
| **Implemented** | The photographed workflow is available as a usable vertical slice in this Android tree. |
| **Partial** | A related screen, API, or foundation exists, but material fields, roles, states, actions, or UI are missing. |
| **Missing** | No usable implementation of the photographed workflow was found. |

No SWM item is currently classified as fully implemented because every photograph contains material SwissMed capabilities beyond the inspected mobile slice.

## Cross-cutting target contract

### Roles and workspaces

- **Agent:** Home, Plan, Route, Organizations/Contacts, Visits, Tasks, Promotions, My GPS, KPI, Documents/Messages, Sync, Profile.
- **Manager/Supervisor:** Overview, Planning, Team, Live Map, GPS History, Organizations, Contacts, Assignments, Tasks, Promotions, Approvals, KPI/Reports.
- **Admin:** users/roles, teams, regions, territories/polygons, dictionaries, master-data quality, visit/GPS policies, KPI formulas, promotion workflows, integrations, and audit. Admin-heavy operations may remain web-first but must produce correct mobile permissions and data.
- Permissions are server-authoritative and tenant-scoped. Hiding a mobile button is not an authorization boundary.

### Device adaptation

- **Phone, 320–599 dp:** bottom navigation, card lists, bottom-sheet filters, full-screen detail, horizontally scrollable date matrices.
- **Compact tablet, 600–839 dp:** navigation rail, one- or two-pane layout depending on orientation.
- **Expanded tablet, 840–1199 dp:** persistent rail, master/detail or list/map split, sticky table identity columns, at least 48 dp touch targets.
- **Desktop/web, 1200+ px:** dense manager tables, bulk operations, polygon editing, reporting, and administration. Smartphone layouts must not be stretched to fill a tablet.

### Offline and synchronization

- Agent-assigned organizations, contacts, published plans, routes, open tasks, promotions, and required documents must be cached for the active field horizon.
- Agent writes use a durable local outbox, idempotency keys, retry state, attachment resumption, and explicit conflict UI.
- Published plans, approvals, ownership changes, KPI formulas, and manager bulk operations remain server-authoritative.
- A cold restart in airplane mode must preserve the active workday and unfinished visit.
- Manager live monitoring and heavy administration are online-first; cached last-known data must be visibly timestamped and never presented as live.

### Configurable SwissMed terminology

The photographs contain customer-specific or ambiguous terms. Until a signed glossary is supplied, these must be dictionary/formula configuration, not hard-coded semantics:

- **MOI**, **Target**, **Категория МК/MO**, **К.О.**, **Лиц.**, **раскрытие**, **потенциал**, **психотип**, **статус сотрудника в базе**, **Эталон ID**;
- coefficients connecting visits, tasks, MOI/Target, GPS confirmation, coverage, points, and prizes;
- geofence radius, GPS accuracy thresholds, stop detection, workday schedule, cancellation approvals, and L1/L2 manager checks.

Every configurable term needs a tenant-scoped code, localized label (RU/AZ/EN), active period, audit history, and safe fallback label.

## Summary

| ID | Photograph capability | Primary roles | Current Android state | Delivery priority |
|---|---|---|---|---|
| SWM-01 | Full organization catalogue and filters | Manager, Admin | Partial | P0 |
| SWM-02 | Bulk contact/organization ownership transfer | Manager, Admin | Missing | P0 |
| SWM-03 | Contact master card | Agent, Manager, Admin | Missing | P0 |
| SWM-04 | Doctor professional profile and brand potential | Agent, Manager | Missing | P0 |
| SWM-05 | My contacts | Agent, Manager | Missing | P0 |
| SWM-06 | Organization detail and tabs | Agent, Manager, Admin | Partial | P0 |
| SWM-07 | My organizations and coverage context | Agent, Manager | Partial | P0 |
| SWM-08 | Dense organization table and saved views | Manager, Admin | Missing | P1 |
| SWM-09 | Pharmacy promotions, points, and approvals | Agent, Manager | Missing | P1 |
| SWM-10 | Employee GPS history and stops | Manager, Agent self-view | Partial | P0 |
| SWM-11 | Physical daily route replay | Manager, Agent self-view | Partial | P0 |
| SWM-12 | Live team map | Manager | Partial | P0 |
| SWM-13 | Plan/GPS KPI dashboard and drill-down | Agent, Manager | Partial | P0 |
| SWM-14 | Full task detail and recurrence | Agent, Manager | Partial | P0 |
| SWM-15 | Coverage, cancellations, tasks home dashboard | Agent, Manager | Partial | P0 |
| SWM-16 | Visit planning with filters | Manager, Agent draft/request | Missing | P0 |
| SWM-17 | Weekly operational home/calendar | Agent, Manager | Partial | P0 |
| SWM-18 | Contact × date planning matrix | Manager | Missing | P0 |

## Detailed parity entries

### SWM-01 — Organization master catalogue

**Source:** photograph 1, organization management list with geographical, organizational, ownership, territory, and polygon filters.

**Target roles:** Manager and Admin manage; Agent may search only permitted/assigned records.
**Current state: Partial.** `getCustomers()` and nearby/route customer lists expose a small organization-like projection (`id`, name, address, category, coordinates), but there is no organization catalogue screen, full schema, filters, table, ownership status, or bulk operation.

**Data**

- organization ID and external/Etalon ID; name, address, OKPO/tax code;
- region/oblast, administrative district, locality, city district;
- organization category, specialization, type, kind;
- active/database status, responsible manager, assigned employee;
- territory and polygon; coordinates and coordinate verification state;
- K.O. and Lic. values as configurable dictionaries until confirmed;
- last visit, next planned visit, free/assigned state, duplicate/master link.

**Filters and views**

- every geographical and classification field visible in the photograph;
- name/address/OKPO/ID free text; employee/database status; manager/employee; territory/polygon;
- “search free organizations”; server pagination; sort; saved personal and shared views; configurable columns.

**Actions and states**

- open/edit, create/request organization, select, assign/transfer, map, export, merge/mark duplicate, archive/reactivate;
- proposed lifecycle: `PENDING_REVIEW → ACTIVE ↔ INACTIVE`, with independent ownership `FREE/ASSIGNED` and data-quality `UNVERIFIED/VERIFIED/DUPLICATE`.

**Target screens and adaptation**

- Manager: `Organizations / All`, dense tablet/web table plus map toggle and filter panel;
- Agent: `Base / Organizations`, cached cards with search and filter bottom sheet;
- expanded tablet: list/detail split; phone: list → full-screen detail.

**Acceptance**

- A manager reproduces the photographed multi-filter search and opens the exact result without downloading the full dataset.
- An Agent cannot query organizations outside their permitted scope.
- Saved filters and columns persist per user/device class.
- Offline Agent search returns the assigned cached subset and labels its last synchronization time.

### SWM-02 — Bulk ownership transfer

**Source:** photograph 2, checkbox selection and “transfer My contacts to employee” action.

**Target roles:** Manager and Admin; Agent has no bulk transfer authority.
**Current state: Missing.** No contact entity, multi-selection, assignment preview, transfer API, or transfer audit UI exists in this Android tree.

**Data**

- selected entity IDs and type (`CONTACT`, `ORGANIZATION`, or both according to policy);
- source owner, target employee/team/territory, effective date, reason, initiator;
- validation result, conflicts, excluded records, before/after ownership snapshot.

**Filters/actions/status**

- reuse SWM-01/SWM-05 filters; select page, select all filtered, clear selection;
- preview impact, resolve conflicts, confirm atomically, view result, retry failed subset, auditable rollback where policy permits;
- `DRAFT → VALIDATING → READY → COMMITTED`, or `CONFLICT/FAILED/ROLLED_BACK`.

**Target screens and adaptation**

- Manager tablet/web: selection toolbar and transfer wizard with side-by-side before/after summary;
- phone: manager emergency flow only, with explicit count and confirmation; no dense bulk editing.

**Acceptance**

- Transfer is idempotent and all-or-nothing unless the user explicitly chooses an allowed partial mode.
- Conflicting territory, inactive employee, duplicate contact, and open-visit cases are shown before commit.
- Agent A loses and Agent B receives the records after sync; open/past audit history remains intact.
- Every change records actor, time, reason, source, destination, and affected IDs.

### SWM-03 — Contact master card

**Source:** photograph 3, contact detail with workplace, personal, contact, address, product, and brand information.

**Target roles:** Agent reads/requests edits; Manager edits permitted records; Admin governs dictionaries/mastering.
**Current state: Missing.** The app exposes customer/organization projections but no separate contact model or contact detail screen.

**Data**

- one or more workplaces: organization, department, role, primary flag, start/end dates;
- surname, first name, patronymic, birth date, gender;
- specialty, qualification/work category, position, notes;
- email, work/home/mobile phone, Viber/WhatsApp/Telegram number;
- home address fields; product category and brand-category associations;
- verification, consent/contact preference, source, duplicate/master reference, change history.

**Filters/actions/status**

- locate by ID/name/phone, organization, specialty, position, geography, owner, status;
- call/message, add/edit/request correction, add/end workplace, schedule visit, create task, archive, report duplicate;
- `UNVERIFIED → VERIFIED`, `ACTIVE ↔ INACTIVE`, `DUPLICATE → MERGED`; workplace status is separately effective-dated.

**Target screens and adaptation**

- `Contact Detail` with Overview, Workplaces, Visits, Potential, Tasks, Promotions, Files, History tabs;
- tablet split from contact list; phone full-screen sections with sticky quick actions.

**Acceptance**

- A workplace change preserves prior history and moves the contact to the correct organization without recreating the person.
- Required pharma fields and tenant dictionaries are validated and localized.
- Agent edits can enter `PENDING_REVIEW` if master-data policy requires approval.
- Contact is available offline when included in the Agent's assigned/published field scope.

### SWM-04 — Doctor professional profile and brand potential

**Source:** photograph 4, professional fields, patients/beds/leader/profile, MOI/category, and brand-potential table.

**Target roles:** Agent records field observations; Manager validates/analyses; Admin configures dictionaries.
**Current state: Missing.** No doctor profile, brand/product potential, MOI, Target, or psychotype model/UI is present.

**Data**

- office/cabinet, patients per month, bed count, leader/opinion-leader marker;
- specialty, qualification category, position, profile, psychotype, birth date, gender;
- configurable contact/product category, MOI and Target flags/values;
- per brand/product: responsible employee, potential, disclosure value, category, effective period, source, verification;
- notes and evidence/history for changed assessments.

**Filters/actions/status**

- filter contacts by specialty/profile/category/MOI/Target/potential band/last assessment;
- add/edit/end-date assessment, compare periods, request manager validation, drill into visits supporting the assessment;
- `DRAFT → SUBMITTED → VERIFIED`, with `RETURNED`, `EXPIRED`, and `INACTIVE` where applicable.

**Target screens and adaptation**

- `Contact / Professional Profile` and `Potential by Brand/Product`;
- tablet: profile left, editable potential table right; phone: summary cards and row-by-row editor.

**Acceptance**

- Values are effective-dated; prior potential is never overwritten without history.
- MOI, Target, disclosure, and category meanings/formulas come from tenant configuration.
- Manager can filter and aggregate the same source data used on the contact card.
- Offline Agent changes queue with conflict handling when the same assessment changed on the server.

### SWM-05 — My contacts

**Source:** photograph 5, “My contacts” filter panel and assigned contact table.

**Target roles:** Agent owns daily use; Manager can view by employee and manage assignments.
**Current state: Missing.** `VisitScreen` searches customers/organizations, not contacts; there is no assigned contact list or contact-level visit context.

**Data and filters**

- contact ID, full name, phones, primary organization/address;
- owner, region/locality, organization type/kind;
- specialty, profile, category, psychotype, MOI/Target, last/next visit;
- assigned/free/inactive status and cached/offline availability.

**Actions and states**

- search/reset/save view, open contact/organization, call, plan visit, start task, add/request contact, remove/transfer with permission;
- `ASSIGNED`, `TRANSFER_PENDING`, `FREE`, `INACTIVE`, plus master-data verification state.

**Target screens and adaptation**

- Agent `Base / Contacts` with offline-first cards and quick actions;
- Manager `Contacts / My Team` with employee filter and bulk selection;
- expanded tablet list/detail; phone cards and filter bottom sheet.

**Acceptance**

- Agent can find a contact by name, phone, specialty, or organization offline.
- Contact visit starts against both person and workplace organization.
- Last/next visit values match visit history/planning and are not client-invented.
- Ownership and visibility update after SWM-02 transfer and synchronization.

### SWM-06 — Organization detail

**Source:** photograph 6, organization detail tabs, address/GPS, shipments, contacts, employees, and organization fields.

**Target roles:** Agent reads field context and requests updates; Manager/Admin edit according to policy.
**Current state: Partial.** Route and Visit screens show organization name, address, category, coordinates, distance, and navigation; there is no organization detail, tab set, contacts, departments, personnel, shipments, or history.

**Data**

- organization master data from SWM-01, address hierarchy and verified coordinates;
- type/kind/category/specialization, OKPO, licence, registration, notes, phones/email;
- responsible employees/department, territory/polygon;
- Contacts, Visits, Departments, Personnel, Promotions, Files, History tabs;
- yearly shipment/sales summary as read-only integration data with source timestamp.

**Actions/status**

- edit/request correction, verify/move pin, open navigation, add contact/department, schedule visit, task, promotion, file;
- master, coordinate, ownership, and integration freshness statuses are shown separately.

**Target screens and adaptation**

- tablet master/detail and tabbed detail; phone stacked overview with tab/section navigation;
- map/address card must work without forcing the entire detail to load online.

**Acceptance**

- Opening an organization from route, contact, search, task, or promotion resolves to the same canonical record.
- Coordinate edits require permission and leave an audit trail.
- Shipment/sales data is labelled read-only with source and refresh time.
- Assigned organization core detail and contacts remain available offline to the Agent.

### SWM-07 — My organizations

**Source:** photographs 7–8, assigned organization list with geography, type, territory, owner, last visit, and compact/dense results.

**Target roles:** Agent and Manager.
**Current state: Partial.** Assigned route points and a generic customer list are usable for check-in, but there is no explicit My Organizations catalogue, SwissMed filters, last-visit/coverage context, saved views, or map/list toggle.

**Data and filters**

- owner, region/locality/city district, territory/polygon;
- organization category/type/kind/specialization, Etalon ID, name/address/OKPO;
- last/next visit, coverage status, K.O./Lic. configured values, active/free/assigned state;
- filter by “my”, team member, territory, visit due/overdue, and distance.

**Actions/status**

- list/map, search/reset, open, navigate, plan/start visit, task, request transfer/correction;
- coverage state `COVERED`, `DUE`, `OVERDUE`, `NOT_PLANNED`, always derived from versioned rules.

**Target screens and adaptation**

- Agent `Base / Organizations`; Manager `Organizations / Assigned`;
- tablet list/map or list/detail split; phone cards with bottom-sheet filters.

**Acceptance**

- Agent sees exactly their effective assignment set, including effective-dated transfers.
- Last visit and coverage state drill down to source visits.
- Online and offline result ordering is stable and visibly identifies stale cached data.

### SWM-08 — Dense organization table and saved views

**Source:** photograph 8, extended multi-row organization result table with paging and inline actions.

**Target roles:** Manager and Admin.
**Current state: Missing.** No generic data-grid, column chooser, server pagination, table selection, export, or saved-view engine exists in mobile.

**Data/filter/actions/status**

- consumes SWM-01/SWM-07 fields and filters;
- configurable/sticky columns, server sorting/paging, page size, row selection, edit/open, export, bulk assignment;
- view ownership `PRIVATE/TEAM/ORG`, with default and archived states.

**Target screens and adaptation**

- expanded tablet/web: dense virtualized table, sticky identity/action columns, filter drawer;
- compact tablet: reduced columns plus detail pane;
- phone: card projection only; advanced column configuration remains tablet/web-first.

**Acceptance**

- Paging and filtering execute server-side and do not fetch the full tenant catalogue.
- A saved view restores filters, sort, columns, and page size.
- Bulk selection clearly distinguishes current page from all filtered records.
- Export respects row-level permissions and records an audit event.

### SWM-09 — Pharmacy promotions, points, and approvals

**Source:** photograph 9, pharmacy promotions with filters, plan/fact, quantities, sums, points, prizes, and two-level manager checks.

**Target roles:** Agent executes/submits; Manager reviews/approves; Admin configures campaign and formula.
**Current state: Missing.** No promotion/campaign, product/brand, plan/fact, points, evidence, or approval UI/API wrapper exists in this Android tree.

**Data**

- campaign, promotion type, code, brand/product, date range, organization/contact;
- employee, manager, user group, geography/territory;
- plan, actual quantity, amount, points, prize points, variance;
- evidence, comments, check results, L1/L2 reviewers and timestamps;
- immutable points ledger and formula version.

**Filters/actions/status**

- filters visible in the photograph: employee/geography/territory/contact, campaign/type/code, organization, manager/group, execution/control status, L1/L2 status, ready-for-review, date mode, amount/points;
- create/assign, group plan import, record fact/evidence, submit, L1/L2 approve, return/reject, distribute/reconcile points, close/cancel;
- `DRAFT → PLANNED → IN_PROGRESS → SUBMITTED → L1_REVIEW → L2_REVIEW → APPROVED → CLOSED`, with `RETURNED/REJECTED/CANCELLED` branches.

**Target screens and adaptation**

- Agent: `Promotions`, campaign detail, organization execution form, evidence/submit;
- Manager: promotion register, review queue, detail comparison, approval audit;
- tablet table/detail split; phone step-by-step execution/review cards.

**Acceptance**

- One pharmacy promotion passes end to end from assignment through L1/L2 and ledger posting.
- Reviewer cannot approve their own submission where policy prohibits it.
- Points are reproducible from immutable facts and a formula version; corrections use compensating entries.
- Agent can complete a downloaded promotion offline and later submit evidence idempotently.

### SWM-10 — Employee GPS history and stops

**Source:** photograph 10, selected employee/date/time GPS history with distance, stops, and organization list.

**Target roles:** Manager; Agent may view only their own history.
**Current state: Partial.** Background GPS sending, a process-memory last-position cache, heartbeat, and `getLocationHistory()` exist. Android V2 gates collection locally to an authenticated Agent with an explicit persisted workday start/end; this is not a durable GPS cache or a server-authoritative shift. Manager roles cannot activate field tracking. There is still no history screen, map dependency, employee/date/time filters, stop detection UI, replay, organization/visit correlation, server-authoritative workday enforcement, or completed physical-device privacy/lifecycle proof.

**Data and filters**

- employee/team/department, workday, date, time interval, raw point coordinates/time/accuracy/speed/heading/battery;
- calculated distance, moving/stopped intervals, stop duration/location, linked organization/visit, gap/anomaly flags;
- selected employee vs team; current vs history; accuracy threshold and transport mode as policy.

**Actions/status**

- search, select employee/date/range, play/pause/scrub, jump to stop/visit, map/list toggle, export with permission;
- `MOVING`, `STOPPED`, `GPS_GAP`, `LOW_ACCURACY`, `OFFLINE_BUFFERED`, `WORKDAY_ENDED`.

**Target screens and adaptation**

- Manager `GPS / History`: full map with collapsible filter/timeline panel;
- Agent `My GPS`: own day summary and privacy/workday state;
- phone uses full-screen map plus bottom sheet; tablet uses map + persistent side panel.

**Acceptance**

- Replay displays ordered raw points, detected stops, visits, distance, and gaps for an authorized employee/day.
- Every derived stop/visit can reveal source timestamps and accuracy.
- GPS collection begins/ends with the explicit workday policy; outside-workday collection is forbidden unless a separately approved policy exists.
- Retention, viewing, and export are tenant-configured and audited.

### SWM-11 — Physical daily route replay

**Source:** photograph 11, full physical route across a territory with point sequence and route line.

**Target roles:** Manager and Agent self-view.
**Current state: Partial.** `RouteScreen` shows an ordered planned route, point statuses, distances, planned time, completion, and external navigation. Android V2 can send GPS points while its client-local Agent workday gate is active; the server does not yet prove or enforce the shift boundary. There is no in-app map, actual route line, full-day replay, stop overlay, plan-vs-fact comparison, or proven offline replay continuity.

**Data/filter/actions/status**

- planned route points/order/time; actual GPS polyline; visits/check-in/out; stops; planned/actual distance and duration;
- employee/date/route/territory filters; show planned, actual, stops, visits, or anomalies;
- navigate during work, replay after work, select point, compare deviation, explain skipped point;
- route `PLANNED/IN_PROGRESS/COMPLETED/CANCELLED`; point `PENDING/VISITED/SKIPPED`; actual segment anomaly flags.

**Target screens and adaptation**

- Agent `Route`: tablet map/list split and phone map/list toggle;
- Manager opens the same route in investigation mode with timeline and plan/fact layers.

**Acceptance**

- The selected day reproduces the planned order and actual travelled line without joining across another employee/workday.
- Skipped points require an allowed reason; visited points link to visit evidence.
- Calculated distance and duration disclose data gaps and formula/version.
- Route remains usable as a cached list offline even when map tiles are unavailable.

### SWM-12 — Live team map

**Source:** photograph 12, current map of employees across Azerbaijan with employee list and latest activity time.

**Target roles:** Manager/Supervisor.
**Current state: Partial.** A role-safe Manager workspace now exists with Overview, Team, Planning, Approvals, and Profile navigation. Team/Planning/Approvals are honest data-unavailable shells, not completed workflows. Agents can send location and a 60-second heartbeat only while the client-local workday gate is active, and profile alerts exist; server-authoritative shift enforcement is still absent. There is still no connected team list, live map, markers, clustering, last-seen status, battery, scope filters, or Manager live-data API in this app.

**Data and filters**

- employee/team/department/territory, latest coordinates/accuracy/time, workday state, current visit, route progress, battery and online state;
- department/team/status filters, search employee, cluster/territory layers.

**Actions/status**

- select marker/employee, inspect last seen/current visit/route, switch to history, contact employee, acknowledge alert;
- `ONLINE`, `STALE`, `OFFLINE`, `WORKDAY_NOT_STARTED`, `ON_VISIT`, `GPS_DISABLED`, thresholds tenant-configured.

**Target screens and adaptation**

- Manager tablet: team list/filter panel + map; phone: full map + draggable employee sheet;
- cluster at wide zoom, individual marker at close zoom; stale data must show timestamp and not animate as live.

**Acceptance**

- Manager sees only employees within organizational scope.
- Marker freshness, battery, current visit, and workday state update without full-screen reload.
- Selecting History opens SWM-10 with employee/date context.
- Permission denial or GPS loss raises a visible, auditable state without inventing a location.

### SWM-13 — Plan/GPS KPI dashboard

**Source:** photograph 13, visit-plan and GPS gauges, trend chart, and department/employee/visit-type/brand filters.

**Target roles:** Agent self-view; Manager team/drill-down.
**Current state: Partial.** Android V2 has separate role-derived dashboard widget sets and a configurable home. Only connected Agent `/visits`, `/tasks`, and `/photos` aggregates can populate corresponding values; there is no confirmed route aggregate or period-query contract. Unconnected Agent widgets and all Manager team metrics remain explicitly unavailable in release builds. There is no server-authoritative period selector/query, visit-plan or GPS gauge, coverage formula, organizational filter, trend, formula version, or source drill-down.

**Data and formulas**

- planned visits, actual eligible visits, task credit, GPS-confirmed visits, visit-plan %, GPS %;
- doctor/pharmacy coverage, MOI, Target, uncovered base, cancellations, tasks, promotions;
- period, department, employee, visit type, brand/product and territory dimensions;
- versioned numerator, denominator, exclusions, coefficients, and effective dates.

**Actions/status**

- filter, compare periods, drill from gauge/chart → employee/contact/visit/task/GPS evidence, export;
- data states `CURRENT`, `PARTIAL`, `LATE_SYNC`, `RECALCULATING`, `FORMULA_CHANGED`.

**Target screens and adaptation**

- Agent personal KPI widgets/detail; Manager KPI dashboard with filter rail and chart/detail split;
- phone shows prioritized cards; tablet shows gauges/trends plus drill-down pane.

**Acceptance**

- Every KPI exposes numerator, denominator, period, filters, formula version, and source records.
- Android and web return the same value from a server-authoritative calculation.
- Period changes produce different scoped queries, not relabelled all-time counters.
- A signed reference dataset reconciles to the agreed manual SwissMed calculation before cutover.

### SWM-14 — Full task detail and recurrence

**Source:** photograph 14, task detail with time, place, status, priority, responsible employee, recurrence, mailing, duplication, files, and progress.

**Target roles:** Agent executes; Manager creates/assigns/reviews; Admin configures groups/status policy.
**Current state: Partial.** Tasks show title, description, priority, due date, organization, and three statuses. An Agent can start and complete with result notes. Missing are detail/edit, start/end time, groups, event, recurrence, progress, place picker, files/evidence, duplication, bulk/mailing, review/return, and timeline.

**Data**

- title, description, group, event, priority, status, responsible/creator/watchers;
- start/end date-time, organization/contact/address, progress;
- recurrence rule/time zone/end condition, duplicate-to date, mailing/notification recipients;
- result, comments/timeline, files/evidence, task-credit configuration.

**Filters/actions/status**

- by status, priority, overdue, assignee/team, organization/contact, group/event, date range;
- create/assign, accept/start, update progress, comment/file, complete, return/reopen, cancel, duplicate, create recurrence, bulk assign;
- `DRAFT → ASSIGNED → ACCEPTED/IN_PROGRESS → SUBMITTED/DONE`, with `RETURNED`, `OVERDUE`, `CANCELLED`.

**Target screens and adaptation**

- Agent task inbox, detail/timeline, execution/evidence; Manager task register, editor, bulk assign/review;
- tablet list/detail; phone list → detail, with fixed primary action.

**Acceptance**

- Recurrence generates exactly one instance per rule occurrence and remains idempotent across time-zone changes/retries.
- Offline status/result/evidence survives restart and synchronizes once.
- Manager return preserves prior completion evidence and reason.
- Task credit is calculated server-side with formula version and source drill-down.

### SWM-15 — Coverage, cancellation, and task home dashboard

**Source:** photograph 15, employee base coverage, cancelled visits awaiting confirmation, active tasks, key message, and short-period switches.

**Target roles:** Agent and Manager with different widget sets.
**Current state: Partial.** The Android V2 configurable-home foundation is present: Agent and Manager receive role-derived widget catalogues; users can select and order one to six widgets, restore defaults, and open a focused widget view; the grid adapts from phone through compact/expanded tablet and persists by tenant, user, workspace, orientation/device class. Managers cannot switch into an Agent workspace. Real Manager values, base-coverage drill-down, cancelled-visit approval queue, key message, MOI/Target breakdown, cross-device preference sync, and literal device-wide widget fullscreen are still absent.

**Data and filters**

- region/department/employee, 1/5/7-day or configurable period;
- required coverage, actual MOI coverage including Target, total fact, uncovered base for doctors/pharmacies;
- cancelled visits and approval status; active/overdue tasks; key messages/announcements;
- widget identity, order, size, role/device/orientation preferences.

**Actions/status**

- open/drill down, approve/return cancellation, edit/view task, acknowledge message, configure/reorder/expand widget;
- cancellation `REQUESTED → MANAGER_REVIEW → APPROVED/RETURNED/REJECTED`; widget config `DEFAULT/CUSTOM`.

**Target screens and adaptation**

- one widget fills the workspace; two split 50/50; three share equally; four use 2×2; five/six use an adaptive equal grid with scroll if minimum size is violated;
- layout persists separately for role, phone/tablet, and orientation; tap expands a widget full-screen.

**Acceptance**

- Coverage totals drill down to exact covered/uncovered contacts and visits.
- Manager decisions on cancellation update calendar, route, KPI, and audit consistently.
- Widget order/selection survives restart and synchronization without exposing unauthorized widget data.
- Tablet and phone each preserve legibility rather than shrinking dense tables.

### SWM-16 — Visit planning with filters

**Source:** photograph 16, visit planning by doctor/pharmacy, plan horizon, employee, geography, organization, specialty, psychotype, and contact selection.

**Target roles:** Manager publishes; Agent views/acknowledges and may create a request/draft where policy allows.
**Current state: Missing.** The mobile app consumes assigned routes but cannot create/edit/publish visit plans, filter candidate contacts, resolve capacity, or plan at contact level.

**Data and filters**

- visit direction (`DOCTOR`, `PHARMACY`, configurable activity types), solo/double/joint participant;
- day/5-day/7-day/week/month horizon, employee, working calendar and capacity;
- region, administrative district, locality, city district, organization type/kind/name/address/OKPO;
- specialty, psychotype/profile/category, contact name, MOI/Target, last visit, monthly frequency/coverage;
- planned start/duration, route order, conflict reason and publication version.

**Actions/status**

- filter candidates, select contacts/dates, preview coverage/capacity/conflicts, optimize route, copy period, save draft, publish, acknowledge, request change/cancel;
- `DRAFT → VALIDATED → PUBLISHED → ACKNOWLEDGED → IN_PROGRESS → COMPLETED`, with `CONFLICT`, `RETURNED`, `CANCEL_REQUESTED`, `CANCELLED`.

**Target screens and adaptation**

- Manager tablet/web planning workspace: filters + candidate list/matrix + calendar/map;
- Agent phone/tablet: published calendar, acknowledgement, change request, limited draft as policy allows.

**Acceptance**

- Manager can reproduce the photographed doctor/pharmacy planning flow at contact level.
- Validation detects duplicate time, leave/nonworking day, capacity, inactive/foreign-scope contact, and double-visit participant conflicts.
- Publishing creates one immutable plan version and notifies the Agent; edits create a new version.
- Published near-term plan and route are available offline to the Agent.

### SWM-17 — Weekly operational home/calendar

**Source:** photograph 17, weekday columns with visits, day-start times, coverage summary, tasks, and filters.

**Target roles:** Agent self-view; Manager selected employee/team view.
**Current state: Partial.** Route/Visit show today's work, Dashboard/Profile show small summaries, and Agent Home has an explicit client-local persisted start/end-workday control that gates Android GPS/heartbeat lifecycle. It is not yet a server-authoritative shift. There is still no week/day-column calendar, 1/5/7-day switch, planned-vs-fact per day, integrated coverage/tasks, Manager employee selector, server-authoritative workday record, or completed offline/physical-device lifecycle validation.

**Data and filters**

- week/day, employee/department/region, planned visits, actual visits, cancellations, tasks;
- workday start/end, visit order/time/type/contact/organization, daily plan/fact/coverage;
- alerts/key message and last synchronization.

**Actions/status**

- switch period, previous/next week, select employee, open visit/task/contact, acknowledge plan, start/end workday, request change;
- day `NOT_STARTED/ACTIVE/ENDED`; plan and visit states from SWM-16 and Visit domain.

**Target screens and adaptation**

- expanded tablet: week columns plus coverage/tasks side panel;
- phone: day agenda with horizontal day switch and optional week summary;
- compact tablet: 3–5 visible days depending orientation, not squeezed seven-column text.

**Acceptance**

- Planned, actual, cancelled, and changed visits reconcile to source records per day.
- Workday start/end controls GPS lifecycle and cannot silently start at login.
- Agent can open downloaded agenda offline; stale state is timestamped.
- Manager employee switching respects team scope and does not reuse stale prior-user data.

### SWM-18 — Contact × date planning matrix

**Source:** photograph 18, rows of contacts/organizations/specialty/last visit and date columns with selection checkboxes and monthly visit count.

**Target roles:** Manager; Agent may receive read-only published matrix/agenda.
**Current state: Missing.** No planning matrix, contact row model, date selection, monthly count, sticky columns, bulk validation, or publish action exists.

**Data and filters**

- contact name/ID, primary organization/address, specialty, MK/category, last visit;
- date columns, selected visit/activity type, participant, monthly completed/planned count;
- all SWM-16 candidate filters plus sort by contact/last visit/coverage/potential.

**Actions/status**

- select/unselect cell, select row/date, multi-select, preview conflict/capacity/coverage, save draft, publish selected cells;
- cell `EMPTY`, `DRAFT`, `CONFLICT`, `PUBLISHED`, `ACKNOWLEDGED`, `COMPLETED`, `CANCELLED`.

**Target screens and adaptation**

- expanded tablet/web: sticky contact identity columns with horizontally scrollable dates;
- compact tablet: reduced identity columns and expandable row detail;
- phone: contact-first planning sheet or read-only agenda, not a compressed desktop grid.

**Acceptance**

- Adding/removing a cell updates coverage and capacity preview immediately and deterministically.
- A cell cannot produce duplicate visit records on repeated save/publish.
- Last visit and monthly count drill down to source visits and respect the selected period.
- Publishing matrix selections produces the same versioned plan and route workflow as SWM-16.

## LeadShelf boundary

LeadDrive MTM owns:

- organization/contact master usage, assignment, planning, routes, visits, GPS, tasks, promotions, KPI, approvals, documents/messages, and field evidence;
- brand/product references required for pharma visit planning, potential, promotions, orders/results, and KPI;
- the immutable visit/promotion/task facts created by MTM users.

LeadShelf owns and MTM must **not** recreate:

- planograms, shelf layouts, facings, fixture/equipment layouts, merchandising layout authoring, compliance editors, and shelf-specific analytics;
- any independent LeadShelf workflow already delivered in the separate product.

Allowed integration is deliberately narrow:

- external product/brand/SKU and organization IDs with cached display-name snapshots;
- a deep link to the LeadShelf record when authorized;
- optional read-only LeadShelf result/evidence/status shown in organization or visit context;
- asynchronous events/API integration with tenant, permission, source, and timestamp metadata.

LeadShelf unavailability must not block a downloaded MTM route, visit check-in/out, task, or promotion submission. MTM stores only the reference/snapshot necessary for audit and continues its own outbox flow.

## Release gates and completion rule

### Open gates for the current foundation

- **Emulator runtime passed on 2026-07-18:** the final-code release APK (SHA-256 `870c2eb55e43c9845db79fa88fb8f816390506e9c4468ffa902571680688b361`) completed the local Agent and Manager walkthrough. Evidence covered authentication/logout, role-safe tabs, 599/600 and 839/840 dp boundary transitions, 390 x 844 phone portrait, 844 x 390 phone landscape, 1280 x 800 tablet landscape, 800 x 1280 tablet portrait, one/two/six-widget layouts, widget ordering, focused-widget return, Agent location/camera workday permission transitions, start/end workday, and a cold app restart with the Manager role and six-widget preference restored without a navigation crash. The visible capture run used the ordinary API 35 AOSP image because the ATD image disables HWUI drawing. Client design approval remains open, so this evidence closes the emulator portion of Phase 2A but does not by itself complete Phase 2A.
- **Physical Android remains open:** no accepted proof yet covers a representative tablet and smartphone, background GPS under screen-off/Doze/vendor power management, permission denial/revocation, camera/photo flow, rotation, cold restart, weak network, or airplane-mode recovery.
- **Signed distribution remains open:** a locally installable emulator release APK is not a production signing gate. The production keystore workflow must source credentials from protected CI secrets rather than tracked literals and remove or rotate the current placeholder values. A signed ARM64 APK/AAB, signature verification, clean install, upgrade-over-previous-version, and store/MDM delivery evidence remain external gates.
- **Production delivery is separate:** when authorized, delivery must remain PR → merge → CI. A manual `deploy.sh` run is not an acceptance substitute for Android runtime, physical-device, or signed-artifact evidence.

For each SWM item, the completion sequence is:

1. signed field/filter/action/status glossary;
2. tenant-scoped schema and migrations;
3. RBAC/RLS and audit events;
4. server APIs and idempotency;
5. Manager web/tablet UX where required;
6. Agent/Manager Android UX;
7. offline/cache/conflict behavior where required;
8. RU/AZ/EN copy and accessibility;
9. automated tests plus emulator/tablet/phone evidence;
10. client walkthrough using the corresponding photograph as the checklist.

The item remains **Partial** if any required role, status branch, formula/drill-down, offline path, or acceptance scenario is absent. API-only, schema-only, mock-only, and happy-path-only work does not close a parity item.

## Recommended implementation order

1. **Parity contract and acceptance baseline:** maintain the 18-photo register, sign the glossary/formulas, confirm role authority and device targets, inventory backend/web dependencies, and keep one acceptance script per SWM item.
2A. **Foundation — UI/runtime:** role-safe Agent/Manager navigation; shared 600/840 dp adaptation; phone bottom tabs and tablet rail; role-derived configurable home; explicit Agent workday controls; RU/AZ/EN and accessibility. The final-code release APK and Agent/Manager emulator walkthrough passed on 2026-07-18. Phase 2A now waits only for client design approval. Physical-device lifecycle, production signing, distribution, and upgrade evidence remain Phase 7/release gates; they do not block starting Phase 2B.
2B. **Foundation — data/safety:** server-authoritative tenant/RBAC enforcement; workday records and GPS policy/audit; durable offline database/outbox; idempotency, retries, conflicts, and resumable attachments; shared dictionaries/formulas; real Manager APIs; stale-data isolation and user/tenant cache invalidation. This phase is not complete and must precede master-data workflow claims.
3. **Master data:** SWM-01, SWM-03, SWM-04, SWM-05, SWM-06, SWM-07, then SWM-02/SWM-08.
4. **Planning and execution:** SWM-16, SWM-18, SWM-17, then complete Route/Visit parity.
5. **Control:** SWM-10, SWM-11, SWM-12 with explicit workday-bound GPS.
6. **Operational workflows:** SWM-14 and SWM-09.
7. **Measurement and home:** SWM-13 and SWM-15 after formulas and source data are reconciled.

This ordering prevents visually complete dashboards and calendars from being built on incomplete contacts, ownership, plans, GPS rules, or formulas.
