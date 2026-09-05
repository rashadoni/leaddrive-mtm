import { hasCoordinates, haversineMeters } from "../../src/lib/geo"

describe("hasCoordinates (field UX audit A1/B2)", () => {
  it("accepts a real pair", () => {
    expect(hasCoordinates({ latitude: 40.4093, longitude: 49.8671 })).toBe(true)
  })

  it("treats Null Island (0,0) as unknown, never as a location 6745 km away", () => {
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(false)
  })

  it("keeps a legitimate zero on one axis", () => {
    expect(hasCoordinates({ latitude: 0, longitude: 49.8 })).toBe(true)
  })

  it.each([
    ["null pair", { latitude: null, longitude: null }],
    ["missing longitude", { latitude: 40.4 }],
    ["undefined customer", undefined],
    ["NaN", { latitude: Number.NaN, longitude: 49.8 }],
    ["out of range", { latitude: 95, longitude: 49.8 }],
  ])("rejects %s", (_label, value) => {
    expect(hasCoordinates(value as never)).toBe(false)
  })
})

describe("haversineMeters", () => {
  it("measures the Baku city centre to the airport at roughly 20 km", () => {
    const meters = haversineMeters(40.4093, 49.8671, 40.4675, 50.0467)
    expect(meters).toBeGreaterThan(15_000)
    expect(meters).toBeLessThan(20_000)
  })
})
