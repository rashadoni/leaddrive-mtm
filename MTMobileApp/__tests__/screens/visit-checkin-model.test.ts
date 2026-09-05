import {
  describeCustomerDistance,
  distanceBetweenMeters,
  formatDistanceMeters,
  hasUsableCoordinates,
  IMPLAUSIBLE_DISTANCE_METERS,
  resolveCheckInPrecondition,
} from "../../src/screens/visit/visit-checkin-model"

const baku = { latitude: 40.4093, longitude: 49.8671 }
const nearbyStore = { latitude: 40.4101, longitude: 49.868 }

describe("unplanned check-in preconditions", () => {
  it("treats null, non-finite, out-of-range and 0,0 coordinates as missing", () => {
    expect(hasUsableCoordinates({ latitude: null, longitude: null })).toBe(false)
    expect(hasUsableCoordinates({ latitude: undefined, longitude: undefined })).toBe(false)
    expect(hasUsableCoordinates({ latitude: Number.NaN, longitude: 49.8 })).toBe(false)
    expect(hasUsableCoordinates({ latitude: 95, longitude: 49.8 })).toBe(false)
    expect(hasUsableCoordinates({ latitude: 0, longitude: 0 })).toBe(false)
    expect(hasUsableCoordinates(nearbyStore)).toBe(true)
  })

  it("refuses a check-in when the customer has no coordinates, even with a good GPS fix", () => {
    expect(resolveCheckInPrecondition({
      customer: { latitude: null, longitude: null },
      position: baku,
    })).toEqual({ kind: "no-coordinates" })
  })

  it("reports why the agent position is missing", () => {
    expect(resolveCheckInPrecondition({
      customer: nearbyStore,
      position: null,
      positionFailure: "permission",
    })).toEqual({ kind: "no-position", reason: "permission" })
    expect(resolveCheckInPrecondition({ customer: nearbyStore, position: null }))
      .toEqual({ kind: "no-position", reason: "gps" })
  })

  it("flags stored coordinates that put the customer thousands of kilometres away", () => {
    const nullIsland = { latitude: 0.0001, longitude: 0.0001 }
    const result = resolveCheckInPrecondition({ customer: nullIsland, position: baku })
    expect(result.kind).toBe("implausible-distance")
    if (result.kind === "implausible-distance") {
      expect(result.distanceMeters).toBeGreaterThan(IMPLAUSIBLE_DISTANCE_METERS)
    }
  })

  it("is ready with a measured distance for a plausible customer", () => {
    const result = resolveCheckInPrecondition({ customer: nearbyStore, position: baku })
    expect(result.kind).toBe("ready")
    if (result.kind === "ready") {
      expect(result.distanceMeters).toBeGreaterThan(50)
      expect(result.distanceMeters).toBeLessThan(200)
    }
  })

  it("never shows a distance for missing or suspicious coordinates in the list", () => {
    expect(describeCustomerDistance({ latitude: null, longitude: null }, baku))
      .toEqual({ state: "missing", distanceMeters: null })
    expect(describeCustomerDistance({ latitude: 0.0001, longitude: 0.0001 }, baku))
      .toEqual({ state: "suspicious", distanceMeters: null })
    expect(describeCustomerDistance(nearbyStore, null))
      .toEqual({ state: "known", distanceMeters: null })
    expect(describeCustomerDistance(nearbyStore, baku).state).toBe("known")
    expect(describeCustomerDistance(nearbyStore, baku).distanceMeters).toBeGreaterThan(0)
  })

  it("formats metres and kilometres", () => {
    expect(distanceBetweenMeters(baku, baku)).toBe(0)
    expect(formatDistanceMeters(85.4)).toBe("85 m")
    expect(formatDistanceMeters(6745700)).toBe("6745.7 km")
  })
})
