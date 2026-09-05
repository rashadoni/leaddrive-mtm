import { checkInOutcomeFromOperation, formatCheckInDistance } from "../../src/screens/visit/check-in-outcome"
import type { OutboxOperation } from "../../src/services/outbox"

function operation(status: "pending" | "conflict", serverData?: Record<string, unknown>, error?: string): OutboxOperation {
  return {
    operationId: "op-1",
    entity: "visits",
    op: "create",
    data: { id: "visit-1", customerId: "cust-1" },
    clientTimestamp: 1,
    attempts: 1,
    nextAttemptAt: 0,
    scopeKey: "t:a",
    status,
    ...(status === "conflict" ? { conflict: { error, serverData, recordedAt: 1 } } : {}),
  }
}

describe("checkInOutcomeFromOperation (field UX audit M-01 / B1)", () => {
  it("reports success when the outbox no longer holds the operation", () => {
    expect(checkInOutcomeFromOperation(undefined, true)).toEqual({ kind: "accepted" })
  })

  it("explains a geofence rejection with the server's distance and limit", () => {
    expect(checkInOutcomeFromOperation(
      operation("conflict", { code: "MTM_VISIT_OUT_OF_ZONE", distanceMeters: 6745700, geofenceRadius: 100 }),
      true,
    )).toEqual({ kind: "too_far", distanceMeters: 6745700, maxMeters: 100 })
  })

  it("names the missing coordinates instead of staying silent", () => {
    expect(checkInOutcomeFromOperation(
      operation("conflict", { code: "MTM_VISIT_CUSTOMER_NO_COORDINATES", customerId: "cust-1" }),
      true,
    )).toEqual({ kind: "no_coordinates" })
  })

  it("maps the remaining contract codes", () => {
    expect(checkInOutcomeFromOperation(operation("conflict", { code: "MTM_VISIT_ALREADY_ACTIVE" }), true))
      .toEqual({ kind: "active_visit" })
    for (const code of ["MTM_ROUTE_POINT_NOT_AVAILABLE", "MTM_ROUTE_POINT_ALREADY_ACTIVE", "MTM_ROUTE_TARGET_MISMATCH", "MTM_ROUTE_TARGET_INVALID"]) {
      expect(checkInOutcomeFromOperation(operation("conflict", { code }), true)).toEqual({ kind: "route_mismatch" })
    }
    expect(checkInOutcomeFromOperation(operation("conflict", { code: "MTM_VISIT_CUSTOMER_NOT_FOUND" }), true))
      .toEqual({ kind: "customer_missing" })
  })

  it("surfaces an unknown server rejection with its message", () => {
    expect(checkInOutcomeFromOperation(operation("conflict", { code: "SOMETHING_NEW" }, "Server said no"), true))
      .toEqual({ kind: "server_error", message: "Server said no" })
  })

  it("distinguishes a queued check-in from an offline one", () => {
    expect(checkInOutcomeFromOperation(operation("pending"), true)).toEqual({ kind: "queued" })
    expect(checkInOutcomeFromOperation(operation("pending"), false)).toEqual({ kind: "offline" })
  })
})

describe("formatCheckInDistance", () => {
  it("formats meters and kilometres and tolerates a missing value", () => {
    expect(formatCheckInDistance(80)).toBe("80 m")
    expect(formatCheckInDistance(6745700)).toBe("6745.7 km")
    expect(formatCheckInDistance(null)).toBe("?")
  })
})
