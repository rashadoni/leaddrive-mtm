/**
 * «Совместный визит» after the manager ended it (S23, 2026-10-20): a visit he
 * already rated must stay on the screen with «Изменить», since the rating can
 * be changed until the end of the next day. Rendered for real; the network and
 * the navigator are stubbed. Fictional people.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGetJointVisit = jest.fn()
const mockNavigate = jest.fn()

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    i18n: { language: "ru" },
  }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0 }))
jest.mock("../../src/services/app-feedback", () => ({ notify: jest.fn() }))
jest.mock("../../src/services/api", () => ({ api: {} }))
jest.mock("../../src/services/manager-api", () => ({
  managerApi: { getJointVisit: (...args: unknown[]) => mockGetJointVisit(...args), endJointVisit: jest.fn() },
}))
jest.mock("@react-navigation/native", () => {
  const ReactActual = jest.requireActual("react")
  return {
    useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
    useFocusEffect: (effect: () => void | (() => void)) => { ReactActual.useEffect(() => effect(), []) },
  }
})

import ManagerJointVisitScreen from "../../src/screens/manager/ManagerJointVisitScreen.android"

type Tree = TestRenderer.ReactTestRenderer
const all = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}

const RATED = {
  id: "visit-rated",
  status: "CHECKED_IN",
  checkInAt: "2026-10-20T16:23:31.000Z",
  checkOutAt: null,
  agent: { id: "agent-elvin", name: "Fictional Elvin" },
  customer: { id: "c1", name: "Fictional Clinic" },
  contact: null,
  joint: true,
  canEvaluate: true,
  evaluateUntil: "2026-10-21T20:00:00.000Z",
  evaluation: { scores: { PREPARATION: 4, RAPPORT: 5 }, comment: null, updatedAt: "2026-10-20T16:27:06.000Z" },
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-20T16:30:00.000Z") })
  mockNavigate.mockReset()
  mockGetJointVisit.mockReset().mockResolvedValue({ success: true, data: { session: null, visits: [RATED] } })
})
afterEach(() => jest.useRealTimers())

describe("the joint visit after the manager ended it", () => {
  it("keeps a rated visit on the screen, and «Изменить» opens its rating", async () => {
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<ManagerJointVisitScreen />) })
    await act(async () => { await Promise.resolve() })

    expect(all(tree, "manager-joint-visit-other")).toHaveLength(1)
    expect(texts(all(tree, "manager-joint-visit-row-visit-rated")[0]).join(" ")).toContain("jointVisit.ratingValue")
    const change = all(tree, "manager-joint-visit-rate-visit-rated")[0]
    expect(texts(change).join(" ")).toBe("jointVisit.change")
    await act(async () => { change.props.onPress() })
    expect(mockNavigate).toHaveBeenCalledWith("ManagerVisitEvaluation", { visit: expect.objectContaining({ id: "visit-rated" }) })
  })

  it("shows nothing to rate once the window is over", async () => {
    mockGetJointVisit.mockResolvedValue({ success: true, data: { session: null, visits: [{ ...RATED, canEvaluate: false }] } })
    let tree!: Tree
    await act(async () => { tree = TestRenderer.create(<ManagerJointVisitScreen />) })
    await act(async () => { await Promise.resolve() })
    expect(all(tree, "manager-joint-visit-other")).toHaveLength(0)
  })
})
