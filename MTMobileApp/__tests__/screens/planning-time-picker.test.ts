import {
  PLANNING_TIME_PERIODS,
  planningQuickTimeSlots,
  planningTimePeriod,
  planningTimeSlots,
} from "../../src/screens/planning/planning-time-picker"

describe("route planning time picker", () => {
  it("offers practical day periods made only of supported half-hour slots", () => {
    expect(PLANNING_TIME_PERIODS).toEqual(["morning", "day", "evening", "night"])
    expect(planningTimeSlots("morning")).toEqual(["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"])
    const evening = planningTimeSlots("evening")
    expect(evening[evening.length - 1]).toBe("23:30")
    expect(planningTimeSlots("day").every((slot) => slot.endsWith(":00") || slot.endsWith(":30"))).toBe(true)
  })

  it("starts with immediate nearby alternatives instead of manual hour and minute fields", () => {
    expect(planningQuickTimeSlots("18:30")).toEqual(["18:30", "19:00", "19:30", "20:00"])
    expect(planningQuickTimeSlots("23:00")).toEqual(["23:00", "23:30"])
  })

  it("keeps malformed legacy values safe and opens their relevant period", () => {
    expect(planningTimePeriod("09:22")).toBe("morning")
    expect(planningTimePeriod("18:30")).toBe("evening")
    expect(planningTimePeriod(null)).toBe("morning")
  })
})
