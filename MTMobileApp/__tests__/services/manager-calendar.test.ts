import {
  calendarDateKeys,
  managerCalendarRouteTone,
  managerMonthWindow,
  managerWeekWindow,
  shiftManagerCalendarAnchor,
  toManagerCalendarData,
} from "../../src/services/manager-calendar"

describe("manager calendar", () => {
  it("builds a Monday-to-Sunday week", () => {
    expect(managerWeekWindow("2026-08-21")).toEqual({ from: "2026-08-17", to: "2026-08-23" })
  })

  it("builds the complete six-row August 2026 grid", () => {
    const window = managerMonthWindow("2026-08-21")
    expect(window).toEqual({ from: "2026-07-27", to: "2026-09-06" })
    expect(calendarDateKeys(window.from, window.to)).toHaveLength(42)
  })

  it("changes month anchors without overflowing short months", () => {
    expect(shiftManagerCalendarAnchor("2026-03-31", "month", -1)).toBe("2026-02-01")
    expect(shiftManagerCalendarAnchor("2026-03-31", "week", 1)).toBe("2026-04-07")
  })

  it("maps the protected API response and keeps older route-only responses useful", () => {
    const mapped = toManagerCalendarData({
      data: {
        from: "2026-08-17",
        to: "2026-08-23",
        agents: [{ id: "a1", name: "Aysel" }],
        routes: [
          { id: "r1", agentId: "a1", date: "2026-08-20T00:00:00.000Z", status: "PLANNED", totalPoints: 4, visitedPoints: 1, agent: { name: "Aysel" } },
          { id: "r2", agentId: "a2", date: "2026-08-21", status: "DRAFT", totalPoints: 2, agent: { name: "Farid" } },
        ],
      },
    }, { from: "x", to: "y" })

    expect(mapped.agents).toEqual([{ id: "a1", name: "Aysel" }, { id: "a2", name: "Farid" }])
    expect(mapped.routes[0]).toMatchObject({ id: "r1", date: "2026-08-20", total: 4, visited: 1 })
  })

  it("uses truthful status tones", () => {
    expect(managerCalendarRouteTone("IN_PROGRESS")).toBe("active")
    expect(managerCalendarRouteTone("COMPLETED")).toBe("done")
    expect(managerCalendarRouteTone("CANCELLED")).toBe("cancelled")
    expect(managerCalendarRouteTone("PLANNED")).toBe("planned")
  })
})
