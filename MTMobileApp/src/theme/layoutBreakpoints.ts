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
