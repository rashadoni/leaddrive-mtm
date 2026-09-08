import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { allOutboxOperations, enqueueOutboxOperation, type OutboxOperation } from "../services/outbox"
import { isWorkdayOpen, type BootstrapWorkday } from "../services/bootstrap"

const STORAGE_KEY = "@mtm_active_workday_v1"
const FINISHED_STORAGE_KEY = "@mtm_finished_workday_v1"
let mutationQueue: Promise<void> = Promise.resolve()

function serializeMutation(operation: () => Promise<void>) {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

export interface ActiveWorkday {
  key: string
  workdayId: string
  startedAt: string
  syncState: "START_PENDING" | "CONFIRMED" | "FINISH_PENDING"
  /**
   * A workday can be paused by the agent here (task A7/T2) or by Workforce
   * elsewhere. Either way a paused session must never unlock route execution
   * or location tracking. Undefined deliberately means active, to keep
   * existing persisted confirmed sessions backward-compatible.
   */
  paused?: boolean
  /**
   * When the current break began, so the card can say "Перерыв с 13:05"
   * instead of just "Перерыв" (task T3). Comes from the server's `pausedAt`
   * on reconcile, or from the moment the agent tapped pause. Absent whenever
   * `paused` is absent.
   */
  pausedAt?: string
}

/**
 * The last workday the server confirmed as finished (audit M-05, task B3).
 * Kept after `activeWorkday` is cleared so "Today" can show "Finished at
 * 18:24" instead of falling back to "not started", and so the same day
 * cannot be restarted from this device (owner decision 4).
 */
export interface FinishedWorkday {
  key: string
  workdayId: string
  finishedAt: string
  /** Local calendar day (YYYY-MM-DD) the shift belongs to. */
  dateKey: string
}

export function localDateKey(value: Date = new Date()): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-")
}

export function isWorkdayFinished(workday: BootstrapWorkday | null | undefined): boolean {
  return !!(workday && (workday.completedAt || workday.status === "COMPLETED"))
}

function persistedFinished(value: unknown): FinishedWorkday | null {
  if (!value || typeof value !== "object") return null
  const parsed = value as Partial<FinishedWorkday>
  if (
    typeof parsed.key !== "string" ||
    typeof parsed.workdayId !== "string" ||
    typeof parsed.finishedAt !== "string" ||
    typeof parsed.dateKey !== "string"
  ) return null
  return { key: parsed.key, workdayId: parsed.workdayId, finishedAt: parsed.finishedAt, dateKey: parsed.dateKey }
}

async function rememberFinishedWorkday(key: string, workday: BootstrapWorkday): Promise<FinishedWorkday> {
  const finishedAt = workday.completedAt ?? new Date().toISOString()
  const finished: FinishedWorkday = {
    key,
    workdayId: workday.id,
    finishedAt,
    dateKey: workday.workDate ?? localDateKey(new Date(finishedAt)),
  }
  await AsyncStorage.setItem(FINISHED_STORAGE_KEY, JSON.stringify(finished))
  return finished
}

export type WorkdaySyncError = "START_CONFLICT" | "FINISH_CONFLICT" | null

interface WorkdayState {
  activeWorkday: ActiveWorkday | null
  finishedWorkday: FinishedWorkday | null
  syncError: WorkdaySyncError
  hydrated: boolean
  hydrate: () => Promise<void>
  start: (key: string) => Promise<void>
  end: (key: string) => Promise<void>
  /**
   * Take a break. The server refuses GPS points recorded inside a pause
   * (leaddrive-v2 `MTM_LOCATION_WORKDAY_PAUSED`), so the local flag is not
   * cosmetic: it is what stops this device sending them in the first place.
   */
  pause: (key: string) => Promise<void>
  /** Come back from a break. */
  resume: (key: string) => Promise<void>
  /**
   * Reconcile the client-local workday with the authoritative server shift
   * returned by /mobile/bootstrap. Conservative on purpose:
   *   - server shift open + no local  -> adopt it (restores an active shift on a
   *     fresh install / new device / cleared storage). The server workday id
   *     equals the client-generated id (server creates the row with data.id),
   *     so end() keeps working after adoption.
   *   - server shift closed + local matches its id -> clear (the shift was ended
   *     elsewhere, e.g. another device).
   *   - a durable pending mutation stays visible while offline; a completed
   *     unrelated shift never clears it.
   */
  reconcileFromServer: (key: string, workday: BootstrapWorkday | null | undefined) => Promise<void>
}

