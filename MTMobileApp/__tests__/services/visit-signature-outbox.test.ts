import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { pendingOutboxOperations } from "../../src/services/outbox"
import { setOfflineScope } from "../../src/services/offline-scope"
import { hasQueuedVisitSignature, queueVisitSignature } from "../../src/services/visit-signature"

describe("queued customer signature", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("queues a SIGNATURE visit action in the shape the sync push validates", async () => {
    const op = await queueVisitSignature(
      "visit-1757800000000-abc12345",
      { svgPath: "M10 20L30 40", widthPx: 600, heightPx: 240 },
      "  Aysel Məmmədova  ",
    )
    expect(op).toMatchObject({
      entity: "visitActions",
      op: "create",
      status: "pending",
      data: {
        visitId: "visit-1757800000000-abc12345",
        actionKey: "SIGNATURE",
        status: "COMPLETED",
        evidence: {
          method: "drawn",
          svgPath: "M10 20L30 40",
          widthPx: 600,
          heightPx: 240,
          signerName: "Aysel Məmmədova",
        },
      },
    })
    // The server takes a cuid `id` or none; a client id would be refused.
    expect(op.data).not.toHaveProperty("id")
    expect(typeof (op.data.evidence as any).signedAt).toBe("string")
    expect(await pendingOutboxOperations()).toHaveLength(1)
    expect(await hasQueuedVisitSignature("visit-1757800000000-abc12345")).toBe(true)
    expect(await hasQueuedVisitSignature("visit-other")).toBe(false)
  })

  it("omits an empty signer name and refuses an invalid drawing", async () => {
    const op = await queueVisitSignature("visit-1", { svgPath: "M1 1L50 50", widthPx: 100, heightPx: 100 }, "   ")
    expect(op.data.evidence).not.toHaveProperty("signerName")
    await expect(queueVisitSignature("visit-1", { svgPath: "M1", widthPx: 100, heightPx: 100 })).rejects.toThrow("VISIT_SIGNATURE_INVALID")
    await expect(queueVisitSignature("", { svgPath: "M1 1L50 50", widthPx: 100, heightPx: 100 })).rejects.toThrow("VISIT_SIGNATURE_NO_VISIT")
  })
})
