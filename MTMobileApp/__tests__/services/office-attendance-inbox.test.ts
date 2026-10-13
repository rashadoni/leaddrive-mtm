jest.mock("../../src/services/api", () => ({ api: { getOwnAttendanceNotifications: jest.fn(), markOwnAttendanceNotifications: jest.fn() } }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: { getState: jest.fn() } }))
import { api } from "../../src/services/api"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { setOfflineScope } from "../../src/services/offline-scope"
import { readAttendanceInbox, markAttendanceInboxRead } from "../../src/services/attendance-inbox"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
const scope = `${officeAgent.organizationId}:${officeAgent.id}`
const item = { id: "fictional-notice", title: "Own request", body: "Recorded", createdAt: "2026-10-13T08:00:00Z", isRead: false }
beforeEach(() => {
  jest.clearAllMocks(); setOfflineScope(officeAgent.organizationId, officeAgent.id)
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ isLoggedIn: true, agent: officeAgent })
  ;(useBootstrapStore.getState as jest.Mock).mockReturnValue({ data: officeBootstrap() })
})
it("projects only display fields from the own notification endpoint", async () => {
  ;(api.getOwnAttendanceNotifications as jest.Mock).mockResolvedValue({ success: true, data: { items: [{ ...item, organizationId: "private", metadata: { reason: "private", coordinates: [1, 2] } }] } })
  expect(await readAttendanceInbox(scope)).toEqual([item])
  expect(api.getOwnAttendanceNotifications).toHaveBeenCalledWith(expect.any(Function))
})
it("refuses an old account's response and a withdrawn admission before sending", async () => {
  ;(api.getOwnAttendanceNotifications as jest.Mock).mockImplementation(async () => { setOfflineScope("other", "other"); return { success: true, data: { items: [item] } } })
  await expect(readAttendanceInbox(scope)).rejects.toThrow("ATTENDANCE_ACCESS_UNAVAILABLE")
  ;(api.getOwnAttendanceNotifications as jest.Mock).mockClear()
  await expect(readAttendanceInbox(scope)).rejects.toThrow("ATTENDANCE_ACCESS_UNAVAILABLE")
  expect(api.getOwnAttendanceNotifications).not.toHaveBeenCalled()
})
it("marks exactly the selected own notice and rejects an unconfirmed write", async () => {
  ;(api.markOwnAttendanceNotifications as jest.Mock).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false })
  await markAttendanceInboxRead(scope, item.id)
  expect(api.markOwnAttendanceNotifications).toHaveBeenCalledWith([item.id], expect.any(Function))
  await expect(markAttendanceInboxRead(scope, item.id)).rejects.toThrow("ATTENDANCE_INBOX_INVALID")
})
it("rejects a malformed or unbounded list instead of treating it as an empty inbox", async () => {
  for (const items of [[{ ...item, isRead: "false" }], Array.from({ length: 101 }, () => item)]) {
    ;(api.getOwnAttendanceNotifications as jest.Mock).mockResolvedValue({ success: true, data: { items } })
    await expect(readAttendanceInbox(scope)).rejects.toThrow("ATTENDANCE_INBOX_INVALID")
  }
})
