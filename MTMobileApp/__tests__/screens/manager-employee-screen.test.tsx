/**
 * The manager opens one employee from «Komanda» (owner, 2026-10-17: «при
 * нажатии получал всю информацию — от маршрута до местонахождения на карте»;
 * the picture was approved: «да, как на картинке»). Rendered for real; the
 * network, the store and the navigator are stubbed. Fictional people.
 */
import React from "react"
import { Linking } from "react-native"
import TestRenderer, { act } from "react-test-renderer"

const mockGetEmployee = jest.fn()
const mockGetEmployeeDay = jest.fn()
const mockGoBack = jest.fn()

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    i18n: { language: "ru" },
  }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-webview", () => ({ WebView: "WebView" }))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("@react-navigation/native", () => {
  const ReactActual = jest.requireActual("react")
  return {
    useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
    useRoute: () => ({ params: { agentId: "agent-anar", name: "Fictional Anar", isOnline: true } }),
    useFocusEffect: (effect: () => void | (() => void)) => { ReactActual.useEffect(() => effect(), []) },
  }
})
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: (select: (state: unknown) => unknown) => select({ data: { timezone: "Asia/Baku", maps: { cartoBasemapsApiKey: null } } }),
}))
jest.mock("../../src/services/api", () => ({ api: { serverOrigin: () => null } }))
jest.mock("../../src/services/manager-api", () => ({
  managerApi: {
    getEmployee: (...args: unknown[]) => mockGetEmployee(...args),
    getEmployeeDay: (...args: unknown[]) => mockGetEmployeeDay(...args),
  },
}))

import ManagerEmployeeScreen, { whatsappUrl } from "../../src/screens/manager/ManagerEmployeeScreen.android"

type Tree = TestRenderer.ReactTestRenderer
const has = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false }).length > 0
const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
const all = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}
const textOf = (tree: Tree, testID: string) => texts(byTestId(tree, testID)).join(" ")

const DAY = {
  range: { date: "2026-10-17", timezone: "Asia/Baku" },
  policy: { stopMinimumMinutes: 5 },
  summary: { distanceMeters: 23_400, lastPointAt: "2026-10-17T07:42:00.000Z" },
  trip: { totals: { movingSeconds: 7_500 } },
  points: [
    { id: "p1", recordedAt: "2026-10-17T05:12:00.000Z", latitude: 40.40, longitude: 49.85, accuracy: 8, battery: 80 },
    { id: "p2", recordedAt: "2026-10-17T07:42:00.000Z", latitude: 40.43, longitude: 49.88, accuracy: 6, battery: 71 },
  ],
  gaps: [{ id: "g1", reason: "TELEMETRY_GAP", startedAt: "2026-10-17T06:20:00.000Z", endedAt: "2026-10-17T06:45:00.000Z", durationSeconds: 1_500 }],
  stops: [],
  workday: { status: "STARTED", startedAt: "2026-10-17T05:12:00.000Z", completedAt: null },
  plannedRoutes: [{
    id: "r1",
    status: "IN_PROGRESS",
    points: [
      { id: "rp1", status: "VISITED", label: "Fictional Clinic", customer: { name: "Fictional Clinic", latitude: 40.41, longitude: 49.86 } },
      { id: "rp2", status: "PENDING", label: "Fictional Hospital", plannedTime: "2026-10-17T08:10:00.000Z", customer: { name: "Fictional Hospital", latitude: 40.44, longitude: 49.89 } },
    ],
  }],
  visits: [{ id: "v1", routePointId: "rp1", checkInAt: "2026-10-17T05:40:00.000Z", checkOutAt: "2026-10-17T05:58:00.000Z", customer: { name: "Fictional Clinic" } }],
}

