jest.mock("../../src/services/api", () => ({ api: { pairAttendanceDesk: jest.fn(), getAttendanceDesks: jest.fn(), revokeAttendanceDesk: jest.fn() } }))
jest.mock("../../src/services/attendance-session-guard", () => ({ guardOfficeAttendance: jest.fn() }))
import { api } from "../../src/services/api"
import { attendanceDeskRefusal, pairAttendanceDesk, readAttendanceDesks, validAttendanceDeskToken } from "../../src/services/attendance-desks"

const token = `mtmd1.${"A".repeat(43)}`
describe("pairing a desk (leaddrive-v2 attendance-desk-screen.ts)", () => {
  it("reads only a desk's own QR, never a branch code", () => {
    expect(validAttendanceDeskToken(token)).toBe(true)
    expect(validAttendanceDeskToken(`mtmq1.${"A".repeat(43)}`)).toBe(false)
    expect(validAttendanceDeskToken(`mtmd1.${"A".repeat(42)}`)).toBe(false)
    expect(validAttendanceDeskToken("https://example.invalid/mtmd1")).toBe(false)
  })
  it("sends the token once and says which branch the desk now belongs to", async () => {
    ;(api.pairAttendanceDesk as jest.Mock).mockResolvedValue({ success: true, data: { branch: { id: "b", name: "Main office" }, expiresAt: "2026-11-04T09:02:00Z" } })
    await expect(pairAttendanceDesk("scope", token)).resolves.toEqual({ branchName: "Main office" })
    expect(api.pairAttendanceDesk).toHaveBeenCalledWith(token, expect.any(Function))
    await expect(pairAttendanceDesk("scope", "nonsense")).rejects.toMatchObject({ code: "MTM_ATTENDANCE_DESK_TOKEN_INVALID" })
    expect(api.pairAttendanceDesk).toHaveBeenCalledTimes(1)
  })
  it("names the refusal so the employee knows whom to ask", () => {
    expect(attendanceDeskRefusal({ code: "MTM_ATTENDANCE_DESK_OFF" })).toBe("off")
    expect(attendanceDeskRefusal({ code: "MTM_ATTENDANCE_DESK_NO_BRANCH" })).toBe("noBranch")
    expect(attendanceDeskRefusal({ code: "MTM_ATTENDANCE_DESK_TOO_MANY" })).toBe("tooMany")
    expect(attendanceDeskRefusal(new Error("network"))).toBe("failed")
  })
  it("lists the employee's desks and drops malformed rows", async () => {
    ;(api.getAttendanceDesks as jest.Mock).mockResolvedValue({ success: true, data: { desks: [{ id: "d1", branchName: "Main office", pairedAt: "2026-11-04T09:00:00Z", lastSeenAt: null }, { id: 5 }] } })
    await expect(readAttendanceDesks("scope")).resolves.toEqual([{ id: "d1", branchName: "Main office", pairedAt: "2026-11-04T09:00:00Z", lastSeenAt: null }])
  })
})
