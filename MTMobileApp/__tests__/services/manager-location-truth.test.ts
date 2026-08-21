import {
  formatManagerEvidenceAge,
  managerAgentTruth,
  normalizeManagerLocations,
  type ManagerTeamAgent,
} from "../../src/services/manager-location-truth"

const NOW = Date.parse("2026-08-20T12:00:00.000Z")

function agent(overrides: Partial<ManagerTeamAgent> = {}): ManagerTeamAgent {
  return {
    id: "agent-1",
    name: "Ali",
    role: "AGENT",
    isOnline: true,
    lastSeenAt: "2026-08-20T11:59:00.000Z",
    workday: { status: "STARTED" },
    ...overrides,
  }
}

describe("manager location presentation truth", () => {
  it("normalizes the current nested API contract without losing employee identity", () => {
    expect(normalizeManagerLocations([{
      id: "agent-1",
      isOnline: true,
      lastSeenAt: "2026-08-20T11:59:00.000Z",
      location: {
        latitude: 40.4093,
        longitude: 49.8671,
        accuracy: 12,
        battery: 64,
        recordedAt: "2026-08-20T11:58:00.000Z",
      },
    }])).toEqual([expect.objectContaining({
      agentId: "agent-1",
      latitude: 40.4093,
      longitude: 49.8671,
      recordedAt: "2026-08-20T11:58:00.000Z",
    })])
  })

  it("supports the legacy flat contract but rejects unidentified or invalid markers", () => {
    expect(normalizeManagerLocations([
      { agentId: "agent-1", latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:59:00.000Z" },
      { latitude: 40.5, longitude: 49.9, recordedAt: "2026-08-20T11:59:00.000Z" },
      { agentId: "agent-3", latitude: 91, longitude: 49.9, recordedAt: "2026-08-20T11:59:00.000Z" },
    ])).toHaveLength(1)
  })

  it("never borrows another employee's fresh coordinate", () => {
    const locations = normalizeManagerLocations([{
      id: "agent-2",
      isOnline: true,
      lastSeenAt: "2026-08-20T11:59:30.000Z",
      location: { latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:59:30.000Z" },
    }])

    expect(managerAgentTruth(agent(), locations, NOW)).toMatchObject({
      location: null,
      gpsFreshness: "NO_COORDINATES",
    })
  })

  it("ages an old isOnline flag to offline and labels its coordinate as historical", () => {
    const locations = normalizeManagerLocations([{
      id: "agent-1",
      isOnline: true,
      lastSeenAt: "2026-08-20T11:40:00.000Z",
      location: { latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:40:00.000Z" },
    }])

    expect(managerAgentTruth(agent({ lastSeenAt: "2026-08-20T11:40:00.000Z" }), locations, NOW)).toMatchObject({
      isOnline: false,
      gpsFreshness: "STALE",
      locationAgeMs: 20 * 60 * 1000,
    })
  })

  it("keeps app presence and coordinate freshness separate", () => {
    const locations = normalizeManagerLocations([{
      id: "agent-1",
      isOnline: true,
      lastSeenAt: "2026-08-20T11:59:00.000Z",
      location: { latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:50:00.000Z" },
    }])

    expect(managerAgentTruth(agent(), locations, NOW)).toMatchObject({
      isOnline: true,
      gpsFreshness: "DELAYED",
    })
  })

  it("does not call an employee online when the server has ended their presence", () => {
    const locations = normalizeManagerLocations([{
      id: "agent-1",
      isOnline: false,
      lastSeenAt: "2026-08-20T11:59:30.000Z",
      location: { latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:59:30.000Z" },
    }])

    expect(managerAgentTruth(agent({ isOnline: false }), locations, NOW)).toMatchObject({
      isOnline: false,
      gpsFreshness: "FRESH",
    })
  })

  it("formats evidence age in a compact, predictable unit", () => {
    expect(formatManagerEvidenceAge(42_000)).toEqual({ value: 0, unit: "minute" })
    expect(formatManagerEvidenceAge(67 * 60_000)).toEqual({ value: 1, unit: "hour" })
    expect(formatManagerEvidenceAge(72 * 60 * 60_000)).toEqual({ value: 3, unit: "day" })
  })
})
