/**
 * «Planlama» of the manager: one agent's routes only (owner, 2026-10-20, on the
 * tablet: «чтоб можно было отдельно выбирать в фильтре агента, чтоб видеть в
 * календаре его маршруты»; the picture was approved). Rendered for real; the
 * network, the store and the navigator are stubbed. Fictional people.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGetPlanningRange = jest.fn()

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

import ManagerPlanningCalendarScreen from "../../src/screens/manager/ManagerPlanningCalendarScreen.android"

type Tree = TestRenderer.ReactTestRenderer
const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
const has = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false }).length > 0
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}
const textOf = (tree: Tree, testID: string) => texts(byTestId(tree, testID)).join(" ")
const summary = (tree: Tree) => ["routes", "agents", "stops"].map((key) => texts(byTestId(tree, `planning-summary-${key}`))[0])

const ROSTER = {
  agents: [{ id: "agent-seymur", name: "Seymur Fictional" }, { id: "agent-elnur", name: "Elnur Fictional" }],
  routes: [
    { id: "r1", agentId: "agent-seymur", date: "2026-10-08", status: "PLANNED", totalPoints: 4, visitedPoints: 0 },
    { id: "r2", agentId: "agent-seymur", date: "2026-10-12", status: "PLANNED", totalPoints: 1, visitedPoints: 0 },
    { id: "r3", agentId: "agent-elnur", date: "2026-10-08", status: "PLANNED", totalPoints: 2, visitedPoints: 0 },
  ],
}

async function render() {
  let tree!: Tree
  await act(async () => { tree = TestRenderer.create(<ManagerPlanningCalendarScreen />) })
  await act(async () => { await Promise.resolve() })
  return tree
}
async function press(tree: Tree, testID: string) {
  await act(async () => { byTestId(tree, testID).props.onPress() })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-08T08:00:00.000Z") })
  mockGetPlanningRange.mockReset().mockImplementation(async (from: string, to: string) => ({ success: true, data: { from, to, ...ROSTER } }))
})
afterEach(() => jest.useRealTimers())

describe("the manager's route calendar, one agent at a time", () => {
  it("shows the whole team until an agent is chosen, and says so in the field", async () => {
    const tree = await render()
    expect(textOf(tree, "planning-agent-value")).toBe("Все сотрудники")
    expect(has(tree, "planning-agent-clear")).toBe(false)
    expect(summary(tree)).toEqual(["3", "2", "7"])
  })

  it("offers the team with each one's routes in the period, and keeps only the chosen agent's", async () => {
    const tree = await render()
    await press(tree, "planning-agent-open")
    expect(textOf(tree, "planning-agent-option-all")).toContain("3")
    expect(textOf(tree, "planning-agent-option-agent-seymur")).toContain("2")
    expect(textOf(tree, "planning-agent-option-agent-elnur")).toContain("1")

    await press(tree, "planning-agent-option-agent-seymur")
    expect(has(tree, "planning-agent-sheet")).toBe(false)
    expect(textOf(tree, "planning-agent-value")).toBe("Seymur Fictional")
    expect(summary(tree)).toEqual(["2", "1", "5"])
    // His colleague's route on the same day is gone from the calendar and the day.
    const page = texts(tree.root).join(" ")
    expect(page).toContain("Seymur Fictional")
    expect(page).not.toContain("Elnur Fictional")
  })

  it("keeps the agent while the period changes, and «Все» brings the team back", async () => {
    const tree = await render()
    await press(tree, "planning-agent-open")
    await press(tree, "planning-agent-option-agent-elnur")
    const next = tree.root.findAll((node) => node.props.accessibilityLabel === "Следующий период" && typeof node.props.onPress === "function", { deep: false })[0]
    await act(async () => { next.props.onPress() })
    await act(async () => { await Promise.resolve() })
    expect(mockGetPlanningRange).toHaveBeenCalledTimes(2)
    expect(textOf(tree, "planning-agent-value")).toBe("Elnur Fictional")

    await press(tree, "planning-agent-clear")
    expect(textOf(tree, "planning-agent-value")).toBe("Все сотрудники")
    expect(summary(tree)).toEqual(["3", "2", "7"])
  })

  it("drops the choice of an agent the team no longer has", async () => {
    const tree = await render()
    await press(tree, "planning-agent-open")
    await press(tree, "planning-agent-option-agent-elnur")
    mockGetPlanningRange.mockImplementation(async (from: string, to: string) => ({ success: true, data: { from, to, agents: [ROSTER.agents[0]], routes: ROSTER.routes.slice(0, 2) } }))
    const next = tree.root.findAll((node) => node.props.accessibilityLabel === "Следующий период" && typeof node.props.onPress === "function", { deep: false })[0]
    await act(async () => { next.props.onPress() })
    await act(async () => { await Promise.resolve() })
    expect(textOf(tree, "planning-agent-value")).toBe("Все сотрудники")
  })
})
