import {
  PLANNING_TIME_HOURS,
  PLANNING_TIME_MINUTES,
  planningTimeParts,
  planningTimeValue,
} from "../../src/screens/planning/planning-time-picker"

describe("route planning time picker", () => {
  it("offers every hour and the supported half-hour touch choices", () => {
    expect(PLANNING_TIME_HOURS).toHaveLength(24)
    expect(PLANNING_TIME_HOURS[0]).toBe("00")
    expect(PLANNING_TIME_HOURS[23]).toBe("23")
    expect(PLANNING_TIME_MINUTES).toEqual(["00", "30"])
  })

  it("keeps the established half-hour normalization contract", () => {
    expect(planningTimeParts("09:22")).toEqual({ hour: "09", minute: "30" })
    expect(planningTimeValue("09", "30")).toBe("09:30")
  })

  it("uses the safe default only for absent or malformed values", () => {
    expect(planningTimeParts(null)).toEqual({ hour: "09", minute: "00" })
    expect(planningTimeParts("25:70")).toEqual({ hour: "09", minute: "00" })
    expect(planningTimeValue("24", "00")).toBe("09:00")
  })
})
