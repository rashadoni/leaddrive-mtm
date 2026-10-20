/**
 * «Маршрут» with «Сегодня | Месяц» (owner-approved mockup, 2026-10-20): the
 * calendar left the bottom bar for «Визиты» and became the route's second tab.
 * The two screens are stubbed with the real shared header; the switch, the
 * lazy month and «+ Составить маршрут» are what is rendered for real.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { StyleSheet } from "react-native"

const mockPlan = jest.fn()
const mockMounts = { route: 0, week: 0 }

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ru" } }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/components/NotificationBell", () => () => null)
jest.mock("../../src/screens/route/RouteScreen", () => {
  const ReactActual = jest.requireActual("react")
  const Header = jest.requireActual("../../src/screens/route/RouteSectionHeader").default
  return function MockRouteScreen() {
    ReactActual.useEffect(() => { mockMounts.route += 1 }, [])
    return ReactActual.createElement(Header, { subtitle: "today", headerTop: 0, onPlan: mockPlan })
  }
})
jest.mock("../../src/screens/week/WeekScreen", () => {
  const ReactActual = jest.requireActual("react")
  const Header = jest.requireActual("../../src/screens/route/RouteSectionHeader").default
  return function MockWeekScreen() {
    ReactActual.useEffect(() => { mockMounts.week += 1 }, [])
    return ReactActual.createElement(Header, { subtitle: "month", headerTop: 0 })
  }
})

import RouteSectionScreen from "../../src/screens/route/RouteSectionScreen"
import RouteSectionHeader from "../../src/screens/route/RouteSectionHeader"

type Tree = TestRenderer.ReactTestRenderer
type Node = TestRenderer.ReactTestInstance

const byId = (root: Node, testID: string) => root.findAll((node) => node.props.testID === testID, { deep: false })
const hidden = (tree: Tree, testID: string) => StyleSheet.flatten(byId(tree.root, testID)[0].props.style).display === "none"

async function press(node: Node) {
  await act(async () => { node.props.onPress() })
}

beforeEach(() => {
  mockPlan.mockReset()
  mockMounts.route = 0
  mockMounts.week = 0
})

describe("«Маршрут» → «Сегодня | Месяц»", () => {
  it("opens on today and reads the month only when the agent asks for it", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<RouteSectionScreen />) })
    expect(hidden(tree, "route-section-today")).toBe(false)
    expect(byId(tree.root, "route-section-month")).toHaveLength(0)
    expect(mockMounts.week).toBe(0)

    const today = byId(tree.root, "route-section-today")[0]
    const todayTab = byId(today, "route-section-tab-today")[0]
    expect(todayTab.props.accessibilityRole).toBe("tab")
    expect(todayTab.props.accessibilityState).toEqual({ selected: true })

    await press(byId(today, "route-section-tab-month")[0])
    expect(hidden(tree, "route-section-today")).toBe(true)
    expect(hidden(tree, "route-section-month")).toBe(false)
    const month = byId(tree.root, "route-section-month")[0]
    expect(byId(month, "route-section-tab-month")[0].props.accessibilityState).toEqual({ selected: true })

    // Back to today: nothing is mounted again — an open visit keeps its state.
    await press(byId(month, "route-section-tab-today")[0])
    expect(hidden(tree, "route-section-today")).toBe(false)
    expect(hidden(tree, "route-section-month")).toBe(true)
    expect(mockMounts).toEqual({ route: 1, week: 1 })
  })

  it("opens the month from a link elsewhere, every time it is followed", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<RouteSectionScreen route={{ params: { view: "month" } }} />) })
    expect(hidden(tree, "route-section-month")).toBe(false)
    expect(hidden(tree, "route-section-today")).toBe(true)

    await press(byId(byId(tree.root, "route-section-month")[0], "route-section-tab-today")[0])
    expect(hidden(tree, "route-section-today")).toBe(false)

    // The same link again hands the tab new params with the same view.
    await act(async () => { tree.update(<RouteSectionScreen route={{ params: { view: "month" } }} />) })
    expect(hidden(tree, "route-section-month")).toBe(false)
  })

  it("puts «+ Составить маршрут» in the header for an agent who plans his own routes", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<RouteSectionScreen />) })
    const plan = byId(byId(tree.root, "route-section-today")[0], "route-section-plan")
    expect(plan).toHaveLength(1)
    expect(plan[0].props.accessibilityRole).toBe("button")
    expect(plan[0].props.accessibilityLabel).toBe("routeSection.plan")
    await press(plan[0])
    expect(mockPlan).toHaveBeenCalledTimes(1)
  })

  it("draws neither the button without a planner nor the tabs outside «Маршрут»", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<RouteSectionHeader subtitle="alone" headerTop={0} />) })
    expect(byId(tree.root, "route-section-plan")).toHaveLength(0)
    expect(byId(tree.root, "route-section-tab-today")).toHaveLength(0)
    expect(byId(tree.root, "route-section-tab-month")).toHaveLength(0)
  })
})
