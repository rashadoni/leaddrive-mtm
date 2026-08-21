import {
  formatGpsPointTime,
  gpsDateKey,
  normalizeGpsTimeZone,
  toGpsHistory,
} from "../../src/services/gps-history"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("gps history mapping", () => {
  it("maps locations and the distance summary", () => {
    const h = toGpsHistory({
      date: "2026-07-19",
      timezone: "UTC",
      gpsIntervalSeconds: 60,
      distanceMeters: 5230,
      locations: [
        { id: "l1", recordedAt: "2026-07-19T08:00:00.000Z", latitude: 40.4, longitude: 49.8, accuracy: 12, speed: 5, battery: 88 },
        { id: "l2", recordedAt: "2026-07-19T08:01:00.000Z", latitude: 40.41, longitude: 49.81 },
      ],
    })
    expect(h.date).toBe("2026-07-19")
    expect(h.timezone).toBe("UTC")
    expect(h.distanceMeters).toBe(5230)
    expect(h.distanceKm).toBe(5.2)
    expect(h.gpsIntervalSeconds).toBe(60)
    expect(h.pointCount).toBe(2)
    expect(h.points[0]).toEqual({
      id: "l1", recordedAt: "2026-07-19T08:00:00.000Z", latitude: 40.4, longitude: 49.8, accuracy: 12, speed: 5, battery: 88,
    })
    expect(h.points[1].accuracy).toBeUndefined()
  })

  it("defaults gracefully on an empty payload", () => {
    const h = toGpsHistory({})
    expect(h.points).toEqual([])
    expect(h.distanceKm).toBe(0)
    expect(h.pointCount).toBe(0)
  })

  it("does not turn blank, null or boolean sensor values into factual zeroes", () => {
    const h = toGpsHistory({
      distanceMeters: " ",
      gpsIntervalSeconds: null,
      locations: [{
        id: "missing-values",
        recordedAt: "2026-07-19T08:00:00.000Z",
        latitude: null,
        longitude: "",
        accuracy: "  ",
        speed: false,
        battery: true,
      }, {
        id: "numeric-strings",
        recordedAt: "2026-07-19T08:01:00.000Z",
        latitude: "40.4",
        longitude: "49.8",
      }],
    })

    expect(h.distanceMeters).toBe(0)
    expect(h.gpsIntervalSeconds).toBeUndefined()
    expect(h.points[0]).toMatchObject({ id: "missing-values" })
    expect(h.points[0].latitude).toBeUndefined()
    expect(h.points[0].longitude).toBeUndefined()
    expect(h.points[0].accuracy).toBeUndefined()
    expect(h.points[0].speed).toBeUndefined()
    expect(h.points[0].battery).toBeUndefined()
    expect(h.points[1]).toMatchObject({ latitude: 40.4, longitude: 49.8 })
  })

  it("uses a validated tenant timezone for day keys and displayed point time", () => {
    const instant = new Date("2026-08-20T21:30:00.000Z")

    expect(normalizeGpsTimeZone(" Asia/Baku ")).toBe("Asia/Baku")
    expect(normalizeGpsTimeZone("Invalid/Zone")).toBeUndefined()
    expect(gpsDateKey(instant, "UTC")).toBe("2026-08-20")
    expect(gpsDateKey(instant, "Asia/Baku")).toBe("2026-08-21")
    expect(formatGpsPointTime(instant.toISOString(), "en-GB", "Asia/Baku")).toContain("01:30")
    expect(formatGpsPointTime("not-a-time", "en-GB", "Asia/Baku")).toBe("—")
  })

  describe("i18n contract", () => {
    it.each([["en", en], ["ru", ru], ["az", az]])("gpsHistory namespace + profile.gpsHistory present in %s", (_lang, locale) => {
      const ns = (locale as { gpsHistory: Record<string, unknown> }).gpsHistory
      for (const key of [
        "title",
        "today",
        "statKm",
        "empty",
        "offlineNote",
        "routeTitle",
        "routeCurrent",
        "mapLoading",
        "mapUnavailable",
        "mapAttribution",
        "pointsWithoutTime",
        "routeGaps",
        "noRecordedTime",
        "playbackTitle",
        "timelineTitle",
        "offlineTitle",
        "errorTitle",
      ]) {
        expect(typeof ns[key]).toBe("string")
        expect((ns[key] as string).length).toBeGreaterThan(0)
      }
      const prof = (locale as { profile: { gpsHistory?: unknown } }).profile
      expect(typeof prof.gpsHistory).toBe("string")
    })
  })
})
