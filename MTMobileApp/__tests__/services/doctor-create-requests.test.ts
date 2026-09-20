import fs from "fs"
import path from "path"
import {
  DOCTOR_REQUEST_RECENT_DAYS,
  doctorRequestLanguage,
  doctorRequestTone,
  toDoctorCreateRequestItem,
  visibleDoctorRequests,
} from "../../src/services/doctor-create-requests"

const NOW = Date.parse("2026-09-20T18:00:00.000Z")
const day = 24 * 60 * 60 * 1000

function item(overrides: Record<string, unknown> = {}) {
  return toDoctorCreateRequestItem({
    id: "r1",
    status: "SUBMITTED",
    displayName: "Dr Test 275 Aliyev",
    clinicName: "Test Klinika 275",
    ...overrides,
  })!
}

describe("doctor request status on the phone", () => {
  it("keeps only rows that carry a name and an id", () => {
    expect(toDoctorCreateRequestItem({ id: "", displayName: "Dr" })).toBeNull()
    expect(toDoctorCreateRequestItem({ id: "r1", displayName: "   " })).toBeNull()
    expect(item().displayName).toBe("Dr Test 275 Aliyev")
  })

  /**
   * A status nobody taught this build about must read as "waiting": telling an
   * agent their doctor was approved when the server said something else is the
   * one mistake that sends them to a clinic with nothing.
   */
  it("treats an unknown status as still waiting", () => {
    expect(item({ status: "ESCALATED_TO_BOARD" }).status).toBe("SUBMITTED")
    expect(item({ status: "approved" }).status).toBe("APPROVED")
  })

  it("groups statuses into what the agent should feel about them", () => {
    expect(doctorRequestTone("SUBMITTED")).toBe("waiting")
    expect(doctorRequestTone("IN_REVIEW")).toBe("waiting")
    expect(doctorRequestTone("NEEDS_INFO")).toBe("attention")
    expect(doctorRequestTone("APPROVED")).toBe("done")
    expect(doctorRequestTone("REJECTED")).toBe("refused")
    expect(doctorRequestTone("CANCELLED")).toBe("refused")
  })

  it("shows everything open and only decisions that are still news", () => {
    const rows = [
      item({ id: "open", status: "SUBMITTED" }),
      item({ id: "asked", status: "NEEDS_INFO" }),
      item({ id: "fresh", status: "APPROVED", reviewedAt: new Date(NOW - day).toISOString() }),
      item({ id: "old", status: "APPROVED", reviewedAt: new Date(NOW - (DOCTOR_REQUEST_RECENT_DAYS + 1) * day).toISOString() }),
      item({ id: "refused", status: "REJECTED", reviewedAt: new Date(NOW - 2 * day).toISOString() }),
    ]
    expect(visibleDoctorRequests(rows, NOW).map((row) => row.id)).toEqual(["open", "asked", "fresh", "refused"])
  })

  it("keeps a decision without a date out of the way", () => {
    const rows = [item({ id: "undated", status: "APPROVED" })]
    expect(visibleDoctorRequests(rows, NOW)).toEqual([])
  })

  it("never floods the screen", () => {
    const rows = Array.from({ length: 12 }, (_, index) => item({ id: `r${index}` }))
    expect(visibleDoctorRequests(rows, NOW).length).toBe(5)
  })

  it("speaks the agent's language", () => {
    expect(doctorRequestLanguage("az-AZ")).toBe("az")
    expect(doctorRequestLanguage("en-GB")).toBe("en")
    expect(doctorRequestLanguage("kk")).toBe("ru")
  })
})

describe("clients screen shows the requests", () => {
  const screen = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/base/RouteContactsList.android.tsx"),
    "utf8",
  )
  const api = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")

  it("reads the agent's own requests over the v2 boundary", () => {
    expect(api).toContain('this.request(`/mobile/route-field/contact-create-requests?limit=')
    expect(api).toContain("}, 20_000, 2)")
    expect(screen).toContain("await api.getDoctorCreateRequests(20)")
  })

  it("never lets a failed status read break the client list", () => {
    expect(screen).toContain("} catch {\n      setRequests([])\n    }")
  })

  it("renders the manager's comment with the status", () => {
    expect(screen).toContain("{requestCopy[item.status]}")
    expect(screen).toContain("{item.decisionComment}")
  })
})
