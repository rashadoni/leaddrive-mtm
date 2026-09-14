export const LAYOUT_BREAKPOINTS = {
  tablet: 600,
  expandedTablet: 840,
} as const

export const LAYOUT_TOUCH_TARGETS = {
  compact: 44,
  expandedTablet: 48,
} as const

export function isTabletWidth(width: number) {
  return width >= LAYOUT_BREAKPOINTS.tablet
}

export function isExpandedTabletWidth(width: number) {
  return width >= LAYOUT_BREAKPOINTS.expandedTablet
}

/**
 * The width at which a list and the selected item both fit on screen.
 *
 * Field UX audit 2026-09-05, task B19. The product had two answers to "is this
 * a tablet" and they disagreed in the middle: the navigation rail, the route
 * screen and the customer base switched at 600, while the calendar and the
 * tasks screen waited for 840. A phone held in landscape is 824 dp — inside
 * that gap — so the rail appeared and the content stayed one narrow column,
 * which is exactly what the audit measured and wrote down.
 *
 * Two panes need 600, not 840: at 600 a 40/60 split still gives the list
 * ~240 dp, which is a readable row. 840 is where a pane can afford to be
 * comfortable, and that is a different question — it still decides touch
 * target sizes and paddings.
 */
export function isTwoPaneWidth(width: number) {
  return width >= LAYOUT_BREAKPOINTS.tablet
}

/** Width of the navigation rail that tab screens get from 600 dp up. */
export const NAV_RAIL_WIDTH = 124

/**
 * The width a tab screen actually has: from 600 dp the navigation rail takes
 * NAV_RAIL_WIDTH off the left.
 *
 * Deciding two panes on the window width split a tablet held upright (Redmi
 * Pad SE, 686 dp) into columns that had 562 dp between them — a phone's width:
 * the route's action pane ran off the right edge and the calendar's day title
 * broke into syllables (2026-09-14). Screens inside the tabs ask this instead.
 */
export function tabContentWidth(windowWidth: number) {
  return isTabletWidth(windowWidth) ? windowWidth - NAV_RAIL_WIDTH : windowWidth
}

/** Two panes on a tab screen: the room right of the rail must fit them. */
export function isTwoPaneTabWidth(windowWidth: number) {
  return isTwoPaneWidth(tabContentWidth(windowWidth))
}