export function workdayKey(tenantId?: string | null, userId?: string | null) {
  return `${tenantId || "unknown-tenant"}:${userId || "unknown-user"}`
}

function persistedWorkday(value: unknown): ActiveWorkday | null {
  if (!value || typeof value !== "object") return null
  const parsed = value as Partial<ActiveWorkday>
  if (
    typeof parsed.key !== "string" ||
    typeof parsed.workdayId !== "string" ||
    typeof parsed.startedAt !== "string"
  ) return null
  const syncState = parsed.syncState === "CONFIRMED" ||
    parsed.syncState === "FINISH_PENDING" ||
    parsed.syncState === "START_PENDING"
      ? parsed.syncState
      // Existing 2.1.11 installs did not persist confirmation state. Treat
      // them as pending until bootstrap proves the server workday is open.
      : "START_PENDING"
  return {
    key: parsed.key,
    workdayId: parsed.workdayId,
    startedAt: parsed.startedAt,
    syncState,
    ...(parsed.paused === true ? { paused: true } : {}),
    ...(parsed.paused === true && typeof parsed.pausedAt === "string" ? { pausedAt: parsed.pausedAt } : {}),
  }
}

function belongsToWorkday(item: OutboxOperation, workdayId: string) {
  return item.entity === "workdays" &&
    (item.data.id === workdayId || item.data.workdayId === workdayId)
}

