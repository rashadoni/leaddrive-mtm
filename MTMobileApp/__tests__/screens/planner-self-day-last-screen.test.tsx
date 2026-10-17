/**
 * The agent's planner, rendered for real (owner, 2026-10-17: «День в конце»).
 * The agent marks clients first and picks the day at the bottom; the day he
 * picks re-checks every marked client with the server for that date, and the
 * route that is written is that day's — with the clients the day took.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import type { PlanningTarget } from "../../src/services/manager-planning"
import { planningTodayKey, shiftPlanningDateKey } from "../../src/services/manager-planning"

const mockGetRoutes = jest.fn()
const mockAsk = jest.fn((..._args: unknown[]) => Promise.resolve(true))
const mockNotify = jest.fn((..._args: unknown[]) => 1)
const mockSync = { online: true }

jest.mock("react-i18next", () => {
  const { mobileResources } = jest.requireActual("../../src/i18n/mobile-resources")
  const t = (key: string, options: Record<string, unknown> = {}) => {
    const value = key.split(".").reduce((node: any, part: string) => node?.[part], mobileResources.az)
    if (typeof value !== "string") return key
    return value.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) => String(options[name] ?? ""))
  }
  return { useTranslation: () => ({ t, i18n: { language: "az" } }) }
})
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0 }))
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: (selector: (state: unknown) => unknown) => selector({ data: { timezone: "Asia/Baku", policies: { canPlanOwnRoutes: true } } }),
}))
jest.mock("../../src/store/hints", () => ({
  useHintsStore: (selector: (state: unknown) => unknown) => selector({ enabled: false, dismissed: [], hydrated: true, dismiss: () => undefined }),
}))
jest.mock("../../src/store/sync-status", () => {
  const useSyncStatusStore = (selector: (state: { online: boolean }) => unknown) => selector(mockSync)
  useSyncStatusStore.getState = () => mockSync
  return { useSyncStatusStore }
})
jest.mock("../../src/services/app-feedback", () => ({
  ask: (...args: unknown[]) => mockAsk(...args),
  notify: (...args: unknown[]) => mockNotify(...args),
}))
jest.mock("../../src/services/api", () => ({
  api: { getRoutesForAgent: (...args: unknown[]) => mockGetRoutes(...args) },
}))

import PlanningWorkspaceCore from "../../src/screens/planning/PlanningWorkspaceCore.android"

type Node = TestRenderer.ReactTestInstance

const TODAY = planningTodayKey(new Date(), "Asia/Baku")
const TOMORROW = shiftPlanningDateKey(TODAY, 1)

/** Ids the server does not return for a date. */
let unavailable: Record<string, string[]> = {}
let recheckFails = false
let routesByDate: Record<string, unknown[]> = {}

const doctor = (id: string, date: string): PlanningTarget => ({
  key: `contact:${id}`,
  kind: "contact",
  customerId: `clinic-${id}`,
  contactId: id,
  name: `Doctor ${id}`,
  organizationName: `Clinic ${id}`,
  eligible: true,
  contactStatus: "ACTIVE",
  validOnDate: date,
})

const loadTargets = jest.fn(async (query: { date: string; targetId?: string }) => {
  if (query.targetId && recheckFails) throw new Error("NETWORK")
  const ids = query.targetId ? [query.targetId] : ["a", "b", "c"]
  const off = unavailable[query.date] ?? []
  return { targets: ids.filter((id) => !off.includes(id)).map((id) => doctor(id, query.date)), nextPage: null }
})
const saveDraft = jest.fn(async (..._args: unknown[]) => ({ routeId: "route-new", version: 1 }))
const publishDraft = jest.fn(async (..._args: unknown[]) => undefined)
const updatePublished = jest.fn(async (..._args: unknown[]) => ({ version: 5 }))
const onClose = jest.fn()

const agentSource = { kind: "self" as const, agent: { id: "agent-1", name: "Agent", role: "AGENT" } }
const targetSource = { loadTargets }
const writeSource = { saveDraft, publishDraft }
const publishedEditSource = { role: "AGENT", canPlanOwnRoutes: true, updatePublished }

const liveRoute = (date: string) => ({
  id: "route-live",
  date,
  status: "IN_PROGRESS",
  version: 4,
  agentId: "agent-1",
  points: [{ id: "pt-1", status: "PENDING", customerId: "clinic-x", contactId: "x", contact: { displayName: "Doctor x" }, customer: { name: "Clinic x" } }],
})

function textsOf(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}
const screenText = (tree: TestRenderer.ReactTestRenderer) => textsOf(tree.root).join(" | ")
const pressables = (tree: TestRenderer.ReactTestRenderer, role: string) =>
  tree.root.findAll((node) => node.props.accessibilityRole === role && typeof node.props.onPress === "function", { deep: false })
const client = (tree: TestRenderer.ReactTestRenderer, name: string): Node => {
  const found = pressables(tree, "checkbox").find((node) => textsOf(node).includes(name))
  if (!found) throw new Error(`No client "${name}"`)
  return found
}
const button = (tree: TestRenderer.ReactTestRenderer, label: string): Node => {
  const found = pressables(tree, "button").find((node) => textsOf(node).join("").includes(label))
  if (!found) throw new Error(`No button "${label}"`)
  return found
}
const byTestId = (tree: TestRenderer.ReactTestRenderer, testID: string): Node => {
  const found = tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === "function", { deep: false })[0]
  if (!found) throw new Error(`No ${testID}`)
  return found
}

