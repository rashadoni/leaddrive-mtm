import fs from "fs"
import path from "path"

/**
 * Found by the owner on a Redmi Pad SE held in landscape (2026-09-14): under
 * the header, steps and route summary, the two panes got about 170 dp. The
 * stop list showed one and a half stops inside a box that had to be scrolled,
 * and «Marşruta başla» was cut in half in the other pane.
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
const tablet = source.slice(source.indexOf("  if (tablet) {"), source.indexOf("<NotesModal", source.indexOf("  if (tablet) {")))

describe("route screen on a tablet scrolls as one page", () => {
  it("has one scroll container and no list scrolling inside a pane", () => {
    expect(tablet.match(/<ScrollView\b/g)).toHaveLength(1)
    expect(tablet).not.toContain("<FlatList")
    expect(tablet).toContain("displayedPoints.map((item) => (")
  })

  it("keeps pull to refresh on the page", () => {
    expect(tablet).toContain("refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}")
  })

  it("lets the panes take their content's height", () => {
    const body = source.slice(source.indexOf("\n  tabletBody: {"), source.indexOf("},", source.indexOf("\n  tabletBody: {")))
    expect(body).not.toContain("flex: 1")
    expect(body).toContain('alignItems: "flex-start"')
  })
})
