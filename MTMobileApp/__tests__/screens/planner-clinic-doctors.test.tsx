/**
 * Zeytun 2026-11-13: «когда составляешь маршрут, выбор клиники будет для
 * того, чтоб выбрать там врачей… визит только к субъектам». Owner: pharmacies
 * stay stops of their own. The agent's planner is rendered for real: on
 * «Klinikalar» a clinic opens its doctors, and a ticked doctor is the stop.
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

const clinic = (id: string, name: string): PlanningTarget => ({ key: `customer:${id}`, kind: "organization", customerId: id, name, eligible: true })
const doctor = (id: string, clinicId: string, date: string): PlanningTarget => ({
  key: `contact:${id}`, kind: "contact", customerId: clinicId, contactId: id, name: `Dr ${id}`,
  organizationName: "Klinika 3", eligible: true, contactStatus: "ACTIVE", validOnDate: date,
})

const loadTargets = jest.fn(async (query: { kind: string; date: string; objectType?: string; clinicId?: string }) => {
  if (query.clinicId === "hospital-6") return { targets: [doctor("mammadova", "hospital-6", query.date)], nextPage: null }
  if (query.clinicId === "clinic-3") return { targets: [doctor("aliyeva", "clinic-3", query.date), doctor("huseynov", "clinic-3", query.date)], nextPage: null }
  if (query.clinicId) return { targets: [], nextPage: null }
  if (query.kind === "organization" && query.objectType === "CLINIC") return { targets: [clinic("clinic-3", "Klinika 3"), clinic("clinic-9", "Klinika 9")], nextPage: null }
  if (query.kind === "organization" && query.objectType === "PHARMACY") return { targets: [clinic("pharmacy-92", "Aptek 92")], nextPage: null }
  // A tab that is not «Klinikalar» (Zeytun's «Bütün müştərilər»): the row says what it is.
  if (query.kind === "organization" && query.objectType === "OTHER") return {
    targets: [
      { ...clinic("hospital-6", "6 saylı Xəstəxana"), objectType: "OTHER", doctorCount: 2 },
      { ...clinic("pharmacy-7", "Aptek 7"), objectType: "PHARMACY", doctorCount: 1 },
      { ...clinic("office-1", "Ofis 1"), objectType: "OTHER", doctorCount: 0 },
    ],
    nextPage: null,
  }
  return { targets: [], nextPage: null }
})
const saveDraft = jest.fn(async (..._args: unknown[]) => ({ routeId: "route-new", version: 1 }))
const publishDraft = jest.fn(async (..._args: unknown[]) => undefined)

const agentSource = { kind: "self" as const, agent: { id: "agent-1", name: "Agent", role: "AGENT" } }
const writeSource = { saveDraft, publishDraft }

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
const tab = (tree: TestRenderer.ReactTestRenderer, label: string): Node => {
  const found = pressables(tree, "tab").find((node) => textsOf(node).join("").includes(label))
  if (!found) throw new Error(`No tab "${label}"`)
  return found
}
const has = (tree: TestRenderer.ReactTestRenderer, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false }).length > 0

const mounted: TestRenderer.ReactTestRenderer[] = []
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}
const debounce = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)) })
  await settle()
}
async function open(targetSource: { loadTargets: typeof loadTargets; clinicDoctors?: boolean }) {
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => {
    tree = TestRenderer.create(
      <PlanningWorkspaceCore onClose={jest.fn()} agentSource={agentSource} targetSource={targetSource} writeSource={writeSource} initialHorizon={1} />,
    )
  })
  mounted.push(tree)
  await debounce()
  return tree
}
async function press(node: Node) {
  await act(async () => { node.props.onPress() })
  await debounce()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSync.online = true
  mockGetRoutes.mockImplementation(async () => ({ success: true, data: { routes: [], capabilities: { canPublish: true } } }))
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach((tree) => tree.unmount()) })
})

describe("«Klinikalar» opens a clinic's doctors", () => {
  it("lists the clinic's doctors instead of adding the clinic, and the ticked doctor is the stop", async () => {
    const tree = await open({ loadTargets, clinicDoctors: true })
    await press(tab(tree, "Klinikalar"))
    await press(client(tree, "Klinika 3"))

    expect(has(tree, "planning-clinic-doctors")).toBe(true)
    expect(loadTargets).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "contact", clinicId: "clinic-3", date: TODAY }), expect.anything())
    // The clinic was not marked as a client of the route.
    expect(screenText(tree)).not.toContain("1 müştəri seçilib")

    await press(client(tree, "Dr aliyeva"))
    expect(screenText(tree)).toContain("1 müştəri seçilib")
    expect(client(tree, "Dr aliyeva").props.accessibilityState).toMatchObject({ checked: true })

    await press(byTestIdPress(tree, "planning-clinic-back"))
    expect(has(tree, "planning-clinic-doctors")).toBe(false)
    expect(screenText(tree)).toContain("Klinika 9")
  })

  it("adds a clinic with no doctors as itself, when asked", async () => {
    const tree = await open({ loadTargets, clinicDoctors: true })
    await press(tab(tree, "Klinikalar"))
    await press(client(tree, "Klinika 9"))
    await press(byTestIdPress(tree, "planning-clinic-add-itself"))
    expect(has(tree, "planning-clinic-doctors")).toBe(false)
    expect(screenText(tree)).toContain("1 müştəri seçilib")
  })

  it("leaves pharmacies, and a planner whose source cannot list a clinic's doctors, as before", async () => {
    const tree = await open({ loadTargets, clinicDoctors: true })
    await press(tab(tree, "Apteklər"))
    await press(client(tree, "Aptek 92"))
    expect(has(tree, "planning-clinic-doctors")).toBe(false)
    expect(screenText(tree)).toContain("1 müştəri seçilib")

    const manager = await open({ loadTargets })
    await press(tab(manager, "Klinikalar"))
    await press(client(manager, "Klinika 3"))
    expect(has(manager, "planning-clinic-doctors")).toBe(false)
  })
})

describe("a clinic opens its doctors from any tab (Zeytun 2026-11-13: «klinikanı müştəri kimi açır, həkimləri yox»)", () => {
  it("says how many doctors work there and opens them instead of adding the clinic", async () => {
    const tree = await open({ loadTargets, clinicDoctors: true })
    await press(tab(tree, "Digər təşkilatlar"))

    const hospital = button(tree, "6 saylı Xəstəxana")
    expect(textsOf(hospital)).toEqual(expect.arrayContaining(["Həkim: 2", "Həkimlər"]))
    await press(hospital)

    expect(has(tree, "planning-clinic-doctors")).toBe(true)
    expect(loadTargets).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "contact", clinicId: "hospital-6" }), expect.anything())
    expect(screenText(tree)).not.toContain("1 müştəri seçilib")
    await press(client(tree, "Dr mammadova"))
    expect(screenText(tree)).toContain("1 müştəri seçilib")
  })

  it("keeps a pharmacy, and a place with no doctors, a stop of its own", async () => {
    const tree = await open({ loadTargets, clinicDoctors: true })
    await press(tab(tree, "Digər təşkilatlar"))
    await press(client(tree, "Aptek 7"))
    await press(client(tree, "Ofis 1"))
    expect(has(tree, "planning-clinic-doctors")).toBe(false)
    expect(screenText(tree)).toContain("2 müştəri seçilib")
  })
})

function byTestIdPress(tree: TestRenderer.ReactTestRenderer, testID: string): Node {
  const found = tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === "function", { deep: false })[0]
  if (!found) throw new Error(`No ${testID}`)
  return found
}
