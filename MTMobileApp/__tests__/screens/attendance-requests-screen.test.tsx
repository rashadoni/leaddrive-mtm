import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
const mockAuth = { agent: { id: "fictional-agent", organizationId: "fictional-org", role: "AGENT" } }
const mockBootstrap = { routeFieldAccess: "enabled", data: { timezone: "Asia/Baku", policies: { agentPermissions: { attendanceRequests: true } } } }
const mockGoBack = jest.fn()
const mockAsk = jest.fn().mockResolvedValue(true)
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ goBack: mockGoBack }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 12, useTabBarPadding: () => 24 }))
jest.mock("../../src/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector(mockAuth) }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: (selector: (state: unknown) => unknown) => selector(mockBootstrap) }))
jest.mock("../../src/services/app-feedback", () => ({ ask: (...args: unknown[]) => mockAsk(...args) }))
jest.mock("../../src/components/PhotoCaptureModal", () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("../../src/services/attendance-requests", () => ({
  attendanceScope: () => "fictional-org:fictional-agent", attendanceGuard: jest.fn(),
  attendanceAccessDenied: (error: { status?: number }) => [401, 403, 404].includes(error?.status ?? 0),
  cachedAttendanceRequests: jest.fn(), clearAttendanceCache: jest.fn().mockResolvedValue(undefined), loadAttendanceRequests: jest.fn(), loadAttendanceQuota: jest.fn(),
  attendanceQueued: jest.fn(), queueAttendanceRequest: jest.fn(), queueAttendanceCancellation: jest.fn(), keepAttendanceDocument: jest.fn(), removeAttendanceDocument: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("../../src/services/outbox", () => ({ retryOutboxConflict: jest.fn().mockResolvedValue("new-operation") }))
jest.mock("../../src/services/sync-engine", () => ({ runMobileSync: jest.fn().mockResolvedValue({ success: true }) }))
import * as service from "../../src/services/attendance-requests"
import { setOfflineScope } from "../../src/services/offline-scope"
import AttendanceRequestsScreen from "../../src/screens/attendance/AttendanceRequestsScreen"
import PhotoCaptureModal from "../../src/components/PhotoCaptureModal"
import type { AttendanceRequest } from "../../src/services/attendance-contract"
const locale = i18next.createInstance()
const row: AttendanceRequest = { id: "own-request", clientRequestId: "c01be938-a8bb-41e1-b08b-d1ea2394d0b3", status: "PENDING", startDate: "2026-10-14", endDate: "2026-10-14", reason: "Fictional appointment", submittedAt: "2026-10-13T08:00:00Z", decidedAt: null, decisionNote: null, cancelledAt: null, version: "2026-10-13T08:00:00Z", details: { kind: "HOURLY_ABSENCE", unit: "HOURS", startTime: "10:00", endTime: "12:00", timezone: "Asia/Baku", attachmentIds: [] } }
const data = (items: AttendanceRequest[] = [row]) => ({ items, nextCursor: null, updatedAt: "2026-10-13T08:00:00Z" })
const roots: TestRenderer.ReactTestRenderer[] = []
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function open(language = "ru") {
  await locale.changeLanguage(language)
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><AttendanceRequestsScreen /></I18nextProvider>) })
  roots.push(tree); await settle(); return tree
}
function node(tree: TestRenderer.ReactTestRenderer, id: string) { return tree.root.findAll(item => item.props.testID === id, { deep: false })[0] }
function text(tree: TestRenderer.ReactTestRenderer) { return JSON.stringify(tree.toJSON()) }
async function press(tree: TestRenderer.ReactTestRenderer, id: string) { await act(async () => { node(tree, id).props.onPress() }); await settle() }
async function type(tree: TestRenderer.ReactTestRenderer, id: string, value: string) { await act(async () => { node(tree, id).props.onChangeText(value) }); await settle() }
beforeAll(async () => { await locale.init({ lng: "ru", fallbackLng: "ru", resources: { ru: { translation: ru }, az: { translation: az }, en: { translation: en } }, interpolation: { escapeValue: false } }) })
beforeEach(() => {
  jest.clearAllMocks(); setOfflineScope("fictional-org", "fictional-agent")
  mockAuth.agent.id = "fictional-agent"; mockBootstrap.data.policies.agentPermissions.attendanceRequests = true
  ;(service.cachedAttendanceRequests as jest.Mock).mockResolvedValue(data())
  ;(service.loadAttendanceRequests as jest.Mock).mockResolvedValue(data())
  ;(service.loadAttendanceQuota as jest.Mock).mockImplementation(async (_scope, month) => ({ month, remainingMinutes: 360, remainingRequests: 2, limits: { monthlyMinutes: 480, monthlyRequests: 3, version: null }, usedMinutes: 120, usedRequests: 1 }))
  ;(service.attendanceQueued as jest.Mock).mockResolvedValue([])
  ;(service.queueAttendanceRequest as jest.Mock).mockResolvedValue({ operationId: "queued" })
  ;(service.queueAttendanceCancellation as jest.Mock).mockResolvedValue({ operationId: "cancel-queued" })
  mockAsk.mockResolvedValue(true)
})
afterEach(() => { act(() => { roots.splice(0).forEach(tree => tree.unmount()) }) })
it.each(["ru", "az", "en"])("renders actual %s request status, manager reply, monthly allowance and form labels", async language => {
  ;(service.loadAttendanceRequests as jest.Mock).mockResolvedValue(data([{ ...row, status: "REJECTED", decisionNote: "Fictional reviewer response", decidedAt: "2026-10-13T09:00:00Z" }]))
  const tree = await open(language)
  const dictionary = { ru, az, en }[language as "ru" | "az" | "en"].attendanceRequests
  expect(text(tree)).toContain(dictionary.title)
  expect(text(tree)).toContain(dictionary.statuses.REJECTED)
  expect(text(tree)).toContain("Fictional reviewer response")
  expect(node(tree, "attendance-cancel-own-request")).toBeUndefined()
  await press(tree, "attendance-new")
  expect(node(tree, "attendance-reason").props.accessibilityLabel).toBe(dictionary.reason)
  expect(text(tree)).not.toContain("attendanceRequests.")
})
it("submits a correction as an exact full pair and closes only after the durable queue write", async () => {
  const tree = await open()
  await press(tree, "attendance-new")
  await press(tree, "attendance-kind-TIME_CORRECTION")
  await type(tree, "attendance-startDate", "2026-10-12")
  await type(tree, "attendance-startTime", "09:10")
  await type(tree, "attendance-endTime", "18:00")
  await type(tree, "attendance-reason", "  Fictional missed finish  ")
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith("fictional-org:fictional-agent", {
    clientRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/), kind: "TIME_CORRECTION", unit: "HOURS", startDate: "2026-10-12", endDate: "2026-10-12", startTime: "09:10", endTime: "18:00", reason: "Fictional missed finish", attachmentIds: [],
  }, [])
  expect(node(tree, "attendance-form")).toBeUndefined()
})
it("rejects invalid date/time/reason locally without queueing", async () => {
  const tree = await open(); await press(tree, "attendance-new")
  await press(tree, "attendance-kind-HOURLY_ABSENCE")
  await type(tree, "attendance-startDate", "2026-02-30")
  await type(tree, "attendance-reason", "Valid fictional reason")
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
  expect(text(tree)).toContain(ru.attendanceRequests.invalid)
})
it("shows a durable offline request separately from confirmed manager status", async () => {
  ;(service.loadAttendanceRequests as jest.Mock).mockRejectedValue(new Error("offline"))
  ;(service.loadAttendanceQuota as jest.Mock).mockRejectedValue(new Error("offline"))
  ;(service.attendanceQueued as jest.Mock).mockResolvedValue([{ operationId: "queued", op: "create", status: "pending", data: { clientRequestId: "another-uuid", kind: "SICK_LEAVE", startDate: "2026-10-15", endDate: "2026-10-15", reason: "Fictional sick day" } }])
  const tree = await open()
  expect(text(tree)).toContain(ru.attendanceRequests.waitingSync)
  expect(text(tree)).toContain(ru.attendanceRequests.statuses.PENDING)
  expect(text(tree)).toContain(ru.attendanceRequests.quotaUnavailable)
  expect(node(tree, "attendance-offline")).toBeDefined()
})
it("asks before cancelling a pending request and does nothing when the agent declines", async () => {
  const tree = await open()
  mockAsk.mockResolvedValueOnce(false)
  await press(tree, "attendance-cancel-own-request")
  expect(service.queueAttendanceCancellation).not.toHaveBeenCalled()
  await press(tree, "attendance-cancel-own-request")
  expect(service.queueAttendanceCancellation).toHaveBeenCalledWith("fictional-org:fictional-agent", row)
})
it.each([401, 403, 404])("clears cached reasons and controls after %s", async status => {
  ;(service.loadAttendanceRequests as jest.Mock).mockRejectedValue({ status })
  const tree = await open()
  expect(node(tree, "attendance-unavailable")).toBeDefined()
  expect(text(tree)).not.toContain(row.reason)
  expect(node(tree, "attendance-new")).toBeUndefined()
})
it("hides the whole feature when the server has not explicitly granted it", async () => {
  mockBootstrap.data.policies.agentPermissions.attendanceRequests = false
  const tree = await open()
  expect(node(tree, "attendance-new")).toBeUndefined()
  expect(service.loadAttendanceRequests).not.toHaveBeenCalled()
})
it("does not pass watermark or GPS context to document capture", async () => {
  const tree = await open(); await press(tree, "attendance-new"); await press(tree, "attendance-photo")
  const calls = (PhotoCaptureModal as jest.Mock).mock.calls
  expect(calls[calls.length - 1][0].visible).toBe(true)
  expect(calls[calls.length - 1][0].watermark).toBeUndefined()
})
