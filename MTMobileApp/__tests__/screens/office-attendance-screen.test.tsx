jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
import { TimePresentation } from "../../src/attendance/ui/TimeUI"
import React from "react"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"
import az from "../../src/i18n/locales/az.json"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
import type { ActiveWorkday } from "../../src/store/workday"
const mockAuth = { isLoggedIn: true, agent: officeAgent, logout: jest.fn(), switchServer: jest.fn(), serverDomain: "fictional.invalid" }
const mockBootstrap = { data: officeBootstrap() }
const mockWorkday: { activeWorkday: ActiveWorkday | null; finishedWorkday: null; hydrated: boolean } = { activeWorkday: null, finishedWorkday: null, hydrated: true }
const mockRecovery = { operation: null, reload: jest.fn().mockResolvedValue(undefined) }
const mockDeliveries: { rows: import('../../src/services/attendance-receipt-contract').AttendanceReceiptRow[]; failed: boolean; reload: jest.Mock } = { rows: [], failed: false, reload: jest.fn() }
jest.mock("../../src/hooks/useAttendanceReceipts", () => ({ useAttendanceReceipts: () => mockDeliveries }))
jest.mock("../../src/services/attendance-own-marks", () => ({ loadOwnAttendanceMarks: jest.fn() }))
const mockQr = {available:false,receipts:[],scope:'org-fixture:office-fixture',reload:jest.fn()}
const mockInstallation={visible:false,blocked:false,own:null,pending:null,busy:false,failed:false,submit:jest.fn(),reload:jest.fn().mockResolvedValue(undefined)}
jest.mock("../../src/hooks/useAttendanceInstallation",()=>({useAttendanceInstallation:()=>mockInstallation}))
jest.mock("../../src/hooks/useAttendanceQr",()=>({useAttendanceQr:()=>mockQr}))
jest.mock("../../src/services/attendance-qr",()=>({guardAttendanceQr:jest.fn()}))
jest.mock("../../src/components/AttendanceQrScanner",()=>()=>null)

