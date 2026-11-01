import {
  dayHoursText,
  openStateAt,
  openStateText,
  proposedWeek,
  readWorkingHours,
  toHoursRequest,
} from "../../src/screens/base/organization-hours-model"

const ph = { open: "09:00", close: "20:00", breakFrom: "13:00", breakTo: "14:00" }
const raw = { 1: ph, 2: ph, 3: ph, 4: ph, 5: ph, 6: { open: "10:00", close: "16:00" }, 7: null }

/** 2026-11-05 is a Thursday. */
const at = (time: string) => new Date(`2026-11-05T${time}:00`)

describe("часы приёма in the field app", () => {
  it("reads the server's week and nothing that is not one", () => {
    expect(readWorkingHours(raw)?.[4]).toEqual(ph)
    expect(readWorkingHours(null)).toBeNull()
    expect(readWorkingHours({ ...raw, 1: { open: "20:00", close: "09:00" } })).toBeNull()
  })

  it("says whether the place is open now", () => {
    const week = readWorkingHours(raw)
    expect(openStateText(openStateAt(week, at("08:30")), "ru")).toEqual({ text: "Закрыто · откроется в 09:00", tone: "wait" })
    expect(openStateText(openStateAt(week, at("11:00")), "ru")).toEqual({ text: "Открыто · обед с 13:00", tone: "ok" })
    expect(openStateText(openStateAt(week, at("13:20")), "ru")).toEqual({ text: "Обед · откроется в 14:00", tone: "wait" })
    expect(openStateText(openStateAt(week, at("15:00")), "az").text).toBe("20:00-dək açıqdır")
    expect(openStateText(openStateAt(null, at("15:00")), "ru").tone).toBe("none")
    expect(dayHoursText(ph, "ru")).toBe("09:00–20:00 · обед 13:00–14:00")
  })

  it("builds the week the agent proposes from what he saw on the door", () => {
    const week = readWorkingHours(raw)
    const later = proposedWeek(week, 4, "time", { open: "10:00", close: "19:00", breakFrom: "", breakTo: "", allWeekdays: true })!
    expect(later[1]).toEqual({ open: "10:00", close: "19:00", breakFrom: "13:00", breakTo: "14:00" })
    expect(later[6]).toEqual({ open: "10:00", close: "16:00" })
    const closed = proposedWeek(week, 4, "closedToday", { open: "", close: "", breakFrom: "", breakTo: "", allWeekdays: false })!
    expect(closed[4]).toBeNull()
    expect(closed[3]).toEqual(ph)
    expect(proposedWeek(week, 4, "time", { open: "19:00", close: "10:00", breakFrom: "", breakTo: "", allWeekdays: false })).toBeNull()
    expect(proposedWeek(null, 2, "lunch", { open: "", close: "", breakFrom: "12:30", breakTo: "13:30", allWeekdays: false })![2]).toEqual({ open: "09:00", close: "18:00", breakFrom: "12:30", breakTo: "13:30" })
  })

  it("reads the request the server sends with the card", () => {
    expect(toHoursRequest({ id: "r1", status: "SUBMITTED", mine: true })).toEqual({ id: "r1", status: "SUBMITTED", mine: true, decisionComment: undefined })
    expect(toHoursRequest(null)).toBeNull()
  })
})
