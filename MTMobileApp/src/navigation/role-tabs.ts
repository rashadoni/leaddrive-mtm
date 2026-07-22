import type { NavGroup } from "../services/bootstrap"

export const MANAGER_TAB_NAMES = ["Overview", "Team", "Planning", "Approvals", "Base", "Profile"] as const
export const AGENT_TAB_NAMES = ["Home", "Week", "Route", "Visits", "Tasks", "Base", "Profile"] as const

export type AppTabName = typeof MANAGER_TAB_NAMES[number] | typeof AGENT_TAB_NAMES[number]

export function tabNamesForNavGroup(navGroup: NavGroup): readonly AppTabName[] {
  return navGroup === "team" ? MANAGER_TAB_NAMES : navGroup === "field" ? AGENT_TAB_NAMES : []
}
