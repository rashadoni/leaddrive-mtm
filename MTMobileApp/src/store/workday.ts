import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { allOutboxOperations, enqueueOutboxOperation, type OutboxOperation } from "../services/outbox"
import { isWorkdayOpen, type BootstrapWorkday } from "../services/bootstrap"

const STORAGE_KEY = "@mtm_active_workday_v1"
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
}

export type WorkdaySyncError = "START_CONFLICT" | "FINISH_CONFLICT" | null

interface WorkdayState {
  activeWorkday: ActiveWorkday | null
  syncError: WorkdaySyncError
  hydrated: boolean
  hydrate: () => Promise<void>
  start: (key: string) => Promise<void>
  end: (key: string) => Promise<void>
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
  return { key: parsed.key, workdayId: parsed.workdayId, startedAt: parsed.startedAt, syncState }
}

function belongsToWorkday(item: OutboxOperation, workdayId: string) {
  return item.entity === "workdays" &&
    (item.data.id === workdayId || item.data.workdayId === workdayId)
}

export const useWorkdayStore = create<WorkdayState>((set, get) => ({
  activeWorkday: null,
  syncError: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      set({ activeWorkday: persistedWorkday(parsed), syncError: null, hydrated: true })
    } catch {
      set({ activeWorkday: null, syncError: null, hydrated: true })
    }
  },
  start: (key) => serializeMutation(async () => {
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
      if (get().activeWorkday?.workdayId === local.workdayId) {
        set({
          activeWorkday: null,
          syncError: startConflict ? "START_CONFLICT" : finishConflict ? "FINISH_CONFLICT" : null,
        })
      }
    }
  }),
}))
