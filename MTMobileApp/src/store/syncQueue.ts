import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../services/api"

export type SyncItemType = "CHECK_IN" | "CHECK_OUT" | "INSPECTION" | "REPAIR_REQUEST" | "ORDER"
export type SyncStatus = "pending" | "processing" | "done" | "failed"

export interface SyncItem {
  id: string          // uuid-like: Date.now() + Math.random()
  type: SyncItemType
  payload: Record<string, unknown>
  createdAt: string   // ISO string
  retries: number
  status: SyncStatus
  error?: string
}

interface SyncQueueState {
  queue: SyncItem[]
  syncing: boolean
  enqueue: (type: SyncItemType, payload: Record<string, unknown>) => string
  processQueue: () => Promise<number>
  clearDone: () => void
  pendingCount: () => number
}

const MAX_RETRIES = 3

async function callApiForItem(item: SyncItem): Promise<void> {
  switch (item.type) {
    case "CHECK_IN":
      await api.checkIn(item.payload as Parameters<typeof api.checkIn>[0])
      break
    case "CHECK_OUT": {
      const { visitId, ...rest } = item.payload as { visitId: string } & Parameters<typeof api.checkOut>[1]
      await api.checkOut(visitId, rest)
      break
    }
    case "INSPECTION":
      await api.post("/mobile/inspections", item.payload)
      break
    case "REPAIR_REQUEST":
      await api.post("/mobile/repair-requests", item.payload)
      break
    case "ORDER":
      await api.createOrderWithSkuItems(item.payload as Parameters<typeof api.createOrderWithSkuItems>[0])
      break
    default:
      throw new Error(`Unknown sync item type: ${item.type}`)
  }
}

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      syncing: false,

      enqueue: (type: SyncItemType, payload: Record<string, unknown>): string => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const item: SyncItem = {
          id,
          type,
          payload,
          createdAt: new Date().toISOString(),
          retries: 0,
          status: "pending",
        }
        set((state) => {
          // Idempotency: don't add if id already exists
          if (state.queue.some((i) => i.id === id)) return state
          return { queue: [...state.queue, item] }
        })
        return id
      },

      processQueue: async (): Promise<number> => {
        set({ syncing: true })
        let successCount = 0

        try {
          const queue = get().queue
          const itemsToProcess = queue.filter(
            (item) =>
              item.status === "pending" ||
              (item.status === "failed" && item.retries < MAX_RETRIES)
          )

          for (const item of itemsToProcess) {
            // Mark as processing
            set((state) => ({
              queue: state.queue.map((i) =>
                i.id === item.id ? { ...i, status: "processing" as SyncStatus } : i
              ),
            }))

            try {
              await callApiForItem(item)
              set((state) => ({
                queue: state.queue.map((i) =>
                  i.id === item.id ? { ...i, status: "done" as SyncStatus, error: undefined } : i
                ),
              }))
              successCount++
            } catch (e: unknown) {
              const errorMsg = e instanceof Error ? e.message : String(e)
              const newRetries = item.retries + 1
              const newStatus: SyncStatus = newRetries >= MAX_RETRIES ? "failed" : "pending"
              set((state) => ({
                queue: state.queue.map((i) =>
                  i.id === item.id
                    ? { ...i, status: newStatus, retries: newRetries, error: errorMsg }
                    : i
                ),
              }))
            }
          }
        } finally {
          set({ syncing: false })
        }

        return successCount
      },

      clearDone: (): void => {
        set((state) => ({
          queue: state.queue.filter((item) => item.status !== "done"),
        }))
      },

      pendingCount: (): number => {
        return get().queue.filter(
          (item) => item.status === "pending" || item.status === "failed"
        ).length
      },
    }),
    {
      name: "sync-queue",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
