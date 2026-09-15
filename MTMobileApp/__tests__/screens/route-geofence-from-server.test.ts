import fs from "fs"
import path from "path"

/**
 * E2E on a Redmi Pad SE, 2026-09-15: the app refused a check-in at «ən çox
 * 100 m» while the organization's zone was 250 m. The zone comes from the
 * server's route point (geofenceRadiusMeters); 100 m is only a fallback.
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

describe("route check-in uses the server's zone", () => {
  it("never compares a distance with the bare fallback", () => {
    const uses = source.split("\n").filter((line) => line.includes("GEOFENCE_DEFAULT"))
    expect(uses.map((line) => line.trim())).toEqual([
      "const GEOFENCE_DEFAULT = 100",
      'return typeof radius === "number" && Number.isFinite(radius) && radius > 0 ? radius : GEOFENCE_DEFAULT',
      "function distanceColor(meters: number, radius: number = GEOFENCE_DEFAULT): string {",
    ])
  })

  it("blocks and explains with the point's radius", () => {
    expect(source).toContain("measuredDistance > checkInRadiusMeters(point))")
    expect(source.match(/max: checkInRadiusMeters\(point\) \}/g)).toHaveLength(2)
  })
})
