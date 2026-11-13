/**
 * «Повторить маршрут» in the field app (Zeytun 2026-11-13, owner's mockup
 * approved with «Давай»): the agent's own route of the chosen day has the
 * button; the sheet shows the Fridays, crosses out a busy one and makes the
 * rest. Rendered for real against a stubbed server.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { monthGridWindow, shiftDateKey, type MonthGridWindow } from "../../src/services/week"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { setOfflineScope } from "../../src/services/offline-scope"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/bootstrap-offline-cache", () => ({
  readOfflineBootstrap: async () => ({ validUntil: Date.now() + 60_000 }),
}))

type WeekResponse = { success: boolean; data?: unknown }
type FocusEffect = () => void | (() => void)

const mockGetWeek = jest.fn((_start: string): Promise<WeekResponse> => Promise.resolve({ success: false }))
const mockNavigate = jest.fn()
const mockFocus: { effect: FocusEffect | null } = { effect: null }
const mockSync = { online: true }
const mockAuth = { agent: { id: "agent-1", organizationId: "tenant-1", role: "AGENT" } }

jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react")
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    // Mounting a tab is its first focus; `focusAgain` below is coming back to it.
    useFocusEffect: (effect: FocusEffect) => {
      useEffect(() => {
        mockFocus.effect = effect
        const cleanup = effect()
        return typeof cleanup === "function" ? cleanup : undefined
      }, [effect])
    },
  }
})
jest.mock("react-i18next", () => {
  const { mobileResources } = jest.requireActual("../../src/i18n/mobile-resources")
  const t = (key: string) => {
    const value = key.split(".").reduce((node: any, part: string) => node?.[part], mobileResources.az)
    return typeof value === "string" ? value : key
  }
  return { useTranslation: () => ({ t, i18n: { language: "az" } }) }
})
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
// The bell reads its own store and the server; these screens are tested without it.
jest.mock("../../src/components/NotificationBell", () => () => null)
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0, useTabBarPadding: () => 0 }))
jest.mock("../../src/store/auth", () => ({
  useAuthStore: Object.assign((selector: (state: unknown) => unknown) => selector(mockAuth), { getState: () => mockAuth }),
}))
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: (selector: (state: unknown) => unknown) => selector({ data: { policies: { canPlanOwnRoutes: true } } }),
}))
jest.mock("../../src/store/sync-status", () => ({
  useSyncStatusStore: (selector: (state: { online: boolean }) => unknown) => selector(mockSync),
}))
const mockGetRoute = jest.fn()
const mockRoutesBetween = jest.fn()
const mockCreate = jest.fn()
const mockPublish = jest.fn()
jest.mock("../../src/services/api", () => ({
  api: { getWeek: (start: string) => mockGetWeek(start), serverOrigin: () => "https://tenant.example",
    getOfflineBootstrapBinding: async () => ({ server: "https://tenant.example", deviceId: "phone", sessionId: "login" }),
    getRoute: (id: string) => mockGetRoute(id),
    getAgentRoutesBetween: (...args: unknown[]) => mockRoutesBetween(...args),
    createRouteDraft: (draft: unknown) => mockCreate(draft),
    publishRoute: (...args: unknown[]) => mockPublish(...args) },
}))
import WeekScreen from "../../src/screens/week/WeekScreen"

type Node = TestRenderer.ReactTestInstance
type Tree = TestRenderer.ReactTestRenderer

const pad = (value: number) => String(value).padStart(2, "0")
const now = new Date()
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const MONTH = `${TODAY.slice(0, 8)}01`

let routesByDate: Record<string, unknown[]> = {}
let visitsByDate: Record<string, unknown[]> = {}

function week(start: string): WeekResponse {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(start, index)
    const visits = visitsByDate[date] ?? []
    return {
      date,
      isToday: date === TODAY,
      routes: routesByDate[date] ?? [],
      visits: { total: visits.length, completed: visits.length, items: visits },
      tasks: { total: 0, completed: 0, items: [] },
    }
  })
  return { success: true, data: { weekStart: start, weekEndExclusive: shiftDateKey(start, 7), today: TODAY, days, summary: {} } }
}

function textsOf(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}
const screenText = (tree: Tree) => textsOf(tree.root).join(" | ")
const cells = (tree: Tree) => tree.root.findAll(
  (node) => node.props.accessibilityRole === "button"
    && typeof node.props.accessibilityState?.selected === "boolean"
    && typeof node.props.onPress === "function",
  { deep: false },
)
const dayIndex = (grid: MonthGridWindow, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${grid.gridStart}T00:00:00Z`)) / 86_400_000)
function cell(tree: Tree, date: string, grid: MonthGridWindow = monthGridWindow(MONTH)): Node {
  const all = cells(tree)
  expect(all).toHaveLength(42)
  return all[dayIndex(grid, date)]
}
const byTestId = (tree: Tree, id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === "function", { deep: false })
const mounted: Tree[] = []
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}
async function open(): Promise<Tree> {
  let tree!: Tree
  await act(async () => { tree = TestRenderer.create(<WeekScreen />) })
  mounted.push(tree)
  await settle()
  return tree
}
async function press(node: Node) {
  await act(async () => { node.props.onPress() })
  await settle()
}

const point = (id: string, doctor: string | null, clinic: string) => ({
  id, customerId: `c-${id}`, contactId: doctor ? `d-${id}` : null, status: "PENDING", effectiveStatus: "PENDING", plannedTime: null,
  customer: { id: `c-${id}`, name: clinic }, contact: doctor ? { id: `d-${id}`, displayName: doctor } : null,
})

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  setOfflineScope("tenant-1", "agent-1")
  mockSync.online = true
  routesByDate = {}
  visitsByDate = {}
  mockGetWeek.mockImplementation((start: string) => Promise.resolve(week(start)))
  mockGetRoute.mockImplementation(async (id: string) => ({ success: true, data: {
    id, date: `${TODAY}T00:00:00.000Z`, name: "Cümə", status: "PLANNED", agentId: "agent-1",
    points: [{ customerId: "c-p1", contactId: "d-p1", orderIndex: 0, plannedTime: null }],
  } }))
  // A week from today the agent already has a route.
  mockRoutesBetween.mockResolvedValue({ success: true, data: { routes: [{ date: `${shiftDateKey(TODAY, 7)}T00:00:00.000Z`, status: "PLANNED" }], capabilities: { canPublish: true } } })
  mockCreate.mockImplementation(async (draft: { date: string }) => ({ success: true, data: { id: `r-${draft.date}`, version: 1 } }))
  mockPublish.mockResolvedValue({ success: true })
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("«Повторить маршрут» on the chosen day", () => {
  it("is offered on the agent's own route, not on one he only joins", async () => {
    routesByDate[TODAY] = [
      { id: "own", name: "Cümə", status: "PUBLISHED", assignmentRole: "PRIMARY", points: [point("p1", "Dr. Aliyeva", "Klinika 3")] },
      { id: "joined", name: "Leyla", status: "PUBLISHED", assignmentRole: "PARTICIPANT", points: [point("p2", null, "Aptek 15")] },
    ]
    const tree = await open()
    expect(byTestId(tree, "calendar-route-repeat")).toHaveLength(1)
  })

  it("opens the sheet on that route's weekday, crosses out the busy date and makes the others", async () => {
    routesByDate[TODAY] = [{ id: "own", name: "Cümə", status: "PUBLISHED", assignmentRole: "PRIMARY", points: [point("p1", "Dr. Aliyeva", "Klinika 3")] }]
    const tree = await open()
    await press(byTestId(tree, "calendar-route-repeat")[0])
    expect(mockGetRoute).toHaveBeenCalledWith("own")
    const weekday = new Date(`${TODAY}T00:00:00Z`).getUTCDay() || 7
    expect(byTestId(tree, `route-repeat-weekday-${weekday}`)[0].props.accessibilityState).toEqual({ selected: true })

    // Six weeks ahead, one of them taken.
    const dates = tree.root.findAll((node) => node.props.testID === "route-repeat-date" && typeof node.type !== "string", { deep: false })
    expect(dates).toHaveLength(6)
    await press(byTestId(tree, "route-repeat-create")[0])
    expect(mockCreate.mock.calls.map(([draft]) => draft.date)).toEqual([14, 21, 28, 35, 42].map((days) => shiftDateKey(TODAY, days)))
    expect(mockPublish).toHaveBeenCalledTimes(5)
    // Every date is accounted for: five made, the busy one said so.
    const rows = tree.root.findAll((node) => node.props.testID === "route-repeat-outcome" && typeof node.type !== "string", { deep: false })
    expect(rows).toHaveLength(6)
    expect(rows.map((row) => textsOf(row).join(" ")).filter((text) => text.includes("buraxıldı: artıq marşrut var"))).toHaveLength(1)
  })
})
