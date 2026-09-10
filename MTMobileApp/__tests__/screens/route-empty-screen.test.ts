import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B9 and defect M-19.
 *
 * With "Сегодня маршрута нет" on the screen, the header still drew a stepper
 * reading "Шаг 1 из 5: Точка" — five steps of a route that does not exist.
 * Below it the same refresh was offered twice, once as a button and once as a
 * sentence telling you to pull the list. And at the bottom sat a card sending
 * you to Visits, while Visits held a card sending you back here.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
  "utf8",
)
const locales = ["ru", "en", "az"].map((locale) => ({
  locale,
  json: JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../src/i18n/locales/${locale}.json`), "utf8")),
}))

describe("B9: the route screen without a route", () => {
  it("draws no stepper when there are no steps", () => {
    // Both layouts: the phone list header and the tablet top strip.
    expect((source.match(/\{route \? <JourneySteps/g) ?? [])).toHaveLength(2)
    expect(source).not.toMatch(/(?<!\{route \? )<JourneySteps activeStep/)
  })

  it("offers one way to refresh, not a button and a sentence about a gesture", () => {
    const missing = locales.filter(({ json }) => {
      const hint = json.route?.noRouteHint
      return typeof hint !== "string" || /потяни|pull to refresh|çəkin/i.test(hint)
    })
    expect(missing.map((entry) => entry.locale)).toEqual([])
  })

  it("keeps an unplanned visit one press away without a card that points sideways", () => {
    // The card and Visits' own card described each other; the header action
    // does the same job in the space of an icon.
    expect(source).not.toContain("UnplannedVisitCard")
    expect(source).not.toContain("unplannedTitle")
    expect(source).not.toContain("unplannedBody")
    const header = source.slice(source.indexOf("  const header = ("), source.indexOf("  if (tablet) {"))
    expect(header).toContain("accessibilityLabel={copy.openVisits}")
    expect(header).toContain('navigation.navigate("Visits")')
  })

  it("still explains itself when the route is genuinely missing", () => {
    // Removing the pull-to-refresh sentence must not leave a bare title.
    const blank: string[] = []
    for (const { locale, json } of locales) {
      for (const key of ["noRouteTitle", "noRouteHint"]) {
        const value = json.route?.[key]
        if (typeof value !== "string" || !value.trim()) blank.push(`${locale}.${key}`)
      }
    }
    expect(blank).toEqual([])
  })

  it("leaves the own-route planning card, which nothing else offers here", () => {
    expect(source).toContain("OwnRoutePlanningCard")
    expect(source).toContain("copy.planOwnRoute")
  })
})
