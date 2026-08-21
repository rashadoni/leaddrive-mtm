import { toWeekData, shiftDateKey } from "../../src/services/week"
import { mobileResources } from "../../src/i18n/mobile-resources"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("week/agenda mapping", () => {
  it("flattens the seven-day payload and summary", () => {
    const data = toWeekData({
      weekStart: "2026-07-13",
      weekEndExclusive: "2026-07-20",
      today: "2026-07-15",
      days: [
        {
          date: "2026-07-13",
          isToday: false,
          isWeekend: false,
          isWorkingDay: true,
          routes: [{ points: [{}, {}, {}] }],
          tasks: {
            total: 2,
            completed: 1,
            items: [
              {
                id: "task-1",
                title: "Send visit report",
                description: "Attach the signed form",
                status: "IN_PROGRESS",
                priority: "HIGH",
                dueDate: "2026-07-13T15:00:00.000Z",
                completedAt: null,
                customer: { id: "customer-1", name: "Clinic A" },
              },
              {
                id: "task-2",
                title: "Confirm next appointment",
                status: "COMPLETED",
                priority: "LOW",
                dueDate: "2026-07-13T17:00:00.000Z",
                completedAt: "2026-07-13T14:00:00.000Z",
                customer: null,
              },
            ],
          },
          visits: {
            total: 3,
            completed: 2,
            items: [
              { id: "vv1", status: "CHECKED_OUT", customer: { name: "Clinic A" } },
              { id: "vv2", status: "CHECKED_IN", contact: { displayName: "Dr B" } },
            ],
          },
        },
        {
          date: "2026-07-19",
          isWeekend: true,
          isWorkingDay: false,
          nonWorkingReason: "Weekend",
          routes: [],
          tasks: { total: 0, completed: 0 },
          visits: { total: 0, completed: 0 },
        },
      ],
      summary: {
        visits: 3, visitsCompleted: 2, tasks: 2, tasksCompleted: 1,
        plannedStops: 3, visitedStops: 2,
        coverage: { plannedCustomers: 3, coveredCustomers: 2, percentage: 66.7 },
      },
    })

    expect(data.weekStart).toBe("2026-07-13")
    expect(data.days).toHaveLength(2)
    expect(data.days[0]).toMatchObject({ routeCount: 1, plannedStops: 3, tasksTotal: 2, visitsCompleted: 2, isWorkingDay: true })
    expect(data.days[0].visits).toEqual([
      { id: "vv1", name: "Clinic A", status: "CHECKED_OUT", checkInAt: undefined },
      { id: "vv2", name: "Dr B", status: "CHECKED_IN", checkInAt: undefined },
    ])
    expect(data.days[0].tasks).toEqual([
      {
        id: "task-1",
        title: "Send visit report",
        description: "Attach the signed form",
        status: "IN_PROGRESS",
        priority: "HIGH",
        dueDate: "2026-07-13T15:00:00.000Z",
        completedAt: undefined,
        customer: { name: "Clinic A" },
      },
      {
        id: "task-2",
        title: "Confirm next appointment",
        description: undefined,
        status: "COMPLETED",
        priority: "LOW",
        dueDate: "2026-07-13T17:00:00.000Z",
        completedAt: "2026-07-13T14:00:00.000Z",
        customer: null,
      },
    ])
    expect(data.days[1]).toMatchObject({ isWorkingDay: false, nonWorkingReason: "Weekend", plannedStops: 0, tasks: [] })
    expect(data.summary).toEqual({
      visits: 3, visitsCompleted: 2, tasks: 2, tasksCompleted: 1, plannedStops: 3, visitedStops: 2, coveragePct: 66.7,
    })
  })

  it("defaults gracefully on an empty payload", () => {
    const data = toWeekData({})
    expect(data.days).toEqual([])
    expect(data.summary.coveragePct).toBe(0)
  })

  it("normalizes incomplete agenda tasks for TaskDetail navigation", () => {
    const data = toWeekData({
      days: [{
        date: "2026-07-15",
        tasks: { total: 1, completed: 0, items: [{ id: 42, title: null }] },
      }],
    })

    expect(data.days[0].tasks).toEqual([{
      id: "42",
      title: "",
      description: undefined,
      status: "PENDING",
      priority: "MEDIUM",
      dueDate: undefined,
      completedAt: undefined,
      customer: null,
    }])
  })
})

describe("shiftDateKey", () => {
  it("moves a date key by whole days in UTC, crossing month boundaries", () => {
    expect(shiftDateKey("2026-07-13", 7)).toBe("2026-07-20")
    expect(shiftDateKey("2026-07-13", -7)).toBe("2026-07-06")
    expect(shiftDateKey("2026-07-31", 1)).toBe("2026-08-01")
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31")
  })

  it("returns the input unchanged for an invalid date key", () => {
    expect(shiftDateKey("not-a-date", 7)).toBe("not-a-date")
  })
})

describe("week i18n contract", () => {
  const KEYS = ["title", "today", "statVisits", "stopsTemplate", "dayOff", "offlineUnavailable"] as const
  it.each([["en", en], ["ru", ru], ["az", az]])("week namespace + navV2.week present in %s", (lang, locale) => {
    const ns = (locale as { week: Record<string, unknown> }).week
    for (const key of KEYS) {
      expect(typeof ns[key]).toBe("string")
      expect((ns[key] as string).length).toBeGreaterThan(0)
    }
    const nav = (mobileResources as Record<string, { navV2: { week?: unknown } }>)[lang].navV2
    expect(typeof nav.week).toBe("string")
  })
})
