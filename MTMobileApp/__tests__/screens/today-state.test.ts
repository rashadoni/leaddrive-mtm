import {
  cachedRouteAsTodaySummary,
  localDateKey,
  selectTodayAwaitingRoute,
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
      points: [
        { id: "p1", orderIndex: 1, status: "VISITED", customer: { name: "Clinic A" } },
        { id: "p2", orderIndex: 2, status: "PLANNED", customer: { name: "Clinic B" } },
      ],
    })
  })

  it("does not present a future or completed route as today's work", () => {
    expect(selectTodayRoute([
      { id: "done", date: "2026-08-20", status: "COMPLETED" },
      { id: "future", date: "2026-08-21", status: "PLANNED" },
    ], "2026-08-20")).toBeNull()
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

/**
 * 2026-10-07, the owner's phone. An agent whose routes a manager approves
 * built a route, started his day — and Today showed none of it: «всё ты
 * удалил, ничего не осталось». The server had sent the draft with every stop.
 */
describe("Today: a route that is saved but not approved yet", () => {
  const TODAY = "2026-10-07"
  /** A draft as `GET /routes?date=…` returns it to the agent's app. */
  const draft = (overrides: Record<string, unknown> = {}) => ({
    id: "route-1",
    date: `${TODAY}T00:00:00.000Z`,
    status: "DRAFT",
    totalPoints: 2,
    version: 4,
    points: [
      { id: "p-2", orderIndex: 1, status: "PENDING", customer: { id: "c-2", name: "Second Clinic" } },
      { id: "p-1", orderIndex: 0, status: "PENDING", customer: { id: "c-1", name: "First Clinic" } },
    ],
    ...overrides,
  })

  it("is shown with its stops in the agent's order, none of them done or next", () => {
    const route = selectTodayAwaitingRoute([draft()], TODAY)
    expect(route?.points.map((point) => point.customer?.name)).toEqual(["First Clinic", "Second Clinic"])
    expect([route?.status, route?.totalPoints, route?.visitedPoints]).toEqual(["DRAFT", 2, 0])
  })

  it("is never taken for a route that can be started", () => {
    expect(selectTodayRoute([draft()], TODAY)).toBeNull()
  })

  it("is not another day's draft, an emptied draft, or an approved route", () => {
    const others = [
      draft({ date: "2026-10-08T00:00:00.000Z" }),
      draft({ points: [], totalPoints: 0 }),
      draft({ status: "PLANNED" }),
      draft({ status: "COMPLETED" }),
    ]
    expect(others.filter((route) => selectTodayAwaitingRoute([route], TODAY))).toEqual([])
    expect([undefined, null, "routes", [null, 7]].filter((routes) => selectTodayAwaitingRoute(routes, TODAY))).toEqual([])
  })
})