jest.mock("../../src/hooks/useAttendanceMarkRecovery", () => ({ useAttendanceMarkRecovery: () => mockRecovery }))
jest.mock("../../src/services/workday-return", () => ({ canReturnToWorkday: (policies: {workdayReturn?: boolean}) => policies?.workdayReturn === true, returnToClosedWorkday: jest.fn().mockResolvedValue("returned") }))
const mockAsk = jest.fn().mockResolvedValue(true)
jest.mock("../../src/store/auth", () => ({ useAuthStore: (selector?: (value: unknown) => unknown) => selector ? selector(mockAuth) : mockAuth }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: (selector: (value: unknown) => unknown) => selector(mockBootstrap) }))
jest.mock("../../src/store/workday", () => ({ useWorkdayStore: (selector: (value: unknown) => unknown) => selector(mockWorkday), workdayKey: (org: string, id: string) => `${org}:${id}` }))
jest.mock("../../src/services/attendance-session-guard", () => ({ officeAttendanceScope: () => "org-fixture:office-fixture", guardOfficeAttendance: jest.fn() }))
jest.mock("../../src/services/attendance-session", () => ({ changeAttendanceWorkday: jest.fn().mockResolvedValue(undefined), refreshAttendanceSession: jest.fn().mockResolvedValue(true) }))
jest.mock("../../src/services/attendance-inbox", () => ({ readAttendanceInbox: jest.fn(), markAttendanceInboxRead: jest.fn().mockResolvedValue(undefined) }))
jest.mock("../../src/services/attendance-requests", () => ({ attendanceAccessDenied: (error: {status?: number}) => [401,403,404].includes(error?.status ?? 0) }))
jest.mock("../../src/services/outbox", () => ({ allOutboxOperations: jest.fn().mockResolvedValue([]) }))
jest.mock("../../src/services/api", () => ({ api: { getProfile: jest.fn().mockResolvedValue({ success: true, data: {} }), getAlerts: jest.fn() } }))
jest.mock("../../src/services/app-feedback", () => ({ ask: (...args: unknown[]) => mockAsk(...args) }))
const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 12, useTabBarPadding: () => 24 }))
jest.mock("../../src/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }))
jest.mock("../../src/store/hints", () => ({ useHintsStore: (selector: (value: unknown) => unknown) => selector({ enabled: true, setEnabled: jest.fn() }) }))
jest.mock("../../src/i18n", () => ({ getCurrentLocale: () => "ru", setLocale: jest.fn(), SUPPORTED_LOCALES: ["az", "ru", "en"] }))
jest.mock("../../src/components/ConfirmSheet", () => () => null)
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
// The bell reads its own store and the server; these screens are tested without it.
jest.mock("../../src/components/NotificationBell", () => () => null)
// The white header's status bar reads the focus, which this navigation mock leaves out.
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
// The profile's band under the clock reads safe-area insets this test does not provide.
jest.mock("../../src/components/StatusBarBand", () => () => null)
import AttendanceQrScanner from "../../src/components/AttendanceQrScanner"
import {guardAttendanceQr} from "../../src/services/attendance-qr"
import AttendanceWorkdayScreen from "../../src/screens/attendance/AttendanceWorkdayScreen"
import AttendanceInboxScreen from "../../src/screens/attendance/AttendanceInboxScreen"
import ProfileScreen from "../../src/screens/profile/ProfileScreen"
import { returnToClosedWorkday } from "../../src/services/workday-return"
import { changeAttendanceWorkday } from "../../src/services/attendance-session"
import { readAttendanceInbox, markAttendanceInboxRead } from "../../src/services/attendance-inbox"
import { allOutboxOperations } from "../../src/services/outbox"
import { api } from "../../src/services/api"
const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const notice = { id: "notice-1", title: "Fictional approval", body: "Fictional own body", createdAt: "2026-10-13T08:00:00Z", isRead: false }
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function render(Component: React.ComponentType, language = "ru", rhythm = false) { await locale.changeLanguage(language); let tree!: TestRenderer.ReactTestRenderer; await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><TimePresentation.Provider value={rhythm}><Component /></TimePresentation.Provider></I18nextProvider>) }); roots.push(tree); await settle(); return tree }
const node = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll(item => item.props.testID === id, { deep: false })[0]
function capture(tree: TestRenderer.ReactTestRenderer, name: string) {
  const directory = process.env.MTM_ATTENDANCE_RENDER_DIR
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${name}.json`), JSON.stringify(renderedTree(tree.toJSON()), null, 2))
}
// Keep actual host nodes/styles. React elements passed as props (refreshControl)
// contain owner/context cycles and are not a serialized display subtree.
function renderedTree(value: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | string | null): unknown {
  if (value === null || typeof value === "string") return value
  if (Array.isArray(value)) return value.map(renderedTree)
  const props = Object.fromEntries(Object.entries(value.props).filter(([key]) => ["style", "testID", "disabled", "accessibilityRole", "accessibilityLabel"].includes(key)))
  return { type: value.type, props, children: value.children?.map(renderedTree) ?? null }
}
const text = (tree: TestRenderer.ReactTestRenderer) => JSON.stringify(renderedTree(tree.toJSON()))
async function press(tree: TestRenderer.ReactTestRenderer, id: string) { await act(async () => { node(tree,id).props.onPress() }); await settle() }
beforeAll(async () => { await locale.init({ lng: "ru", fallbackLng: "ru", resources: { ru: { translation: ru }, az: { translation: az }, en: { translation: en } }, interpolation: { escapeValue: false } }) })
beforeEach(() => { jest.clearAllMocks(); mockAuth.serverDomain = "fictional.invalid"; mockDeliveries.rows = []; mockDeliveries.failed = false; Object.assign(mockInstallation, {visible:false, own:null, pending:null, busy:false, failed:false}); mockQr.available = false; mockInstallation.blocked = false; mockBootstrap.data = officeBootstrap(); mockAuth.agent = { ...officeAgent }; mockWorkday.activeWorkday = null; mockWorkday.hydrated = true; mockAsk.mockResolvedValue(true); (allOutboxOperations as jest.Mock).mockResolvedValue([]); (readAttendanceInbox as jest.Mock).mockResolvedValue([notice]) })
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()) }); await settle() })
it.each(["ru","az","en"])("renders actual %s office day and sends the canonical start action", async language => {
  expect(mockBootstrap.data.manifest?.modules.routeField.enabled).toBe(false)
  expect(mockBootstrap.data.manifest?.streams).toEqual([])
  const tree = await render(AttendanceWorkdayScreen,language), copy = {ru,az,en}[language as "ru"|"az"|"en"].officeAttendance
  expect(text(tree)).toContain(copy.workday); expect(text(tree)).toContain(copy.noTracking); expect(text(tree)).not.toContain("officeAttendance.")
  capture(tree, `workday-${language}`)
  await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("start")
})
it("keeps a pending start visibly provisional while allowing the next shift action", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-13T08:00:00Z", syncState: "START_PENDING" }
  const tree = await render(AttendanceWorkdayScreen); expect(node(tree,"office-workday-pending")).toBeDefined(); expect(node(tree,"office-workday-action").props.disabled).toBe(false)
  expect(node(tree,"office-workday-correct").props.disabled).toBe(true)
  await press(tree,"office-workday-correct"); expect(mockNavigate).not.toHaveBeenCalled()
  await press(tree,"office-workday-break"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("pause")
  await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("end")
})
it("opens a scoped correction for the actual confirmed workday without submitting a request", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-13T18:00:00Z", syncState: "CONFIRMED" }
  const tree = await render(AttendanceWorkdayScreen)
  await press(tree, "office-workday-correct")
  expect(mockNavigate).toHaveBeenCalledWith("OwnRequests", { correction: expect.objectContaining({ scope: "org-fixture:office-fixture", server: "fictional.invalid", workDate: "2026-10-13", startedAt: "2026-10-13T18:00:00Z", completedAt: null }) })
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})
it("uses pause/resume and requires an explicit finish confirmation", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-13T08:00:00Z", syncState: "CONFIRMED" }
  const tree = await render(AttendanceWorkdayScreen); await press(tree,"office-workday-break"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("pause")
  mockAsk.mockResolvedValueOnce(false); await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).not.toHaveBeenCalledWith("end")
  await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("end")
})
it("ignores a finish confirmation delivered after leaving the screen", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-13T08:00:00Z", syncState: "CONFIRMED" }
  let resolve!: (value: boolean) => void; mockAsk.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const tree = await render(AttendanceWorkdayScreen); await press(tree,"office-workday-action"); await act(async () => tree.unmount()); await act(async () => resolve(true)); expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})
it.each(["ru","az","en"])("renders actual %s own inbox and persists read state through the narrow API", async language => {
  const tree = await render(AttendanceInboxScreen,language)
  expect(text(tree)).toContain({ru,az,en}[language as "ru"|"az"|"en"].officeAttendance.inbox)
  capture(tree, `inbox-${language}`)
  expect(text(tree)).toContain(notice.title); (readAttendanceInbox as jest.Mock).mockResolvedValue([{...notice,isRead:true}])
  await press(tree,"office-read-notice-1"); expect(markAttendanceInboxRead).toHaveBeenCalledWith("org-fixture:office-fixture","notice-1"); expect(node(tree,"office-read-notice-1")).toBeUndefined()
})
it.each([401,403,404])("clears private inbox content and controls after %s", async status => {
  const tree = await render(AttendanceInboxScreen); (readAttendanceInbox as jest.Mock).mockRejectedValueOnce({status}); await press(tree,"office-inbox-refresh")
  expect(text(tree)).not.toContain(notice.body); expect(node(tree,"office-inbox-unavailable")).toBeDefined()
})
it("changes already loaded attendance titles with the selected app language without reading or writing again", async () => {
  const localized = { ...notice, title: "Заявка одобрена", titleKey: "attendanceNotice.approved" }
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([localized, { ...notice, id: "legacy", title: "Legacy human message" }])
  const tree = await render(AttendanceInboxScreen, "az")
  expect(text(tree)).toContain(az.attendanceNotice.approved)
  expect(text(tree)).not.toContain(localized.title)
  const reads = (readAttendanceInbox as jest.Mock).mock.calls.length
  for (const language of ["ru", "en", "az"] as const) {
    await act(async () => { await locale.changeLanguage(language) })
    expect(text(tree)).toContain({ ru, en, az }[language].attendanceNotice.approved)
    expect(text(tree)).toContain("Legacy human message")
    expect(text(tree)).toContain(notice.body)
    expect(text(tree)).not.toContain(localized.title)
    expect(readAttendanceInbox).toHaveBeenCalledTimes(reads)
    expect(markAttendanceInboxRead).not.toHaveBeenCalled()
  }
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([{ ...localized, isRead: true }])
  await press(tree, "office-read-notice-1")
  expect(markAttendanceInboxRead).toHaveBeenCalledWith("org-fixture:office-fixture", "notice-1")
  expect(text(tree)).toContain(az.attendanceNotice.approved)
  expect(node(tree, "office-read-notice-1")).toBeUndefined()
})
it.each(["az", "ru", "en"] as const)("renders known reminder copy in %s and retains unkeyed body text", async language => {
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([
    { ...notice, title: "Stored reminder title", body: "Stored static reminder body", titleKey: "attendanceNotice.startReminder", bodyKey: "attendanceNotice.reminderBody" },
    { ...notice, id: "rejected", title: "Stored rejected title", titleKey: "attendanceNotice.rejected" },
    { ...notice, id: "cancelled", title: "Stored cancelled title", titleKey: "attendanceNotice.cancelled" },
  ])
  const tree = await render(AttendanceInboxScreen, language), copy = { az, ru, en }[language].attendanceNotice
  expect(text(tree)).toContain(copy.startReminder); expect(text(tree)).toContain(copy.reminderBody)
  expect(text(tree)).toContain(copy.rejected); expect(text(tree)).toContain(copy.cancelled)
  expect(text(tree)).toContain(notice.body)
  expect(text(tree)).not.toContain("Stored reminder"); expect(text(tree)).not.toContain("Stored static")
  expect(text(tree)).not.toContain("attendanceNotice.")
})
it("a reply after inbox unmount never starts a new mutation", async () => {
  let resolve!: (value: unknown) => void; (markAttendanceInboxRead as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const tree = await render(AttendanceInboxScreen); await press(tree,"office-read-notice-1"); await act(async () => tree.unmount()); await act(async () => resolve(undefined)); expect(markAttendanceInboxRead).toHaveBeenCalledTimes(1)
})
it("does not load field alerts for an office profile", async () => {
  const tree = await render(ProfileScreen); expect(api.getProfile).toHaveBeenCalledWith(expect.any(Function)); expect(api.getAlerts).not.toHaveBeenCalled(); expect(text(tree)).toContain("Aylin Demo")
})
it("hides private day actions when the current permission is withdrawn", async () => {
  mockBootstrap.data.policies.agentPermissions!.attendanceWorkday = false
  const tree = await render(AttendanceWorkdayScreen); expect(node(tree,"office-workday-action")).toBeUndefined(); expect(text(tree)).not.toContain("Aylin Demo")
})

function completedToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const part = (type: string) => parts.find(item => item.type === type)!.value
  mockBootstrap.data.workday = { id:'wd-today',status:'COMPLETED',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),workDate:`${part('year')}-${part('month')}-${part('day')}` }
  mockBootstrap.data.policies.workdayReturn = true
}
it.each(['ru','az','en'])('renders actual %s office return and calls the guarded existing service', async language => {
  completedToday(); const tree = await render(AttendanceWorkdayScreen, language)
  expect(node(tree,'office-workday-action')).toBeUndefined(); expect(node(tree,'office-workday-return')).toBeDefined(); capture(tree,`office-return-${language}`)
  await press(tree,'office-workday-return'); expect(returnToClosedWorkday).toHaveBeenCalledWith('org-fixture:office-fixture','wd-today',expect.any(Function))
})
it.each(['old-day','missing-policy','revoked'])('does not offer office return for %s', async reason => {
  completedToday()
  if (reason === 'old-day') mockBootstrap.data.workday!.workDate = '2020-01-01'
  if (reason === 'missing-policy') mockBootstrap.data.policies.workdayReturn = undefined
  if (reason === 'revoked') mockBootstrap.data.policies.agentPermissions!.attendanceWorkday = false
  const tree = await render(AttendanceWorkdayScreen); expect(node(tree,'office-workday-return')).toBeUndefined()
})
it.each(['locked','notToday'])('explains office return refusal %s and removes the failed action', async outcome => {
  completedToday(); (returnToClosedWorkday as jest.Mock).mockResolvedValueOnce(outcome)
  const tree = await render(AttendanceWorkdayScreen); await press(tree,'office-workday-return')
  expect(node(tree,'office-workday-return')).toBeUndefined(); expect(text(tree)).toContain(outcome === 'locked' ? ru.officeAttendance.returnLocked : ru.officeAttendance.returnNotToday)
})

it.each([
  ['MTM_ATTENDANCE_INSTALLATION_APPROVAL_REQUIRED', 'installationBody'],
  ['MTM_ATTENDANCE_INSTALLATION_APP_REQUIRED', 'appBody'],
] as const)('explains installation return refusal %s', async (code, copyKey) => {
  completedToday(); (returnToClosedWorkday as jest.Mock).mockRejectedValueOnce({code})
  const tree = await render(AttendanceWorkdayScreen); await press(tree, 'office-workday-return')
  expect(text(tree)).toContain(ru.attendanceLocation[copyKey])
  expect(text(tree)).not.toContain(ru.officeAttendance.failed)
})


it.each(["ru","az","en"])("offers optional QR in %s without replacing ordinary time actions",async language=>{
  mockQr.available=true
  const tree=await render(AttendanceWorkdayScreen,language)
  const copy={ru,az,en}[language as "ru"|"az"|"en"].attendanceQr
  expect(text(tree)).toContain(copy.optional)
  expect(text(tree)).toContain(copy.startWithoutQr)
  capture(tree,`qr-office-${language}`)
  await press(tree,"office-workday-qr")
  const scanner=tree.root.findByType(AttendanceQrScanner)
  expect(scanner.props.visible).toBe(true)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
  await act(async()=>scanner.props.onConfirm('fictional-qr'))
  expect(guardAttendanceQr).toHaveBeenCalledWith('org-fixture:office-fixture')
  expect(changeAttendanceWorkday).toHaveBeenCalledWith('start','fictional-qr')
})
it("never opens the QR camera while paused and finishes without QR",async()=>{
  mockQr.available=true
  mockWorkday.activeWorkday={key:'org-fixture:office-fixture',workdayId:'wd',startedAt:'2026-10-13T08:00:00Z',syncState:'CONFIRMED',paused:true}
  const tree=await render(AttendanceWorkdayScreen)
  expect(node(tree,'office-workday-qr').props.disabled).toBe(true)
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
  expect(text(tree)).toContain(ru.attendanceQr.breakPrivacy)
  await press(tree,'office-workday-action')
  expect(changeAttendanceWorkday).toHaveBeenCalledWith('end')
})
it("closes an open QR scanner when the day moves into a break",async()=>{
  mockQr.available=true
  mockWorkday.activeWorkday={key:'org-fixture:office-fixture',workdayId:'wd',startedAt:'2026-10-13T08:00:00Z',syncState:'CONFIRMED'}
  const tree=await render(AttendanceWorkdayScreen)
  await press(tree,'office-workday-qr')
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(true)
  mockWorkday.activeWorkday={...mockWorkday.activeWorkday,paused:true}
  await act(async()=>tree.update(<I18nextProvider i18n={locale}><AttendanceWorkdayScreen/></I18nextProvider>))
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})
it("does not offer QR for a completed day or revoked attendance",async()=>{
  mockQr.available=true;completedToday()
  const tree=await render(AttendanceWorkdayScreen)
  expect(node(tree,'office-workday-qr').props.disabled).toBe(true)
  mockBootstrap.data.policies.agentPermissions!.attendanceWorkday=false
  await act(async()=>tree.update(<I18nextProvider i18n={locale}><AttendanceWorkdayScreen/></I18nextProvider>))
  expect(node(tree,'office-workday-qr')).toBeUndefined()
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
})

it('closes the QR scanner when current installation approval becomes blocked',async()=>{
  mockQr.available=true
  const tree=await render(AttendanceWorkdayScreen)
  await press(tree,'office-workday-qr')
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(true)
  mockInstallation.blocked=true
  await act(async()=>tree.update(<I18nextProvider i18n={locale}><AttendanceWorkdayScreen/></I18nextProvider>))
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
  expect(node(tree,'office-workday-qr').props.disabled).toBe(true)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})


it.each(["ru", "az", "en"])("keeps a discoverable QR control and explains missing access in %s", async language => {
  const tree = await render(AttendanceWorkdayScreen, language)
  const copy = { ru, az, en }[language as "ru" | "az" | "en"].attendanceQr
  expect(text(tree)).toContain(copy.scan)
  expect(text(tree)).toContain(copy.notEnabled)
  expect(node(tree, 'office-workday-qr').props.disabled).toBe(true)
  await press(tree, 'office-workday-qr')
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})
it("explains why QR cannot start a new mark after completion", async () => {
  mockQr.available = true; completedToday()
  const tree = await render(AttendanceWorkdayScreen)
  expect(text(tree)).toContain(ru.attendanceQr.dayCompleted)
  expect(node(tree, 'office-workday-qr').props.disabled).toBe(true)
  await press(tree, 'office-workday-qr')
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
})
it("keeps QR visible but blocked while the phone awaits approval", async () => {
  mockQr.available = true; mockInstallation.blocked = true
  const tree = await render(AttendanceWorkdayScreen)
  expect(text(tree)).toContain(ru.attendanceQr.installationRequired)
  await press(tree, 'office-workday-qr')
  expect(tree.root.findByType(AttendanceQrScanner).props.visible).toBe(false)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})

const CompactWorkday = () => <AttendanceWorkdayScreen compact />
it.each(['ru', 'az', 'en'] as const)('keeps %s compact actions and identity visible while help and evidence wait for a tap', async language => {
  mockQr.available = true
  mockWorkday.activeWorkday = {key:'org-fixture:office-fixture',workdayId:'wd',startedAt:'2026-10-22T05:00:00Z',syncState:'CONFIRMED'}
  const tree = await render(CompactWorkday, language), copy = {ru, az, en}[language]
  expect(text(tree)).toContain(officeAgent.name)
  expect(node(tree, 'office-workday-qr').props.disabled).toBe(false)
  expect(node(tree, 'office-workday-action')).toBeDefined()
  expect(text(tree)).not.toContain(copy.officeAttendance.closeHint)
  expect(text(tree)).not.toContain(copy.officeAttendance.noTracking)
  expect(node(tree, 'attendance-mark-details-load')).toBeUndefined()
  expect(node(tree, 'attendance-evidence-disclosure').props.accessibilityState.expanded).toBe(false)
  capture(tree, `compact-workday-${language}`)
  await press(tree, 'attendance-help-disclosure')
  expect(text(tree)).toContain(copy.officeAttendance.closeHint)
  expect(text(tree)).toContain(copy.officeAttendance.noTracking)
  await press(tree, 'attendance-evidence-disclosure')
  expect(node(tree, 'attendance-mark-details-load')).toBeDefined()
  await press(tree, 'attendance-evidence-disclosure')
  expect(node(tree, 'attendance-mark-details-load')).toBeUndefined()
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})
it('keeps compact offline expiry, local capture and correction restrictions visible', async () => {
  const verifiedAt = Date.parse('2026-10-22T05:00:00Z')
  mockBootstrap.data.attendanceOffline = { verifiedAt, lastSeenAt: verifiedAt, validUntil: verifiedAt + 86400000, installation: null, location: null }
  mockWorkday.activeWorkday = { key: 'org-fixture:office-fixture', workdayId: 'wd', startedAt: '2026-10-22T05:00:00Z', syncState: 'START_PENDING' }
  const tree = await render(CompactWorkday)
  expect(text(tree)).toContain(ru.attendanceCompact.offline)
  expect(node(tree, 'office-workday-offline-until')).toBeDefined()
  expect(text(tree)).toContain('09:00')
  expect(node(tree, 'office-workday-pending')).toBeDefined()
  expect(node(tree, 'office-workday-correct').props.disabled).toBe(true)
  await press(tree, 'office-workday-correct'); expect(mockNavigate).not.toHaveBeenCalled()
  await press(tree, 'office-workday-break'); expect(changeAttendanceWorkday).toHaveBeenCalledWith('pause')
  capture(tree, 'compact-offline-pending')
})
it('keeps compact conflict and HR-review warnings visible without opening details', async () => {
  ;(allOutboxOperations as jest.Mock).mockResolvedValue([{entity:'workdays',status:'conflict'}])
  mockDeliveries.rows = [{ operationId:'one',workdayId:'wd',action:'START',occurredAt:'2026-10-22T05:00:00Z',delivery:'RECEIVED',receivedAt:'2026-10-22T06:00:00Z',review:'PENDING_REVIEW' }]
  const tree = await render(CompactWorkday)
  expect(node(tree, 'office-workday-conflict')).toBeDefined()
  expect(node(tree, 'attendance-receipts-review-summary')).toBeDefined()
  expect(node(tree, 'office-workday-action').props.disabled).toBe(true)
  expect(node(tree, 'attendance-receipt-received')).toBeUndefined()
  await press(tree, 'attendance-receipts-disclosure')
  expect(node(tree, 'attendance-receipt-received')).toBeDefined()
})
it('still requires finish confirmation and never reopens a pending offline finish in compact mode', async () => {
  mockWorkday.activeWorkday = { key:'org-fixture:office-fixture',workdayId:'wd',startedAt:'2026-10-22T05:00:00Z',syncState:'CONFIRMED' }
  const tree = await render(CompactWorkday)
  mockAsk.mockResolvedValueOnce(false); await press(tree,'office-workday-action')
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
  await press(tree,'office-workday-action'); expect(changeAttendanceWorkday).toHaveBeenCalledWith('end')
  mockWorkday.activeWorkday = {...mockWorkday.activeWorkday,syncState:'FINISH_PENDING'}
  await act(async () => tree.update(<I18nextProvider i18n={locale}><CompactWorkday /></I18nextProvider>))
  expect(node(tree,'office-workday-action')).toBeUndefined()
  expect(node(tree,'office-workday-return')).toBeUndefined()
  expect(node(tree,'office-workday-pending')).toBeDefined()
})
it('closes compact disclosures when the server changes and hides all actions on revoked access', async () => {
  mockWorkday.activeWorkday = {key:'org-fixture:office-fixture',workdayId:'wd',startedAt:'2026-10-22T05:00:00Z',syncState:'CONFIRMED'}
  const tree = await render(CompactWorkday)
  await press(tree,'attendance-evidence-disclosure')
  expect(node(tree,'attendance-mark-details-load')).toBeDefined()
  mockAuth.serverDomain = 'another-fictional.invalid'
  await act(async () => tree.update(<I18nextProvider i18n={locale}><CompactWorkday /></I18nextProvider>))
  expect(node(tree,'attendance-mark-details-load')).toBeUndefined()
  mockBootstrap.data.policies.agentPermissions!.attendanceWorkday = false
  await act(async () => tree.update(<I18nextProvider i18n={locale}><CompactWorkday /></I18nextProvider>))
  expect(text(tree)).not.toContain(officeAgent.name)
  expect(node(tree,'office-workday-qr')).toBeUndefined()
  expect(node(tree,'attendance-receipts-disclosure')).toBeUndefined()
  mockAuth.serverDomain = 'fictional.invalid'
})

it('explains an empty compact history without querying a nonexistent day or creating a mark', async () => {
  const tree = await render(CompactWorkday)
  await press(tree,'attendance-evidence-disclosure')
  expect(text(tree)).toContain(ru.attendanceMarks.empty)
  expect(node(tree,'attendance-mark-details-load')).toBeUndefined()
  expect(node(tree,'office-workday-action').props.disabled).toBe(false)
  expect(changeAttendanceWorkday).not.toHaveBeenCalled()
})

it.each(["ru", "az", "en"])("Rhythm %s inbox expands and filters without silently marking messages read", async language => {
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([notice, { ...notice, id: "read", isRead: true }])
  const tree = await render(AttendanceInboxScreen, language, true)
  await press(tree, "office-notice-open-notice-1")
  expect(text(tree)).toContain(notice.body)
  expect(markAttendanceInboxRead).not.toHaveBeenCalled()
  await press(tree, "inbox-filter-unread")
  expect(node(tree, "office-notice-read")).toBeUndefined()
  expect(node(tree, "office-notice-notice-1")).toBeDefined()
  expect(markAttendanceInboxRead).not.toHaveBeenCalled()
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([{ ...notice, isRead: true }])
  await press(tree, "office-read-notice-1")
  expect(markAttendanceInboxRead).toHaveBeenCalledWith("org-fixture:office-fixture", "notice-1")
  expect(node(tree, "office-notice-notice-1")).toBeUndefined()
  expect(text(tree)).not.toContain("attendanceRhythm.")
})
it("Rhythm profile exposes preferences first and keeps server switching behind confirmation", async () => {
  const tree = await render(ProfileScreen, "ru", true)
  expect(node(tree, "time-language-ru").props.accessibilityState.selected).toBe(true)
  expect(node(tree, "time-switch-company")).toBeUndefined()
  await press(tree, "time-connection-disclosure")
  expect(node(tree, "time-switch-company")).toBeDefined()
  await press(tree, "time-switch-company")
  expect(mockAuth.switchServer).not.toHaveBeenCalled()
  expect(mockAuth.logout).not.toHaveBeenCalled()
  expect(api.getAlerts).not.toHaveBeenCalled()
})
it("Rhythm day history only shows actual receipts for this workday and retains finish confirmation", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-22T05:00:00Z", syncState: "CONFIRMED" }
  mockDeliveries.rows = [
    { operationId: "old", workdayId: "old-day", action: "START", occurredAt: "2026-10-20T05:00:00Z", delivery: "RECEIVED", receivedAt: null, review: "NOT_REQUIRED" },
    { operationId: "today", workdayId: "wd", action: "START", occurredAt: "2026-10-22T05:00:00Z", delivery: "LOCAL", receivedAt: null, review: null },
  ]
  const Day = () => <AttendanceWorkdayScreen compact />
  const tree = await render(Day, "ru", true)
  expect(tree.root.findAll(item => item.props.testID === "time-history-local").length).toBeGreaterThan(0)
  expect(tree.root.findAll(item => item.props.testID === "time-history-received")).toHaveLength(0)
  mockAsk.mockResolvedValueOnce(false); await press(tree, "office-workday-action")
  expect(changeAttendanceWorkday).not.toHaveBeenCalledWith("end")
})
it("Rhythm never labels yesterday's device receipts as today's history", async () => {
  mockBootstrap.data.workday = { id: 'old-day', status: 'COMPLETED', startedAt: '2020-10-20T05:00:00Z', completedAt: '2020-10-20T14:00:00Z', workDate: '2020-10-20' }
  mockDeliveries.rows = [{ operationId: 'old', workdayId: 'old-day', action: 'START', occurredAt: '2020-10-20T05:00:00Z', delivery: 'RECEIVED', receivedAt: null, review: 'NOT_REQUIRED' }]
  const Day = () => <AttendanceWorkdayScreen compact />
  const tree = await render(Day, 'ru', true)
  expect(node(tree, 'time-day-history')).toBeUndefined()
})

it("Rhythm explanation notices carry a fresh action intent, and profile refresh reloads phone approval", async () => {
  ;(readAttendanceInbox as jest.Mock).mockResolvedValue([{ ...notice, explanation: true }])
  const inbox = await render(AttendanceInboxScreen, "ru", true)
  await press(inbox, "office-notice-open-notice-1"); await press(inbox, "office-explain-notice-1")
  expect(mockNavigate).toHaveBeenLastCalledWith("OwnExplanations", { answerIntent: expect.stringMatching(/^[a-f0-9-]{36}$/) })
  const first = mockNavigate.mock.calls.at(-1)![1].answerIntent
  await press(inbox, "office-explain-notice-1")
  expect(mockNavigate.mock.calls.at(-1)![1].answerIntent).not.toBe(first)
  const profile = await render(ProfileScreen, "ru", true)
  const control = profile.root.findAll(item => item.props.refreshControl?.props?.onRefresh)[0].props.refreshControl
  const reloads = mockInstallation.reload.mock.calls.length
  await act(async () => control.props.onRefresh()); await settle()
  expect(mockInstallation.reload).toHaveBeenCalledTimes(reloads + 1)
  expect(markAttendanceInboxRead).not.toHaveBeenCalled()
})
