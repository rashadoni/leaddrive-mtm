import { create } from "zustand"
import { api } from "../services/api"

export type EquipmentCondition = "GOOD" | "DAMAGED" | "NEEDS_REPAIR" | "MISSING"
export type RepairPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT"

export interface EquipmentItem {
  id: string
  serialNumber: string
  model?: string | null
  condition: EquipmentCondition
  typeId: string
  type?: { name: string } | null
  customerId?: string | null
  _count?: { repairRequests: number }
}

export interface InspectionPayload {
  equipmentId: string
  conditionBefore: EquipmentCondition
  conditionAfter: EquipmentCondition
  checklist?: Record<string, boolean>
  notes?: string
  photoUrls?: string[]
  visitId?: string
}

export interface RepairPayload {
  equipmentId: string
  description: string
  priority?: RepairPriority
  visitId?: string
}

interface EquipmentState {
  items: EquipmentItem[]
  loading: boolean
  error: string | null
  lastInspectionId: string | null
  lastRepairRequestId: string | null

  fetchEquipment: (customerId: string) => Promise<void>
  submitInspection: (payload: InspectionPayload) => Promise<void>
  submitRepairRequest: (payload: RepairPayload) => Promise<void>
  clearError: () => void
}

export const useEquipmentStore = create<EquipmentState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  lastInspectionId: null,
  lastRepairRequestId: null,

  clearError: () => set({ error: null }),

  fetchEquipment: async (customerId: string) => {
    set({ loading: true, error: null })
    try {
      const res = await api.get(`/equipment?customerId=${encodeURIComponent(customerId)}&limit=100`)
      const equipment: EquipmentItem[] = (res as any)?.data?.equipment ?? []
      set({ items: equipment, loading: false })
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? "Failed to load equipment" })
    }
  },

  submitInspection: async (payload: InspectionPayload) => {
    set({ error: null, lastInspectionId: null })
    try {
      const res = await api.post(`/equipment/${payload.equipmentId}/inspect`, payload)
      const inspectionId: string = (res as any)?.data?.inspection?.id ?? null
      // Update local condition
      if (payload.conditionAfter !== payload.conditionBefore) {
        set((state) => ({
          items: state.items.map((eq) =>
            eq.id === payload.equipmentId
              ? { ...eq, condition: payload.conditionAfter }
              : eq
          ),
        }))
      }
      set({ lastInspectionId: inspectionId })
    } catch (e: any) {
      set({ error: e?.message ?? "Failed to submit inspection" })
    }
  },

  submitRepairRequest: async (payload: RepairPayload) => {
    set({ error: null, lastRepairRequestId: null })
    try {
      const res = await api.post("/repair-requests", {
        equipmentId: payload.equipmentId,
        description: payload.description,
        priority: payload.priority ?? "NORMAL",
        ...(payload.visitId ? { visitId: payload.visitId } : {}),
      })
      const requestId: string = (res as any)?.data?.data?.request?.id ?? null
      set({ lastRepairRequestId: requestId })
    } catch (e: any) {
      set({ error: e?.message ?? "Failed to submit repair request" })
    }
  },
}))
