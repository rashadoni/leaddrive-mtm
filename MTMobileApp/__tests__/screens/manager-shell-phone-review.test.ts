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
    const styles = workspace.slice(workspace.indexOf("const styles = StyleSheet.create"))
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
    for (const source of [workspace, liveMap]) {
      expect(source).not.toMatch(/toLocaleString\(\[\]/)
      expect(source).toContain("formatLocalizedDateTime(")
    }
  })

  it("3. says the role in words, never MANAGER", () => {
    const translate = (dictionary: Record<string, any>) => (key: string) => key.split(".").reduce((node, part) => node?.[part], dictionary) as string
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

  it("6. does not call the manager «offline» on his own card, nor count him", () => {
    const rows = [
      { agent: { id: "manager" }, truth: { isOnline: false, gpsFreshness: "NO_COORDINATES" as const } },
      { agent: { id: "agent-1" }, truth: { isOnline: true, gpsFreshness: "FRESH" as const } },
      { agent: { id: "agent-2" }, truth: { isOnline: false, gpsFreshness: "STALE" as const } },
    ]
    expect(teamPresenceSummary(rows, "manager")).toEqual({ online: 1, offline: 1, gpsAttention: 1 })
    expect(teamPresenceSummary(rows, null)).toEqual({ online: 1, offline: 2, gpsAttention: 2 })
    expect(workspace).toContain("self={!!viewerId && agent.id === viewerId}")
    const card = workspace.slice(workspace.indexOf("function AgentTruthCard"))
    expect(card).toContain('{self ? (\n          <View style={[styles.presencePill, { backgroundColor: fieldTheme.color.primarySoft }]} testID="manager-own-card">')
    for (const locale of ["ru", "en", "az"] as const) expect(mobileResources[locale].managerShell.you).toBeTruthy()
  })
})
