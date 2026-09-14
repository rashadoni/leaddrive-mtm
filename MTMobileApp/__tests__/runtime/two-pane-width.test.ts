import fs from "fs"
import path from "path"
import { LAYOUT_BREAKPOINTS, NAV_RAIL_WIDTH, isTabletWidth, isExpandedTabletWidth, isTwoPaneTabWidth, isTwoPaneWidth, tabContentWidth } from "../../src/theme/layoutBreakpoints"

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
    // The calendar asks for more than the generic line: at 654 dp beside the
    // rail every date broke mid-word on the phone held sideways (2026-09-14).
    expect(week).toContain('return tabContentWidth(width) >= CALENDAR_TWO_PANE_CONTENT_WIDTH ? "tablet" : "phone"')
    expect(week).toContain("export const CALENDAR_TWO_PANE_CONTENT_WIDTH = 720")
    expect(tabContentWidth(823) >= 720).toBe(false)
    expect(tabContentWidth(1097) >= 720).toBe(true)
    expect(tabContentWidth(686) >= 720).toBe(false)
    expect(tasks).toContain("const tablet = isTwoPaneTabWidth(width)")
    // The old gate must not linger beside the new one.
    expect(week).not.toContain("isExpandedTabletWidth")
    expect(tasks).not.toContain("isExpandedTabletWidth")
  })

  it("leaves the screens that were already right alone", () => {
    expect(read("screens/route/RouteScreen.tsx")).toContain('return isTwoPaneTabWidth(width) ? "tablet" : "phone"')
    expect(read("screens/base/BaseScreen.tsx")).toContain("const tablet = isTabletWidth(width)")
  })

  it("keeps 840 for the question it actually answers", () => {
    // Comfort, not capability: paddings and touch targets still step up there.
    expect(isExpandedTabletWidth(LAYOUT_BREAKPOINTS.expandedTablet)).toBe(true)
    // The navigation rail no longer steps at 840: at 82 dp a phone in landscape
    // (823 dp) cut every caption to "B…" (device acceptance 2026-09-14). The
    // rail is 124 dp wherever it shows; see rail-captions.test.ts.
    expect(NAV_RAIL_WIDTH).toBe(124)
    expect(read("navigation/AppNavigatorAndroidV2.tsx")).toContain("const RAIL_WIDTH = NAV_RAIL_WIDTH")
  })

  it("gives the master pane a floor so a 600 dp split stays readable", () => {
    // 38 % of 600 is 228 dp for a row carrying a date tile and a full date.
    expect(read("screens/week/WeekScreen.tsx")).toContain('dayMaster: { width: "42%", minWidth: 216')
    expect(read("screens/week/WeekScreen.tsx")).toContain("minWidth: 0,\n    minHeight: 460,")
    // Tasks no longer has a master pane: on a tablet it is one page with two
    // columns of cards (see tasks-one-page.test.ts).
  })
})

describe("two panes on a tab screen count the room right of the rail", () => {
  it("keeps a tablet held upright in one column", () => {
    // Redmi Pad SE portrait, 2026-09-14: 686 dp window, 562 dp beside the rail.
    expect(tabContentWidth(686)).toBe(562)
    expect(isTwoPaneTabWidth(686)).toBe(false)
  })

  it("still splits the landscape phone and the landscape tablet", () => {
    expect(isTwoPaneTabWidth(823)).toBe(true)
    expect(isTwoPaneTabWidth(1097)).toBe(true)
  })

  it("leaves phones alone: no rail, no subtraction", () => {
    expect(tabContentWidth(412)).toBe(412)
    expect(isTwoPaneTabWidth(412)).toBe(false)
  })
})
