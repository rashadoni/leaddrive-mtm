import {
  PLANNING_TIME_HOURS,
  PLANNING_TIME_MINUTES,
  planningTimeMinuteOptions,
  planningTimeParts,
  planningTimeValue,
} from "../../src/screens/planning/planning-time-picker"

describe("route planning time picker", () => {
  it("offers every hour and quarter-hour touch choice", () => {
    expect(PLANNING_TIME_HOURS).toHaveLength(24)
    expect(PLANNING_TIME_HOURS[0]).toBe("00")
    expect(PLANNING_TIME_HOURS[23]).toBe("23")
    expect(PLANNING_TIME_MINUTES).toEqual(["00", "15", "30", "45"])
  })

  it("keeps a valid existing non-quarter time instead of rounding it", () => {
    expect(planningTimeParts("09:22")).toEqual({ hour: "09", minute: "22" })
    expect(planningTimeMinuteOptions("09:22")).toEqual(["00", "15", "22", "30", "45"])
    expect(planningTimeValue("09", "22")).toBe("09:22")
  })

  it("uses the safe default only for absent or malformed values", () => {
    expect(planningTimeParts(null)).toEqual({ hour: "09", minute: "00" })
    expect(planningTimeParts("25:70")).toEqual({ hour: "09", minute: "00" })
    expect(planningTimeValue("24", "00")).toBe("09:00")
  })
})
