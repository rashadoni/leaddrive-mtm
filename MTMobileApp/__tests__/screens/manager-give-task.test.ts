import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import { buildNotificationFeed, type FeedContext } from "../../src/services/notification-feed"
import { feedCopy } from "../../src/services/notification-feed-copy"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const sheet = read("screens/manager/ManagerGiveTaskSheet.android.tsx")
const employee = read("screens/manager/ManagerEmployeeScreen.android.tsx")
const managerApi = read("services/manager-api.ts")

/**
 * «Дать задачу» (owner, 2026-10-20: «чтоб была возможность создавать задачи
 * менеджерам через приложение»; mockup approved with «Давай»).
 */
describe("giving a task from the manager's phone", () => {
  it("puts «Дать задачу» on the employee's card, outlined beside the one filled «Позвонить»", () => {
    expect(employee).toContain('testID="manager-employee-give-task"')
    expect(employee).toContain('{t("managerTask.giveButton")}')
    expect(employee).toContain("<ManagerGiveTaskSheet visible={giveTaskOpen} agentId={agentId} agentName={name} pushReady={pushReady} onClose={() => setGiveTaskOpen(false)} />")
    expect(employee).toMatch(/giveTask: \{[^}]*borderWidth: 1\.5[^}]*backgroundColor: fieldTheme\.color\.surface/)
  })

  it("talks to the server's endpoint through the manager facade", () => {
    expect(managerApi).toContain('return api.requestLegacy("/mobile/manager/tasks", { method: "POST", body: JSON.stringify({ agentId, title, due }) })')
  })

  it("has every text in Russian, English and Azerbaijani, and every key the sheet asks for", () => {
    const keysOf = (value: Record<string, unknown>, prefix = ""): string[] => Object.entries(value).flatMap(([key, inner]) => (
      inner && typeof inner === "object" ? keysOf(inner as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`]
    ))
    const keys = (locale: "ru" | "en" | "az") => keysOf(mobileResources[locale].managerTask).sort()
    expect(keys("en")).toEqual(keys("ru"))
    expect(keys("az")).toEqual(keys("ru"))
    const used = [...`${sheet}\n${employee}`.matchAll(/"managerTask\.([\w.]+)"/g)].map((match) => match[1])
    expect(used.length).toBeGreaterThan(15)
    for (const key of used) expect(keys("ru")).toContain(key)
    for (const failure of ["notYourTeam", "dayPassed", "invalid", "offline", "session", "failed"]) expect(keys("ru")).toContain(`errors.${failure}`)
    expect(mobileResources.az.managerTask.giveButton).toBe("Tapşırıq ver")
    expect(mobileResources.ru.managerTask.giveButton).toBe("Дать задачу")
  })

  it("takes every colour from the palette, in both themes", () => {
    const found = sheet.split("\n").filter((line) => /(?:olor|Color)\s*:\s*"(?:#|rgb)/.test(line))
    expect(found).toEqual([])
    expect(sheet).toContain("const styles = themed(() => StyleSheet.create({")
  })
})

describe("the task in the agent's bell", () => {
  const field: FeedContext = { shell: "field", selfId: "agent-self", attendanceRequests: true, ownWorkday: false }
  it("shows the server's words — who gave it and what — and opens his tasks", () => {
    const items = buildNotificationFeed({
      context: field,
      copy: feedCopy("ru"),
      formatDay: (key: string) => key,
      now: new Date("2026-10-20T10:00:00.000Z"),
      sources: {
        server: [{
          id: "n-1",
          type: "task",
          title: "Новая задача от Fictional Kamran",
          body: "Bring the samples · срок завтра до 18:00",
          isRead: false,
          createdAt: "2026-10-20T09:00:00.000Z",
          metadata: { domain: "task", event: "task_assigned", assignedTaskId: "task-1", giverAgentId: "manager-1" },
        }],
      },
    } as Parameters<typeof buildNotificationFeed>[0])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: "task",
      title: "Новая задача от Fictional Kamran",
      body: "Bring the samples · срок завтра до 18:00",
      target: { screen: "Tasks" },
    })
  })
})
