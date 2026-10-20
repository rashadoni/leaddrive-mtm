/**
 * «Оценка агента» on a joint visit (owner-approved mockup, 2026-10-20).
 * Rendered for real; the network and the navigator are stubbed. Fictional people.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockSave = jest.fn()
const mockGoBack = jest.fn()
const mockNotify = jest.fn()

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
jest.mock("../../src/services/app-feedback", () => ({ notify: (...args: unknown[]) => mockNotify(...args) }))
jest.mock("../../src/services/api", () => ({ api: {} }))
jest.mock("../../src/services/manager-api", () => ({
  managerApi: { saveVisitEvaluation: (...args: unknown[]) => mockSave(...args) },
}))

const VISIT = {
  id: "visit-joint-1",
  status: "CHECKED_IN",
  checkInAt: "2026-10-20T06:42:00.000Z",
  checkOutAt: null,
  agent: { id: "agent-elvin", name: "Fictional Elvin" },
  customerName: "Fictional Clinic",
  contactName: "Dr. Fictional",
  contactSpecialty: "Cardiologist",
  joint: true,
  canEvaluate: true,
  evaluateUntil: "2026-10-21T20:00:00.000Z",
  evaluation: null as null | { scores: Record<string, number>; average: number | null; comment: string | null; updatedAt: string },
}
let mockParams: { visit: typeof VISIT } = { visit: VISIT }

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}))

import ManagerVisitEvaluationScreen from "../../src/screens/manager/ManagerVisitEvaluationScreen.android"

type Tree = TestRenderer.ReactTestRenderer
const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}
const textOf = (tree: Tree, testID: string) => texts(byTestId(tree, testID)).join(" ")

async function render() {
  let tree!: Tree
  await act(async () => { tree = TestRenderer.create(<ManagerVisitEvaluationScreen />) })
  return tree
}

async function press(tree: Tree, testID: string) {
  await act(async () => { byTestId(tree, testID).props.onPress() })
}

beforeEach(() => {
  mockParams = { visit: VISIT }
  mockSave.mockReset().mockResolvedValue({ success: true })
  mockGoBack.mockReset()
  mockNotify.mockReset()
})

describe("the manager rates the agent on a joint visit", () => {
  it("saves nothing until a point is rated", async () => {
    const tree = await render()
    const save = byTestId(tree, "manager-visit-evaluation-save")
    expect(save.props.disabled).toBe(true)
    expect(textOf(tree, "manager-visit-evaluation-save")).toBe("jointVisit.chooseFirst")
    await press(tree, "manager-visit-evaluation-save")
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("sends the rated points and the comment, and goes back", async () => {
    const tree = await render()
    await press(tree, "manager-visit-evaluation-PREPARATION-4")
    await press(tree, "manager-visit-evaluation-RAPPORT-5")
    await press(tree, "manager-visit-evaluation-NEEDS-3")
    // A second tap on the same number takes it back: the point did not happen.
    await press(tree, "manager-visit-evaluation-OBJECTIONS-2")
    await press(tree, "manager-visit-evaluation-OBJECTIONS-2")
    expect(textOf(tree, "manager-visit-evaluation-average")).toContain("4")
    await act(async () => { byTestId(tree, "manager-visit-evaluation-comment").props.onChangeText("  Ask more before presenting  ") })

    await press(tree, "manager-visit-evaluation-save")
    expect(mockSave).toHaveBeenCalledWith("visit-joint-1", {
      scores: { PREPARATION: 4, RAPPORT: 5, NEEDS: 3 },
      comment: "Ask more before presenting",
    })
    expect(mockNotify).toHaveBeenCalledWith({ tone: "success", title: "jointVisit.saved" })
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it("opens a rating already given with its numbers, and says why the server refused", async () => {
    mockParams = {
      visit: { ...VISIT, evaluation: { scores: { CLOSING: 5 }, average: 5, comment: "Fine", updatedAt: "2026-10-20T07:00:00.000Z" } },
    }
    mockSave.mockRejectedValueOnce(Object.assign(new Error("closed"), { code: "MTM_VISIT_EVALUATION_CLOSED" }))
    const tree = await render()
    expect(byTestId(tree, "manager-visit-evaluation-CLOSING-5").props.accessibilityState).toEqual({ checked: true })
    expect(byTestId(tree, "manager-visit-evaluation-comment").props.value).toBe("Fine")
    await press(tree, "manager-visit-evaluation-save")
    expect(textOf(tree, "manager-visit-evaluation-error")).toContain("jointVisit.errorClosed")
    expect(mockGoBack).not.toHaveBeenCalled()
  })
})
