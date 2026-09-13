import fs from "fs"
import path from "path"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

/**
 * The owner opened the sync centre on the phone (2026-09-13) and asked what the
 * error was. The card said "Saxlanmış dəyişiklik server məlumatları ilə
 * ziddiyyət təşkil edir" over "MTM_VISIT_CUSTOMER_NO_COORDINATES": a generic
 * title, a raw server code, and no hint of what to do. The code had no entry
 * in the translation map.
 */
const chip = fs.readFileSync(path.resolve(__dirname, "../../src/components/SyncStatusChip.tsx"), "utf8")

describe("sync centre names a coordinates conflict in words", () => {
  it("maps the server code to its own title and help", () => {
    expect(chip).toContain('MTM_VISIT_CUSTOMER_NO_COORDINATES: "syncCenter.conflictNoCoordinates",')
    expect(chip).toContain('t("syncCenter.conflictNoCoordinatesHelp")')
  })

  it("names the client the rejected visit was for", () => {
    expect(chip).toContain("const fromServer = conflict.operation.conflict?.serverData?.customerId")
    expect(chip).toContain("api.getCustomer(id)")
    expect(chip).toContain('t("syncCenter.conflictCustomer", { name })')
  })

  it("shows a raw code only when the app has no words for it", () => {
    const card = chip.slice(chip.indexOf("<Text style={styles.conflictTitle}>"), chip.indexOf("<View style={styles.actionRow}>"))
    expect(card).toContain('conflictTranslationKey(code) === "syncCenter.conflictGeneric" ? (\n                      <Text style={styles.conflictCode}>{code}</Text>')
    expect(card).not.toMatch(/\n\s*<Text style=\{styles\.conflictCode\}>\{code\}<\/Text>\n\s*\{conflictTranslationKey/)
  })

  it("has the title and help in all three languages, naming the real buttons", () => {
    const problems: string[] = []
    for (const [name, locale] of [["az", az], ["ru", ru], ["en", en]] as const) {
      const sync = (locale as { syncCenter: Record<string, string> }).syncCenter
      const common = (locale as { common: Record<string, string> }).common
      if (!sync.conflictNoCoordinates?.trim()) problems.push(`${name}: title`)
      if (!sync.conflictCustomer?.includes("{{name}}")) problems.push(`${name}: customer line`)
      const help = sync.conflictNoCoordinatesHelp ?? ""
      if (!help.includes(common.retry)) problems.push(`${name}: help does not name "${common.retry}"`)
      if (!help.includes(sync.discard)) problems.push(`${name}: help does not name "${sync.discard}"`)
    }
    expect(problems).toEqual([])
  })
})
