import {
  copyPlanningDay,
  planningCopyTargetDates,
  type PlanningAssignedTarget,
  type PlanningTarget,
} from "../../src/services/manager-planning"

/**
 * Week planner, owner decision 2026-09-14: "copy to other days" fills the empty
 * working days with the selected day's plan. It must not guess that a target
 * valid on one date is valid on another, and must not merge into a day that
 * already has stops.
 */
const store = (id: string, date: string, time: string): PlanningAssignedTarget => ({
  key: `organization:${id}`,
  kind: "organization",
  customerId: id,
  name: `Store ${id}`,
  eligible: true,
  validOnDate: date,
  date,
  plannedTime: time,
})
const serverTarget = (id: string, date: string): PlanningTarget => ({
  key: `organization:${id}`,
  kind: "organization",
  customerId: id,
  name: `Store ${id}`,
  eligible: true,
  validOnDate: date,
})

describe("planningCopyTargetDates", () => {
  const week = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]

  it("offers the other open, empty working days only", () => {
    expect(planningCopyTargetDates({
      dates: week,
      fromDate: "2026-09-21",
      today: "2026-09-14",
      blockedDates: new Set(["2026-09-24"]),
      plannedDates: new Set(["2026-09-21", "2026-09-23"]),
    })).toEqual(["2026-09-22", "2026-09-25"])
  })

  it("never offers the past", () => {
    expect(planningCopyTargetDates({
      dates: week,
      fromDate: "2026-09-24",
      today: "2026-09-23",
      blockedDates: new Set(),
      plannedDates: new Set(),
    })).toEqual(["2026-09-23", "2026-09-25"])
  })
})

describe("copyPlanningDay", () => {
  const monday = [store("1", "2026-09-21", "2026-09-21T09:00:00.000Z"), store("2", "2026-09-21", "2026-09-21T09:30:00.000Z")]

  it("copies in order without appointment times, for targets the server confirmed on that date", () => {
    const next = copyPlanningDay(monday, monday, "2026-09-22", [serverTarget("1", "2026-09-22"), serverTarget("2", "2026-09-22")])
    const tuesday = next.filter((target) => target.date === "2026-09-22")
    expect(tuesday.map((target) => [target.key, target.plannedTime])).toEqual([
      ["organization:1", null],
      ["organization:2", null],
    ])
  })

  it("skips a target the server did not return for that date", () => {
    const next = copyPlanningDay(monday, monday, "2026-09-22", [serverTarget("2", "2026-09-22")])
    expect(next.filter((target) => target.date === "2026-09-22").map((target) => target.key)).toEqual(["organization:2"])
  })

  it("does not reuse Monday's validation for Tuesday", () => {
    // A lookup for the wrong date is not a confirmation.
    const next = copyPlanningDay(monday, monday, "2026-09-22", [serverTarget("1", "2026-09-21")])
    expect(next.filter((target) => target.date === "2026-09-22")).toEqual([])
  })
})
