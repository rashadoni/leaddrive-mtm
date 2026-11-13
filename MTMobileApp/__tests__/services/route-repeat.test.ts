import {
  ROUTE_REPEAT_MAX_ROUTES,
  busyRouteDates,
  routeRepeatDates,
  routeRepeatDraft,
  runRouteRepeat,
  toRouteRepeatSource,
} from "../../src/services/route-repeat"

/**
 * Zeytun 2026-11-13: «клиент хочет повторяющийся маршрут: например, он каждую
 * пятницу идёт по какому-то маршруту. Чтоб мог пересоздавать». The same rule
 * as the CRM's (src/lib/mtm/route-repeat.ts there), with the same cases.
 */
const ROUTE = toRouteRepeatSource({
  id: "route-fri",
  date: "2026-11-20T00:00:00.000Z",
  name: "Klinika 3 və apteklər",
  status: "PLANNED",
  agentId: "agent-rashad",
  points: [
    { customerId: "pharmacy-92", contactId: null, orderIndex: 1, plannedTime: "2026-11-20T08:00:00.000Z" },
    { customerId: "clinic-3", contactId: "doctor-aliyeva", orderIndex: 0, plannedTime: "2026-11-20T06:00:00.000Z" },
  ],
})!

describe("which Fridays", () => {
  it("every week after the route's own day, up to the end date", () => {
    expect(routeRepeatDates({ sourceDate: "2026-11-20", today: "2026-11-13", weekday: 5, everyWeeks: 1, until: "2026-12-18" }))
      .toEqual(["2026-11-27", "2026-12-04", "2026-12-11", "2026-12-18"])
  })
  it("every other week in the route's rhythm, never today or earlier", () => {
    expect(routeRepeatDates({ sourceDate: "2026-10-30", today: "2026-11-13", weekday: 5, everyWeeks: 2, until: "2026-12-31" }))
      .toEqual(["2026-11-27", "2026-12-11", "2026-12-25"])
  })
  it("at most 26", () => {
    expect(routeRepeatDates({ sourceDate: "2026-11-20", today: "2026-11-13", weekday: 5, everyWeeks: 1, until: "2028-01-01" }))
      .toHaveLength(ROUTE_REPEAT_MAX_ROUTES)
  })
})

describe("each copy", () => {
  it("is the same stops in order, at the same time of day", () => {
    expect(routeRepeatDraft(ROUTE, "2026-12-04")).toEqual({
      agentId: "agent-rashad",
      date: "2026-12-04",
      name: "Klinika 3 və apteklər",
      points: [
        { customerId: "clinic-3", contactId: "doctor-aliyeva", plannedTime: "2026-12-04T06:00:00.000Z" },
        { customerId: "pharmacy-92", plannedTime: "2026-12-04T08:00:00.000Z" },
      ],
    })
  })
  it("a route without stops is not offered", () => {
    expect(toRouteRepeatSource({ id: "x", date: "2026-11-20T00:00:00.000Z", agentId: "a", points: [] })).toBeNull()
  })
})

describe("making them", () => {
  it("skips the busy Friday unasked, names the refused one, publishes the rest", async () => {
    const create = jest.fn(async (draft: { date: string }) => {
      if (draft.date === "2026-12-04") throw Object.assign(new Error("closed"), { code: "MTM_ROUTE_NON_WORKING_DAY" })
      return { data: { id: `r-${draft.date}`, version: 1 } }
    })
    const publishRoute = jest.fn(async () => ({}))
    const outcomes = await runRouteRepeat({
      source: ROUTE,
      dates: ["2026-11-27", "2026-12-04", "2026-12-11"],
      busyDates: busyRouteDates({ data: { routes: [
        { date: "2026-11-27T00:00:00.000Z", status: "PLANNED" },
        { date: "2026-12-11T00:00:00.000Z", status: "CANCELLED" },
      ] } }),
      publish: true,
      create,
      publishRoute,
    })
    expect(outcomes).toEqual([
      { date: "2026-11-27", result: "skipped", reason: "busy" },
      { date: "2026-12-04", result: "skipped", reason: "closedDay" },
      { date: "2026-12-11", result: "created", routeId: "r-2026-12-11", published: true },
    ])
    expect(create.mock.calls.map(([draft]) => draft.date)).toEqual(["2026-12-04", "2026-12-11"])
    expect(publishRoute).toHaveBeenCalledWith("r-2026-12-11", 1)
  })
})
