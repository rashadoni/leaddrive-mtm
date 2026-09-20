import fs from "fs"
import path from "path"

const routeScreen = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
  "utf8",
)

/**
 * Owner, 2026-09-20: «когда строится маршрут и выполняются шаги, прочерти
 * дорожную линию вертикально, чтобы выполняя, дорога заполнялась от шага к
 * шагу». The stops were a list of numbered circles with nothing between them.
 */
describe("the route reads as a road that fills in", () => {
  it("draws a rail above and below every stop", () => {
    expect(routeScreen).toContain("styles.stopRail")
    expect(routeScreen).toContain("first && styles.stopRailLineHidden")
    expect(routeScreen).toContain("last && styles.stopRailLineHidden")
  })

  it("fills the segment once the stop on that side is behind the agent", () => {
    expect(routeScreen).toContain("roadAbove && styles.stopRailLineDone")
    expect(routeScreen).toContain("roadBelow && styles.stopRailLineDone")
    expect(routeScreen).toContain('roadAbove={position > 0 && displayedPoints[position - 1].status === "VISITED"}')
    expect(routeScreen).toContain('roadBelow={item.status === "VISITED"}')
  })

  it("does the same on the phone list and the tablet pane", () => {
    const wired = routeScreen.match(/roadAbove=\{position > 0/g) ?? []
    expect(wired.length).toBe(2)
  })

  it("keeps the finished stop's checkmark and the green rail in one colour", () => {
    expect(routeScreen).toMatch(/stopRailLineDone: \{ backgroundColor: fieldTheme\.color\.success \}/)
  })
})
