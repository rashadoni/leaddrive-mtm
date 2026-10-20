import fs from "fs"
import path from "path"
import { formatLocalizedDateTime } from "../../src/lib/format-localized-date"
import { statusLabel } from "../../src/lib/status-labels"
import { teamPresenceSummary } from "../../src/services/manager-location-truth"
import { mobileResources } from "../../src/i18n/mobile-resources"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const workspace = read("screens/manager/ManagerWorkspaceScreen.android.tsx")
const calendar = read("screens/manager/ManagerPlanningCalendarScreen.android.tsx")
const liveMap = read("screens/manager/ManagerLiveMap.android.tsx")

/** Owner's phone, build 488, Zeytun, manager in Azerbaijani (2026-10-17). */
describe("manager shell: what the phone review found", () => {
  it("1. keeps the header title visible on a phone: the copy is not collapsed by flex in a column", () => {
    const styles = workspace.slice(workspace.indexOf("const styles = themed(() => StyleSheet.create"))
    expect(styles).toContain("headerCopy: { gap: fieldTheme.space.xs },")
    expect(styles).toContain("headerCopyTablet: { flex: 1 },")
    expect(workspace).toContain("<View style={[styles.headerCopy, tablet && styles.headerCopyTablet]}>")
    expect(workspace).toContain("<Text style={styles.title}>{t(meta.titleKey)}</Text>")
  })

  it("2. writes dates in the app's language, Azerbaijani included", () => {
    const at = new Date(2026, 9, 17, 15, 5)
    expect(formatLocalizedDateTime(at, "az")).toBe("17 okt, 15:05")
    expect(formatLocalizedDateTime(at.getTime(), "az-AZ")).toBe("17 okt, 15:05")
    expect(formatLocalizedDateTime("not a date", "az")).toBe("—")
    for (const source of [workspace, liveMap]) expect(source).not.toMatch(/toLocaleString\(\[\]/)
    // The map prints no date of its own since the cards under it went (7.).
    expect(workspace).toContain("formatLocalizedDateTime(")
  })

  it("3. says the role in words, never MANAGER", () => {
    const translate = (dictionary: Record<string, any>) => (key: string): string => key.split(".").reduce<any>((node, part) => node?.[part], dictionary)
    expect(statusLabel(translate(az), "role", "MANAGER")).toBe("Menecer")
    expect(statusLabel(translate(az), "role", "SUPERVISOR")).toBe("Supervayzer")
    expect(statusLabel(translate(ru), "role", "MANAGER")).toBe("Менеджер")
    expect(statusLabel(translate(en), "role", "AGENT")).toBe("Field agent")
    expect(workspace).toContain('{statusLabel(t, "role", agent.role)} · {workdayLabel(agent.workday?.status, t)}')
    expect(workspace).not.toContain("{agent.role} ·")
  })

  it.each(["ru", "en", "az"] as const)("4. says in %s what really waits in approvals", (locale) => {
    const body = mobileResources[locale].managerShell.approvalsBody
    expect(body).not.toMatch(/aptek|аптек|pharmacy/i)
    const expected = { az: ["marşrut", "həkim", "məzuniyyət", "müştəri"], ru: ["Маршрут", "врач", "отпуск", "клиент"], en: ["routes", "doctor", "leave", "client"] }[locale]
    for (const word of expected) expect(body).toContain(word)
  })

  it("5. fits the planning header on a phone: the subtitle wraps and the button has its own row", () => {
    expect(calendar).toContain("<Text style={styles.subtitle}>{copy.subtitle}</Text>")
    expect(calendar).not.toContain("numberOfLines={tablet ? 2 : 1} style={styles.subtitle}")
    expect(calendar).toContain("{tablet ? createButton : null}")
    expect(calendar).toContain("{tablet ? null : <View style={styles.headerActions}>{createButton}</View>}")
    expect(calendar).toContain("headerCopy: { flex: 1, minWidth: 0, gap: 2 },")
  })

  it("6. leaves the manager out of his own team: no card, no count, not on the map", () => {
    const rows = [
      { agent: { id: "manager" }, truth: { isOnline: false, gpsFreshness: "NO_COORDINATES" as const } },
      { agent: { id: "agent-1" }, truth: { isOnline: true, gpsFreshness: "FRESH" as const } },
      { agent: { id: "agent-2" }, truth: { isOnline: false, gpsFreshness: "STALE" as const } },
    ]
    expect(teamPresenceSummary(rows, "manager")).toEqual({ online: 1, offline: 1, gpsAttention: 1 })
    expect(teamPresenceSummary(rows, null)).toEqual({ online: 1, offline: 2, gpsAttention: 2 })
    // Owner, 2026-10-17: «менеджер сам себя видит, открывается у него
    // карточка». The rows that feed both the list and the map leave him out.
    expect(workspace).toContain(".filter((agent) => !viewerId || agent.id !== viewerId)")
    expect(workspace).not.toContain("manager-own-card")
    expect(workspace).toContain("<ManagerLiveMap rows={teamRows}")
  })

  it("7. shows each employee once on «Komanda»: the map has no card list of its own", () => {
    // One agent stood three times on one screen: a card rail above the map, a
    // «Seçilmiş əməkdaş» block under it and his card in the team list (owner,
    // 2026-10-17: «два раза агента список выходит»). The list stays; the map
    // names an employee in its own popup when a marker is tapped.
    expect(liveMap).not.toContain("managerShell.liveMapEvidenceTitle")
    expect(liveMap).not.toContain("managerShell.liveMapSelected")
    expect(liveMap).not.toContain("<ScrollView")
    expect(workspace).toContain("{teamRows.map(({ agent, truth }) => (")
  })
})
