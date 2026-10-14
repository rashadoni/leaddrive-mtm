import { AppState } from "react-native"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useSyncStatusStore } from "../store/sync-status"
import { hasOfficeAttendanceAccess } from "./attendance-access"
import { hasRouteFieldAccess } from "./bootstrap"
import { refreshAttendanceSession } from "./attendance-session"
import { refreshRouteFieldSession } from "./field-session"
import { getOfflineScope, offlineScopeKey } from "./offline-scope"
import { allOutboxOperations, subscribeOutboxChanges, type OutboxOperation } from "./outbox"

const CANCELLED = "FOREGROUND_SYNC_RETRY_CANCELLED"
type Principal = { key: string; scope: string; field: boolean }
type Retry = { at: number; token: string }

function currentPrincipal(): Principal | null {
  const auth = useAuthStore.getState(), agent = auth.agent
  const scope = offlineScopeKey(agent?.organizationId, agent?.id)
  if (!auth.isLoggedIn || auth.isLoading || !agent || !scope || getOfflineScope() !== scope
    || AppState.currentState !== "active" || useSyncStatusStore.getState().online !== true) return null
  return { key: JSON.stringify([scope, agent.role, auth.serverDomain]), scope, field: agent.role === "AGENT" }
}

function admitted(principal: Principal, ignoreLoading = false): boolean {
  const { agent } = useAuthStore.getState(), bootstrap = useBootstrapStore.getState(), data = bootstrap.data
  if (bootstrap.loading && !ignoreLoading) return false
  if (!principal.field) return hasOfficeAttendanceAccess(data, agent)
  // Cached role/admission from a different login never authorizes a timer.
  return hasRouteFieldAccess(bootstrap.routeFieldAccess) && !!agent && !!data
    && data.tenant?.id === agent.organizationId && data.principal?.id === agent.id
    && data.principal.role === agent.role
    && (!data.manifest || (data.manifest.tenant.id === agent.organizationId
      && data.manifest.principal.id === agent.id && data.manifest.principal.role === agent.role))
}

function eligible(operation: OutboxOperation, principal: Principal) {
  if (operation.scopeKey !== principal.scope || operation.status !== "pending") return false
  if (principal.field) return true
  const permissions = useBootstrapStore.getState().data?.policies.agentPermissions
  return operation.entity === "workdays"
    || (operation.entity === "attendanceConsents" && permissions?.attendanceLocation === true)
    || (operation.entity === "attendanceRequests" && permissions?.attendanceRequests === true)
}

/** Android foreground only. Queue persistence remains the authority, and its
 * existing sender still owns backoff, admission, acknowledgements and replay.
 * No interval, GPS heartbeat, background task or automatic conflict retry. */
export function startForegroundSyncRetry(): () => void {
  let stopped = false, revision = 0, reading = false, running = false, readAgain = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // In-memory receipts only. Keep the current queue's tokens, never payloads.
  const attempted = new Set<string>()
  let lastAdmission: { key: string; allowed: boolean } | null = null

  const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null }
  const unchanged = (principal: Principal) => !stopped && currentPrincipal()?.key === principal.key
  const guard = (principal: Principal) => {
    if (!unchanged(principal)) throw new Error(CANCELLED)
  }

  async function reschedule() {
    if (stopped) return
    if (reading || running) { readAgain = true; return }
    reading = true
    const ticket = revision
    try {
      const principal = currentPrincipal()
      if (!principal || !admitted(principal)) return
      const status = useSyncStatusStore.getState()
      if (status.phase === "syncing") return
      // The existing supervisor hydrates its persisted window. Never treat an
      // unhydrated field pipeline as permission to bypass that window.
      if (principal.field && status.scopeKey !== principal.scope) return
      const pipeline = principal.field ? status.pipelines.routeOutbox : null
      if (pipeline?.phase === "disabled" || pipeline?.phase === "syncing") return
      const rows = await allOutboxOperations()
      if (ticket !== revision || !unchanged(principal) || !admitted(principal)) return
      const retries: Retry[] = rows.filter(row => eligible(row, principal)).flatMap(row => {
        if (!Number.isFinite(row.nextAttemptAt)) return []
        const at = Math.max(0, row.nextAttemptAt, pipeline?.retryAt ?? 0)
        return [{ at, token: JSON.stringify([principal.key, row.operationId, row.attempts, row.nextAttemptAt, pipeline?.retryAt ?? null]) }]
      })
      const retained = new Set(retries.map(retry => retry.token))
      for (const token of attempted) if (!retained.has(token)) attempted.delete(token)
      const waiting = retries.filter(retry => !attempted.has(retry.token))
      if (!waiting.length) return
      const due = waiting.reduce((earliest, retry) => Math.min(earliest, retry.at), Infinity)
      // Yield one turn to an explicit action that just persisted its command.
      // setTimeout's signed 32-bit bound also handles a corrupt far-future date
      // without wrapping into an immediate retry loop.
      timer = setTimeout(() => {
        timer = null
        if (!unchanged(principal) || !admitted(principal) || ticket !== revision) return
        if (Date.now() < due) { void reschedule(); return }
        const claimed = retries.filter(retry => retry.at <= Date.now()).map(retry => retry.token)
        for (const token of claimed) attempted.add(token)
        running = true
        const refresh = principal.field ? refreshRouteFieldSession : refreshAttendanceSession
        void refresh(() => guard(principal)).catch(error => {
          // A lifecycle cancellation before sending can be reconsidered when
          // the same principal returns. Failed admission/unchanged backoff is
          // deliberately consumed until an operation/deadline changes or
          // admission has a confirmed refused-to-admitted recovery.
          if (error instanceof Error && error.message === CANCELLED) {
            for (const token of claimed) attempted.delete(token)
          }
        }).finally(() => {
          running = false
          readAgain = false
          void reschedule()
        })
      }, Math.min(2_147_483_647, Math.max(250, due - Date.now())))
    } catch {
      // An unavailable queue never starts a polling loop or discards a write.
      // A later lifecycle/store/persistence event may safely try reading again.
    } finally {
      reading = false
      if (readAgain && !running && !stopped) { readAgain = false; void reschedule() }
    }
  }

  function changed() {
    const principal = currentPrincipal()
    if (principal) {
      // Loading an already valid bootstrap is not a withdrawal/recovery. A
      // genuine refused -> admitted transition may reconsider a stranded
      // deadline exactly once, without changing its persisted retry window.
      const allowed = admitted(principal, true)
      if (lastAdmission?.key === principal.key && !lastAdmission.allowed && allowed) attempted.clear()
      lastAdmission = { key: principal.key, allowed }
    }
    revision += 1
    cancelTimer()
    void reschedule()
  }
  const unsubscribers = [
    useAuthStore.subscribe(changed), useBootstrapStore.subscribe(changed),
    useSyncStatusStore.subscribe(changed), subscribeOutboxChanges(changed),
  ]
  const lifecycle = AppState.addEventListener("change", changed)
  changed()
  return () => {
    stopped = true
    revision += 1
    cancelTimer()
    lifecycle.remove()
    for (const unsubscribe of unsubscribers) unsubscribe()
    attempted.clear()
  }
}
