jest.mock("../../src/services/api", () => ({ api: { requestLegacy: jest.fn().mockResolvedValue({ success: true }) } }))

import fs from "fs"
import path from "path"
import {
  ATTENDANCE_REJECT_NOTE_MIN,
  attendanceDecisionRefusal,
  attendanceKindLabel,
  attendancePeriod,
  toApprovals,
  toAttendanceApprovals,
} from "../../src/services/manager-approvals"
import { api } from "../../src/services/api"
import { managerApi } from "../../src/services/manager-api"
import { mobileResources } from "../../src/i18n/mobile-resources"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

/** An item as GET /mobile/manager/approvals sends it in `data.attendance` (leaddrive-v2 #841). */
const leave = {
  id: "8d0f7a8e-0000-4000-8000-000000000001",
  clientRequestId: "c-1",
  agentId: "agent-1",
  status: "PENDING",
  startDate: "2026-10-20",
  endDate: "2026-10-22",
  reason: " Ailə səfəri ",
  submittedAt: "2026-10-17T08:00:00.000Z",
  decisionNote: null,
  decidedAt: null,
  cancelledAt: null,
  version: "2026-10-17T08:00:00.123Z",
  employeeName: "Aylin Demo",
  teamName: "Bakı",
  reviewerName: null,
  details: { version: 1, kind: "ANNUAL_LEAVE", unit: "DAYS", startTime: null, endTime: null, timezone: "Asia/Baku", dayKind: null, attachmentIds: [] },
}
const hourly = {
  ...leave,
  id: "8d0f7a8e-0000-4000-8000-000000000002",
  startDate: "2026-10-18",
  endDate: "2026-10-18",
  reason: null,
  teamName: null,
  details: { ...leave.details, kind: "HOURLY_ABSENCE", unit: "HOURS", startTime: "10:00", endTime: "12:30", dayKind: { code: "DOCTOR", names: { az: "Həkim qəbulu", ru: "Приём у врача", en: "Doctor's visit" } } },
}

const dictionary = (locale: Record<string, any>, shell: Record<string, any>) => (key: string): string =>
  key.split(".").reduce<any>((node, part) => node?.[part], { ...locale, managerShell: shell }) ?? key

