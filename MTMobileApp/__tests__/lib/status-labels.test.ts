import { readFileSync } from "node:fs"
import { join } from "node:path"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import { STATUS_GROUPS, statusKey, statusLabel } from "../../src/lib/status-labels"

/**
 * Field UX audit 2026-09-05, M-11 / task B15: "Magazin · Active",
 * "Checked out · Successful", "AGENT" and "WEEKEND" were server identifiers
 * printed as copy. Every value now has a label in each language.
 */
type Catalog = { status: Record<string, Record<string, string> | string> }

describe("status dictionary", () => {
  it.each([["az", az], ["ru", ru], ["en", en]] as Array<[string, Catalog]>)("%s labels every value", (locale, catalog) => {
    expect(catalog.status.unknown).toEqual(expect.any(String))
    for (const [group, values] of Object.entries(STATUS_GROUPS)) {
      for (const value of values) {
        const label = (catalog.status[group] as Record<string, string> | undefined)?.[value]
        // One assertion per value with the key in the payload, so a failure names it.
        expect({ key: `${locale}: status.${group}.${value}`, type: typeof label, raw: label === value })
          .toEqual({ key: `${locale}: status.${group}.${value}`, type: "string", raw: false })
      }
    }
  })

  it("resolves keys and falls back to the neutral label", () => {
    const t = (key: string) => `<${key}>`
    expect(statusKey("visit", "CHECKED_OUT")).toBe("status.visit.CHECKED_OUT")
    expect(statusKey("role", " agent ")).toBe("status.role.AGENT")
    expect(statusKey("dayKind", "NOT_A_KIND")).toBe("status.unknown")
    expect(statusLabel(t, "dayKind", "WEEKEND")).toBe("<status.dayKind.WEEKEND>")
    expect(statusLabel(t, "customer", undefined)).toBe("<status.unknown>")
  })

  it("no longer humanizes server codes on the organization card or the profile", () => {
    const card = readFileSync(join(__dirname, "../../src/screens/base/RouteOrganizationDetailScreen.android.tsx"), "utf8")
    expect(card).not.toContain("readable(visit.status)")
    expect(card).not.toContain("readable(detail.status)")
    expect(card).toContain('statusLabel(t, "customer", detail.status)')
    const profile = readFileSync(join(__dirname, "../../src/screens/profile/ProfileScreen.tsx"), "utf8")
    expect(profile).not.toContain("{agent?.role}</Text>")
    const week = readFileSync(join(__dirname, "../../src/screens/week/WeekScreen.tsx"), "utf8")
    expect(week).not.toContain('day.nonWorkingReason || t("week.dayOff")')
    expect(week).toContain("dayOffReason(day)")
  })
})
