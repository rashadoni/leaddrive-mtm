jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
import { TimePresentation } from "../../src/attendance/ui/TimeUI"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"
import az from "../../src/i18n/locales/az.json"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"

// Owner, 2026-10-16 (approved mockup): HR asks the late and the absent to explain; the employee answers here.
const mockAuth = { agent: officeAgent }
const mockBootstrap = { data: officeBootstrap() }
const mockNavigate = jest.fn()
jest.mock("../../src/store/auth", () => ({ useAuthStore: (selector?: (value: unknown) => unknown) => selector ? selector(mockAuth) : mockAuth }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: (selector: (value: unknown) => unknown) => selector(mockBootstrap) }))
jest.mock("../../src/services/attendance-session-guard", () => ({ officeAttendanceScope: () => "org-fixture:office-fixture", guardOfficeAttendance: jest.fn() }))
jest.mock("../../src/services/attendance-requests", () => ({ attendanceAccessDenied: (error: { status?: number }) => [401, 403, 404].includes(error?.status ?? 0) }))
jest.mock("../../src/services/api", () => ({ api: { getAttendanceExplanations: jest.fn(), answerAttendanceExplanation: jest.fn() } }))
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 12, useTabBarPadding: () => 24 }))
jest.mock("../../src/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }))
import AttendanceExplanationsScreen from "../../src/screens/attendance/AttendanceExplanationsScreen"
import { api } from "../../src/services/api"
import { attendanceNoticePresentation } from "../../src/services/attendance-notice-presentation"

const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function render(language = "ru", rhythm = false, answerIntent?: string) {
  await locale.changeLanguage(language)
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><TimePresentation.Provider value={rhythm}><AttendanceExplanationsScreen route={{ params: { answerIntent } }} /></TimePresentation.Provider></I18nextProvider>) })
  roots.push(tree); await settle(); return tree
}
const node = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll(item => item.props.testID === id, { deep: false })[0]
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAllByType("Text" as never).map(item => [item.props.children].flat().join("")).join("\n")
async function press(tree: TestRenderer.ReactTestRenderer, id: string) { await act(async () => { node(tree, id).props.onPress() }); await settle() }
async function type(tree: TestRenderer.ReactTestRenderer, id: string, value: string) { await act(async () => { node(tree, id).props.onChangeText(value) }) }
const data = {
  today: "2026-10-16",
  items: [
    { id: "e1", employeeId: "office-fixture", employeeName: "Aylin Demo", date: "2026-10-16", kind: "LATE", status: "REQUESTED", lateMinutes: 25, requestedAt: "2026-10-16T06:05:00.000Z", requestedByName: "HR", answer: null, answeredAt: null, decidedAt: null, decidedByName: null },
    { id: "e2", employeeId: "office-fixture", employeeName: "Aylin Demo", date: "2026-10-10", kind: "ABSENT", status: "ACCEPTED", lateMinutes: null, requestedAt: null, requestedByName: null, answer: "Затопило квартиру", answeredAt: "2026-10-10T10:00:00.000Z", decidedAt: "2026-10-11T08:00:00.000Z", decidedByName: "HR" },
  ],
  candidates: [{ date: "2026-10-14", kind: "ABSENT", lateMinutes: null }],
}
beforeAll(async () => { await locale.init({ lng: "ru", fallbackLng: "ru", resources: { ru: { translation: ru }, az: { translation: az }, en: { translation: en } }, interpolation: { escapeValue: false } }) })
beforeEach(() => {
  jest.clearAllMocks()
  ;(api.getAttendanceExplanations as jest.Mock).mockResolvedValue({ success: true, data })
  ;(api.answerAttendanceExplanation as jest.Mock).mockImplementation(async (input: { date: string; kind: string; text: string }) => ({ success: true, data: { item: { ...data.items[0], ...input, status: "ANSWERED", answer: input.text } } }))
})
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()) }); await settle() })

it("shows what HR asked first, then the days one may explain, then what was sent", async () => {
  const tree = await render()
  const shown = texts(tree)
  expect(shown).toContain(ru.explanations.askedBadge)
  expect(shown).toContain("Опоздание 16 октября: на 25 мин")
  expect(shown).toContain(ru.explanations.openTitle)
  expect(shown).toContain("Не пришли 14 октября")
  expect(shown).toContain("«Затопило квартиру»")
  expect(shown).toContain(ru.explanations.status_ACCEPTED)
  // A decided explanation cannot be edited.
  expect(node(tree, "explanation-edit-2026-10-10:ABSENT")).toBeUndefined()
  expect(shown.indexOf(ru.explanations.askedBadge)).toBeLessThan(shown.indexOf(ru.explanations.openTitle))
})

it("sends the answer to HR's request, trimmed, and reloads the list", async () => {
  const tree = await render()
  await press(tree, "explanation-write-2026-10-16:LATE")
  await type(tree, "explanation-text-2026-10-16:LATE", "  Пробка на мосту  ")
  await press(tree, "explanation-send-2026-10-16:LATE")
  expect(api.answerAttendanceExplanation).toHaveBeenCalledWith({ date: "2026-10-16", kind: "LATE", text: "Пробка на мосту" }, expect.any(Function))
  expect(api.getAttendanceExplanations).toHaveBeenCalledTimes(2)
  expect(node(tree, "explanations-notice").props.children).toBe(ru.explanations.notice_sent)
})

