jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
import { TimePresentation } from "../../src/attendance/ui/TimeUI"
import React from "react"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
// «Mənim uçotum»: an employee HR keeps. A field agent has no own requests (owner, 2026-10-20).
const mockAuth = { serverDomain: 'fixture.invalid', agent: { id: "fictional-agent", organizationId: "fictional-org", role: "EMPLOYEE" } }
const mockBootstrap = { routeFieldAccess: "disabled", data: { timezone: "Asia/Baku", tenant: { id: "fictional-org" }, principal: { id: "fictional-agent", role: "EMPLOYEE" }, manifest: { tenant: { id: "fictional-org" }, principal: { id: "fictional-agent", role: "EMPLOYEE" } }, policies: { attendanceMarkVersion: 1, agentPermissions: { attendanceRequests: true, attendanceWorkday: true } } } }
const mockNavigate = jest.fn()
const mockAsk = jest.fn().mockResolvedValue(true)
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }))
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
  attendanceQueued: jest.fn(), queueAttendanceRequest: jest.fn(), queueAttendanceCancellation: jest.fn(), keepAttendanceDocument: jest.fn(), discardAttendanceDraftDocuments: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("../../src/services/outbox", () => ({ retryOutboxConflict: jest.fn().mockResolvedValue("new-operation") }))
