# MTM Mobile — Offline-First Manual QA Scenarios

> **Scope:** Validate the outbox sync cycle, pull/push behavior, and connectivity edge cases.
> **Target build:** M2-1c (SyncManager + offline helpers + applyPull)
> **Device:** Physical Android device or emulator with network controls
> **Prerequisites:** Agent is logged in; at least 3 customers + 1 route visible in the app.

---

## Environment Setup

| Tool | Purpose |
|---|---|
| Android Studio emulator → "Extended controls" → "Cellular" | Toggle network on/off |
| Physical device | Airplane mode toggle |
| Server logs | Watch `/mobile/sync/pull` and `/mobile/sync/push` calls |
| DB inspector (Flipper / WatermelonDB devtools) | Inspect `outbox_operations` table |

---

## Scenario 1 — Aviation Mode: Full Offline Write Queue

**Goal:** Prove that all write operations work without a network connection and queue correctly in the outbox.

### Steps

1. **Kill network.** Put device in Airplane mode (or disable emulator network).
2. Confirm the sync status indicator shows "idle" (no error — device hasn't tried to sync yet).
3. **Check in to a customer visit:**
   - Navigate to a customer → tap "Check In"
   - Verify the visit appears in the UI immediately (WatermelonDB local write)
4. **Create an order:**
   - Inside the active visit → add 2–3 SKU line items → tap "Submit Order"
   - Verify the order appears in the order list immediately
5. **Complete a task:**
   - Navigate to a task assigned to the visit → tap "Complete"
   - Verify task status shows "COMPLETED" immediately
6. **Check out:**
   - Return to the visit → tap "Check Out"
   - Verify visit status shows "CHECKED OUT" immediately

### Expected DB state (inspect `outbox_operations`)

| # | `entity` | `op_type` | `status` |
|---|---|---|---|
| 1 | `visits` | `create` | `pending` |
| 2 | `orders` | `create` | `pending` |
| 3 | `tasks` | `update` | `pending` |
| 4 | `visits` | `update` | `pending` |

All 4 rows present with `retry_count = 0`, `last_error = null`.

### Pass criteria
- App is fully usable with no visible errors while offline
- UI reflects local writes immediately (no spinner waiting for server)
- All 4 outbox rows present with `status = 'pending'`

---

## Scenario 2 — Reconnect: Outbox Flushes Automatically

**Goal:** Verify the network-reconnect trigger fires sync and clears the outbox.

> Continue from Scenario 1 (4 pending ops in outbox)

### Steps

1. **Restore network.** Disable Airplane mode.
2. Wait up to **5 seconds** for the netinfo reconnect event to fire.
3. Watch the sync status indicator: expect `idle → syncing → idle`.
4. Inspect `outbox_operations`: all 4 rows should be gone (purge runs 7 days after sync, but status = `synced`).
5. Confirm server has received the 4 operations (check server logs or CRM dashboard).

### Pass criteria
- Sync starts automatically within ~5 s of reconnection
- All 4 ops have `status = 'synced'` in outbox (or purged if >7 days old)
- Visit, order, and task appear in the web CRM dashboard with correct data

---

## Scenario 3 — Mixed Connectivity: Sync Survives Mid-Push Network Drop

**Goal:** Prove that a network failure during push reverts ops to `pending` (no data loss).

### Steps

1. Create a new visit + order offline (2 pending ops).
2. Restore network.
3. **Immediately** drop network again just as sync is in progress (requires timing; use emulator network controls).
4. Wait 5 seconds.
5. Inspect `outbox_operations`.

### Expected behavior
- If the push request failed mid-flight: both ops back to `status = 'pending'`
- If the push succeeded before the drop: both ops = `status = 'synced'`
- In neither case should ops be stuck as `status = 'syncing'`

### Pass criteria
- No ops stuck in `status = 'syncing'` after network is stable again
- On next reconnect, ops in `pending` are retried and reach server

---

## Scenario 4 — Auto-Sync: 60-Second Interval

**Goal:** Verify the 60-second interval timer fires even without user interaction.

### Steps

1. Log in and let the app sit idle on the home screen.
2. Ensure network is connected.
3. Watch server logs for `/mobile/sync/pull` requests.
4. Confirm a pull request arrives every ~60 seconds.

### Pass criteria
- Pull requests appear at ~60 s intervals
- Status cycles `idle → syncing → idle` each time
- No crashes or double-sync if user opens the app during the cycle

---

## Scenario 5 — Conflict: Server Rejects a Push Op

**Goal:** Verify conflict ops are marked `failed` and the conflict data is accessible in the UI.

> This requires a server-side test helper or manual DB manipulation to force a conflict.

### Setup
On the server, manually mark the same visit as `CHECKED_OUT` (simulating another device).

### Steps

1. Create a visit offline → restore network → let sync run.
2. Before the push syncs, manually check out the visit on the server (forcing a conflict).
3. Watch the push response: the server should return `status: 'conflict'` for the visit op.
4. Inspect `outbox_operations`:
   - `status = 'failed'`
   - `last_error = 'Conflict with server data'`
   - `data` column contains `_conflict: true` and `_serverData: {...}`

### Pass criteria
- Op is not retried after a conflict (stays `failed`)
- The `data` column's `_serverData` field contains the server's current state
- UI should surface a visible error (conflict resolution UI — separate task)

---

## Scenario 6 — Server Error: Retry Backoff + MAX_RETRIES

**Goal:** Verify the exponential backoff and `failed` state after 5 retries.

> Requires a test flag on the server to return `status: 'error'` for a specific operation.

### Steps

1. Enable the server test flag.
2. Create any offline write → restore network.
3. Watch the outbox over multiple sync cycles (every 60 s).
4. After each cycle, inspect `retry_count` and `status`.

### Expected progression

Each retry occurs on the **next 60-second auto-sync cycle** (backoff per-op not yet wired —
tracked as TODO M2-1f). The retry_count simply accumulates across cycles.

| After sync cycle # | `retry_count` | `status` |
|---|---|---|
| 1 | 1 | `pending` |
| 2 | 2 | `pending` |
| 3 | 3 | `pending` |
| 4 | 4 | `pending` |
| 5 | 5 | **`failed`** |

### Pass criteria
- Op reaches `failed` state after exactly 5 error results
- `failed` ops are never retried in future sync cycles
- `failedCount` in sync state increments visibly in the UI badge

---

## Scenario 7 — Pull Delta: Server Changes Applied Locally

**Goal:** Prove that server-pushed changes (customer edits, new routes) reach the device.

### Steps

1. In the web CRM, edit a customer name to `"QA Test Customer"`.
2. On the device, trigger a manual sync (pull-to-refresh or wait for 60 s interval).
3. Verify the customer name in the mobile app updates to `"QA Test Customer"`.
4. In the web CRM, add a new route for today assigned to the agent.
5. Sync again → verify the new route appears in the app's route list.
6. In the web CRM, delete a customer.
7. Sync → verify the customer is no longer visible in the app.

### Pass criteria
- Customer name update appears within one sync cycle
- New route appears with correct points and order
- Deleted customer disappears from the list
- No duplicate records after multiple syncs

---

## Scenario 8 — Route Points Replace-All

**Goal:** Verify that changing route points on the server replaces all local points atomically.

### Steps

1. Let a route sync to the device (should have 3 points: A, B, C).
2. In the web CRM, reorder the points to B, A, C and add a new point D.
3. Sync → verify the device shows B, A, C, D in that order.
4. In the web CRM, remove point C.
5. Sync → verify the device shows B, A, D (no C).

### Pass criteria
- Points are in server order after each sync
- No orphaned or duplicate points
- Old points (C after step 4) are gone from the local DB

---

## Scenario 9 — Rapid Fire Offline Writes (Stress)

**Goal:** Ensure atomic batching holds under rapid successive writes.

### Steps

1. Go offline.
2. In quick succession (within 1 minute), perform:
   - 5 check-ins (different customers)
   - 3 orders (2–5 items each)
   - 10 task completions
3. Go online.
4. Let sync complete.

### Expected outbox after offline writes
- 18 rows in `outbox_operations` with `status = 'pending'`
- No partial rows (each operation is fully created)

### Expected after sync
- All 18 rows `status = 'synced'`
- Server has received all 18 operations (verify via server log)
- No duplicate entities in the server DB

### Pass criteria
- Zero data loss after stress batch
- All entities visible in CRM dashboard
- Sync completes within 2 cycles (≤ 120 s)

---

## Scenario 10 — clearOutbox Emergency Reset

**Goal:** Verify `syncManager.clearOutbox()` removes all pending/failed ops without affecting entity data.

### Steps

1. Create 3 offline writes → keep offline (3 pending ops in outbox).
2. Call `syncManager.clearOutbox()` from the debug menu (or via `__DEV__` breakpoint).
3. Inspect `outbox_operations` — should be empty.
4. Restore network.
5. Sync runs → pull succeeds; push is skipped (nothing in outbox).
6. Verify the locally created entities (visits, orders) are still visible in the app even though they will never reach the server.

### Pass criteria
- Outbox is empty after clearOutbox()
- Entity records (Visit, Order) are still in the local WDB (not deleted)
- `pendingCount` in sync state drops to 0
- UX note: the entities will remain local-only until the user re-creates them online

---

## Checklist Summary

| # | Scenario | Status | Notes |
|---|---|---|---|
| 1 | Aviation mode: full offline write queue | ☐ | |
| 2 | Reconnect: outbox flushes automatically | ☐ | |
| 3 | Mixed connectivity: mid-push network drop | ☐ | |
| 4 | Auto-sync: 60-second interval | ☐ | |
| 5 | Conflict: server rejects push op | ☐ | Needs server test helper |
| 6 | Server error: retry + MAX_RETRIES | ☐ | Needs server test flag |
| 7 | Pull delta: server changes applied locally | ☐ | |
| 8 | Route points replace-all | ☐ | |
| 9 | Rapid fire offline writes (stress) | ☐ | |
| 10 | clearOutbox emergency reset | ☐ | |