it("asks for a few words instead of sending an empty explanation", async () => {
  const tree = await render()
  await press(tree, "explanation-write-2026-10-14:ABSENT")
  await type(tree, "explanation-text-2026-10-14:ABSENT", " ok ")
  await press(tree, "explanation-send-2026-10-14:ABSENT")
  expect(api.answerAttendanceExplanation).not.toHaveBeenCalled()
  expect(node(tree, "explanations-notice").props.children).toBe(ru.explanations.notice_short)
})

it("says in words when the day no longer needs explaining", async () => {
  ;(api.answerAttendanceExplanation as jest.Mock).mockRejectedValue(Object.assign(new Error("x"), { status: 409, code: "MTM_ATTENDANCE_EXPLANATION_NOT_NEEDED" }))
  const tree = await render()
  await press(tree, "explanation-write-2026-10-14:ABSENT")
  await type(tree, "explanation-text-2026-10-14:ABSENT", "Был у врача")
  await press(tree, "explanation-send-2026-10-14:ABSENT")
  expect(node(tree, "explanations-notice").props.children).toBe(ru.explanations.notice_notNeeded)
})

it("points leave, sick leave and trips to a request instead", async () => {
  const tree = await render()
  await press(tree, "explanations-file-request")
  expect(mockNavigate).toHaveBeenCalledWith("OwnRequests")
})

it("writes Azerbaijani dates itself", async () => {
  const tree = await render("az")
  const shown = texts(tree)
  expect(shown).toContain(az.explanations.title)
  expect(shown).not.toMatch(/M10/)
})

it("opens «Объяснительные» from an inbox notice about an explanation, and only from that", () => {
  expect(attendanceNoticePresentation({ domain: "route", attendanceExplanationId: "6f1f4b3e-2a0c-4d4b-9c4e-0b5f1f2a3c4d", kind: "LATE", date: "2026-10-16" })).toEqual({ explanation: true })
  expect(attendanceNoticePresentation({ domain: "route", attendanceExplanationId: "not-a-uuid" })).toEqual({})
  expect(attendanceNoticePresentation({ domain: "other", attendanceExplanationId: "6f1f4b3e-2a0c-4d4b-9c4e-0b5f1f2a3c4d" })).toEqual({})
})

it.each(["ru", "az", "en"])("Rhythm %s keeps HR requests separate from sent answers without losing a draft", async language => {
  const tree = await render(language, true)
  expect(node(tree, "explanation-asked-2026-10-16:LATE")).toBeDefined()
  expect(node(tree, "explanation-open-2026-10-14:ABSENT")).toBeDefined()
  expect(node(tree, "explanation-written-2026-10-10:ABSENT")).toBeUndefined()
  await press(tree, "explanation-write-2026-10-16:LATE")
  await type(tree, "explanation-text-2026-10-16:LATE", "Keep my answer")
  expect(node(tree, "explanations-filter-history").props.disabled).toBe(true)
  expect(node(tree, "explanation-text-2026-10-16:LATE").props.value).toBe("Keep my answer")
  await press(tree, "explanation-send-2026-10-16:LATE")
  await press(tree, "explanations-filter-history")
  expect(node(tree, "explanation-written-2026-10-10:ABSENT")).toBeDefined()
  expect(node(tree, "explanation-asked-2026-10-16:LATE")).toBeUndefined()
  expect(texts(tree)).not.toContain("attendanceRhythm.")
})

it("an inbox shortcut returns to HR requests after visiting sent history", async () => {
  const tree = await render("ru", true)
  await press(tree, "explanations-filter-history")
  expect(node(tree, "explanation-asked-2026-10-16:LATE")).toBeUndefined()
  await act(async () => tree.update(<I18nextProvider i18n={locale}><TimePresentation.Provider value><AttendanceExplanationsScreen route={{ params: { answerIntent: "new-inbox-intent" } }} /></TimePresentation.Provider></I18nextProvider>))
  await settle()
  expect(node(tree, "explanation-asked-2026-10-16:LATE")).toBeDefined()
  expect(node(tree, "explanation-written-2026-10-10:ABSENT")).toBeUndefined()
})
it("an inbox shortcut never hides or overwrites an open sent-answer draft", async () => {
  ;(api.getAttendanceExplanations as jest.Mock).mockResolvedValue({ success: true, data: { ...data, items: [...data.items, { ...data.items[0], id: "answered", date: "2026-10-15", status: "ANSWERED", answer: "Earlier answer" }] } })
  const tree = await render("ru", true)
  await press(tree, "explanations-filter-history"); await press(tree, "explanation-edit-2026-10-15:LATE")
  await type(tree, "explanation-text-2026-10-15:LATE", "Preserve this unsent change")
  await act(async () => tree.update(<I18nextProvider i18n={locale}><TimePresentation.Provider value><AttendanceExplanationsScreen route={{ params: { answerIntent: "new-inbox-intent" } }} /></TimePresentation.Provider></I18nextProvider>))
  await settle()
  expect(node(tree, "explanation-text-2026-10-15:LATE").props.value).toBe("Preserve this unsent change")
  expect(node(tree, "explanations-draft-before-inbox")).toBeDefined()
  expect(api.answerAttendanceExplanation).not.toHaveBeenCalled()
  await press(tree, "explanation-cancel-2026-10-15:LATE")
  expect(node(tree, "explanation-asked-2026-10-16:LATE")).toBeDefined()
})
