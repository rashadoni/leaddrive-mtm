/**
 * Zeytun, 2026-11-13: «Общий календарь, чтоб посмотреть по дням/неделям, какие
 * маршруты имеются, — не нашёл». The calendar had a month grid only. «Неделя»
 * shows the chosen day's week as seven rows that name each day's people.
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
const weekRows = (tree: Tree) => tree.root.findAll((node) => node.props.testID === "calendar-week-day", { deep: false })
const byTestId = (tree: Tree, id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === "function", { deep: false })[0]
const routeStops = (tree: Tree) => tree.root.findAll((node) => node.props.testID === "calendar-route-stop", { deep: false })
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

const NEXT_WEEK = shiftDateKey(TODAY, 7)

describe("«Неделя»: the chosen day's week, day by day, with the people on each route", () => {
  it("lists the seven days of this week and names the stops of each day", async () => {
    routesByDate[TODAY] = [{ id: "route-today", name: "Yasamal", status: "PUBLISHED", points: [
      point("p1", "Dr. Aliyeva", "Klinika 3"),
      point("p2", null, "Aptek 92 Yasamal"),
    ] }]
    const tree = await open()
    await press(byTestId(tree, "calendar-mode-week"))

    const rows = weekRows(tree)
    expect(rows).toHaveLength(7)
    expect(rows.map((row) => row.props.accessibilityState.selected)).toContain(true)
    const today = rows.find((row) => row.props.accessibilityState.selected)!
    expect(textsOf(today).join(" ")).toContain("Yasamal")
    expect(textsOf(today).join(" ")).toContain("Dr. Aliyeva, Aptek 92 Yasamal")
    // The other days of the week say there is no route, rather than nothing.
    expect(rows.filter((row) => textsOf(row).join(" ").includes("Marşrut yoxdur")).length).toBeGreaterThan(0)
  })

  it("pages a week forward and opens a day of it with its whole route", async () => {
    routesByDate[NEXT_WEEK] = [{ id: "route-next", name: "Nəsimi", status: "PUBLISHED", points: [
      point("p9", "Dr. Hüseynov", "Klinika 7"),
    ] }]
    const tree = await open()
    await press(byTestId(tree, "calendar-mode-week"))
    await press(tree.root.findAll((node) => node.props.accessibilityLabel === "Növbəti həftə" && typeof node.props.onPress === "function", { deep: false })[0])

    const rows = weekRows(tree)
    expect(rows).toHaveLength(7)
    const next = rows.find((row) => textsOf(row).join(" ").includes("Dr. Hüseynov"))
    expect(next).toBeDefined()
    await press(next!)
    expect(routeStops(tree)).toHaveLength(1)
    expect(screenText(tree)).toContain("Klinika 7")
  })

  it("goes back to the month grid", async () => {
    const tree = await open()
    await press(byTestId(tree, "calendar-mode-week"))
    expect(weekRows(tree)).toHaveLength(7)
    await press(byTestId(tree, "calendar-mode-month"))
    expect(weekRows(tree)).toHaveLength(0)
    expect(cells(tree)).toHaveLength(42)
  })
})
