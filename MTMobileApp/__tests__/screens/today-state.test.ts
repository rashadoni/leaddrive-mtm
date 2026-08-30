import {
  cachedRouteAsTodaySummary,
  localDateKey,
  selectTodayRoute,
  todayRoutePrimaryAction,
} from "../../src/screens/today/today-state"

describe("today-state", () => {
  it("uses the in-progress route for the requested local day", () => {
    const route = selectTodayRoute([
      { id: "planned", date: "2026-08-20T00:00:00.000Z", status: "PLANNED", totalPoints: 2, visitedPoints: 0 },
      {
        id: "active",
        date: "2026-08-20",
        status: "IN_PROGRESS",
        totalPoints: 3,
        points: [
          { id: "p2", orderIndex: 2, status: "PLANNED", customer: { id: "c2", name: "Clinic B" } },
          { id: "p1", orderIndex: 1, status: "VISITED", customer: { id: "c1", name: "Clinic A" } },
        ],
      },
    ], "2026-08-20")

    expect(route).toMatchObject({
      id: "active",
      version: null,
      totalPoints: 3,
      visitedPoints: 1,
      remainingPoints: 2,
      nextPoint: { id: "p2", customer: { name: "Clinic B" } },
    })
  })

  it("does not present a future or completed route as today's work", () => {
    expect(selectTodayRoute([
      { id: "done", date: "2026-08-20", status: "COMPLETED" },
      { id: "future", date: "2026-08-21", status: "PLANNED" },
    ], "2026-08-20")).toBeNull()
  })

  it("shows an own draft as a non-executable way back to planning", () => {
    const route = selectTodayRoute([
      { id: "draft", date: "2026-08-20", status: "DRAFT", version: 2, totalPoints: 1 },
    ], "2026-08-20")
    expect(route).toMatchObject({ id: "draft", status: "DRAFT", totalPoints: 1 })
    expect(todayRoutePrimaryAction(route!, "live")).toBe("open")
  })

  it("never lets a draft hide an executable planned or in-progress route", () => {
    expect(selectTodayRoute([
      { id: "draft", date: "2026-08-20", status: "DRAFT", totalPoints: 1 },
      { id: "planned", date: "2026-08-20", status: "PLANNED", totalPoints: 1 },
    ], "2026-08-20")?.id).toBe("planned")
    expect(selectTodayRoute([
      { id: "draft", date: "2026-08-20", status: "DRAFT", totalPoints: 1 },
      { id: "active", date: "2026-08-20", status: "IN_PROGRESS", totalPoints: 1 },
    ], "2026-08-20")?.id).toBe("active")
  })

  it("keeps unknown customer data unknown instead of inventing a stop", () => {
    const route = cachedRouteAsTodaySummary({
      id: "cached",
      date: "2026-08-20",
      status: "PLANNED",
      totalPoints: 1,
      visitedPoints: 0,
      points: [],
    }, "2026-08-20")

    expect(route?.remainingPoints).toBe(1)
    expect(route?.nextPoint).toBeNull()
  })

  it("formats the device-local date without a UTC day shift", () => {
    expect(localDateKey(new Date(2026, 7, 20, 1, 30))).toBe("2026-08-20")
  })

  it("offers route start only for a live planned route with a usable version", () => {
    const route = selectTodayRoute([
      { id: "planned", date: "2026-08-20", status: "PLANNED", version: 4, totalPoints: 1 },
    ], "2026-08-20")
    expect(route).not.toBeNull()
    expect(todayRoutePrimaryAction(route!, "live")).toBe("start")
    expect(todayRoutePrimaryAction(route!, "cached")).toBe("open")
    expect(todayRoutePrimaryAction({ ...route!, version: null }, "live")).toBe("open")
    expect(todayRoutePrimaryAction({ ...route!, totalPoints: 0 }, "live")).toBe("open")
  })
})
