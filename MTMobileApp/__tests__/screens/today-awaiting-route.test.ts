import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * 2026-10-07, the owner's phone: with a route saved but not approved, Today
 * showed nothing of it — «всё ты удалил, ничего не осталось». Today now lists
 * the route's clients in order and says it waits for the manager.
 */
const today = fs.readFileSync(path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"), "utf8")

describe("Today: the screen shows a route that waits for approval", () => {
  it("looks for it only when there is no route to start, from the same read", () => {
    expect(today).toContain("const activeRoute = selectTodayRoute(routes, todayKey)")
    expect(today).toContain("setAwaitingRoute(activeRoute ? null : selectTodayAwaitingRoute(routes, todayKey))")
    const kind = today.slice(today.indexOf("const nextKind: NextKind = useMemo("), today.indexOf("const routeSummaryText"))
    expect(kind.indexOf('if (route) return "route"')).toBeLessThan(kind.indexOf('if (awaitingRoute) return "awaiting"'))
    expect(kind.indexOf('if (awaitingRoute) return "awaiting"')).toBeLessThan(kind.indexOf('if (loading) return "loading"'))
  })

  it("lists its clients by number and leads to the Route tab, never to «start»", () => {
    expect(today).toContain("awaitingRoute.points.map((point, index) => (")
    const copy = today.slice(today.indexOf('if (nextKind === "awaiting") {'), today.indexOf('if (nextKind === "tasks") {'))
    expect(copy).toContain('destination: "Route" as Destination')
    expect(copy).toContain("startRoute: false")
    expect(copy).toContain("startWorkday: false")
    expect(copy).toContain('button: t("todayV2.openRoute")')
  })

  it("says so in every language, with the number of stops, and without the word «draft»", () => {
    const words = (["ru", "en", "az"] as const).map((locale) => [
      mobileResources[locale].todayV2.routeAwaitingTitle,
      mobileResources[locale].todayV2.routeAwaitingBody,
    ])
    expect(words.map(([title]) => title)).toEqual([
      "Маршрут ждёт утверждения", "Route is waiting for approval", "Marşrut təsdiq gözləyir",
    ])
    expect(words.filter(([, body]) => !body.includes("{{count}}"))).toEqual([])
    expect(words.flat().filter((text) => /чернов|qaralama|draft/i.test(text))).toEqual([])
  })
})
