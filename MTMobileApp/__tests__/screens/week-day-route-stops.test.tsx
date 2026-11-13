/**
 * Zeytun, 2026-11-13: «При выборе даты в календаре маршруты в будущие дни не
 * видны — весь маршрут за тот день. Виден только которые исполнились.» The
 * month read every stop of every route; the chosen day listed only visits,
 * which exist from check-in on, so a future day showed nobody to go to.
 * Rendered for real: the screen, the month read, the offline month cache.
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
jest.mock("../../src/services/api", () => ({
  api: { getWeek: (start: string) => mockGetWeek(start), serverOrigin: () => "https://tenant.example",
    getOfflineBootstrapBinding: async () => ({ server: "https://tenant.example", deviceId: "phone", sessionId: "login" }) },
}))

import WeekScreen from "../../src/screens/week/WeekScreen"

type Node = TestRenderer.ReactTestInstance
type Tree = TestRenderer.ReactTestRenderer

const pad = (value: number) => String(value).padStart(2, "0")
const now = new Date()
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const MONTH = `${TODAY.slice(0, 8)}01`
const FUTURE = now.getDate() < 28 ? shiftDateKey(TODAY, 1) : shiftDateKey(TODAY, -1)

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
const stops = (tree: Tree) => tree.root.findAll((node) => node.props.testID === "calendar-route-stop", { deep: false })

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

const point = (id: string, doctor: string | null, clinic: string, status = "PENDING") => ({
  id, status: "PENDING", effectiveStatus: status, plannedTime: null,
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
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("the chosen day shows its whole route, not only the visits made", () => {
  it("lists every stop of a day nobody has visited yet", async () => {
    routesByDate[FUTURE] = [{ id: "route-fri", status: "PUBLISHED", points: [
      point("p1", "Dr. Aliyeva", "Klinika 3"),
      point("p2", null, "Aptek 92 Yasamal"),
    ] }]
    const tree = await open()
    await press(cell(tree, FUTURE))

    const text = screenText(tree)
    expect(stops(tree)).toHaveLength(2)
    expect(text).toContain("Dr. Aliyeva")
    expect(text).toContain("Klinika 3")
    expect(text).toContain("Aptek 92 Yasamal")
    expect(text).toContain("Planda")
    // Not «no visits for this day» under a route of two stops.
    expect(text).not.toContain("Bu gün üçün ziyarət yoxdur")
  })

  it("opens the visit made at a stop from that stop and lists an off-route visit apart", async () => {
    routesByDate[TODAY] = [{ id: "route-today", status: "IN_PROGRESS", points: [
      point("p1", "Dr. Aliyeva", "Klinika 3", "VISITED"),
      point("p2", null, "Aptek 92 Yasamal"),
    ] }]
    visitsByDate[TODAY] = [
      { id: "visit-1", routePointId: "p1", status: "CHECKED_OUT", contact: { displayName: "Dr. Aliyeva" } },
      { id: "visit-2", status: "CHECKED_OUT", customer: { name: "Aptek 15" } },
    ]
    const tree = await open()
    await press(cell(tree, TODAY))

    const text = screenText(tree)
    expect(text).toContain("Ziyarət olunub")
    expect(text).toContain("Marşrutdan kənar ziyarətlər")
    // The visit at the stop is shown once — on its stop.
    expect(text.split("Dr. Aliyeva")).toHaveLength(2)
    expect(text).toContain("Aptek 15")

    await press(stops(tree)[0])
    expect(mockNavigate).toHaveBeenCalledWith("VisitWorkspace", { visitId: "visit-1", name: "Dr. Aliyeva" })
  })

  it("keeps the stops of a saved month when the phone is offline", async () => {
    routesByDate[FUTURE] = [{ id: "route-fri", status: "PUBLISHED", points: [point("p1", "Dr. Aliyeva", "Klinika 3")] }]
    const first = await open()
    await act(async () => { first.unmount() })
    mounted.splice(mounted.indexOf(first), 1)
    mockSync.online = false
    mockGetWeek.mockRejectedValue(new TypeError("Network request failed"))

    const restored = await open()
    await press(cell(restored, FUTURE))
    expect(stops(restored)).toHaveLength(1)
    expect(screenText(restored)).toContain("Dr. Aliyeva")
    expect(screenText(restored)).toContain("Klinika 3")
  })
})
