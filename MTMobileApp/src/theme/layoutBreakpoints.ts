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
