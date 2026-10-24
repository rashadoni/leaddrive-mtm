/**
 * The agent's «Задачи» as one list, like the CRM's boards (owner, 2026-10-20:
 * «не понятно сразу, в какой вкладке задача… все задачи отображались и рядом
 * статус, который можно менять»; mockup approved with «Давай»). Rendered for
 * real; the network, the outbox and the chrome around the list are stubbed.
 * Fictional tasks.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGetTasks = jest.fn()
const mockQueue = jest.fn()
const mockNavigate = jest.fn()

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "ru" } }),
}))
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/services/api", () => ({ api: { getTasks: (...args: unknown[]) => mockGetTasks(...args) } }))
jest.mock("../../src/services/offline-reads", () => ({ readOfflineTasks: jest.fn().mockResolvedValue([]) }))
jest.mock("../../src/services/sync-engine", () => ({ flushRouteFieldOutbox: jest.fn().mockResolvedValue({ sent: 1 }) }))
jest.mock("../../src/services/task-outbox", () => ({
  countPendingTaskUpdates: jest.fn().mockResolvedValue(0),
  queueTaskStatusUpdate: (...args: unknown[]) => mockQueue(...args),
}))
jest.mock("../../src/store/sync-status", () => ({
  useSyncStatusStore: (selector: (state: { online: boolean }) => unknown) => selector({ online: true }),
}))
jest.mock("../../src/store/auth", () => ({ useAuthStore: { getState: () => ({ agent: null }) } }))
jest.mock("../../src/hooks/useTabBarHeight", () => ({ useHeaderTop: () => 0, useTabBarPadding: () => 0 }))
jest.mock("../../src/hooks/useAutoRefresh", () => {
  const { useEffect } = jest.requireActual("react")
  return { useAutoRefresh: (load: () => void) => { useEffect(() => { load() }, [load]) } }
})
jest.mock("../../src/components/FeedbackToast", () => () => null)
jest.mock("../../src/components/StatusBarBand", () => () => null)
jest.mock("../../src/components/LightScreenStatusBar", () => () => null)
jest.mock("../../src/components/NotificationBell", () => () => null)

import TasksScreen from "../../src/screens/tasks/TasksScreen"

type Tree = TestRenderer.ReactTestRenderer
type Node = TestRenderer.ReactTestInstance
const renderedTrees: Tree[] = []

const day = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  date.setHours(18, 0, 0, 0)
  return date.toISOString()
}

const TASKS = [
  { id: "t-later", title: "Collect the November order", status: "PENDING", priority: "MEDIUM", dueDate: day(3) },
  { id: "t-done", title: "Reconciliation act", status: "COMPLETED", priority: "MEDIUM", completedAt: day(-2) },
  { id: "t-overdue", title: "Get the contract signed", status: "OVERDUE", persistedStatus: "PENDING", priority: "HIGH", dueDate: day(-1) },
  { id: "t-returned", title: "Photograph the shelf", status: "IN_PROGRESS", priority: "MEDIUM", returnReason: "No price tags", dueDate: day(5) },
]

function ids(tree: Tree, prefix: string): string[] {
  const seen: string[] = []
  for (const node of tree.root.findAll((item) => typeof item.props.testID === "string" && item.props.testID.startsWith(prefix))) {
    if (!seen.includes(node.props.testID)) seen.push(node.props.testID)
  }
  return seen.map((testID) => testID.slice(prefix.length))
}
const one = (tree: Tree, testID: string): Node => tree.root.findAll((node) => node.props.testID === testID)[0]
function texts(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}

async function open(): Promise<Tree> {
  let tree!: Tree
  await act(async () => { tree = TestRenderer.create(<TasksScreen />) })
  renderedTrees.push(tree)
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
  return tree
}
async function press(tree: Tree, testID: string) {
  await act(async () => { await one(tree, testID).props.onPress() })
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  mockGetTasks.mockReset().mockResolvedValue({ success: true, data: { tasks: TASKS } })
  mockQueue.mockReset().mockResolvedValue(undefined)
  mockNavigate.mockReset()
})

afterEach(async () => {
  await act(async () => { renderedTrees.splice(0).forEach(tree => tree.unmount()) })
})

describe("all the agent's tasks in one list", () => {
  it("shows all tasks immediately, overdue and returned first, without hiding completed records", async () => {
    const tree = await open()
    expect(ids(tree, "tasks-group-")).toEqual(["open", "closed"])
    expect(ids(tree, "task-row-")).toEqual(["t-overdue", "t-returned", "t-later", "t-done"])
    expect(texts(one(tree, "task-row-t-returned")).join(" ")).toContain("Возвращена: No price tags")

    expect(ids(tree, "task-row-")).toEqual(["t-overdue", "t-returned", "t-later", "t-done"])
  })

  it("shows a completed-only list under All, with no extra expand action", async () => {
    mockGetTasks.mockResolvedValue({ success: true, data: { tasks: [TASKS[1]] } })
    const tree = await open()
    expect(ids(tree, "task-row-")).toEqual(["t-done"])
    expect(ids(tree, "tasks-group-")).toEqual(["closed"])
    await press(tree, "task-row-t-done")
    expect(mockNavigate).toHaveBeenCalledWith("TaskDetail", { task: TASKS[1] })
    expect(mockQueue).not.toHaveBeenCalled()
  })

  it("narrows to «Взяты» or «Выполнены» and counts each", async () => {
    const tree = await open()
    expect(texts(one(tree, "tasks-filter-ALL")).join(" ")).toContain("4")
    expect(texts(one(tree, "tasks-filter-PENDING")).join(" ")).toContain("2")

    await press(tree, "tasks-filter-IN_PROGRESS")
    expect(ids(tree, "tasks-group-")).toEqual([])
    expect(ids(tree, "task-row-")).toEqual(["t-returned"])

    await press(tree, "tasks-filter-COMPLETED")
    expect(ids(tree, "task-row-")).toEqual(["t-done"])
  })

  it("keeps the four filters on one line, shrinking a long label instead of wrapping it", async () => {
    // Owner, 2026-10-20: «Tamamlanıb падает на вторую строку… сделай, чтоб был на одной строке».
    const tree = await open()
    const flat = (style: unknown): Record<string, unknown> =>
      Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {})
    expect(flat(one(tree, "tasks-filters").props.style)).toMatchObject({ flexDirection: "row", flexWrap: "nowrap" })
    for (const value of ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"]) {
      const chip = one(tree, `tasks-filter-${value}`)
      const style = typeof chip.props.style === "function" ? chip.props.style({ pressed: false }) : chip.props.style
      expect(flat(style)).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 })
      const label = chip.findAll((node) => node.props.adjustsFontSizeToFit === true)
      expect(label.length).toBeGreaterThan(0)
      expect(label[0].props.numberOfLines).toBe(1)
    }
  })

  it("changes a status from the row: a tap on it, then the new one", async () => {
    const tree = await open()
    await press(tree, "task-status-t-overdue")
    expect(one(tree, "tasks-status-sheet")).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
    await press(tree, "tasks-status-IN_PROGRESS")
    expect(mockQueue).toHaveBeenCalledWith("t-overdue", "IN_PROGRESS", undefined)
  })

  it("asks for the result before «Выполнена», and leaves a closed task's status alone", async () => {
    const tree = await open()
    await press(tree, "task-status-t-later")
    await press(tree, "tasks-status-COMPLETED")
    expect(mockQueue).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.props.placeholder === "Например: согласовано, документы отправлены").length).toBeGreaterThan(0)

    expect(one(tree, "task-status-t-done").props.disabled).toBe(true)
  })

  it("opens the task from its row", async () => {
    const tree = await open()
    await press(tree, "task-row-t-later")
    expect(mockNavigate).toHaveBeenCalledWith("TaskDetail", { task: expect.objectContaining({ id: "t-later" }) })
    expect(mockQueue).not.toHaveBeenCalled()
  })
})
