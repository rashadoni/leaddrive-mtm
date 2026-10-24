import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { Modal } from "react-native"

// Exercise the real screen with fictional data; no device or server mutations.
const mockTask = {
  id: "task-example", title: "Check the delivery", agentId: "agent-example",
  status: "IN_PROGRESS", progress: 40, result: "Delivery checked",
  createdAt: "2026-10-20T09:00:00Z", recurrenceRule: "WEEKLY",
  customer: { name: "Example pharmacy", address: "Example street" },
}
let mockCurrentTask = { ...mockTask }
let mockPhase = "idle"
let mockOperations: any[] = []
const mockBack = jest.fn()
const mockProgress = jest.fn()
const mockDocuments = jest.fn()
const mockQueue = jest.fn()

jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ru" } }) }))
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockBack }),
  useRoute: () => ({ params: { task: mockCurrentTask } }),
}))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0 }))
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("../../src/components/FeedbackToast", () => () => null)
jest.mock("../../src/store/auth", () => ({ useAuthStore: (select: any) => select({ agent: { id: "agent-example" } }) }))
jest.mock("../../src/store/sync-status", () => ({
  useSyncStatusStore: (select?: any) => {
    const state = { online: mockPhase !== "offline", phase: mockPhase, conflicts: 0, pending: mockOperations.length }
    return select ? select(state) : state
  },
}))
jest.mock("../../src/services/api", () => ({ api: {
  getTasks: () => Promise.resolve({ success: true, data: { tasks: [mockCurrentTask] } }),
  getTaskDocuments: (...args: unknown[]) => mockDocuments(...args),
  updateTaskProgress: (...args: unknown[]) => mockProgress(...args),
} }))
jest.mock("../../src/services/outbox", () => ({ allOutboxOperations: () => Promise.resolve(mockOperations) }))
jest.mock("../../src/services/task-outbox", () => ({
  countPendingTaskUpdates: () => Promise.resolve(mockOperations.length),
  queueTaskStatusUpdate: (...args: unknown[]) => mockQueue(...args),
}))
jest.mock("../../src/services/sync-engine", () => ({
  flushRouteFieldOutbox: jest.fn().mockResolvedValue({ sent: 0 }),
  refreshSyncStatusCounts: jest.fn().mockResolvedValue(undefined),
}))

import TaskDetailScreen from "../../src/screens/tasks/TaskDetailScreen"

const trees: TestRenderer.ReactTestRenderer[] = []
async function open() {
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<TaskDetailScreen />) })
  trees.push(tree)
  return tree
}
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id)[0]
const byLabel = (tree: TestRenderer.ReactTestRenderer, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label)[0]
async function press(tree: TestRenderer.ReactTestRenderer, id: string) {
  await act(async () => { byId(tree, id).props.onPress() })
}
function content(node: TestRenderer.ReactTestInstance): string {
  return node.children.map(child => typeof child === "string" ? child : content(child)).join(" ")
}

beforeEach(() => {
  mockCurrentTask = { ...mockTask }
  mockPhase = "idle"
  mockOperations = []
  mockBack.mockReset()
  mockQueue.mockReset()
  mockProgress.mockReset().mockResolvedValue({ success: true })
  mockDocuments.mockReset().mockResolvedValue({ success: true, data: { documents: [
    { id: "doc-example", title: "Delivery note", fileName: "example.pdf", mimeType: "application/pdf", sizeBytes: 2048 },
  ] } })
})
afterEach(async () => { await act(async () => { trees.splice(0).forEach(tree => tree.unmount()) }) })

it("opens files and history as secondary views; Android back dismisses the sheet without leaving the task", async () => {
  const tree = await open()
  await press(tree, "task-detail-files")
  expect(content(byId(tree, "task-detail-files-content"))).toContain("Delivery note")
  expect(content(byId(tree, "task-detail-files-content"))).toContain("открыть или добавить их здесь нельзя")
  const modal = tree.root.findAllByType(Modal).find(n => n.props.visible)
  await act(async () => { modal!.props.onRequestClose() })
  expect(mockBack).not.toHaveBeenCalled()
  expect(tree.root.findAllByType(Modal).filter(n => n.props.visible)).toHaveLength(0)
  await press(tree, "task-detail-history")
  expect(content(byId(tree, "task-detail-history-content"))).toContain("task.tlCreated")
  expect(content(byId(tree, "task-detail-history-content"))).toContain("task.recurWeekly")
  await press(tree, "task-detail-sheet-close")
  expect(mockQueue).not.toHaveBeenCalled()
  expect(mockProgress).not.toHaveBeenCalled()
})

it("retries failed document loading inside the sheet", async () => {
  mockDocuments.mockResolvedValueOnce({ success: false })
  const tree = await open()
  await press(tree, "task-detail-files")
  expect(content(byId(tree, "task-detail-files-content"))).toContain("Не удалось загрузить")
  const retry = byId(tree, "task-detail-files-content").findAll(n => n.props.accessibilityRole === "button" && n.props.onPress)[0]
  await act(async () => { retry.props.onPress() })
  expect(content(byId(tree, "task-detail-files-content"))).toContain("Delivery note")
  expect(mockDocuments).toHaveBeenCalledTimes(2)
})

it("keeps progress updates and completion confirmation available to the assignee", async () => {
  const tree = await open()
  await act(async () => { byLabel(tree, "+10%").props.onPress() })
  expect(mockProgress).toHaveBeenCalledWith("task-example", 50)
  await press(tree, "task-detail-primary")
  const confirmation = tree.root.findAllByType(Modal).find(n => n.props.visible)
  expect(content(confirmation!)).toContain("Завершение задачи")
  expect(mockQueue).not.toHaveBeenCalled()
})

it.each(["offline", "pending"])("keeps progress blocked while %s", async reason => {
  if (reason === "offline") mockPhase = "offline"
  else mockOperations = [{ entity: "tasks", status: "pending", clientTimestamp: 1, data: { id: mockTask.id, status: "IN_PROGRESS" } }]
  const tree = await open()
  expect(byLabel(tree, "+10%").props.disabled).toBe(true)
  // Guard must also refuse a stale event that arrives after going offline.
  await act(async () => { byLabel(tree, "+10%").props.onPress() })
  expect(mockProgress).not.toHaveBeenCalled()
  if (reason === "pending") expect(byId(tree, "task-detail-primary").props.disabled).toBe(true)
})

it.each(["COMPLETED", "CANCELLED", "FOREIGN"])("keeps %s details read-only while preserving files and history", async status => {
  mockCurrentTask = status === "FOREIGN" ? { ...mockTask, agentId: "another-agent" } : { ...mockTask, status }
  const tree = await open()
  expect(byId(tree, "task-detail-primary")).toBeUndefined()
  expect(byLabel(tree, "+10%")).toBeUndefined()
  await press(tree, "task-detail-files")
  expect(content(byId(tree, "task-detail-files-content"))).toContain("Delivery note")
  expect(mockQueue).not.toHaveBeenCalled()
})