async function render() {
  let tree!: Tree
  await act(async () => { tree = TestRenderer.create(<ManagerEmployeeScreen />) })
  await act(async () => { await Promise.resolve() })
  return tree
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-17T08:00:00.000Z") })
  mockGoBack.mockReset()
  mockGetEmployee.mockReset().mockResolvedValue({ success: true, data: { name: "Fictional Anar", role: "AGENT", phone: "+994 50 111 22 33", team: { name: "Fictional Team" }, manager: { name: "Fictional Lead" } } })
  mockGetEmployeeDay.mockReset().mockResolvedValue({ success: true, data: DAY })
})
afterEach(() => jest.useRealTimers())

describe("the manager's card of one employee", () => {
  it("asks for today's day of this employee and shows it: map, visits, route, workday, deviations", async () => {
    const tree = await render()
    expect(mockGetEmployee).toHaveBeenCalledWith("agent-anar")
    expect(mockGetEmployeeDay).toHaveBeenCalledWith("agent-anar", "2026-10-17")

    expect(textOf(tree, "manager-employee-name")).toBe("Fictional Anar")
    expect(textOf(tree, "manager-employee-workday")).toContain("managerEmployee.workdayStarted")
    expect(has(tree, "manager-employee-map")).toBe(true)
    expect(textOf(tree, "manager-employee-visits")).toContain('managerEmployee.visitsValue {"visited":1,"planned":2}')
    expect(all(tree, "manager-employee-stop-VISITED")).toHaveLength(1)
    expect(all(tree, "manager-employee-stop-NEXT")).toHaveLength(1)
    expect(textOf(tree, "manager-employee-route")).toContain("Fictional Hospital")
    expect(textOf(tree, "manager-employee-workday-card")).toContain("managerEmployee.stillWorking")
    expect(textOf(tree, "manager-employee-deviations")).toContain("managerEmployee.noGps")
  })

  it("calls and writes on WhatsApp to the number on the card", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never)
    const tree = await render()
    await act(async () => { byTestId(tree, "manager-employee-call").props.onPress() })
    await act(async () => { byTestId(tree, "manager-employee-whatsapp").props.onPress() })
    expect(open.mock.calls.map(([url]) => url)).toEqual(["tel:+994501112233", "https://wa.me/994501112233"])
    expect(whatsappUrl("00994 50 111 22 33")).toBe("https://wa.me/994501112233")
    expect(whatsappUrl("123")).toBeNull()
    open.mockRestore()
  })

  it("opens yesterday and comes back to today; there is no day after today", async () => {
    const tree = await render()
    expect(byTestId(tree, "manager-employee-next-day").props.accessibilityState).toEqual({ disabled: true })
    await act(async () => { byTestId(tree, "manager-employee-previous-day").props.onPress() })
    await act(async () => { await Promise.resolve() })
    expect(mockGetEmployeeDay).toHaveBeenLastCalledWith("agent-anar", "2026-10-16")
    expect(textOf(tree, "manager-employee-day")).toContain("managerEmployee.yesterday")
    // On a past day the unvisited point is «not visited», not «next».
    expect(all(tree, "manager-employee-stop-MISSED")).toHaveLength(1)
    await act(async () => { byTestId(tree, "manager-employee-today").props.onPress() })
    await act(async () => { await Promise.resolve() })
    expect(mockGetEmployeeDay).toHaveBeenLastCalledWith("agent-anar", "2026-10-17")
  })

  it("says the employee is not in the team when the server refuses him", async () => {
    mockGetEmployeeDay.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }))
    const tree = await render()
    expect(textOf(tree, "manager-employee-error")).toContain("managerEmployee.forbidden")
  })

  it("says there is no phone instead of drawing buttons that call nobody", async () => {
    mockGetEmployee.mockResolvedValue({ success: true, data: { name: "Fictional Anar", role: "AGENT", phone: null } })
    const tree = await render()
    expect(has(tree, "manager-employee-call")).toBe(false)
    expect(texts(tree.root).join(" ")).toContain("managerEmployee.noPhone")
  })
})
