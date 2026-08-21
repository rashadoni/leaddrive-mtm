import {
  buildManagerLiveMapDocument,
  buildManagerLiveMapModel,
  resolveManagerLiveMapSelection,
  type ManagerLiveMapDocumentMarker,
  type ManagerLiveMapRow,
} from "../../src/screens/manager/manager-live-map"
import type {
  ManagerAgentTruth,
  ManagerLocationEvidence,
  ManagerTeamAgent,
} from "../../src/services/manager-location-truth"

function agent(id: string, name: string): ManagerTeamAgent {
  return {
    id,
    name,
    role: "AGENT",
    isOnline: true,
    lastSeenAt: "2026-08-21T09:59:00.000Z",
    workday: { status: "STARTED" },
  }
}

function location(agentId: string, latitude: number, longitude: number): ManagerLocationEvidence {
  return {
    agentId,
    latitude,
    longitude,
    accuracy: 12,
    battery: 68,
    recordedAt: "2026-08-21T09:58:00.000Z",
    lastSeenAt: "2026-08-21T09:59:00.000Z",
    isOnline: true,
  }
}

function row(
  id: string,
  name: string,
  truth: Partial<ManagerAgentTruth>,
): ManagerLiveMapRow {
  return {
    agent: agent(id, name),
    truth: {
      isOnline: true,
      lastSeenAt: "2026-08-21T09:59:00.000Z",
      location: location(id, 40.4093, 49.8671),
      gpsFreshness: "FRESH",
      locationAgeMs: 2 * 60_000,
      ...truth,
    },
  }
}

describe("manager live map truth model", () => {
  it("calls only online + fresh evidence current and labels every other coordinate last known", () => {
    const model = buildManagerLiveMapModel([
      row("current", "Current Agent", {}),
      row("offline", "Offline Agent", { isOnline: false }),
      row("delayed", "Delayed Agent", { gpsFreshness: "DELAYED", locationAgeMs: 8 * 60_000 }),
      row("stale", "Stale Agent", { gpsFreshness: "STALE", locationAgeMs: 40 * 60_000 }),
    ])

    expect(model.markers.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "current", status: "CURRENT" },
      { id: "offline", status: "LAST_KNOWN" },
      { id: "delayed", status: "LAST_KNOWN" },
      { id: "stale", status: "STALE" },
    ])
    expect(model).toMatchObject({
      totalCount: 4,
      currentCount: 1,
      lastKnownCount: 3,
      staleCount: 1,
      noCoordinatesCount: 0,
    })
  })

  it("omits employees without their own accepted coordinates", () => {
    const model = buildManagerLiveMapModel([
      row("mapped", "Mapped Agent", {}),
      row("missing", "Missing Agent", {
        location: null,
        gpsFreshness: "NO_COORDINATES",
        locationAgeMs: null,
      }),
    ])

    expect(model.markers).toHaveLength(1)
    expect(model.markers[0]).toMatchObject({ id: "mapped", latitude: 40.4093, longitude: 49.8671 })
    expect(model.noCoordinatesCount).toBe(1)
  })

  it("rejects invalid coordinates instead of inventing a marker", () => {
    const invalid = location("invalid", 91, 49.8671)
    const model = buildManagerLiveMapModel([
      row("invalid", "Invalid Agent", { location: invalid }),
    ])

    expect(model.markers).toEqual([])
    expect(model.noCoordinatesCount).toBe(1)
  })

  it("automatically selects only an unambiguous single server marker", () => {
    const current = buildManagerLiveMapModel([row("only", "Only Agent", {})]).markers
    const multiple = buildManagerLiveMapModel([
      row("first", "First Agent", {}),
      row("second", "Second Agent", {}),
    ]).markers

    expect(resolveManagerLiveMapSelection(current, null)).toBe("only")
    expect(resolveManagerLiveMapSelection(multiple, null)).toBeNull()
    expect(resolveManagerLiveMapSelection(multiple, "second")).toBe("second")
    expect(resolveManagerLiveMapSelection(current, "missing")).toBe("only")
  })

  it("builds a raster map without remote scripts, device geolocation, or raw script injection", () => {
    const marker: ManagerLiveMapDocumentMarker = {
      ...buildManagerLiveMapModel([row("safe", "</script><script>bad()</script>", {})]).markers[0],
      statusLabel: "Current position",
      ageLabel: "2 minutes ago",
    }
    const html = buildManagerLiveMapDocument([marker], {
      languageCode: "en",
      accessibilityLabel: "Team location overview",
      tapHint: "Tap a marker",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      fit: "Show all employees",
      mapLoading: "Loading map",
      mapUnavailable: "Map unavailable",
      mapAttribution: "© OpenStreetMap · © CARTO",
    })

    expect(html).toContain("ReactNativeWebView.postMessage")
    expect(html).toContain("window.__selectManagerMarker")
    expect(html).toContain("markers.length === 1 && selectedId === null")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("\\u003c/script>")
    expect(html).toContain("basemaps.cartocdn.com/light_all/")
    expect(html).toContain("© OpenStreetMap · © CARTO")
    expect(html).toContain("Map unavailable")
    expect(html).not.toContain("</script><script>bad()")
    expect(html).not.toContain("tile.openstreetmap.org")
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toContain("navigator.geolocation")
    expect(html).not.toContain("getCurrentPosition")
  })
})
