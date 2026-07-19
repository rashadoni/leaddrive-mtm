import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { enqueueOutboxOperation } from "../services/outbox"
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
}

interface WorkdayState {
  activeWorkday: ActiveWorkday | null
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
   *   - otherwise -> leave local untouched, so an un-synced optimistic start
   *     (queued in the outbox, not yet on the server) is never dropped.
   */
  reconcileFromServer: (key: string, workday: BootstrapWorkday | null | undefined) => Promise<void>
}

export function workdayKey(tenantId?: string | null, userId?: string | null) {
  return `${tenantId || "unknown-tenant"}:${userId || "unknown-user"}`
}

export const useWorkdayStore = create<WorkdayState>((set, get) => ({
  activeWorkday: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      const valid =
        parsed &&
        typeof parsed.key === "string" &&
        typeof parsed.workdayId === "string" &&
        typeof parsed.startedAt === "string"
          ? (parsed as ActiveWorkday)
          : null
      set({ activeWorkday: valid, hydrated: true })
    } catch {
      set({ activeWorkday: null, hydrated: true })
    }
  },
  start: (key) => serializeMutation(async () => {
    const startedAt = new Date().toISOString()
    const workdayId = "wd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10)
    const activeWorkday = { key, workdayId, startedAt }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkday))
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "START", id: workdayId, occurredAt: startedAt } })
    set({ activeWorkday })
  }),
  end: (key) => serializeMutation(async () => {
    const activeWorkday = get().activeWorkday
    if (activeWorkday?.key !== key) return
    const occurredAt = new Date().toISOString()
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { action: "END", workdayId: activeWorkday.workdayId, occurredAt } })
    await AsyncStorage.removeItem(STORAGE_KEY)
    if (get().activeWorkday?.key === key) set({ activeWorkday: null })
  }),
  reconcileFromServer: (key, workday) => serializeMutation(async () => {
    const local = get().activeWorkday
    const open = isWorkdayOpen(workday)
    if (open && !local) {
      const activeWorkday: ActiveWorkday = { key, workdayId: workday!.id, startedAt: workday!.startedAt! }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkday))
      set({ activeWorkday })
    } else if (!open && local && workday && local.workdayId === workday.id) {
      await AsyncStorage.removeItem(STORAGE_KEY)
      if (get().activeWorkday?.workdayId === local.workdayId) set({ activeWorkday: null })
    }
  }),
}))
