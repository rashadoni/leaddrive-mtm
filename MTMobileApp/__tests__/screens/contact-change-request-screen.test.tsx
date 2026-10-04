/**
 * Route Field → client card → "propose a change", rendered for real: the form
 * offers the organization's own classes, sends only what the agent changed to
 * the app's v2 door, and tells the agent in words when the server refuses.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGoBack = jest.fn()
const mockGetDetail = jest.fn()
const mockSubmit = jest.fn()
const mockAsk = jest.fn((..._args: unknown[]) => Promise.resolve(true))

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { id: "c1", name: "Aliyev Farid" } }),
}))
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ru" } }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0 }))
jest.mock("../../src/services/app-feedback", () => ({ ask: (...args: unknown[]) => mockAsk(...args) }))
jest.mock("../../src/services/api", () => ({
  api: {
    getRouteContactDetail: (...args: unknown[]) => mockGetDetail(...args),
    submitRouteContactChangeRequest: (...args: unknown[]) => mockSubmit(...args),
  },
}))

import RouteContactChangeRequestScreen from "../../src/screens/base/RouteContactChangeRequestScreen.android"

type Node = TestRenderer.ReactTestInstance

const card = (changeRequest: Record<string, unknown> = {}, contact: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    contact: {
      id: "c1", name: "Aliyev Farid", firstName: "Farid", lastName: "Aliyev",
      updatedAt: "2026-10-01T08:00:00.000Z", specialty: "Kardioloq", category: "B", status: "ACTIVE", workplaces: [],
      ...contact,
    },
    changeRequest: {
      allowed: true,
      fields: ["category", "specialtyName", "firstName", "lastName"],
      classes: ["A", "B", "C", "VIP"],
      specialties: ["Kardioloq", "Nevroloq"],
      latest: null,
      ...changeRequest,
    },
  },
})

function textsOf(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}
const byTestId = (tree: TestRenderer.ReactTestRenderer, testID: string): Node | undefined =>
  tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
const buttonsIn = (node: Node): Node[] =>
  node.findAll((child) => child.props.accessibilityRole === "button" && typeof child.props.onPress === "function", { deep: false })
const chip = (tree: TestRenderer.ReactTestRenderer, group: string, label: string): Node => {
  const found = buttonsIn(byTestId(tree, group)!).find((node) => textsOf(node).join("") === label)
  if (!found) throw new Error(`No chip "${label}" in ${group}`)
  return found
}
const screenText = (tree: TestRenderer.ReactTestRenderer) => textsOf(tree.root).join(" | ")

const mounted: TestRenderer.ReactTestRenderer[] = []
// A macrotask turn lets every chained promise of load/submit finish.
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}
async function open() {
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<RouteContactChangeRequestScreen />) })
  mounted.push(tree)
  await settle()
  return tree
}
async function press(node: Node | undefined) {
  if (!node) throw new Error("Nothing to press")
  await act(async () => { node.props.onPress() })
  await settle()
}
async function type(tree: TestRenderer.ReactTestRenderer, testID: string, value: string) {
  await act(async () => { byTestId(tree, testID)!.props.onChangeText(value) })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetDetail.mockResolvedValue(card())
  mockSubmit.mockResolvedValue({ success: true, data: { id: "request-1" } })
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("the agent proposes a change to a client", () => {
  it("offers the organization's classes with the client's own one selected", async () => {
    const tree = await open()
    expect(mockGetDetail).toHaveBeenCalledWith("c1")
    const classes = buttonsIn(byTestId(tree, "contact-change-classes")!)
    expect(classes.map((node) => textsOf(node).join(""))).toEqual(["A", "B", "C", "VIP"])
    expect(classes.map((node) => node.props.accessibilityState.selected)).toEqual([false, true, false, false])
    expect(byTestId(tree, "contact-change-first-name")!.props.value).toBe("Farid")
    expect(byTestId(tree, "contact-change-last-name")!.props.value).toBe("Aliyev")
    // Two specialties: quicker to read than to search.
    expect(byTestId(tree, "contact-change-specialty-search")).toBeUndefined()
  })

  it("sends only what changed, to the manager, and goes back to the card", async () => {
    const tree = await open()
    await press(chip(tree, "contact-change-classes", "VIP"))
    expect(chip(tree, "contact-change-classes", "VIP").props.accessibilityState.selected).toBe(true)
    await type(tree, "contact-change-reason", "  Сам врач сказал на визите ")
    await press(byTestId(tree, "contact-change-submit"))

    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith("c1", {
      idempotencyKey: expect.stringMatching(/^contact-change-/),
      reason: "Сам врач сказал на визите",
      expectedContactUpdatedAt: "2026-10-01T08:00:00.000Z",
      changes: { category: "VIP" },
    })
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ title: "Заявка отправлена", tone: "success" }))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it("does not send a request that changes nothing or says no reason", async () => {
    const tree = await open()
    await type(tree, "contact-change-reason", "Сам врач сказал")
    await press(byTestId(tree, "contact-change-submit"))
    expect(screenText(tree)).toContain("Вы ничего не изменили.")

    await press(chip(tree, "contact-change-specialties", "Nevroloq"))
    await type(tree, "contact-change-reason", "")
    await press(byTestId(tree, "contact-change-submit"))
    expect(screenText(tree)).toContain("Напишите, почему нужно изменить данные.")

    expect(mockSubmit).not.toHaveBeenCalled()
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it("re-reads the card and says so when somebody changed the client meanwhile", async () => {
    mockSubmit.mockRejectedValue(Object.assign(new Error("Contact changed since the form was opened"), {
      code: "MTM_CONTACT_CONFLICT", status: 409,
    }))
    const tree = await open()
    await press(chip(tree, "contact-change-classes", "A"))
    await type(tree, "contact-change-reason", "Сам врач сказал")
    mockGetDetail.mockResolvedValue(card({}, { category: "C", updatedAt: "2026-10-02T08:00:00.000Z" }))
    await press(byTestId(tree, "contact-change-submit"))

    expect(mockGetDetail).toHaveBeenCalledTimes(2)
    expect(screenText(tree)).toContain("Карточку только что изменили.")
    expect(chip(tree, "contact-change-classes", "C").props.accessibilityState.selected).toBe(true)
    // What the agent wrote stays.
    expect(byTestId(tree, "contact-change-reason")!.props.value).toBe("Сам врач сказал")
    expect(mockGoBack).not.toHaveBeenCalled()
  })

  it("tells the agent in words when the organization switched the request off", async () => {
    mockSubmit.mockRejectedValue(Object.assign(new Error("The organization has switched this function off"), {
      code: "MTM_AGENT_PERMISSION_DISABLED", status: 403,
    }))
    const tree = await open()
    await press(chip(tree, "contact-change-classes", "A"))
    await type(tree, "contact-change-reason", "Сам врач сказал")
    await press(byTestId(tree, "contact-change-submit"))

    expect(screenText(tree)).toContain("Ваша организация отключила заявки на изменение клиентов.")
    expect(screenText(tree)).not.toContain("switched this function off")
  })

  it("shows no form when the organization does not allow the request", async () => {
    mockGetDetail.mockResolvedValue(card({ allowed: false }))
    const tree = await open()
    expect(byTestId(tree, "contact-change-submit")).toBeUndefined()
    expect(screenText(tree)).toContain("Ваша организация отключила заявки на изменение клиентов.")
  })

  it("shows no form while an earlier request waits for the manager", async () => {
    mockGetDetail.mockResolvedValue(card({ latest: { id: "r1", status: "SUBMITTED", reason: "Сказал врач" } }))
    const tree = await open()
    expect(byTestId(tree, "contact-change-submit")).toBeUndefined()
    expect(screenText(tree)).toContain("По этому клиенту уже есть ваша заявка.")
  })

  it("offers only the fields the organization uses", async () => {
    mockGetDetail.mockResolvedValue(card({ fields: ["category", "firstName", "lastName"], specialties: [] }))
    const tree = await open()
    expect(byTestId(tree, "contact-change-specialties")).toBeUndefined()
    expect(byTestId(tree, "contact-change-classes")).toBeDefined()
  })

  it("gives a long specialty list a search field", async () => {
    const specialties = ["Allerqoloq", "Kardioloq", "Nevroloq", "Pediatr", "Terapevt", "Uroloq", "Cərrah", "Oftalmoloq", "Dermatoloq"]
    mockGetDetail.mockResolvedValue(card({ specialties }))
    const tree = await open()
    expect(buttonsIn(byTestId(tree, "contact-change-specialties")!)).toHaveLength(9)
    await type(tree, "contact-change-specialty-search", "loq")
    expect(buttonsIn(byTestId(tree, "contact-change-specialties")!).map((node) => textsOf(node).join("")))
      .toEqual(["Allerqoloq", "Kardioloq", "Nevroloq", "Uroloq", "Oftalmoloq", "Dermatoloq"])
  })

  it("offers to try again when the card cannot be opened", async () => {
    mockGetDetail.mockRejectedValueOnce(new Error("SERVER_INVALID_RESPONSE_500"))
    const tree = await open()
    expect(screenText(tree)).toContain("Не удалось открыть карточку.")
    await press(buttonsIn(tree.root).find((node) => textsOf(node).join("") === "Повторить"))
    expect(byTestId(tree, "contact-change-submit")).toBeDefined()
  })
})
