import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { enqueueOutboxOperation, flushOutbox, pendingOutboxOperations } from "../../src/services/outbox"
import { setOfflineScope } from "../../src/services/offline-scope"
import {
  countPendingBrandPotentialUpdates,
  queueBrandPotentialCreate,
  queueBrandPotentialEnd,
} from "../../src/services/brand-potential-outbox"

describe("durable brand potential mutations", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("queues a brand-potential create with contact scope and evidence", async () => {
    const op = await queueBrandPotentialCreate("contact-1", {
      clientPotentialId: "mobile-potential-1",
      brandExternalId: "brand-acc",
      brandName: "ACC",
      productExternalId: "acc-200",
      productName: "ACC 200 mg",
      categoryLabel: "B2",
      potentialValue: 80,
      coverageValue: 25,
      periodStart: "2026-07-01",
      source: "FIELD_INTERVIEW",
      provenance: { note: "Doctor interview" },
      evidenceVisitIds: ["visit-1"],
    })

    expect(op).toMatchObject({
      entity: "brandPotentials",
      op: "create",
      scopeKey: "org-1:agent-1",
      status: "pending",
      data: {
        contactId: "contact-1",
        clientPotentialId: "mobile-potential-1",
        brandExternalId: "brand-acc",
        potentialValue: 80,
        provenance: { note: "Doctor interview" },
        evidenceVisitIds: ["visit-1"],
      },
    })
  })

  it("queues an end-period mutation and counts only brand-potential operations", async () => {
    await queueBrandPotentialEnd("potential-1", "2026-07-22", "period closed")
    await enqueueOutboxOperation({ entity: "tasks", op: "update", data: { id: "task-1" } })

    expect(await countPendingBrandPotentialUpdates()).toBe(1)
    expect((await pendingOutboxOperations())[0]).toMatchObject({
      entity: "brandPotentials",
      op: "update",
      data: { id: "potential-1", periodEnd: "2026-07-22", reason: "period closed" },
    })
  })

  it("keeps a rejected create visible as a sync conflict", async () => {
    const op = await queueBrandPotentialCreate("contact-1", {
      clientPotentialId: "mobile-potential-2",
      brandExternalId: "brand-acc",
      brandName: "ACC",
      potentialValue: 50,
      coverageValue: 10,
      periodStart: "2026-07-01",
      source: "FIELD_INTERVIEW",
      provenance: { note: "Doctor interview" },
      evidenceVisitIds: ["visit-1"],
    })

    const result = await flushOutbox(async () => ({
      results: [{ operationId: op.operationId, status: "conflict", serverData: { code: "MTM_CONTACT_SCOPE_REQUIRED" } }],
    }))
    expect(result).toEqual({ sent: 0, deferred: 0, conflicted: 1 })
    expect(await countPendingBrandPotentialUpdates()).toBe(1)
  })
})
