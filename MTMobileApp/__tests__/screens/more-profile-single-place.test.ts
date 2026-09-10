import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Field UX audit 2026-09-05, task B11 and defect M-18, plus the duplicate list
 * the audit collected under "one thing in several places".
 *
 * "Ещё" is a menu of four links. Above them stood four introductions: an
 * eyebrow, a question, a paragraph about what is gathered here, an instruction
 * on how to tap, and a heading telling you to choose a section.
 *
 * The profile then repeated three things that already existed elsewhere: the
 * day's counters (the main screen, both showing zeros), "Моя GPS-история" (the
 * "Ещё" menu), and the sync chip. The chip was in four places at once, which
 * is four chances for them to disagree about the same fact.
 */
const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../src/screens", file), "utf8")

const more = read("more/MoreScreen.tsx")
const profile = read("profile/ProfileScreen.tsx")
const today = read("today/TodayScreen.tsx")
const taskDetail = read("tasks/TaskDetailScreen.tsx")

describe("B11: one thing in one place", () => {
  it("stops explaining a menu of four links", () => {
    for (const key of ["moreV2.eyebrow", "moreV2.subtitle", "moreV2.guide", "moreV2.sectionTitle"]) {
      expect(more).not.toContain(key)
    }
    expect(more).toContain('t("moreV2.title")')
  })

  it("names the screen instead of asking a question it cannot take an answer to", () => {
    const titles = (["ru", "en", "az"] as const).map(
      (locale) => (mobileResources[locale].moreV2 as Record<string, string>).title,
    )
    expect(titles).toEqual(["Ещё", "More", "Daha çox"])
  })

  it("leaves the orphaned strings nowhere in the dictionary", () => {
    const orphans: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const block = mobileResources[locale].moreV2 as Record<string, unknown>
      for (const key of ["eyebrow", "subtitle", "guide", "sectionTitle"]) {
        if (key in block) orphans.push(`${locale}.${key}`)
      }
    }
    expect(orphans).toEqual([])
  })

  it("does not repeat the day's counters in the profile", () => {
    expect(profile).not.toContain("performanceTitle")
    expect(profile).not.toContain("StatBox")
    expect(profile).not.toContain("todaySummary")
  })

  it("keeps GPS history in the menu that lists it", () => {
    expect(more).toContain("GpsHistory")
    expect(profile).not.toContain("GpsHistory")
  })

  it("shows the sync chip in exactly one place a field agent can reach", () => {
    // Today's header, with the sync centre behind it. The profile row and the
    // chip on every task card header are gone.
    expect(today).toContain("<SyncStatusChip inverse />")
    expect(profile).not.toContain("SyncStatusChip")
    expect(taskDetail).not.toContain("SyncStatusChip")
  })
})
