/**
 * «Дать задачу» on the employee's card (owner, 2026-10-20: «чтоб была
 * возможность создавать задачи менеджерам через приложение»). Rendered for
 * real; the network, the toast and the safe area are stubbed. Fictional people.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockGiveTask = jest.fn()
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
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("../../src/services/app-feedback", () => ({ notify: (...args: unknown[]) => mockNotify(...args) }))
jest.mock("../../src/services/api", () => ({ api: {} }))
jest.mock("../../src/services/manager-api", () => ({
  managerApi: { giveTask: (...args: unknown[]) => mockGiveTask(...args) },
}))
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: (selector: (state: unknown) => unknown) => selector({ data: { timezone: "Asia/Baku" } }),
}))

import ManagerGiveTaskSheet from "../../src/screens/manager/ManagerGiveTaskSheet.android"

type Tree = TestRenderer.ReactTestRenderer
const one = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID)[0]
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}
const onClose = jest.fn()

async function open(props: Partial<React.ComponentProps<typeof ManagerGiveTaskSheet>> = {}) {
  let tree!: Tree
  await act(async () => {
    tree = TestRenderer.create(<ManagerGiveTaskSheet visible agentId="agent-elvin" agentName="Fictional Elvin" onClose={onClose} {...props} />)
  })
  return tree
}
async function press(tree: Tree, testID: string) {
  await act(async () => { await one(tree, testID).props.onPress() })
}
async function write(tree: Tree, text: string) {
  await act(async () => { one(tree, "manager-task-title").props.onChangeText(text) })
}

beforeEach(() => {
  mockGiveTask.mockReset().mockResolvedValue({ success: true, data: { task: { id: "task-1" }, pushReady: true } })
  mockNotify.mockReset()
  onClose.mockReset()
})

describe("«Дать задачу»", () => {
  it("sends whom, what and «tomorrow» by default, says it went, and closes", async () => {
    const tree = await open({ pushReady: true })
    expect(texts(one(tree, "manager-task-reach")).join("")).toBe("managerTask.reachYes")
    await write(tree, "  Bring the samples ")
    await press(tree, "manager-task-send")
    expect(mockGiveTask).toHaveBeenCalledWith("agent-elvin", "Bring the samples", "tomorrow")
    expect(mockNotify).toHaveBeenCalledWith({ tone: "success", title: "managerTask.sent", message: "managerTask.sentPush" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("sends a day chosen under «Дата…», and «Без срока» as none", async () => {
    const tree = await open()
    await write(tree, "Visit the warehouse")
    await press(tree, "manager-task-due-date")
    const firstDay = tree.root.findAll((node) => typeof node.props.testID === "string" && node.props.testID.startsWith("manager-task-day-"))[0]
    const day = String(firstDay.props.testID).replace("manager-task-day-", "")
    await act(async () => { firstDay.props.onPress() })
    await press(tree, "manager-task-send")
    expect(mockGiveTask).toHaveBeenLastCalledWith("agent-elvin", "Visit the warehouse", day)

    const again = await open()
    await write(again, "Call back")
    await press(again, "manager-task-due-none")
    await press(again, "manager-task-send")
    expect(mockGiveTask).toHaveBeenLastCalledWith("agent-elvin", "Call back", "none")
  })

  it("sends nothing without the words or without the day, and says what is missing", async () => {
    const tree = await open()
    await press(tree, "manager-task-send")
    expect(texts(one(tree, "manager-task-error")).join("")).toBe("managerTask.writeWhat")
    await write(tree, "Something")
    await press(tree, "manager-task-due-date")
    await press(tree, "manager-task-send")
    expect(texts(one(tree, "manager-task-error")).join("")).toBe("managerTask.chooseDay")
    expect(mockGiveTask).not.toHaveBeenCalled()
  })

  it("stays open with the server's reason when the agent is not in the team", async () => {
    mockGiveTask.mockRejectedValue(Object.assign(new Error("HTTP 403"), { code: "MTM_TASK_SCOPE_DENIED" }))
    const tree = await open({ pushReady: false })
    expect(texts(one(tree, "manager-task-reach")).join("")).toBe("managerTask.reachNo")
    await write(tree, "Nope")
    await press(tree, "manager-task-send")
    expect(texts(one(tree, "manager-task-error")).join("")).toBe("managerTask.errors.notYourTeam")
    expect(onClose).not.toHaveBeenCalled()
  })
})