jest.mock("../../src/services/sync-engine", () => ({ runMobileSync: jest.fn().mockResolvedValue({ success: true }) }))
import * as service from "../../src/services/attendance-requests"
import { setOfflineScope } from "../../src/services/offline-scope"
import AttendanceRequestsScreen from "../../src/screens/attendance/AttendanceRequestsScreen"
import PhotoCaptureModal from "../../src/components/PhotoCaptureModal"
import type { AttendanceDocument, AttendanceRequest } from "../../src/services/attendance-contract"
import { createAttendanceCorrectionIntent, type AttendanceCorrectionIntent } from '../../src/services/attendance-correction-intent'
const locale = i18next.createInstance()
const row: AttendanceRequest = { id: "own-request", clientRequestId: "c01be938-a8bb-41e1-b08b-d1ea2394d0b3", status: "PENDING", startDate: "2026-10-14", endDate: "2026-10-14", reason: "Fictional appointment", submittedAt: "2026-10-13T08:00:00Z", decidedAt: null, decisionNote: null, cancelledAt: null, version: "2026-10-13T08:00:00Z", details: { kind: "HOURLY_ABSENCE", unit: "HOURS", startTime: "10:00", endTime: "12:00", timezone: "Asia/Baku", attachmentIds: [] } }
const data = (items: AttendanceRequest[] = [row]) => ({ items, nextCursor: null, updatedAt: "2026-10-13T08:00:00Z" })
const roots: TestRenderer.ReactTestRenderer[] = []
const settle = async () => { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function open(language = "ru", correction?: AttendanceCorrectionIntent, rhythm = false) {
  await locale.changeLanguage(language)
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><TimePresentation.Provider value={rhythm}><AttendanceRequestsScreen route={{ params: { correction } }} /></TimePresentation.Provider></I18nextProvider>) })
  roots.push(tree); await settle(); return tree
}
function node(tree: TestRenderer.ReactTestRenderer, id: string) { return tree.root.findAll(item => item.props.testID === id, { deep: false })[0] }
function text(tree: TestRenderer.ReactTestRenderer) { return JSON.stringify(tree.toJSON()) }
async function press(tree: TestRenderer.ReactTestRenderer, id: string) { await act(async () => { tree.root.findAll(item => item.props.testID === id && typeof item.props.onPress === "function")[0].props.onPress() }); await settle() }
async function type(tree: TestRenderer.ReactTestRenderer, id: string, value: string) { await act(async () => { node(tree, id).props.onChangeText(value) }); await settle() }
function captureNightForm(tree: TestRenderer.ReactTestRenderer, language: string) {
  const dir = process.env.MTM_ATTENDANCE_RENDER_DIR
  if (!dir) return
  const host = (value: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | string | null): unknown => {
    if (value === null || typeof value === "string") return value
    if (Array.isArray(value)) return value.map(host)
    return { type: value.type, props: Object.fromEntries(Object.entries(value.props).filter(([key]) => ["style", "contentContainerStyle", "testID", "accessibilityRole", "accessibilityLabel", "disabled", "value", "placeholder", "multiline"].includes(key))), children: value.children?.map(host) ?? null }
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `night-correction-${language}.json`), JSON.stringify(host(tree.toJSON()), null, 2))
}
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
afterEach(async () => { act(() => { roots.splice(0).forEach(tree => tree.unmount()) }); await settle() })
it.each(['ru', 'az', 'en'])('opens the selected overnight day in the existing %s correction form without sending', async language => {
  const correction = createAttendanceCorrectionIntent('fictional-org:fictional-agent', 'fixture.invalid', 'Asia/Baku', {
    workDate: '2026-10-21', startedAt: '2026-10-21T18:00:00Z', completedAt: '2026-10-22T02:00:00Z',
  })!
  const tree = await open(language, correction)
  expect(node(tree, 'attendance-kind-TIME_CORRECTION').props.accessibilityState.selected).toBe(true)
  expect(node(tree, 'attendance-startDate').props.value).toBe('2026-10-21')
  expect(node(tree, 'attendance-endDate').props.value).toBe('2026-10-22')
  expect(node(tree, 'attendance-startTime').props.value).toBe('22:00')
  expect(node(tree, 'attendance-endTime').props.value).toBe('06:00')
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
  await type(tree, 'attendance-reason', 'Please check my finish time')
  await press(tree, 'attendance-submit')
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith('fictional-org:fictional-agent', expect.objectContaining({ kind: 'TIME_CORRECTION', startDate: '2026-10-21', endDate: '2026-10-22' }), [])
})
it('does not expose a correction intent belonging to another account', async () => {
  const correction = createAttendanceCorrectionIntent('other:employee', 'fixture.invalid', 'Asia/Baku', { startedAt: '2026-10-21T05:00:00Z' })!
  const tree = await open('ru', correction)
  expect(node(tree, 'attendance-form')).toBeUndefined()
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
})
it('preserves an existing request when a new workday correction arrives', async () => {
  const tree = await open(); await press(tree, 'attendance-new'); await type(tree, 'attendance-reason', 'Keep this existing draft')
  const correction = createAttendanceCorrectionIntent('fictional-org:fictional-agent', 'fixture.invalid', 'Asia/Baku', { startedAt: '2026-10-21T05:00:00Z' })!
  await act(async () => tree.update(<I18nextProvider i18n={locale}><TimePresentation.Provider value={false}><AttendanceRequestsScreen route={{ params: { correction } }} /></TimePresentation.Provider></I18nextProvider>)); await settle()
  expect(node(tree, 'attendance-reason').props.value).toBe('Keep this existing draft')
  expect(node(tree, 'attendance-open-correction').props.disabled).toBe(true)
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
})
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
it.each(["ru", "az", "en"])("shows %s overnight dates and queues the exact full correction", async language => {
  const tree = await open(language)
  const dictionary = { ru, az, en }[language as "ru" | "az" | "en"].attendanceRequests
  await press(tree, "attendance-new")
  await press(tree, "attendance-kind-TIME_CORRECTION")
  await type(tree, "attendance-startDate", "2026-10-12")
  await type(tree, "attendance-endDate", "2026-10-13")
  await type(tree, "attendance-startTime", "22:00")
  await type(tree, "attendance-endTime", "06:00")
  await type(tree, "attendance-reason", "Fictional overnight shift: missed finish")
  expect(node(tree, "attendance-startDate").props.accessibilityLabel).toBe(dictionary.correctionStartDate)
  expect(node(tree, "attendance-endDate").props.accessibilityLabel).toBe(dictionary.correctionEndDate)
  expect(text(tree)).toContain(dictionary.correctionDateHint)
  expect(text(tree)).not.toContain("attendanceRequests.")
  captureNightForm(tree, language)
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith("fictional-org:fictional-agent", {
    clientRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/), kind: "TIME_CORRECTION", unit: "HOURS", startDate: "2026-10-12", endDate: "2026-10-13", startTime: "22:00", endTime: "06:00", reason: "Fictional overnight shift: missed finish", attachmentIds: [],
  }, [])
  expect(node(tree, "attendance-form")).toBeUndefined()
})
it("preserves the explicit end date while changing start date or reselecting correction", async () => {
  const tree = await open(); await press(tree, "attendance-new"); await press(tree, "attendance-kind-TIME_CORRECTION")
  await type(tree, "attendance-startDate", "2026-10-12")
  await type(tree, "attendance-endDate", "2026-10-13")
  await type(tree, "attendance-startDate", "2026-10-")
  expect(node(tree, "attendance-endDate").props.value).toBe("2026-10-13")
  await type(tree, "attendance-startDate", "2026-10-11")
  await press(tree, "attendance-kind-TIME_CORRECTION")
  expect(node(tree, "attendance-endDate").props.value).toBe("2026-10-13")
  await type(tree, "attendance-startTime", "22:00"); await type(tree, "attendance-endTime", "06:00")
  await type(tree, "attendance-reason", "Fictional correction")
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
  expect(text(tree)).toContain(ru.attendanceRequests.invalid)
  await type(tree, "attendance-startDate", "2026-10-12")
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).toHaveBeenCalledTimes(1)
})
it.each(["HOURLY_ABSENCE", "OVERTIME"])("keeps %s within one day after leaving an overnight correction", async kind => {
  const tree = await open(); await press(tree, "attendance-new"); await press(tree, "attendance-kind-TIME_CORRECTION")
  await type(tree, "attendance-startDate", "2026-10-12"); await type(tree, "attendance-endDate", "2026-10-13")
  await press(tree, `attendance-kind-${kind}`)
  expect(node(tree, "attendance-endDate")).toBeUndefined()
  expect(text(tree)).not.toContain(ru.attendanceRequests.correctionDateHint)
  await type(tree, "attendance-startDate", "2026-10-14")
  await type(tree, "attendance-startTime", "10:00"); await type(tree, "attendance-endTime", "11:00")
  await type(tree, "attendance-reason", "Fictional hourly request"); await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith("fictional-org:fictional-agent", expect.objectContaining({ kind, startDate: "2026-10-14", endDate: "2026-10-14" }), [])
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
// Owner, 2026-11-01 (HRSS clip: «məzuniyyət ərizəsinin ən azı 5 gün əvvəl verilməsi tövsiyə olunur»):
// the company's notice is a note in the leave form, nothing more; without one (or an older CRM) — no note.
it.each([["ru", "Отпуск лучше просить заранее — не позже чем за 5 дн. до начала."], ["az", "Məzuniyyət ərizəsini başlanğıcdan ən azı 5 gün əvvəl verməyiniz tövsiyə olunur."]])("shows the company's leave notice in the %s leave form", async (language, expected) => {
  ;(service.loadAttendanceQuota as jest.Mock).mockImplementation(async (_scope, month) => ({ month, remainingMinutes: 360, remainingRequests: 2, usedMinutes: 120, usedRequests: 1,
    limits: { monthlyMinutes: 480, monthlyRequests: 3, leaveNoticeDays: 5, version: null } }))
  const tree = await open(language)
  await press(tree, "attendance-new")
  expect(node(tree, "attendance-leave-notice").props.children).toBe(expected)
  await press(tree, "attendance-kind-SICK_LEAVE")
  expect(node(tree, "attendance-leave-notice")).toBeUndefined()
})
it("shows no leave notice when the company set none or the CRM is older", async () => {
  const tree = await open()
  await press(tree, "attendance-new")
  expect(node(tree, "attendance-form")).toBeDefined()
  expect(node(tree, "attendance-leave-notice")).toBeUndefined()
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

const document: AttendanceDocument = { clientAttachmentId: "ed6afaf3-c410-411c-aa90-8dc5b369c9db", path: "/private/attendance-documents/ed6afaf3-c410-411c-aa90-8dc5b369c9db.jpg", scopeKey: "fictional-org:fictional-agent" }
async function capturePhoto(tree: TestRenderer.ReactTestRenderer) {
  await press(tree, "attendance-photo")
  const calls = (PhotoCaptureModal as jest.Mock).mock.calls
  await act(async () => { calls[calls.length - 1][0].onPhotoTaken("/camera/photo.jpg") })
  await settle()
}
it("releases an unsubmitted private photo on Back/unmount", async () => {
  ;(service.keepAttendanceDocument as jest.Mock).mockResolvedValueOnce(document)
  const tree = await open(); await press(tree, "attendance-new"); await capturePhoto(tree)
  expect(node(tree, "attendance-remove-0")).toBeDefined()
  await press(tree, "attendance-back")
  // Office only: «Geri» returns to the own workday tab.
  expect(mockNavigate).toHaveBeenCalledWith("OwnWorkday")
  await act(async () => { tree.unmount() }); await settle()
  expect(service.discardAttendanceDraftDocuments).toHaveBeenCalledWith([document])
})
it("also releases a private photo whose capture finishes after leaving", async () => {
  let finish!: (value: AttendanceDocument) => void
  ;(service.keepAttendanceDocument as jest.Mock).mockReturnValueOnce(new Promise(done => { finish = done }))
  const tree = await open(); await press(tree, "attendance-new"); await capturePhoto(tree)
  await act(async () => { tree.unmount() })
  expect(tree.toJSON()).toBeNull()
  await act(async () => { finish(document) }); await settle()
  expect(service.discardAttendanceDraftDocuments).toHaveBeenCalledWith([document])
})
it("waits for a pending durable write before checking whether its photos can be cleaned", async () => {
  let finish!: (value: unknown) => void
  ;(service.keepAttendanceDocument as jest.Mock).mockResolvedValueOnce(document)
  ;(service.queueAttendanceRequest as jest.Mock).mockReturnValueOnce(new Promise(done => { finish = done }))
  const tree = await open(); await press(tree, "attendance-new"); await capturePhoto(tree)
  await type(tree, "attendance-reason", "Fictional leave reason")
  await press(tree, "attendance-submit")
  await act(async () => { tree.unmount() }); await settle()
  expect(service.queueAttendanceRequest).toHaveBeenCalled()
  expect(service.discardAttendanceDraftDocuments).not.toHaveBeenCalled()
  await act(async () => { finish({ operationId: "queued" }) }); await settle()
  expect(service.discardAttendanceDraftDocuments).toHaveBeenCalledWith([document])
})
it("releases only abandoned documents when a draft is closed or access is withdrawn", async () => {
  ;(service.keepAttendanceDocument as jest.Mock).mockResolvedValue(document)
  const tree = await open(); await press(tree, "attendance-new"); await capturePhoto(tree)
  await press(tree, "attendance-close-form")
  expect(service.discardAttendanceDraftDocuments).toHaveBeenCalledWith([document])
  ;(service.discardAttendanceDraftDocuments as jest.Mock).mockClear()
  await press(tree, "attendance-new"); await capturePhoto(tree)
  mockBootstrap.data.policies.agentPermissions.attendanceRequests = false
  await act(async () => { tree.update(<I18nextProvider i18n={locale}><AttendanceRequestsScreen /></I18nextProvider>) }); await settle()
  expect(service.discardAttendanceDraftDocuments).toHaveBeenCalledWith([document])
  expect(node(tree, "attendance-unavailable")).toBeDefined()
})
it("hands confirmed queued photos to the outbox instead of releasing them on unmount", async () => {
  ;(service.keepAttendanceDocument as jest.Mock).mockResolvedValueOnce(document)
  const tree = await open(); await press(tree, "attendance-new"); await capturePhoto(tree)
  await type(tree, "attendance-reason", "Fictional leave reason")
  await press(tree, "attendance-submit")
  await act(async () => { tree.unmount() }); await settle()
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith(expect.any(String), expect.any(Object), [document])
  expect(service.discardAttendanceDraftDocuments).not.toHaveBeenCalled()
})
it.each(["ru", "az", "en"])("shows a read-only HR history record from its frozen %s catalogue name", async language => {
  const names = { az: "Xüsusi gün", ru: "Особый день", en: "Special day" }
  const hrRow: AttendanceRequest = { ...row, status: "APPROVED", details: { ...row.details, kind: "HR_RECORD", dayKind: { code: "X1", names } } }
  ;(service.loadAttendanceRequests as jest.Mock).mockResolvedValue(data([hrRow]))
  const tree = await open(language)
  const dictionary = { ru, az, en }[language as "ru" | "az" | "en"].attendanceRequests
  expect(text(tree)).toContain(`X1 · ${names[language as keyof typeof names]}`)
  expect(text(tree)).toContain(dictionary.hrRecord)
  expect(text(tree)).not.toContain("attendanceRequests.kinds.HR_RECORD")
  expect(node(tree, "attendance-cancel-own-request")).toBeUndefined()
  await press(tree, "attendance-new")
  expect(node(tree, "attendance-kind-HR_RECORD")).toBeUndefined()
  const choices = tree.root.findAll(item => typeof item.props.testID === "string" && item.props.testID.startsWith("attendance-kind-"), { deep: false })
  expect(choices).toHaveLength(8)
})
it("does not act on a cancellation confirmation returned after leaving the screen", async () => {
  let confirm!: (value: boolean) => void
  mockAsk.mockReturnValueOnce(new Promise(done => { confirm = done }))
  const tree = await open()
  await press(tree, "attendance-cancel-own-request")
  // Commit the unmount before resolving the external prompt. In one act batch,
  // the promise can resolve while React has not yet run the unmount cleanup.
  await act(async () => { tree.unmount() })
  expect(tree.toJSON()).toBeNull()
  expect(service.queueAttendanceCancellation).not.toHaveBeenCalled()
  await act(async () => { confirm(true) }); await settle()
  expect(service.queueAttendanceCancellation).not.toHaveBeenCalled()
})

it("Rhythm filters only the loaded request list and keeps the durable queue visible", async () => {
  ;(service.loadAttendanceRequests as jest.Mock).mockResolvedValue(data([row, { ...row, id: "approved", clientRequestId: "other", status: "APPROVED" }]))
  ;(service.attendanceQueued as jest.Mock).mockResolvedValue([{ operationId: "local", op: "create", status: "pending", data: { clientRequestId: "local-id", kind: "SICK_LEAVE", reason: "Offline reason", startDate: "2026-10-22", endDate: "2026-10-22" } }])
  const tree = await open("ru", undefined, true)
  expect(node(tree, "attendance-request-approved")).toBeDefined()
  await press(tree, "attendance-filter-waiting")
  expect(node(tree, "attendance-request-approved")).toBeUndefined()
  expect(node(tree, "attendance-request-own-request")).toBeDefined()
  expect(text(tree)).toContain("Offline reason")
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
})
it.each(["ru", "az", "en"])("Rhythm %s form focuses on one draft and retains the full overnight correction contract", async language => {
  const correction = createAttendanceCorrectionIntent('fictional-org:fictional-agent', 'fixture.invalid', 'Asia/Baku', { workDate: '2026-10-21', startedAt: '2026-10-21T18:00:00Z', completedAt: '2026-10-22T02:00:00Z' })!
  const tree = await open(language, correction, true)
  expect(node(tree, "attendance-list")).toBeUndefined()
  expect(node(tree, "attendance-form")).toBeDefined()
  await press(tree, "attendance-change-kind")
  expect(node(tree, "attendance-kind-TIME_CORRECTION").props.accessibilityState.selected).toBe(true)
  await press(tree, "attendance-kind-TIME_CORRECTION")
  expect(node(tree, "attendance-startDate").props.value).toBe("2026-10-21")
  expect(node(tree, "attendance-endDate").props.value).toBe("2026-10-22")
  await press(tree, "attendance-startTime"); await press(tree, "time-picker-hour-23"); await press(tree, "time-picker-minute-15"); await press(tree, "time-picker-confirm")
  await press(tree, "attendance-submit")
  expect(node(tree, "attendance-reason-error")).toBeDefined()
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
  await type(tree, "attendance-reason", "  Please check my overnight finish  ")
  await press(tree, "attendance-submit")
  expect(service.queueAttendanceRequest).toHaveBeenCalledWith("fictional-org:fictional-agent", expect.objectContaining({ kind: "TIME_CORRECTION", startDate: "2026-10-21", endDate: "2026-10-22", startTime: "23:15", endTime: "06:00", reason: "Please check my overnight finish" }), [])
  expect(node(tree, "attendance-list")).toBeDefined()
  expect(node(tree, "attendance-form")).toBeUndefined()
  expect(text(tree)).not.toContain("attendanceRhythm.")
})
it("Rhythm calendar changes civil dates without submitting or losing the reason", async () => {
  const correction = createAttendanceCorrectionIntent('fictional-org:fictional-agent', 'fixture.invalid', 'Asia/Baku', { workDate: '2026-10-21', startedAt: '2026-10-21T05:00:00Z' })!
  const tree = await open("az", correction, true)
  await type(tree, "attendance-reason", "Keep the draft")
  await press(tree, "attendance-endDate"); await press(tree, "calendar-next"); await press(tree, "calendar-2026-11-02")
  expect(node(tree, "attendance-endDate").props.value).toBe("2026-11-02")
  expect(node(tree, "attendance-startDate").props.value).toBe("2026-10-21")
  expect(node(tree, "attendance-reason").props.value).toBe("Keep the draft")
  expect(service.queueAttendanceRequest).not.toHaveBeenCalled()
  await press(tree, "attendance-close-form")
  expect(node(tree, "attendance-form")).toBeUndefined()
})
