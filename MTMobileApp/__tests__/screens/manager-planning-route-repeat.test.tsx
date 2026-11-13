/**
 * «Повторить маршрут» in the manager's route calendar (Zeytun 2026-11-13,
 * owner's mockup approved with «Давай»): each route of the chosen day has the
 * button, and it opens the sheet on that route.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGetPlanningRange = jest.fn()
const mockGetRoute = jest.fn()
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ru" } }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0, useTabBarPadding: () => 0 }))
jest.mock("../../src/components/NotificationBell", () => () => null)
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: (select: (state: unknown) => unknown) => select({ data: { timezone: "Asia/Baku" } }),
}))
jest.mock("../../src/services/manager-api", () => ({
  managerApi: { getPlanningRange: (...args: unknown[]) => mockGetPlanningRange(...args) },
}))

jest.mock("../../src/services/api", () => ({
  api: {
    getRoute: (id: string) => mockGetRoute(id),
    getAgentRoutesBetween: async () => ({ success: true, data: { routes: [], capabilities: { canPublish: true } } }),
    createRouteDraft: jest.fn(),
    publishRoute: jest.fn(),
  },
}))

import ManagerPlanningCalendarScreen from "../../src/screens/manager/ManagerPlanningCalendarScreen.android"

type Tree = TestRenderer.ReactTestRenderer
const all = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === "function", { deep: false })

const ROSTER = {
  agents: [{ id: "agent-seymur", name: "Seymur Fictional" }, { id: "agent-elnur", name: "Elnur Fictional" }],
  routes: [
    { id: "r1", agentId: "agent-seymur", date: "2026-10-08", status: "PLANNED", totalPoints: 4, visitedPoints: 0 },
    { id: "r3", agentId: "agent-elnur", date: "2026-10-08", status: "PLANNED", totalPoints: 2, visitedPoints: 0 },
    { id: "r4", agentId: "agent-elnur", date: "2026-10-08", status: "CANCELLED", totalPoints: 2, visitedPoints: 0 },
  ],
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-08T08:00:00.000Z") })
  mockGetPlanningRange.mockReset().mockImplementation(async (from: string, to: string) => ({ success: true, data: { from, to, ...ROSTER } }))
  mockGetRoute.mockReset().mockResolvedValue({ success: true, data: {
    id: "r1", date: "2026-10-08T00:00:00.000Z", status: "PLANNED", agentId: "agent-seymur",
    points: [{ customerId: "c1", contactId: null, orderIndex: 0, plannedTime: null }],
  } })
})
afterEach(() => jest.useRealTimers())

describe("«Повторить маршрут» in the manager's calendar", () => {
  it("is on each live route of the chosen day and opens the sheet on that route", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<ManagerPlanningCalendarScreen />) })
    await act(async () => { await Promise.resolve() })
    // A cancelled route is not repeated.
    expect(all(tree, "planning-route-repeat")).toHaveLength(2)
    expect(tree.root.findAll((node) => node.props.testID === "route-repeat-sheet")).toHaveLength(0)

    const seymur = all(tree, "planning-route-repeat").find((node) => String(node.props.accessibilityLabel).includes("Seymur Fictional"))!
    await act(async () => { seymur.props.onPress() })
    await act(async () => { await Promise.resolve() })
    expect(mockGetRoute).toHaveBeenCalledWith("r1")
    expect(tree.root.findAll((node) => node.props.testID === "route-repeat-sheet").length).toBeGreaterThan(0)
  })
})