const mounted: TestRenderer.ReactTestRenderer[] = []
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}
async function open(props: Record<string, unknown> = {}) {
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => {
    tree = TestRenderer.create(
      <PlanningWorkspaceCore
        onClose={onClose}
        agentSource={agentSource}
        targetSource={targetSource}
        writeSource={writeSource}
        publishedEditSource={publishedEditSource}
        initialHorizon={1}
        {...props}
      />,
    )
  })
  mounted.push(tree)
  // The client list waits for its search debounce.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)) })
  await settle()
  return tree
}
async function press(node: Node) {
  await act(async () => { node.props.onPress() })
  await settle()
}

beforeEach(() => {
  jest.clearAllMocks()
  unavailable = {}
  recheckFails = false
  routesByDate = {}
  mockSync.online = true
  mockGetRoutes.mockImplementation(async (date: string) => ({
    success: true,
    data: { routes: routesByDate[date] ?? [], capabilities: { canPublish: true } },
  }))
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("the agent picks the day after the clients", () => {
  it("lists the clients with no day chosen and does not save until one is", async () => {
    const tree = await open()
    expect(screenText(tree)).toContain("Hansı gün üçün?")
    expect(screenText(tree)).toContain("Müştəriləri seçin, sonra günü")
    expect(button(tree, "Marşrutu yadda saxla").props.disabled).toBe(true)

    await press(client(tree, "Doctor a"))
    await press(client(tree, "Doctor b"))
    expect(screenText(tree)).toContain("2 müştəri seçilib — indi günü seçin")
    expect(button(tree, "Marşrutu yadda saxla").props.disabled).toBe(true)
    expect(saveDraft).not.toHaveBeenCalled()
  })

  it("re-checks the marked clients for the day, names the one it refuses, and saves the rest on that day", async () => {
    unavailable[TOMORROW] = ["b"]
    const tree = await open()
    await press(client(tree, "Doctor a"))
    await press(client(tree, "Doctor b"))
    await press(byTestId(tree, "mtm-mobile-self-plan-day-tomorrow"))

    expect(loadTargets).toHaveBeenCalledWith({ kind: "contact", date: TOMORROW, targetId: "a" })
    expect(loadTargets).toHaveBeenCalledWith({ kind: "contact", date: TOMORROW, targetId: "b" })
    expect(screenText(tree)).toContain("seçimdən çıxarıldı: Doctor b")
    expect(screenText(tree)).toContain("1 müştəri seçilib")
    expect(mockGetRoutes).toHaveBeenCalledWith(TOMORROW, "agent-1")

    const save = button(tree, "Marşrutu yadda saxla")
    expect(save.props.disabled).toBe(false)
    await press(save)
    expect(saveDraft).toHaveBeenCalledTimes(1)
    expect(saveDraft).toHaveBeenCalledWith({
      agentId: "agent-1",
      date: TOMORROW,
      points: [{ customerId: "clinic-a", contactId: "a", plannedTime: null }],
    })
    expect(publishDraft).toHaveBeenCalledWith({ routeId: "route-new", expectedVersion: 1 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("changes nothing when the check cannot reach the server", async () => {
    const tree = await open()
    await press(client(tree, "Doctor a"))
    recheckFails = true
    await press(byTestId(tree, "mtm-mobile-self-plan-day-tomorrow"))
    expect(screenText(tree)).toContain("Müştəriləri bu gün üçün yoxlamaq alınmadı")
    expect(byTestId(tree, "mtm-mobile-self-plan-day-tomorrow").props.accessibilityState.checked).toBe(false)
    expect(button(tree, "Marşrutu yadda saxla").props.disabled).toBe(true)
    expect(screenText(tree)).toContain("1 müştəri seçilib")
  })

  it("adds the marked clients to the end of a day whose route is already live", async () => {
    routesByDate[TODAY] = [liveRoute(TODAY)]
    const tree = await open()
    await press(client(tree, "Doctor a"))
    await press(byTestId(tree, "mtm-mobile-self-plan-day-today"))

    expect(screenText(tree)).toContain("Bu günün marşrutu artıq dərc edilib (ziyarət: 1)")
    await press(button(tree, "Marşruta əlavə et"))
    expect(updatePublished).toHaveBeenCalledWith({
      routeId: "route-live",
      expectedVersion: 4,
      points: [
        { customerId: "clinic-x", contactId: "x", plannedTime: null },
        { customerId: "clinic-a", contactId: "a", plannedTime: null },
      ],
    })
    expect(saveDraft).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("«Planı dəyiş» names its day and leads to another one", () => {
  it("moves the clients just added to the new plan and leaves the published day as it was", async () => {
    routesByDate[TODAY] = [liveRoute(TODAY)]
    const tree = await open({ initialDate: TODAY, initialEditPublished: true })
    expect(screenText(tree)).toContain("Dərc edilmiş marşrut · Ziyarət: 1")
    await press(client(tree, "Doctor a"))
    expect(screenText(tree)).toContain("Ziyarət: 2")

    await press(byTestId(tree, `mtm-mobile-plan-other-day-${TODAY}`))
    // Only an addition was made: nothing is lost, nothing to ask.
    expect(mockAsk).not.toHaveBeenCalled()
    expect(screenText(tree)).toContain("Hansı gün üçün?")
    expect(screenText(tree)).toContain("1 müştəri seçilib")

    await press(byTestId(tree, "mtm-mobile-self-plan-day-tomorrow"))
    await press(button(tree, "Marşrutu yadda saxla"))
    expect(saveDraft).toHaveBeenCalledWith({
      agentId: "agent-1",
      date: TOMORROW,
      points: [{ customerId: "clinic-a", contactId: "a", plannedTime: null }],
    })
    expect(updatePublished).not.toHaveBeenCalled()
  })
})
