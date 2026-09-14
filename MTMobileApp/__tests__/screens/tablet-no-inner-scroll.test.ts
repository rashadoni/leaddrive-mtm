import fs from "fs"
import path from "path"

/**
 * The owner on a Redmi Pad SE held in landscape (2026-09-14): "there must be
 * no inner scroll — this is not Windows or a browser". Visits had two columns
 * scrolling separately; GPS history put 332 points in a 720 px frame beside a
 * details frame. Route and Tasks are covered by their own tests.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src/screens", file), "utf8")

describe("tablet screens scroll as one page", () => {
  it("Visits: one ScrollView holding the header and both columns", () => {
    const visits = read("visit/VisitScreen.tsx")
    const tablet = visits.slice(visits.indexOf("      {tablet ? (\n        // One page on a tablet"), visits.indexOf("      ) : (\n        <>\n          {header}"))
    expect(tablet.match(/<ScrollView\b/g)).toHaveLength(1)
    expect(tablet).toContain("{header}")
    const panel = visits.slice(visits.indexOf("function HistoryPanel("), visits.indexOf("function HistoryHeading("))
    expect(panel).not.toContain("<FlatList")
    expect(panel).toContain("visits.map((item) => <VisitRow visit={item} key={item.id}")
    const body = visits.slice(visits.indexOf("\n  tabletBody: {"), visits.indexOf("},", visits.indexOf("\n  tabletBody: {")))
    expect(body).not.toContain("flex: 1")
    expect(body).toContain('alignItems: "flex-start"')
  })

  it("GPS history: the same single list on every width", () => {
    const gps = read("gps/GpsHistoryScreen.tsx")
    expect(gps).not.toContain("} else if (expandedTablet) {")
    expect(["masterPanel", "detailPanel", "timelineListTablet"].filter((name) => gps.includes(name))).toEqual([])
  })
})
