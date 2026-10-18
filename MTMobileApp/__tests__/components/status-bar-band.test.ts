import fs from "fs"
import path from "path"

/**
 * Redmi Pad SE, 2026-09-14: once a screen's green header scrolls away, cards
 * pass under the clock and the light status bar icons sit white on white.
 * Every screen whose header scrolls with the page keeps a band under the bar.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

describe("screens whose header scrolls keep the status bar readable", () => {
  it("paints the band to the status bar's height, above the content", () => {
    const band = read("components/StatusBarBand.tsx")
    expect(band).toContain('<View pointerEvents="none" style={[styles.band, tone === "light" && styles.light, { height: insets.top }]} />')
    expect(band).toContain('position: "absolute", top: 0')
    // The tab headers are white since 2026-10-18: their band is white too.
    expect(band).toContain("light: { backgroundColor: fieldTheme.color.surface }")
  })

  it.each([
    ["screens/today/TodayScreen.tsx", 1],
    ["screens/route/RouteScreen.tsx", 2],
    ["screens/tasks/TasksScreen.tsx", 1],
    ["screens/visit/VisitScreen.tsx", 1],
    ["screens/profile/ProfileScreen.tsx", 1],
  ])("renders it on %s", (file, count) => {
    const source = read(file)
    expect(source).toContain('import StatusBarBand from "../../components/StatusBarBand"')
    expect(source.match(/<StatusBarBand( tone="light")? \/>/g)).toHaveLength(count)
  })
})
