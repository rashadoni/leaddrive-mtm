import { planningMonthGrid, shiftPlanningMonth, nextPlanningWorkday } from "../../src/services/planning-month"

/**
 * Field UX audit 2026-09-05, task B8: the planner moved the date one day per
 * press — two weeks ahead was fourteen presses — weekends were not marked, and
 * the default landed on whatever today happened to be, which in the audit was
 * a Saturday.
 *
 * The arithmetic is tested without a screen because that is where this kind of
 * thing breaks: month ends, the Sunday-first/Monday-first off-by-one, and the
 * timezone drift that A1 and C2 already cost this product once each.
 */
describe("planning month grid", () => {
  it("puts the 1st under its own weekday, counting from Monday", () => {
    // 2026-09-01 is a Tuesday: one blank before it.
    const grid = planningMonthGrid("2026-09-15", "2026-09-10")
    expect(grid.slice(0, 1).every((cell) => cell.date === null)).toBe(true)
    expect(grid[1].date).toBe("2026-09-01")
    expect(grid[1].day).toBe(1)
  })

  it("gives Sunday six blanks, not none", () => {
    // 2026-11-01 is a Sunday — the classic off-by-one of a Monday-first grid.
    const grid = planningMonthGrid("2026-11-20", "2026-11-01")
    expect(grid.filter((cell) => cell.date === null)).toHaveLength(6)
    expect(grid[6].date).toBe("2026-11-01")
  })

  it("covers the whole month and no more", () => {
    const september = planningMonthGrid("2026-09-15", "2026-09-10").filter((c) => c.date)
    expect(september).toHaveLength(30)
    const february = planningMonthGrid("2028-02-10", "2028-02-01").filter((c) => c.date)
    expect(february).toHaveLength(29)
  })

  it("marks weekends, past days and today", () => {
    const grid = planningMonthGrid("2026-09-15", "2026-09-10")
    const byDate = new Map(grid.filter((c) => c.date).map((c) => [c.date as string, c]))
    expect(byDate.get("2026-09-12")?.weekend).toBe(true)
    expect(byDate.get("2026-09-13")?.weekend).toBe(true)
    expect(byDate.get("2026-09-14")?.weekend).toBe(false)
    expect(byDate.get("2026-09-09")?.past).toBe(true)
    expect(byDate.get("2026-09-10")?.past).toBe(false)
    expect(byDate.get("2026-09-10")?.today).toBe(true)
  })

  it("steps months without landing in the wrong one", () => {
    // The trap: 31 March minus one month is not 31 February.
    expect(shiftPlanningMonth("2026-03-31", -1)).toBe("2026-02-01")
    expect(shiftPlanningMonth("2026-12-15", 1)).toBe("2027-01-01")
    expect(shiftPlanningMonth("2026-01-15", -1)).toBe("2025-12-01")
  })

  it("refuses to guess when the key is not a date", () => {
    expect(planningMonthGrid("nonsense", "2026-09-10")).toEqual([])
    expect(shiftPlanningMonth("nonsense", 1)).toBe("nonsense")
    expect(nextPlanningWorkday("nonsense")).toBe("nonsense")
  })

  it("opens on today when today is a working day", () => {
    expect(nextPlanningWorkday("2026-09-10")).toBe("2026-09-10")
  })

  it("skips the weekend the auditor landed on", () => {
    // Saturday and Sunday both hand back Monday: nobody plans a route for a
    // day nobody works, and the default should cost zero presses.
    expect(nextPlanningWorkday("2026-09-12")).toBe("2026-09-14")
    expect(nextPlanningWorkday("2026-09-13")).toBe("2026-09-14")
  })
})
