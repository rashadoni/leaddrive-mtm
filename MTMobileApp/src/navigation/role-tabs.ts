/**
 * This APK is Route Field only. Workforce/manager tabs belong to the separate
 * HRM application and are intentionally not represented as a fallback here.
 */
export const AGENT_TAB_NAMES = ["Today", "Calendar", "Route", "Tasks", "More"] as const

export type RouteFieldTabName = typeof AGENT_TAB_NAMES[number]

export function routeFieldTabNames(): readonly RouteFieldTabName[] {
  return AGENT_TAB_NAMES
}
