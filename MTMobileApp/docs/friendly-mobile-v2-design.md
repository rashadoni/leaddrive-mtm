# LeadDrive Field 2.0 — friendly mobile design contract

## Product boundary

This APK is the Android companion for LeadDrive MTM / Route & Field. It is for
field medical representatives and their managers. It does not contain shelf,
planogram, equipment, merchandising, sales-pipeline, finance, or generic CRM
modules.

The interface must never invent live data or enable an action that the mobile
JWT contract cannot perform. Cached, stale, pending-sync, unavailable, and
permission-blocked states are named explicitly.

## Users and operating context

- Field agents use a phone or tablet while walking, travelling, standing at a
  clinic reception, and speaking with a doctor or pharmacist.
- Managers use tablets more often and need team state, planning, approvals,
  exceptions, and investigation details.
- Connectivity may be intermittent. The app must keep downloaded work visible
  and make queued changes understandable.
- The product is localized in Azerbaijani, Russian, and English.
- A first-time employee must understand the next action without training.

## Voice and visual direction

**Decisive · vivid · dependable · patient.** The app should feel like a calm
field guide, not an administrative dashboard. LeadDrive evergreen is the
foundation; cobalt marks navigation, amber marks attention, coral marks a
time-sensitive action, and red is reserved for real errors or destructive
consequences.

The interface uses plain language, one dominant action per screen, visible
48 dp touch targets, generous spacing, and icons paired with words. Emoji are
not used as controls. Hints explain the immediate task, then can be dismissed
and restored from Profile.

## Agent navigation

Phone bottom navigation and tablet rail share the same five primary places:

1. **Today** — workday state, sync truth, the next useful action, today's
   progress, and a short agenda.
2. **Calendar** — date/week navigation, planned visits, tasks, working days,
   and direct opening of visit/task detail.
3. **Route** — ordered clients, navigation, distance, check-in, active visit,
   and completion.
4. **Tasks** — due/active/done work, clear priority, progress, evidence, and
   completion notes.
5. **More** — Visits, Clients & organizations, My GPS, KPI, notifications,
   sync centre, help, language, and profile.

Visits are not hidden: the Today screen has a prominent next-visit action,
Calendar opens planned visits, Route starts a visit, and More contains visit
history/manual visit.

## Manager navigation

1. **Overview** — team pulse and exceptions.
2. **Team** — current states and locations.
3. **Planning** — read and, only when supported by mobile contracts, edit team
   plans.
4. **Approvals** — actionable review queue with explicit consequences.
5. **More** — organizations/contacts, GPS history, transfers, KPI, sync/help,
   and profile.

## First-run and coaching flow

### Step 1 — Company

- Label: “Company code”.
- Example: `zeytunpharm`.
- Live preview: `zeytunpharm.leaddrivecrm.org`.
- Explain that this selects the company's secure workspace.
- Primary action: “Continue”.

### Step 2 — Account

- Show selected company with a visible “Change company” action.
- Labels remain visible while typing.
- Email and password errors state what happened and what to do next.
- Password reveal uses an accessible icon, not emoji.
- Primary action: “Sign in”.

### Step 3 — Ready for the day

- Explain location access before asking Android for permission.
- Explain that tracking runs only during an explicitly started workday.
- Show three short steps: Start day → Visit clients → End day.
- Primary action: “Open Today”.

### Context hints

- Today: why and when to start/end the workday.
- Calendar: tap a day, then tap a visit or task.
- Route: tap the next stop; Navigate and Check in are separate actions.
- Visit: Check in → add result/photo → Check out.
- Tasks: Start → update progress → Complete.
- Offline: work is saved on the device; show the pending count and a Sync now
  action when the network returns.

## Interaction rules

- One filled primary button per decision area.
- All touch targets are at least 48 dp on tablet and 44 dp on phone.
- Disabled actions explain the missing prerequisite next to the control.
- Loading copy names the operation: “Loading today's route…”, not “Loading”.
- Empty states teach the first action and never end with only “No data”.
- Success confirms the outcome and next step.
- Destructive or irreversible actions name the exact consequence.
- Pull to refresh is supplementary; every offline/error state has a visible
  Retry or Sync action.

## Phone and tablet adaptation

### Phone

- One focused column.
- Persistent five-item bottom navigation.
- Details and filters open as full-screen routes or bottom sheets.
- Primary action stays in the thumb zone without covering content.
- Long forms are split into numbered steps.

### Compact tablet

- Five-item left rail.
- Two-column Today/Calendar layouts where content supports it.
- Route and client screens use list/detail or list/map splits.
- Forms use two columns only when labels and translated values stay readable.

### Expanded tablet / landscape

- Persistent rail with labels.
- Master/detail planning, task, visit, organization, and contact workspaces.
- Filters remain visible in a side panel; advanced fields are progressively
  disclosed.
- No phone card is stretched across the full viewport.

## Delivery slices

### Slice A — friendly daily core

- Company/account onboarding.
- Today, Calendar, Route, Tasks, More navigation.
- Visits, clients/organizations, personal GPS/KPI, sync and profile access.
- Shared page headers, notices, progress steps, empty states, and action rows.
- RU/AZ/EN copy parity and phone/tablet geometry tests.

### Slice B — manager core

- Team and current locations.
- Readable planning summary.
- Approval queue and clear decisions.
- Contact transfer and organization/contact master detail.

### Slice C — new mobile server contracts

- Route candidate search, create/edit/publish and contact-by-date planning.
- Signed coverage/cancellations and complete decisions.
- Pharmacy campaigns, evidence, points, and two-level review.
- Team KPI and unified GPS replay/stops.

Each slice is complete only after tests, signed APK build, installation/update
verification, login against a tenant, phone/tablet screenshots, and a real
happy-path smoke test. A CI artifact alone is not physical-device acceptance.
