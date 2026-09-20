import fs from "node:fs"
import path from "node:path"

function read(relative: string) {
  return fs.readFileSync(path.resolve(__dirname, "../../src", relative), "utf8")
}

describe("field visit UX simplification", () => {
  it("keeps presentations and visit tasks as separate actions", () => {
    const route = read("screens/route/RouteScreen.tsx")
    expect(route).toContain('presentations: "Презентация"')
    expect(route).toContain('visitTasks: "Задачи визита"')
    expect(route).not.toContain('openWorkspace: "Задачи и презентации"')
  })

  it("does not present optional or retired checklist actions as visit work", () => {
    const workspace = read("screens/visit/VisitWorkspaceScreen.tsx")
    expect(workspace).toContain('requirement.mode === "REQUIRED"')
    expect(workspace).toContain('["STOCK_CHECK", "VISIT_NOTE", "FEEDBACK"].includes(requirement.actionKey)')
  })

  it("surfaces server team messages in the route-field app", () => {
    const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
    const more = read("screens/more/MoreScreen.tsx")
    const messages = read("screens/more/TeamMessagesScreen.tsx")
    expect(navigator).toContain('name="Messages"')
    expect(more).toContain('route: "Messages"')
    expect(messages).toContain("api.getMobileMessages()")
    expect(messages).toContain('entity: "messageReceipts"')
  })
})
