import { computeDueDate } from "../../src/services/task-due"

const now = new Date("2026-07-20T08:30:00.000Z")

describe("computeDueDate", () => {
  it("clear returns null", () => {
    expect(computeDueDate("clear", now)).toBeNull()
  })

  it("today is set to local noon on the current day", () => {
    const d = new Date(computeDueDate("today", now)!)
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(0)
    expect(d.getDate()).toBe(now.getDate())
  })

  it("tomorrow / plus3 / week advance by the right number of days", () => {
    const base = new Date(computeDueDate("today", now)!).getTime()
    const day = 24 * 60 * 60 * 1000
    expect(Math.round((new Date(computeDueDate("tomorrow", now)!).getTime() - base) / day)).toBe(1)
    expect(Math.round((new Date(computeDueDate("plus3", now)!).getTime() - base) / day)).toBe(3)
    expect(Math.round((new Date(computeDueDate("week", now)!).getTime() - base) / day)).toBe(7)
  })

  it("month advances the month", () => {
    const iso = computeDueDate("month", now)!
    expect(new Date(iso).getMonth()).toBe((now.getMonth() + 1) % 12)
  })
})
