import fs from "fs"
import path from "path"

/**
 * B19 device acceptance, 2026-09-14: the phone in landscape is 823 dp wide,
 * so it gets the navigation rail — and the rail was 82 dp there, 112 only from
 * 840. Every caption read "B…", "T…", "M…". A first fix to 112 dp still showed
 * "Tapşırı…": on the phone the label box was 51 dp, 61 less than the rail —
 * margins, item padding and the label's own inset. "Tapşırıqlar" at 12 px
 * needs about 59, so the rail is 124 (label box 63).
 */
const navigator = fs.readFileSync(path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"), "utf8")

describe("B19: the navigation rail has room for its captions", () => {
  it("uses one rail width wherever the rail shows", () => {
    expect(navigator).toContain("const RAIL_WIDTH = 124")
    expect(navigator).toContain("width: RAIL_WIDTH,")
    expect(navigator).not.toMatch(/width:\s*expandedRail\s*\?/)
    expect(navigator).not.toContain("? 112 : 82")
  })

  it("leaves enough for the longest caption after margins and item padding", () => {
    const railWidth = 124
    const measuredNonLabelWidth = 112 - 51 // rail minus the label box at 112, on the phone
    const longestCaption = 59 // "Tapşırıqlar", 12 px bold, measured on the phone
    expect(railWidth - measuredNonLabelWidth).toBeGreaterThanOrEqual(longestCaption)
  })
})
