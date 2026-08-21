import {
  buildGpsRouteDocument,
  createGpsPlaybackModel,
  selectGpsPlaybackPoint,
} from "../../src/screens/gps/gps-history-model"

describe("GPS history playback model", () => {
  it("sorts real points chronologically and keeps coordinate-less records in the timeline", () => {
    const model = createGpsPlaybackModel([
      { id: "late", recordedAt: "2026-08-20T09:05:00.000Z", latitude: 40.41, longitude: 49.81 },
      { id: "missing", recordedAt: "2026-08-20T09:02:00.000Z", latitude: 40.4 },
      { id: "early", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 40.39, longitude: 49.79 },
    ])

    expect(model.timelinePoints.map((point) => point.id)).toEqual(["early", "missing", "late"])
    expect(model.timelinePoints.map((point) => point.playbackIndex)).toEqual([0, null, 1])
    expect(model.routePoints.map((point) => point.id)).toEqual(["early", "late"])
    expect(model.routeSegments.map((segment) => segment.map((point) => point.id))).toEqual([["early", "late"]])
    expect(model.excludedPointCount).toBe(1)
    expect(model.missingCoordinateCount).toBe(1)
    expect(model.invalidTimestampCount).toBe(0)
    expect(model.startedAt).toBe("2026-08-20T09:00:00.000Z")
    expect(model.endedAt).toBe("2026-08-20T09:05:00.000Z")
    expect(model.durationSeconds).toBe(300)
  })

  it("rejects coordinates outside the drawable Web Mercator range", () => {
    const model = createGpsPlaybackModel([
      { id: "north", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 89, longitude: 49.8 },
      { id: "east", recordedAt: "2026-08-20T09:01:00.000Z", latitude: 40.4, longitude: 181 },
      { id: "valid", recordedAt: "2026-08-20T09:02:00.000Z", latitude: 40.4, longitude: 49.8 },
    ])

    expect(model.routePoints.map((point) => point.id)).toEqual(["valid"])
    expect(model.excludedPointCount).toBe(2)
  })

  it("keeps records without valid time visible but excludes them from route playback", () => {
    const model = createGpsPlaybackModel([
      { id: "timed", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 40.4, longitude: 49.8 },
      { id: "untimed", recordedAt: "", latitude: 40.41, longitude: 49.81 },
    ])

    expect(model.timelinePoints.map((point) => point.id)).toEqual(["timed", "untimed"])
    expect(model.timelinePoints.map((point) => point.playbackIndex)).toEqual([0, null])
    expect(model.routePoints.map((point) => point.id)).toEqual(["timed"])
    expect(model.invalidTimestampCount).toBe(1)
    expect(model.missingCoordinateCount).toBe(0)
  })

  it("splits the drawn route at honest GPS time gaps", () => {
    const model = createGpsPlaybackModel([
      { id: "a", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 40.4, longitude: 49.8 },
      { id: "b", recordedAt: "2026-08-20T09:01:00.000Z", latitude: 40.41, longitude: 49.81 },
      { id: "c", recordedAt: "2026-08-20T09:20:00.000Z", latitude: 40.42, longitude: 49.82 },
    ], 60)

    expect(model.gapThresholdSeconds).toBe(300)
    expect(model.gpsGapCount).toBe(1)
    expect(model.routeSegments.map((segment) => segment.map((point) => point.id))).toEqual([
      ["a", "b"],
      ["c"],
    ])
  })

  it("clamps selection and reports deterministic playback progress", () => {
    const model = createGpsPlaybackModel([
      { id: "a", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 40.4, longitude: 49.8 },
      { id: "b", recordedAt: "2026-08-20T09:01:00.000Z", latitude: 40.41, longitude: 49.81 },
      { id: "c", recordedAt: "2026-08-20T09:02:00.000Z", latitude: 40.42, longitude: 49.82 },
    ])

    expect(selectGpsPlaybackPoint(model, -5)).toMatchObject({ index: 0, progress: 0, isFirst: true, isLast: false })
    expect(selectGpsPlaybackPoint(model, 1)).toMatchObject({ index: 1, progress: 0.5, isFirst: false, isLast: false })
    expect(selectGpsPlaybackPoint(model, 99)).toMatchObject({ index: 2, progress: 1, isFirst: false, isLast: true })
    expect(selectGpsPlaybackPoint(model, Number.NaN)).toMatchObject({ index: 0, progress: 0 })
  })

  it("builds a self-contained local route scheme without external map requests", () => {
    const model = createGpsPlaybackModel([
      { id: "a", recordedAt: "2026-08-20T09:00:00.000Z", latitude: 40.4, longitude: 49.8 },
      { id: "b", recordedAt: "2026-08-20T09:01:00.000Z", latitude: 40.41, longitude: 49.81 },
    ])
    const html = buildGpsRouteDocument(model.routeSegments, {
      language: "en",
      routeLabel: "GPS route",
      start: "Start",
      end: "End",
      current: "</script><script>unsafe()</script>",
      localSchemeHint: "Local route scheme",
    })

    expect(html).toContain('id="overlay"')
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("Local route scheme")
    expect(html).not.toContain("tile.openstreetmap.org")
    expect(html).not.toContain("© OpenStreetMap")
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toContain("</script><script>unsafe()")
  })
})
