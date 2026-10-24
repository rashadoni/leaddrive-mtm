/**
 * The calendar after the planner (agent's phone, 2026-10-18): a route saved
 * for a day left that day empty until a pull-to-refresh. Coming back to the
 * tab reads the month again — quietly, with the chosen day still chosen.
 */
import { readFileSync } from "fs"
import { join } from "path"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { monthGridWindow, shiftDateKey, shiftMonthKey, type MonthGridWindow } from "../../src/services/week"
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
const NEXT_MONTH = shiftMonthKey(MONTH, 1)
// Another day of this month, the one the agent plans for.
const PLANNED = now.getDate() < 28 ? shiftDateKey(TODAY, 1) : shiftDateKey(TODAY, -1)
const LOADING = "Aylıq təqvim hazırlanır"

let routesByDate: Record<string, unknown[]> = {}
/** While set, every week read waits here until the test lets it answer. */
let held: Array<{ start: string; answer: () => void }> | null = null

function week(start: string): WeekResponse {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDateKey(start, index)
    return {
      date,
      isToday: date === TODAY,
      routes: routesByDate[date] ?? [],
      visits: { total: 0, completed: 0, items: [] },
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
function labelled(tree: Tree, label: string): Node {
  const found = tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function", { deep: false })[0]
  if (!found) throw new Error(`No "${label}"`)
  return found
}

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
/** The tab is covered by another screen and then shown again. */
async function focusAgain() {
  await act(async () => { mockFocus.effect?.() })
  await settle()
}
/** Answers the month read last (its six weeks), or every read still waiting. */
async function answer(which: "latest" | "all") {
  const waiting = held ?? []
  const answered = which === "latest" ? waiting.slice(-6) : waiting
  held = waiting.filter((read) => !answered.includes(read))
  await act(async () => { answered.forEach((read) => read.answer()) })
  await settle()
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  setOfflineScope("tenant-1", "agent-1")
  mockSync.online = true
  routesByDate = {}
  held = null
  mockFocus.effect = null
  mockGetWeek.mockImplementation((start: string) => (held
    ? new Promise<WeekResponse>((resolve) => { held!.push({ start, answer: () => resolve(week(start)) }) })
    : Promise.resolve(week(start))))
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("the calendar reads the month again when the agent comes back to it", () => {
  it("shows the saved plan after the screen is recreated without a network", async () => {
    routesByDate[PLANNED] = [{ id: "route-saved", status: "PLANNED", points: [{ id: "p1" }, { id: "p2" }] }]
    const first = await open()
    await act(async () => { first.unmount() })
    mounted.splice(mounted.indexOf(first), 1)
    mockSync.online = false
    mockGetWeek.mockRejectedValue(new TypeError("Network request failed"))
    const restored = await open()
    expect(cell(restored, PLANNED).props.accessibilityLabel).toContain("Marşrut nöqtələri: 2")
    expect(screenText(restored)).not.toContain("Təqvimi açmaq alınmadı")
  })

  it("lets the employee return from an uncached offline month to the saved month", async () => {
    const tree = await open()
    mockSync.online = false
    mockGetWeek.mockRejectedValue(new TypeError("Network request failed"))
    await press(labelled(tree, "Növbəti ay"))
    expect(screenText(tree)).toContain("Təqvimi açmaq alınmadı")
    expect(cells(tree)).toHaveLength(0)
    await press(labelled(tree, "Əvvəlki ay"))
    expect(cells(tree)).toHaveLength(42)
    expect(screenText(tree)).not.toContain("Təqvimi açmaq alınmadı")
  })

  it("removes the previously visible calendar after an access denial", async () => {
    const tree = await open()
    mockGetWeek.mockRejectedValue(Object.assign(new Error("denied"), { status: 403 }))
    await focusAgain()
    expect(cells(tree)).toHaveLength(0)
    expect(screenText(tree)).toContain("Təqvimi açmaq alınmadı")
  })

  it("shows the route just saved in the planner on the chosen day, without a pull-to-refresh", async () => {
    const tree = await open()
    expect(mockGetWeek).toHaveBeenCalledTimes(6)

    await press(cell(tree, PLANNED))
    expect(cell(tree, PLANNED).props.accessibilityState.selected).toBe(true)
    expect(cell(tree, PLANNED).props.accessibilityLabel).toContain("Marşrut nöqtələri: 0")

    await press(labelled(tree, "Öz marşrutumu qur"))
    expect(mockNavigate).toHaveBeenCalledWith("PlanningBuilder", { initialDate: PLANNED, initialHorizon: 1 })

    // The planner saved two clients on that day; the month answers slower than the tab shows.
    routesByDate[PLANNED] = [{ id: "route-new", status: "PLANNED", points: [{ id: "p1" }, { id: "p2" }] }]
    held = []
    await focusAgain()
    expect(mockGetWeek).toHaveBeenCalledTimes(12)
    // In between, the month on screen stays — no loading screen, the day still chosen.
    expect(screenText(tree)).not.toContain(LOADING)
    expect(cell(tree, PLANNED).props.accessibilityState.selected).toBe(true)

    await answer("all")
    expect(cell(tree, PLANNED).props.accessibilityLabel).toContain("Marşrut nöqtələri: 2")
    expect(cell(tree, PLANNED).props.accessibilityState.selected).toBe(true)
    expect(screenText(tree)).not.toContain(LOADING)
  })

  it("does not read again on the first focus, which is the mount", async () => {
    await open()
    expect(mockGetWeek).toHaveBeenCalledTimes(6)
    expect(mockGetWeek.mock.calls.map(([start]) => start)).toEqual(monthGridWindow(MONTH).weekStarts)
  })

  it("keeps the month the agent paged to when the re-read of the old one answers last", async () => {
    const tree = await open()
    held = []
    await focusAgain()
    await press(labelled(tree, "Növbəti ay"))
    // The next month answers first, the quiet re-read of this one after it.
    await answer("latest")
    await answer("all")

    const nextGrid = monthGridWindow(NEXT_MONTH)
    expect(screenText(tree)).not.toContain(LOADING)
    expect(cell(tree, NEXT_MONTH, nextGrid).props.accessibilityState.selected).toBe(true)
    expect(dayIndex(nextGrid, NEXT_MONTH)).toBeLessThan(7)
  })
})

describe("the Route tab, the other way back from the planner", () => {
  // «Planı dəyiş» and «Marşruta əlavə et» close the planner with goBack; the
  // tab already reads its route again on every focus.
  it("re-reads its route on focus", () => {
    const route = readFileSync(join(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
    const navigator = readFileSync(join(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"), "utf8")
    expect(route).toContain("useAutoRefresh(\n    useCallback(() => {\n      fetchRoute()")
    expect(navigator).toContain("<RouteSelfPlanningWorkspace\n    onClose={() => navigation.goBack()}")
  })
})
