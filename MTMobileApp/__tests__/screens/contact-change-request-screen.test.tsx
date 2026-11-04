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
  useNavigation: () => ({ goBack: mockGoBack, navigate: (...args: unknown[]) => mockNavigate(...args) }),
  useRoute: () => ({ params: { id: "c1", name: "Aliyev Farid" } }),
}))
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ru" } }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0 }))
jest.mock("../../src/services/app-feedback", () => ({ ask: (...args: unknown[]) => mockAsk(...args) }))
const mockGetPlace = jest.fn()
const mockSubmitPlace = jest.fn()
const mockNavigate = jest.fn()
jest.mock("../../src/services/api", () => ({
  api: {
    getRouteContactDetail: (...args: unknown[]) => mockGetDetail(...args),
    submitRouteContactChangeRequest: (...args: unknown[]) => mockSubmit(...args),
    getRouteOrganizationDetail: (...args: unknown[]) => mockGetPlace(...args),
    submitOrganizationLocationRequest: (...args: unknown[]) => mockSubmitPlace(...args),
  },
}))
// Nothing about the session is under test: the organization switched nothing off.
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: require("zustand").create(() => ({})) }))

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


// «Адрес и точка» (owner, 2026-11-04): «местоположения и адрес также сделать в
// этом разделе, а не искать где-то в другом месте»; «должно быть и до и на месте».
describe("the agent proposes a workplace's address and pin in advance", () => {
  const { useLocationPickStore } = require("../../src/store/location-picks")
  const north = (latitude: number, meters: number) => latitude + meters / 111_195
  const place = (locationRequest: Record<string, unknown> | null = null, organization: Record<string, unknown> = {}) => ({
    success: true,
    data: {
      organization: { id: "org-1", name: "Poliklinika 5", address: "Füzuli küç. 12", latitude: 40.4, longitude: 49.85, contacts: [], visits: [], ...organization },
      locationRequest,
    },
  })
  const withWorkplace = (changeRequest: Record<string, unknown> = {}) => card(changeRequest, {
    workplaces: [{ customerId: "org-1", name: "Poliklinika 5", address: "Füzuli küç. 12", isPrimary: true }],
  })

  beforeEach(() => {
    mockGetDetail.mockResolvedValue(withWorkplace())
    mockGetPlace.mockResolvedValue(place())
    mockSubmitPlace.mockResolvedValue({ success: true, data: { request: { id: "loc-1" } } })
  })
  afterEach(() => { act(() => { useLocationPickStore.setState({ picks: {} }) }) })

  it("shows the place the client works at, with its address as the card has it", async () => {
    const tree = await open()
    expect(mockGetPlace).toHaveBeenCalledWith("org-1")
    expect(byTestId(tree, "contact-change-place")).toBeDefined()
    expect(byTestId(tree, "contact-change-address")!.props.value).toBe("Füzuli küç. 12")
    expect(textsOf(byTestId(tree, "contact-change-pin")!).join("")).toBe("Точка на карте стоит")
  })

  it("sends a corrected address alone as the place's request in advance, with the pin as it stands", async () => {
    const tree = await open()
    await type(tree, "contact-change-address", "Nizami küç. 41")
    await type(tree, "contact-change-reason", "Переехали в новое здание")
    await press(byTestId(tree, "contact-change-submit"))
    // Nothing about the doctor changed: his request is not sent.
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(mockSubmitPlace).toHaveBeenCalledWith("org-1", {
      idempotencyKey: expect.stringMatching(/^place-advance-/),
      origin: "REMOTE",
      proposed: { latitude: 40.4, longitude: 49.85 },
      address: "Nizami küç. 41",
      comment: "Переехали в новое здание",
    })
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Подтвердить: клиент здесь") }))
    expect(mockGoBack).toHaveBeenCalled()
  })

  it("opens the map to put the pin, and sends the pin put there with the doctor's change", async () => {
    const tree = await open()
    await press(byTestId(tree, "contact-change-put-pin"))
    expect(mockNavigate).toHaveBeenCalledWith("OrganizationLocationFix", { id: "org-1", name: "Poliklinika 5", latitude: 40.4, longitude: 49.85, mode: "advance" })
    // Back from the map with a pin 1.2 km north.
    const door = { latitude: north(40.4, 1_200), longitude: 49.85 }
    await act(async () => { useLocationPickStore.getState().pick("org-1", door) })
    expect(textsOf(byTestId(tree, "contact-change-pin")!).join("")).toBe("Новая точка — в 1,2 км от прежней")
    await press(chip(tree, "contact-change-classes", "VIP"))
    await type(tree, "contact-change-reason", "Сказали на визите")
    await press(byTestId(tree, "contact-change-submit"))
    expect(mockSubmit).toHaveBeenCalledWith("c1", expect.objectContaining({ changes: { category: "VIP" } }))
    expect(mockSubmitPlace).toHaveBeenCalledWith("org-1", expect.objectContaining({ origin: "REMOTE", proposed: door }))
    expect(mockSubmitPlace.mock.calls[0][1]).not.toHaveProperty("address")
  })

  it("says the doctor's change went and the place's did not — and does not send the doctor's twice", async () => {
    mockSubmitPlace.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "MTM_LOCATION_REQUEST_PENDING" }))
    const tree = await open()
    await press(chip(tree, "contact-change-classes", "VIP"))
    await type(tree, "contact-change-address", "Nizami küç. 41")
    await type(tree, "contact-change-reason", "Сказали на визите")
    await press(byTestId(tree, "contact-change-submit"))
    expect(screenText(tree)).toContain("Изменения врача отправлены, а адрес и точка — нет. По этому месту уже ждёт заявка на адрес.")
    expect(mockGoBack).not.toHaveBeenCalled()
    await press(byTestId(tree, "contact-change-submit"))
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it("offers nothing for a place where a request already waits, and replaces only his own advance one", async () => {
    mockGetPlace.mockResolvedValue(place({ id: "r9", status: "SUBMITTED", mine: false, proposedLatitude: 40.41, proposedLongitude: 49.85, origin: "ON_SITE" }))
    let tree = await open()
    expect(byTestId(tree, "contact-change-place-waiting")).toBeDefined()
    expect(byTestId(tree, "contact-change-address")).toBeUndefined()

    mockGetPlace.mockResolvedValue(place({ id: "r9", status: "SUBMITTED", mine: true, proposedLatitude: 40.41, proposedLongitude: 49.85, origin: "REMOTE", confirmedAt: null }))
    tree = await open()
    expect(byTestId(tree, "contact-change-place-replaces")).toBeDefined()
    expect(byTestId(tree, "contact-change-address")).toBeDefined()
  })

  it("asks for a pin for a place that has none", async () => {
    mockGetPlace.mockResolvedValue(place(null, { latitude: null, longitude: null }))
    const tree = await open()
    expect(textsOf(byTestId(tree, "contact-change-pin")!).join("")).toBe("Точки на карте нет")
    await type(tree, "contact-change-address", "Nizami küç. 41")
    await type(tree, "contact-change-reason", "Переехали")
    await press(byTestId(tree, "contact-change-submit"))
    expect(screenText(tree)).toContain("У места нет точки на карте — поставьте её.")
    expect(mockSubmitPlace).not.toHaveBeenCalled()
  })

  it("keeps the place open while the doctor's own request waits", async () => {
    mockGetDetail.mockResolvedValue(withWorkplace({ latest: { id: "q1", status: "SUBMITTED" } }))
    const tree = await open()
    expect(textsOf(byTestId(tree, "contact-change-contact-closed")!).join("")).toBe("Изменения врача: ваша прошлая заявка ещё ждёт руководителя.")
    expect(byTestId(tree, "contact-change-classes")).toBeUndefined()
    expect(byTestId(tree, "contact-change-address")).toBeDefined()
  })
})
