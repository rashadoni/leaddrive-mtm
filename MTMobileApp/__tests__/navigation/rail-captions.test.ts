import fs from "fs"
import path from "path"

/**
 * B19 device acceptance, 2026-09-14: the phone in landscape is 823 dp wide,
 * so it gets the navigation rail — and the rail was 82 dp there, 112 only from
 * 840. Every caption read "B…", "T…", "M…": the item keeps 66 dp after its
 * 8 dp margins and the material item padding takes 20 more, while
 * "Tapşırıqlar" at 12 px needs about 59.
 */
const navigator = fs.readFileSync(path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"), "utf8")

describe("B19: the navigation rail has room for its captions", () => {
  it("uses one rail width wherever the rail shows", () => {
    expect(navigator).toContain("const RAIL_WIDTH = 112")
    expect(navigator).toContain("width: RAIL_WIDTH,")
    expect(navigator).not.toMatch(/width:\s*expandedRail\s*\?/)
    expect(navigator).not.toContain("? 112 : 82")
  })

  it("leaves enough for the longest caption after margins and item padding", () => {
    const railWidth = 112
    const itemMargins = 8 * 2
    const materialItemPadding = 10 * 2
    const longestCaption = 59 // "Tapşırıqlar", 12 px bold, measured on the phone
    expect(railWidth - itemMargins - materialItemPadding).toBeGreaterThanOrEqual(longestCaption)
  })
})
