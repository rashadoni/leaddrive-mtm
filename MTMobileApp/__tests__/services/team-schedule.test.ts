import { teamMeetingsByDate, toTeamScheduleData } from "../../src/services/team-schedule"

describe("team schedule privacy mapper", () => {
  it("keeps only calendar-safe fields and groups meetings by date", () => {
    const data = toTeamScheduleData({
      enabled: true,
      from: "2026-08-17",
      to: "2026-08-23",
      meetings: [{
        id: "point-1",
        date: "2026-08-20",
        plannedTime: "2026-08-20T10:30:00.000Z",
        agent: { id: "agent-2", name: "Aysel Mammadova", phone: "+994-secret" },
        customer: { id: "customer-secret", name: "Mərkəzi Klinika" },
        contact: { id: "contact-secret", displayName: "Dr. Əliyev", phone: "+994-secret" },
        location: { address: "Nizami 10", city: "Bakı", latitude: 40.1, longitude: 49.8 },
        routeStatus: "PLANNED",
        pointStatus: "PENDING",
        notes: "private",
      }],
    })

    expect(data.meetings).toEqual([{
      id: "point-1",
      date: "2026-08-20",
      plannedTime: "2026-08-20T10:30:00.000Z",
      agent: { id: "agent-2", name: "Aysel Mammadova" },
      customerName: "Mərkəzi Klinika",
      contactName: "Dr. Əliyev",
      address: "Nizami 10",
      city: "Bakı",
      routeStatus: "PLANNED",
      pointStatus: "PENDING",
    }])
    expect(JSON.stringify(data)).not.toContain("secret")
    expect(JSON.stringify(data)).not.toContain("latitude")
    expect(teamMeetingsByDate(data.meetings)["2026-08-20"]).toHaveLength(1)
  })

  it("drops all meetings when company sharing is disabled", () => {
    const data = toTeamScheduleData({
      enabled: false,
      meetings: [{ id: "must-not-survive", date: "2026-08-20" }],
    })

    expect(data.enabled).toBe(false)
    expect(data.meetings).toEqual([])
  })

  it("rejects incomplete rows instead of showing invented calendar data", () => {
    const data = toTeamScheduleData({
      enabled: true,
      meetings: [
        { id: "missing-customer", date: "2026-08-20", agent: { id: "a", name: "Agent" } },
        { id: "bad-date", date: "tomorrow", agent: { id: "a", name: "Agent" }, customerName: "Clinic" },
      ],
    })

    expect(data.meetings).toEqual([])
  })
})
