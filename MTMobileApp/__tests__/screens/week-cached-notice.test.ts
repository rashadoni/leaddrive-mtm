import { readFileSync } from "fs"
import { join } from "path"

/**
 * Audit B4 / task T7: the calendar told the agent "Сейчас нет связи" whenever
 * a request failed — a 500 with full signal said the connection was gone. That
 * sends someone to fix a network that works and hides the real fault from
 * whoever reads the report later.
 *
 * T7 fixed the contacts list and left this screen behind, which is why the
 * check is a contract and not a note: the two screens must stay fixed
 * together.
 */
const SRC = join(__dirname, "..", "..", "src")
const week = readFileSync(join(SRC, "screens", "week", "WeekScreen.tsx"), "utf8")
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8")
const contacts = read("screens", "base", "ContactsList.tsx")

describe("cached-data notice on the calendar", () => {
  it("decides the reason from connectivity, not from the failure alone", () => {
    expect(week).toContain("cachedViewNotice({ online, requestFailed: offline })")
    expect(week).toContain("useSyncStatusStore((state) => state.online)")
  })

  it("takes its wording from the shared dictionary", () => {
    expect(week).toContain("t(CACHED_VIEW_NOTICE_KEYS[notice])")
  })

  it("no longer claims a lost connection in any language", () => {
    // These were literals inside the component, one per language, shown for
    // every kind of failure.
    const stillThere = ["Сейчас нет связи", "You're offline", "Hazırda bağlantı yoxdur"]
      .filter((claim) => week.includes(claim))
    expect(stillThere).toEqual([])
  })

  it("keeps the pull-to-refresh advice only where it is true", () => {
    // "Pull down when your connection returns" is good advice offline and
    // nonsense when the server is the one that failed.
    expect(week).toContain('body={notice === "offline" ? copy.staleBody : undefined}')
  })

  it("stays in step with every screen that shows saved data", () => {
    // They drifted once already: T7 fixed the contacts list and left the
    // calendar saying "no connection" for a 500. Listing them here is what
    // stops the next screen from being fixed alone.
    const screens = {
      "screens/base/ContactsList.tsx": contacts,
      "screens/week/WeekScreen.tsx": week,
      "screens/base/OrganizationExplorerScreen.tsx": read("screens", "base", "OrganizationExplorerScreen.tsx"),
      "screens/base/ContactDetailScreen.tsx": read("screens", "base", "ContactDetailScreen.tsx"),
      "screens/tasks/TasksScreen.tsx": read("screens", "tasks", "TasksScreen.tsx"),
      "screens/tasks/TaskDetailScreen.tsx": read("screens", "tasks", "TaskDetailScreen.tsx"),
      "screens/visit/VisitScreen.tsx": read("screens", "visit", "VisitScreen.tsx"),
      "screens/visit/VisitWorkspaceScreen.tsx": read("screens", "visit", "VisitWorkspaceScreen.tsx"),
    }
    const missing = Object.entries(screens)
      .filter(([, source]) => !source.includes("cachedViewNotice(") || !source.includes("CACHED_VIEW_NOTICE_KEYS"))
      .map(([name]) => name)
    expect(missing).toEqual([])
  })
})
