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
const mockAuth = { agent: officeAgent, logout: jest.fn(), switchServer: jest.fn(), serverDomain: "fictional.invalid" }
const mockBootstrap = { data: officeBootstrap() }
const mockWorkday: { activeWorkday: ActiveWorkday | null; finishedWorkday: null; hydrated: boolean } = { activeWorkday: null, finishedWorkday: null, hydrated: true }
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
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 12, useTabBarPadding: () => 24 }))
jest.mock("../../src/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }))
jest.mock("../../src/store/hints", () => ({ useHintsStore: (selector: (value: unknown) => unknown) => selector({ enabled: true, setEnabled: jest.fn() }) }))
jest.mock("../../src/i18n", () => ({ getCurrentLocale: () => "ru", setLocale: jest.fn(), SUPPORTED_LOCALES: ["az", "ru", "en"] }))
jest.mock("../../src/components/ConfirmSheet", () => () => null)
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
import AttendanceWorkdayScreen from "../../src/screens/attendance/AttendanceWorkdayScreen"
import AttendanceInboxScreen from "../../src/screens/attendance/AttendanceInboxScreen"
import ProfileScreen from "../../src/screens/profile/ProfileScreen"
import { changeAttendanceWorkday } from "../../src/services/attendance-session"
import { readAttendanceInbox, markAttendanceInboxRead } from "../../src/services/attendance-inbox"
import { allOutboxOperations } from "../../src/services/outbox"
import { api } from "../../src/services/api"
const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const notice = { id: "notice-1", title: "Fictional approval", body: "Fictional own body", createdAt: "2026-10-13T08:00:00Z", isRead: false }
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function render(Component: React.ComponentType, language = "ru") { await locale.changeLanguage(language); let tree!: TestRenderer.ReactTestRenderer; await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><Component /></I18nextProvider>) }); roots.push(tree); await settle(); return tree }
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
beforeEach(() => { jest.clearAllMocks(); mockBootstrap.data = officeBootstrap(); mockAuth.agent = { ...officeAgent }; mockWorkday.activeWorkday = null; mockWorkday.hydrated = true; mockAsk.mockResolvedValue(true); (allOutboxOperations as jest.Mock).mockResolvedValue([]); (readAttendanceInbox as jest.Mock).mockResolvedValue([notice]) })
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()) }); await settle() })
it.each(["ru","az","en"])("renders actual %s office day and sends the canonical start action", async language => {
  const tree = await render(AttendanceWorkdayScreen,language), copy = {ru,az,en}[language as "ru"|"az"|"en"].officeAttendance
  expect(text(tree)).toContain(copy.workday); expect(text(tree)).toContain(copy.noTracking); expect(text(tree)).not.toContain("officeAttendance.")
  capture(tree, `workday-${language}`)
  await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).toHaveBeenCalledWith("start")
})
it("does not allow a pending start to masquerade as confirmed or queue another action", async () => {
  mockWorkday.activeWorkday = { key: "org-fixture:office-fixture", workdayId: "wd", startedAt: "2026-10-13T08:00:00Z", syncState: "START_PENDING" }
  const tree = await render(AttendanceWorkdayScreen); expect(node(tree,"office-workday-pending")).toBeDefined(); expect(node(tree,"office-workday-action").props.disabled).toBe(true)
  await press(tree,"office-workday-action"); expect(changeAttendanceWorkday).not.toHaveBeenCalled()
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
