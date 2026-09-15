import fs from "fs"
import path from "path"
import { checkInRadiusMeters } from "../../src/lib/check-in-radius"

/**
 * E2E on a Redmi Pad SE, 2026-09-15: the app refused a check-in at «ən çox
 * 100 m» while the organization's zone was 250 m.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src/screens", file), "utf8")

describe("check-in zone", () => {
  it("takes the stop's radius, then the organization's, then 100 m", () => {
    expect([
      checkInRadiusMeters(400, { checkInGeofenceRadiusMeters: 250 }),
      checkInRadiusMeters(null, { checkInGeofenceRadiusMeters: 250 }),
      checkInRadiusMeters(undefined, {}),
      checkInRadiusMeters(0, null),
      checkInRadiusMeters(Number.NaN, { checkInGeofenceRadiusMeters: -5 }),
    ]).toEqual([400, 250, 100, 100, 100])
  })

  it("route and visit screens block and explain with that zone, not a bare 100", () => {
    const route = read("route/RouteScreen.tsx")
    expect(route).toContain("measuredDistance > pointCheckInRadius(point))")
    expect(route.match(/max: pointCheckInRadius\(point\) \}/g)).toHaveLength(2)
    const visit = read("visit/VisitScreen.tsx")
    expect(visit).not.toContain("GEOFENCE_DEFAULT")
    expect(visit).toContain("if (distance > radius) {")
    expect(visit.match(/max: radius,/g)).toHaveLength(2)
  })
})