export const useWorkdayStore = create<WorkdayState>((set, get) => ({
  activeWorkday: null,
  finishedWorkday: null,
  syncError: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const [raw, rawFinished] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(FINISHED_STORAGE_KEY),
      ])
      const parsed = raw ? JSON.parse(raw) : null
      const parsedFinished = rawFinished ? JSON.parse(rawFinished) : null
      set({ activeWorkday: persistedWorkday(parsed), finishedWorkday: persistedFinished(parsedFinished), syncError: null, hydrated: true })
    } catch {
      set({ activeWorkday: null, finishedWorkday: null, syncError: null, hydrated: true })
    }
  },
  start: (key) => serializeMutation(async () => {
    // Owner decision 4 (audit 2026-09-05): a finished day stays finished. A
    // break/resume control replaces the restart (task A7/B3, sprint 3).
    const finished = get().finishedWorkday
    if (finished?.key === key && finished.dateKey === localDateKey()) return
    const startedAt = new Date().toISOString()
    const workdayId = "wd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10)
    const activeWorkday: ActiveWorkday = { key, workdayId, startedAt, syncState: "START_PENDING" }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkday))
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "START", id: workdayId, occurredAt: startedAt } })
    set({ activeWorkday, syncError: null })
  }),
  end: (key) => serializeMutation(async () => {
    const activeWorkday = get().activeWorkday
    if (activeWorkday?.key !== key) return
    const occurredAt = new Date().toISOString()
    // The server state machine uses FINISH (not END). Keeping the wire value
    // aligned means that pressing “End workday” actually closes the server
    // workday and stops live GPS, including after an offline retry.
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "FINISH", workdayId: activeWorkday.workdayId, occurredAt } })
    const pendingFinish: ActiveWorkday = { ...activeWorkday, syncState: "FINISH_PENDING" }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pendingFinish))
    if (get().activeWorkday?.key === key) set({ activeWorkday: pendingFinish, syncError: null })
  }),
  pause: (key) => serializeMutation(async () => {
    const activeWorkday = get().activeWorkday
    // Only a confirmed, running shift can pause: pausing one the server has
    // not yet accepted would queue PAUSE behind a START that may still be
    // rejected, and the server answers MTM_WORKDAY_NOT_RUNNING anyway.
    if (activeWorkday?.key !== key || activeWorkday.syncState !== "CONFIRMED" || activeWorkday.paused) return
    const occurredAt = new Date().toISOString()
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "PAUSE", workdayId: activeWorkday.workdayId, occurredAt } })
    const paused: ActiveWorkday = { ...activeWorkday, paused: true, pausedAt: occurredAt }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(paused))
    if (get().activeWorkday?.key === key) set({ activeWorkday: paused, syncError: null })
  }),
  resume: (key) => serializeMutation(async () => {
    const activeWorkday = get().activeWorkday
    if (activeWorkday?.key !== key || activeWorkday.syncState !== "CONFIRMED" || !activeWorkday.paused) return
    const occurredAt = new Date().toISOString()
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "RESUME", workdayId: activeWorkday.workdayId, occurredAt } })
    const { paused: _paused, pausedAt: _pausedAt, ...running } = activeWorkday
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(running))
    if (get().activeWorkday?.key === key) set({ activeWorkday: running, syncError: null })
  }),
  reconcileFromServer: (key, workday) => serializeMutation(async () => {
    const local = get().activeWorkday
    const open = isWorkdayOpen(workday)
    const operations = local
      ? (await allOutboxOperations()).filter((item) => belongsToWorkday(item, local.workdayId))
      : []
    const pendingStart = operations.some((item) => item.status === "pending" && item.data.action === "START")
    const pendingFinish = operations.some((item) => item.status === "pending" && item.data.action === "FINISH")
    const startConflict = operations.some((item) => item.status === "conflict" && item.data.action === "START")
    const finishConflict = operations.some((item) => item.status === "conflict" && item.data.action === "FINISH")

    if (open) {
      if (local?.workdayId === workday!.id && local.syncState === "FINISH_PENDING" && pendingFinish) {
        // FINISH is still queued. Keep GPS stopped and keep the honest
        // "finishing" state until the server accepts or rejects the event.
        return
      }
      const activeWorkday: ActiveWorkday = {
        key,
        workdayId: workday!.id,
        startedAt: workday!.startedAt!,
        syncState: "CONFIRMED",
        ...(workday!.status === "PAUSED" ? { paused: true } : {}),
        // T3: without the moment the break began the card could only say
        // "Перерыв" — true but useless to someone deciding whether to go back.
        ...(workday!.status === "PAUSED" && workday!.pausedAt ? { pausedAt: workday!.pausedAt } : {}),
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkday))
      set({ activeWorkday, syncError: finishConflict ? "FINISH_CONFLICT" : null })
    } else if (local && (pendingStart || pendingFinish) && !startConflict && !finishConflict && !workday) {
      // Offline or deferred mutation: no server workday exists yet. Preserve
      // the visible pending state and retry from the durable outbox.
      return
    } else if (local && workday && workday.id !== local.workdayId && !startConflict && !finishConflict) {
      // A completed row for a different shift is not evidence that this
      // device's queued or restored shift was rejected.
      return
    } else if (local) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      // The server closed this very shift: remember when, so "Today" shows
      // "finished at" instead of "not started" (audit M-05).
      const finishedWorkday = workday && workday.id === local.workdayId && isWorkdayFinished(workday) && !startConflict && !finishConflict
        ? await rememberFinishedWorkday(key, workday)
        : get().finishedWorkday
      if (get().activeWorkday?.workdayId === local.workdayId) {
        set({
          activeWorkday: null,
          finishedWorkday,
          syncError: startConflict ? "START_CONFLICT" : finishConflict ? "FINISH_CONFLICT" : null,
        })
      }
    } else if (workday && isWorkdayFinished(workday)) {
      // Fresh install or cleared storage: the server already knows the shift
      // is over, so the device must not offer to start it again today.
      const finishedWorkday = await rememberFinishedWorkday(key, workday)
      set({ finishedWorkday })
    }
  }),
}))