describe("Personnel requests in the manager's approvals", () => {
  it("reads the pending requests with the version the decision must carry back", () => {
    const items = toAttendanceApprovals({ attendance: [leave, hourly, { ...leave, id: "decided", status: "APPROVED" }, { ...leave, id: "no-version", version: null }] })
    expect(items.map((item) => item.id)).toEqual([leave.id, hourly.id])
    expect(items[0]).toEqual({
      id: leave.id, version: "2026-10-17T08:00:00.123Z", employeeName: "Aylin Demo", teamName: "Bakı", kind: "ANNUAL_LEAVE", unit: "DAYS",
      startDate: "2026-10-20", endDate: "2026-10-22", startTime: undefined, endTime: undefined, dayKindNames: undefined, reason: "Ailə səfəri",
    })
    expect(items[1]).toMatchObject({ unit: "HOURS", startTime: "10:00", endTime: "12:30", dayKindNames: { az: "Həkim qəbulu", ru: "Приём у врача", en: "Doctor's visit" } })
    expect(toAttendanceApprovals({})).toEqual([])
  })

  it("leaves the Workforce queue as it was", () => {
    expect(toApprovals({ attendance: [leave] })).toEqual({ hrm: [], routeChanges: [], customers: [], contactChanges: [], total: 0 })
  })

  it("names the kind in words: the tenant's day kind first, else the app's word", () => {
    const [annual, doctor] = toAttendanceApprovals({ attendance: [leave, hourly] })
    expect(attendanceKindLabel(annual, "az", dictionary(az, mobileResources.az.managerShell))).toBe("Məzuniyyət")
    expect(attendanceKindLabel(annual, "ru", dictionary(ru, mobileResources.ru.managerShell))).toBe("Отпуск")
    expect(attendanceKindLabel(annual, "en", dictionary(en, mobileResources.en.managerShell))).toBe("Annual leave")
    expect(attendanceKindLabel(doctor, "az-AZ", dictionary(az, mobileResources.az.managerShell))).toBe("Həkim qəbulu")
    expect(attendanceKindLabel(doctor, "ru", dictionary(ru, mobileResources.ru.managerShell))).toBe("Приём у врача")
  })

  it("gives the period as dates, and the hours when the request is by the hour", () => {
    const [annual, doctor] = toAttendanceApprovals({ attendance: [leave, hourly] })
    const day = (key: string) => `[${key}]`
    expect(attendancePeriod(annual, day)).toBe("[2026-10-20] — [2026-10-22]")
    expect(attendancePeriod(doctor, day)).toBe("[2026-10-18], 10:00–12:30")
  })

  it("sends the decision with the request's version, and a null note on approval", async () => {
    const request = api.requestLegacy as jest.Mock
    await managerApi.attendanceDecision(leave.id, "APPROVED", leave.version)
    await managerApi.attendanceDecision(leave.id, "REJECTED", leave.version, "  Bu həftə komanda boşdur  ")
    expect(request).toHaveBeenNthCalledWith(1, `/mobile/manager/attendance-requests/${leave.id}/decision`, expect.objectContaining({ method: "POST" }))
    expect(JSON.parse((request.mock.calls[0][1] as RequestInit).body as string)).toEqual({ decision: "APPROVED", version: leave.version, note: null })
    expect(JSON.parse((request.mock.calls[1][1] as RequestInit).body as string)).toEqual({ decision: "REJECTED", version: leave.version, note: "Bu həftə komanda boşdur" })
  })

  it("says each refusal in words and reloads when the request moved on", () => {
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_REQUEST_CHANGED", status: 409 })).toEqual({ key: "managerShell.attendanceChanged", reload: true })
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_REQUEST_ALREADY_DECIDED", status: 409 })).toEqual({ key: "managerShell.attendanceChanged", reload: true })
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_DECISION_FORBIDDEN", status: 403 })).toEqual({ key: "managerShell.attendanceForbidden", reload: false })
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_REQUEST_SELF_APPROVAL", status: 403 }).key).toBe("managerShell.attendanceOwnRequest")
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_REQUEST_NOT_FOUND", status: 404 })).toEqual({ key: "managerShell.decisionGone", reload: true })
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_DISABLED", status: 404 }).key).toBe("managerShell.attendanceDisabled")
    expect(attendanceDecisionRefusal({ code: "MTM_ATTENDANCE_REQUEST_FAILED", status: 500 })).toEqual({ key: "managerShell.decisionFailed", reload: false })
    expect(attendanceDecisionRefusal({ message: "REQUEST_TIMEOUT" }).key).toBe("managerShell.decisionFailed")
  })

  it.each(["ru", "en", "az"] as const)("has every sentence in %s", (locale) => {
    const shell = mobileResources[locale].managerShell as Record<string, string>
    for (const key of ["approvalsAttendance", "attendanceChanged", "attendanceForbidden", "attendanceOwnRequest", "attendanceDisabled", "attendanceReasonRequired", "decisionGone", "decisionFailed"]) {
      expect(shell[key]?.trim()).toBeTruthy()
    }
  })

  it("is on the approvals screen: counted, decided with its version, and never rejected without a reason", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/manager/ManagerWorkspaceScreen.android.tsx"), "utf8")
    expect(ATTENDANCE_REJECT_NOTE_MIN).toBe(3)
    expect(screen).toContain("setAttendance(toAttendanceApprovals(response.approvals.data))")
    expect(screen).toContain("+ doctorItems.length + attendanceItems.length")
    expect(screen).toContain("await managerApi.attendanceDecision(item.id, decision, item.version, note)")
    expect(screen).toContain('if (decision === "REJECTED" && (note?.trim().length ?? 0) < ATTENDANCE_REJECT_NOTE_MIN) {')
    expect(screen).toContain('onReject={(id) => setRejectTarget({ kind: "attendance", id })}')
    // The Workforce section stays as it was.
    expect(screen).toContain('<ApprovalSection title={t("managerShell.approvalsHrm")} items={approvals.hrm}')
  })
})
