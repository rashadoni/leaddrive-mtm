import fs from "fs"
import path from "path"

// Owner, 2026-10-19: the day was closed and the only client on the route had
// been visited, yet «Bugünkü marşrut» still called him with «Marşrutu aç».
const root = path.join(__dirname, "../..")
const today = fs.readFileSync(path.join(root, "src/screens/today/TodayScreen.tsx"), "utf8")
const resources = fs.readFileSync(path.join(root, "src/i18n/mobile-resources.ts"), "utf8")

describe("a route with every stop done", () => {
  const done = today.slice(today.indexOf("route.totalPoints > 0 && route.remainingPoints === 0"))
  const branch = done.slice(0, done.indexOf("if (nextKind === \"route\") {"))

  it("no longer offers to open it", () => {
    expect(branch).not.toContain("todayV2.openRoute")
    expect(branch).toContain('eyebrow: t("todayV2.routeDone")')
  })

  it("offers to plan tomorrow, only where the company lets agents plan", () => {
    expect(branch).toContain('button: canPlanOwnRoutes ? t("todayV2.planTomorrow") : null')
    expect(today).toContain('const canPlanOwnRoutes = String(agent?.role).toUpperCase() === "AGENT" && ownRoutePlanningPolicy')
    expect(today).toContain('navigation.navigate("PlanningBuilder", { initialDate: shiftDateKey(todayKey, 1) })')
  })

  it("says so in every language", () => {
    for (const text of ["Маршрут выполнен", "Route complete", "Marşrut tamamlandı", "Спланировать маршрут на завтра", "Plan tomorrow's route", "Sabahkı marşrutu planla"]) {
      expect(resources).toContain(text)
    }
  })
})
