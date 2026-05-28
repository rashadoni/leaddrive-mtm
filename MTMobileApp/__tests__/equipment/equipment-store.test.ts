/**
 * G2 — Zustand store tests for equipment (fetch + inspect + repair).
 *
 * Tests the contract that EquipmentListScreen, EquipmentInspectScreen
 * and RepairRequestScreen rely on. Mirrors the pattern from cart-store.test.ts.
 *
 * API shape (backend already implemented):
 *   GET  /api/v1/mtm/equipment?customerId=X  → { equipment: MtmEquipment[] }
 *   POST /api/v1/mtm/equipment/:id/inspect   → { inspection: { id } }
 *   POST /api/v1/mtm/equipment               → { equipment: { id } }  (repair req via POST body type=REPAIR_REQUEST)
 *
 * The store lives at src/store/equipment.ts (to be created).
 */

import { useEquipmentStore } from "../../src/store/equipment"

// ── Fixtures ─────────────────────────────────────────────────────────────────

import type { EquipmentItem } from "../../src/store/equipment"

const FRIDGE_A: EquipmentItem = {
  id: "eq-1",
  serialNumber: "SN-001",
  model: "Pepsi Fridge 200L",
  condition: "GOOD",
  typeId: "type-1",
  type: { name: "Soyuducu" },
  customerId: "cust-1",
}

const FRIDGE_B: EquipmentItem = {
  id: "eq-2",
  serialNumber: "SN-002",
  model: "Pepsi Fridge 100L",
  condition: "DAMAGED",
  typeId: "type-1",
  type: { name: "Soyuducu" },
  customerId: "cust-1",
}

// Mock the api module so tests never hit network
jest.mock("../../src/services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

import { api } from "../../src/services/api"
const mockGet = api.get as jest.MockedFunction<typeof api.get>
const mockPost = api.post as jest.MockedFunction<typeof api.post>

function freshState() {
  useEquipmentStore.setState({
    items: [],
    loading: false,
    error: null,
    lastInspectionId: null,
    lastRepairRequestId: null,
  })
  jest.clearAllMocks()
}

// ── fetchEquipment ────────────────────────────────────────────────────────────

describe("useEquipmentStore — fetchEquipment", () => {
  beforeEach(freshState)

  it("populates items from API response", async () => {
    mockGet.mockResolvedValueOnce({ data: { equipment: [FRIDGE_A, FRIDGE_B] } })
    await useEquipmentStore.getState().fetchEquipment("cust-1")
    expect(useEquipmentStore.getState().items).toHaveLength(2)
    expect(useEquipmentStore.getState().items[0].serialNumber).toBe("SN-001")
  })

  it("sets loading=true during fetch, false after", async () => {
    let resolveApi!: (v: unknown) => void
    mockGet.mockReturnValueOnce(new Promise((res) => { resolveApi = res }))
    const fetchPromise = useEquipmentStore.getState().fetchEquipment("cust-1")
    expect(useEquipmentStore.getState().loading).toBe(true)
    resolveApi({ data: { equipment: [] } })
    await fetchPromise
    expect(useEquipmentStore.getState().loading).toBe(false)
  })

  it("sets error on API failure", async () => {
    mockGet.mockRejectedValueOnce(new Error("Network error"))
    await useEquipmentStore.getState().fetchEquipment("cust-1")
    expect(useEquipmentStore.getState().error).toBe("Network error")
    expect(useEquipmentStore.getState().items).toHaveLength(0)
  })

  it("calls /api/v1/mtm/equipment with correct customerId", async () => {
    mockGet.mockResolvedValueOnce({ data: { equipment: [] } })
    await useEquipmentStore.getState().fetchEquipment("cust-42")
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("customerId=cust-42")
    )
  })
})

// ── submitInspection ──────────────────────────────────────────────────────────

describe("useEquipmentStore — submitInspection", () => {
  beforeEach(freshState)

  const INSPECT_PAYLOAD = {
    equipmentId: "eq-1",
    conditionBefore: "GOOD" as const,
    conditionAfter: "DAMAGED" as const,
    checklist: { powerOn: true, doorSeal: false },
    notes: "Kapı möhürü xarabdır",
    photoUrls: ["https://cdn.example.com/photo1.jpg"],
    visitId: "visit-99",
  }

  it("posts to /api/v1/mtm/equipment/:id/inspect and saves lastInspectionId", async () => {
    mockPost.mockResolvedValueOnce({ data: { inspection: { id: "insp-123" } } })
    await useEquipmentStore.getState().submitInspection(INSPECT_PAYLOAD)
    expect(useEquipmentStore.getState().lastInspectionId).toBe("insp-123")
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/equipment/eq-1/inspect"),
      expect.objectContaining({ conditionBefore: "GOOD", conditionAfter: "DAMAGED" })
    )
  })

  it("updates local item condition on success", async () => {
    useEquipmentStore.setState({ items: [FRIDGE_A] })
    mockPost.mockResolvedValueOnce({ data: { inspection: { id: "insp-x" } } })
    await useEquipmentStore.getState().submitInspection(INSPECT_PAYLOAD)
    const updated = useEquipmentStore.getState().items.find((e) => e.id === "eq-1")
    expect(updated?.condition).toBe("DAMAGED")
  })

  it("sets error on inspection failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("Server error"))
    await useEquipmentStore.getState().submitInspection(INSPECT_PAYLOAD)
    expect(useEquipmentStore.getState().error).toBeTruthy()
    expect(useEquipmentStore.getState().lastInspectionId).toBeNull()
  })
})

// ── submitRepairRequest ───────────────────────────────────────────────────────

describe("useEquipmentStore — submitRepairRequest", () => {
  beforeEach(freshState)

  const REPAIR_PAYLOAD = {
    equipmentId: "eq-2",
    description: "Kompressor sıradan çıxıb, soyutmur",
    priority: "HIGH" as const,
    visitId: "visit-99",
  }

  it("posts repair request and saves lastRepairRequestId", async () => {
    // Backend: POST /api/v1/mtm/repair-requests → { success: true, data: { request: { id } } }
    mockPost.mockResolvedValueOnce({ data: { success: true, data: { request: { id: "repair-55" } } } })
    await useEquipmentStore.getState().submitRepairRequest(REPAIR_PAYLOAD)
    expect(useEquipmentStore.getState().lastRepairRequestId).toBe("repair-55")
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/repair-requests"),
      expect.objectContaining({ equipmentId: "eq-2", description: "Kompressor sıradan çıxıb, soyutmur", priority: "HIGH" })
    )
  })

  it("sets error on network failure", async () => {
    mockPost.mockRejectedValueOnce(new Error("Timeout"))
    await useEquipmentStore.getState().submitRepairRequest(REPAIR_PAYLOAD)
    expect(useEquipmentStore.getState().error).toBe("Timeout")
    expect(useEquipmentStore.getState().lastRepairRequestId).toBeNull()
  })
})
