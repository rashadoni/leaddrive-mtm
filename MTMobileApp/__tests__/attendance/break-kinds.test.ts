import { parseAttendanceBreakKinds } from "../../src/services/bootstrap"
import { attendanceBreakKindName, attendanceBreakOverLimit, attendanceBreakUsage } from "../../src/services/attendance-break-kinds"

const t = (key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ""}`
const good = { kinds: [{ id: "smoke", name: null, limitMinutes: 30, usedSeconds: 720 }, { id: "k-1a2b3c4d", name: "Zəng", limitMinutes: null, usedSeconds: 0 }], currentKindId: null }

describe("kinds of a break from bootstrap (leaddrive-v2 attendance-break-kinds.ts)", () => {
  it("takes exactly the server's shape", () => {
    expect(parseAttendanceBreakKinds(good)).toEqual(good)
    expect(parseAttendanceBreakKinds({ ...good, currentKindId: "smoke" })?.currentKindId).toBe("smoke")
  })
  it.each([
    ["no list", undefined], ["an empty list", { kinds: [], currentKindId: null }],
    ["a bad id", { kinds: [{ id: "Smoke!", name: null, limitMinutes: 30, usedSeconds: 0 }], currentKindId: null }],
    ["a limit out of range", { kinds: [{ id: "smoke", name: null, limitMinutes: 0, usedSeconds: 0 }], currentKindId: null }],
    ["negative minutes", { kinds: [{ id: "smoke", name: null, limitMinutes: 30, usedSeconds: -1 }], currentKindId: null }],
    ["an empty name", { kinds: [{ id: "smoke", name: " ", limitMinutes: 30, usedSeconds: 0 }], currentKindId: null }],
    ["a bad current kind", { ...good, currentKindId: 5 }],
  ])("drops %s: «Fasilə» stays one tap", (_label, value) => {
    expect(parseAttendanceBreakKinds(value)).toBeUndefined()
  })
  it("names a built-in kind in the app's language and keeps the company's own words", () => {
    expect(attendanceBreakKindName(good.kinds[0], t)).toBe("attendanceBreaks.kind_smoke")
    expect(attendanceBreakKindName(good.kinds[1], t)).toBe("Zəng")
  })
  it("says how much of the limit is used today", () => {
    expect(attendanceBreakUsage(good.kinds[0], t)).toBe('attendanceBreaks.used{"used":12,"limit":30}')
    expect(attendanceBreakUsage(good.kinds[1], t)).toBe("attendanceBreaks.noLimit")
    expect(attendanceBreakOverLimit(good.kinds[0])).toBe(false)
    expect(attendanceBreakOverLimit({ ...good.kinds[0], usedSeconds: 1801 })).toBe(true)
  })
})
