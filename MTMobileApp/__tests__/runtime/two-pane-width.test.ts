import fs from "fs"
import path from "path"
import { LAYOUT_BREAKPOINTS, isTabletWidth, isExpandedTabletWidth, isTwoPaneWidth } from "../../src/theme/layoutBreakpoints"

/**
 * Field UX audit 2026-09-05, task B19: two panes from 600 dp.
 *
 * The product had two answers to "is this a tablet" and they disagreed in the
 * middle. The navigation rail, the route screen and the customer base switched
 * at 600; the calendar and the tasks screen waited for 840.
 *
 * A phone held in landscape is 824 dp — inside that gap. That is precisely
 * what the audit measured: "навигация переезжает в левый рельс… но контент
 * остаётся одной узкой колонкой". The rail was answering one question and the
 * content another.
 */
const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

describe("B19: one answer to what a tablet is", () => {
  it("splits into two panes from 600 dp", () => {
    expect(isTwoPaneWidth(LAYOUT_BREAKPOINTS.tablet)).toBe(true)
    expect(isTwoPaneWidth(LAYOUT_BREAKPOINTS.tablet - 1)).toBe(false)
  })

  it("covers the landscape phone that fell into the gap", () => {
    // 824 dp: the width the audit actually measured on the owner's device.
    expect(isTwoPaneWidth(824)).toBe(true)
    expect(isExpandedTabletWidth(824)).toBe(false)
    expect(isTabletWidth(824)).toBe(true)
  })

  it("is used by the two screens that waited for 840", () => {
    const week = read("screens/week/WeekScreen.tsx")
    const tasks = read("screens/tasks/TasksScreen.tsx")
    expect(week).toContain('return isTwoPaneWidth(width) ? "tablet" : "phone"')
    expect(tasks).toContain("const tablet = isTwoPaneWidth(width)")
    // The old gate must not linger beside the new one.
    expect(week).not.toContain("isExpandedTabletWidth")
    expect(tasks).not.toContain("isExpandedTabletWidth")
  })

  it("leaves the screens that were already right alone", () => {
    expect(read("screens/route/RouteScreen.tsx")).toContain('return isTabletWidth(width) ? "tablet" : "phone"')
    expect(read("screens/base/BaseScreen.tsx")).toContain("const tablet = isTabletWidth(width)")
  })

  it("keeps 840 for the question it actually answers", () => {
    // Comfort, not capability: paddings and touch targets still step up there.
    expect(isExpandedTabletWidth(LAYOUT_BREAKPOINTS.expandedTablet)).toBe(true)
    expect(read("navigation/AppNavigatorAndroidV2.tsx")).toContain("const expandedRail = isExpandedTabletWidth(width)")
  })

  it("gives the master pane a floor so a 600 dp split stays readable", () => {
    // 38 % of 600 is 228 dp for a row carrying a date tile and a full date.
    expect(read("screens/week/WeekScreen.tsx")).toContain('dayMaster: { width: "42%", minWidth: 216')
    expect(read("screens/week/WeekScreen.tsx")).toContain("minWidth: 0,\n    minHeight: 460,")
    expect(read("screens/tasks/TasksScreen.tsx")).toContain("tabletList: { flex: 0.44, minWidth: 0 }")
  })
})
