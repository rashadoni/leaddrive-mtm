import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { setOfflineScope } from "../../src/services/offline-scope"
import {
  conflictOutboxOperations,
  flushOutbox,
  pendingOutboxOperations,
} from "../../src/services/outbox"
import {
  queueVisitCheckIn,
  queueVisitCheckOut,
  readOptimisticVisit,
  reconcileOptimisticVisit,
} from "../../src/services/visit-outbox"

describe("durable visit mutations", () => {
  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T09:15:00.000Z"))
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  afterEach(() => jest.useRealTimers())

  it("queues check-in with a client visit id and persists an optimistic active visit", async () => {
    const { visit, operation } = await queueVisitCheckIn({
      customer: { id: "customer-1", name: "Central Clinic" },
      latitude: 40.4,
      longitude: 49.8,
      routeId: "route-1",
      routePointId: "point-1",
    })

    expect(operation).toMatchObject({
      entity: "visits",
      op: "create",
      scopeKey: "org-1:agent-1",
      status: "pending",
      data: {
        id: visit.id,
        customerId: "customer-1",
        status: "CHECKED_IN",
        checkInAt: "2026-07-21T09:15:00.000Z",
        checkInLat: 40.4,
        checkInLng: 49.8,
        routeId: "route-1",
        routePointId: "point-1",
      },
    })
    expect(await readOptimisticVisit()).toEqual(visit)
  })

  it("orders offline check-in before check-out for the same client visit id", async () => {
    const { visit } = await queueVisitCheckIn({ customer: { id: "customer-1", name: "Clinic" } })
    jest.setSystemTime(new Date("2026-07-21T09:45:00.000Z"))
    await queueVisitCheckOut(visit, { notes: "Completed" })

    const operations = await pendingOutboxOperations()
    expect(operations).toHaveLength(2)
    expect(operations.map((item) => item.op)).toEqual(["create", "update"])
    expect(operations[1].data).toMatchObject({
      id: visit.id,
      status: "CHECKED_OUT",
      checkOutAt: "2026-07-21T09:45:00.000Z",
      notes: "Completed",
    })
    expect(await readOptimisticVisit()).toMatchObject({ id: visit.id, pendingCheckOut: true })
  })

  it("removes a rejected check-in from the active banner but keeps its conflict", async () => {
    const { visit, operation } = await queueVisitCheckIn({ customer: { id: "customer-1", name: "Clinic" } })
    await flushOutbox(async () => ({
      results: [{
        operationId: operation.operationId,
        status: "conflict",
        serverData: { code: "MTM_VISIT_OUT_OF_ZONE" },
      }],
    }))

    expect(await reconcileOptimisticVisit(null)).toBeNull()
    expect(await readOptimisticVisit()).toBeNull()
    expect(await conflictOutboxOperations()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ id: visit.id }) }),
    ])
  })

  it("restores an active visit when check-out is rejected", async () => {
    const { visit, operation: checkIn } = await queueVisitCheckIn({ customer: { id: "customer-1", name: "Clinic" } })
    await flushOutbox(async () => ({ results: [{ operationId: checkIn.operationId, status: "ok" }] }))
    const { operation: checkOut } = await queueVisitCheckOut(visit, {})
    await flushOutbox(async () => ({
      results: [{
        operationId: checkOut.operationId,
        status: "conflict",
        serverData: { code: "MTM_VISIT_REQUIREMENTS_INCOMPLETE", missing: ["PHOTO"] },
      }],
    }))

    await expect(reconcileOptimisticVisit(null)).resolves.toMatchObject({
      id: visit.id,
      pendingCheckOut: false,
    })
  })
})
