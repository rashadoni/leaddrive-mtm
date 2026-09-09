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
const contacts = readFileSync(join(SRC, "screens", "base", "ContactsList.tsx"), "utf8")

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
    for (const claim of ["Сейчас нет связи", "You're offline", "Hazırda bağlantı yoxdur"]) {
      expect(week, `calendar still hard-codes "${claim}"`).not.toContain(claim)
    }
  })

  it("keeps the pull-to-refresh advice only where it is true", () => {
    // "Pull down when your connection returns" is good advice offline and
    // nonsense when the server is the one that failed.
    expect(week).toContain('body={notice === "offline" ? copy.staleBody : undefined}')
  })

  it("stays in step with the contacts list, which was fixed first", () => {
    for (const source of [week, contacts]) {
      expect(source).toContain("CACHED_VIEW_NOTICE_KEYS")
      expect(source).toContain("cachedViewNotice(")
    }
  })
})
