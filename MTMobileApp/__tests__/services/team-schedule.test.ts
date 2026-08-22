import { teamMeetingsForDate, toTeamSchedule } from "../../src/services/team-schedule"

describe("team schedule mapper", () => {
  it("fails closed when tenant visibility is disabled", () => {
    const result = toTeamSchedule({
      enabled: false,
      scope: "DISABLED",
      meetings: [{ id: "point-1", date: "2026-08-22", agent: { name: "Aysel" }, customer: { name: "Clinic" } }],
    })

    expect(result).toEqual({ enabled: false, scope: "DISABLED", meetings: [], truncated: false })
  })

  it("keeps only the safe calendar-card fields for enabled team meetings", () => {
    const result = toTeamSchedule({
      enabled: true,
      scope: "TEAM",
      truncated: true,
      meetings: [{
        id: "point-1",
        date: "2026-08-22",
        plannedTime: "2026-08-22T10:30:00.000Z",
        agent: { id: "agent-secret", name: "Aysel" },
        customer: { id: "customer-secret", name: "Central Clinic" },
        contact: { id: "contact-secret", displayName: "Dr Aysel" },
        location: { address: "12 Nizami Street", city: "Baku", latitude: 40.4 },
      }],
    })

    expect(result).toEqual({
      enabled: true,
      scope: "TEAM",
      truncated: true,
      meetings: [{
        id: "point-1",
        date: "2026-08-22",
        plannedTime: "2026-08-22T10:30:00.000Z",
        agentName: "Aysel",
        customerName: "Central Clinic",
        contactName: "Dr Aysel",
        address: "12 Nizami Street",
        city: "Baku",
      }],
    })
    expect(teamMeetingsForDate(result, "2026-08-22")).toHaveLength(1)
    expect(teamMeetingsForDate(result, "2026-08-23")).toEqual([])
  })
})
