/**
 * A doctor who works in two clinics (Zeytun, 2026-11-13: «некоторые врачи
 * бывают в разных клиниках… чтоб агент сам принимал решение»). He used to
 * vanish from the agent's planner; now the agent picks the clinic, and the
 * route is saved at the clinic he picked — also when the day is chosen after.
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


const twoClinics = (date: string): PlanningTarget => ({
  key: "contact:two",
  kind: "contact",
  // The server's default: the clinic of his last visit.
  customerId: "clinic-a",
  contactId: "two",
  name: "Doctor two",
  organizationName: "Clinic A",
  eligible: true,
  contactStatus: "ACTIVE",
  validOnDate: date,
  clinicChoices: [
    { customerId: "clinic-a", organizationName: "Clinic A", address: "Yasamal", lastVisited: true },
    { customerId: "clinic-b", organizationName: "Clinic B", address: "Nəsimi", lastVisited: false },
  ],
})
const oneClinic = (date: string): PlanningTarget => ({
  key: "contact:one", kind: "contact", customerId: "clinic-c", contactId: "one", name: "Doctor one",
  organizationName: "Clinic C", eligible: true, contactStatus: "ACTIVE", validOnDate: date,
})

const loadTargets = jest.fn(async (query: { date: string; targetId?: string }) => {
  const all = [twoClinics(query.date), oneClinic(query.date)]
  return { targets: query.targetId ? all.filter((row) => row.contactId === query.targetId) : all, nextPage: null }
})
const saveDraft = jest.fn(async (..._args: unknown[]) => ({ routeId: "route-new", version: 1 }))
const publishDraft = jest.fn(async (..._args: unknown[]) => undefined)
const updatePublished = jest.fn(async (..._args: unknown[]) => ({ version: 5 }))
const onClose = jest.fn()

const agentSource = { kind: "self" as const, agent: { id: "agent-1", name: "Agent", role: "AGENT" } }
const targetSource = { loadTargets }
const writeSource = { saveDraft, publishDraft }
const publishedEditSource = { role: "AGENT", canPlanOwnRoutes: true, updatePublished }

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
async function open(props: Partial<React.ComponentProps<typeof PlanningWorkspaceCore>> = {}) {
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
  mockSync.online = true
  mockGetRoutes.mockImplementation(async () => ({ success: true, data: { routes: [], capabilities: { canPublish: true } } }))
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("a doctor of two clinics in the agent's planner", () => {
  it("asks where, and the route is saved at the clinic the agent picked", async () => {
    const tree = await open()
    // Not a client to tick at once: the row asks for the clinic.
    expect(pressables(tree, "checkbox").some((node) => textsOf(node).includes("Doctor two"))).toBe(false)
    const row = button(tree, "Doctor two")
    expect(textsOf(row)).toEqual(expect.arrayContaining(["İş yeri: 2", "Klinikanı seç"]))
    await press(row)

    const sheet = byTestId(tree, "planning-doctor-clinic-clinic-a")
    expect(sheet).toBeTruthy()
    expect(screenText(tree)).toContain("Doctor two harada olacaq?")
    expect(screenText(tree)).toContain("Son vizit burada olub")
    await press(byTestId(tree, "planning-doctor-clinic-clinic-b"))
    expect(screenText(tree)).toContain("1 müştəri seçilib")
    expect(screenText(tree)).toContain("Clinic B")

    // The day chosen after re-checks the doctor; the server's default (A) does not undo the pick.
    await press(byTestId(tree, "mtm-mobile-self-plan-day-tomorrow"))
    expect(loadTargets).toHaveBeenCalledWith({ kind: "contact", date: TOMORROW, targetId: "two" })
    await press(button(tree, "Marşrutu yadda saxla"))
    expect(saveDraft).toHaveBeenCalledWith({
      agentId: "agent-1",
      date: TOMORROW,
      points: [{ customerId: "clinic-b", contactId: "two", plannedTime: null }],
    })
  })

  it("adds nothing when the agent closes the question, and a doctor of one clinic is ticked at once", async () => {
    const tree = await open()
    await press(button(tree, "Doctor two"))
    await press(byTestId(tree, "planning-doctor-clinic-cancel"))
    expect(screenText(tree)).not.toContain("müştəri seçilib")

    await press(client(tree, "Doctor one"))
    expect(screenText(tree)).toContain("1 müştəri seçilib")
  })
})
