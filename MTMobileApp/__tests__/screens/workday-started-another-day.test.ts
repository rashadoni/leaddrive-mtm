import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import { formatLocalizedDate } from "../../src/lib/format-localized-date"

/**
 * On the phone, 2026-09-14: a workday started on the 13th at 20:57 and never
 * ended read "İş günü 20:57-da başlayıb" the next morning — as if it had started
 * today. The date is now said whenever it is not today.
 */
const today = fs.readFileSync(path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"), "utf8")

describe("Today names the day a still-open workday started on", () => {
  it("adds the date only when the start was not today", () => {
    expect(today).toContain("new Date(currentWorkday.startedAt).toDateString() !== new Date().toDateString()")
    expect(today).toContain('t("todayV2.dayStartedOnAt", { date: startedOn, time: startedAt })')
    expect(today).toContain('t("todayV2.dayStartedAt", { time: startedAt })')
  })

  it("formats the date through the shared helper, lower-case in Azerbaijani", () => {
    expect(today).toContain('formatLocalizedDate(new Date(currentWorkday.startedAt), i18n.language, { day: "numeric", month: "long" })')
    expect(formatLocalizedDate(new Date(2026, 8, 13, 20, 57), "az", { day: "numeric", month: "long" })).toBe("13 sentyabr")
  })

  it("has the sentence with both placeholders in all three languages", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const text = (mobileResources[locale].todayV2 as Record<string, string>).dayStartedOnAt ?? ""
      if (!text.includes("{{date}}") || !text.includes("{{time}}")) missing.push(locale)
    }
    expect(missing).toEqual([])
  })
})
