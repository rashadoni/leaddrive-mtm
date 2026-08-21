import { AGENT_TAB_NAMES, MANAGER_TAB_NAMES, tabNamesForNavGroup } from "../../src/navigation/role-tabs"

describe("role-safe mobile tabs", () => {
  it("keeps the manager shell focused on five primary workspaces", () => {
    expect(tabNamesForNavGroup("team")).toEqual(MANAGER_TAB_NAMES)
    expect(MANAGER_TAB_NAMES).toEqual(["Overview", "Team", "Planning", "Approvals", "More"])
  })

  it("keeps the agent shell focused on today's field workflow", () => {
    expect(tabNamesForNavGroup("field")).toEqual(AGENT_TAB_NAMES)
    expect(AGENT_TAB_NAMES).toEqual(["Today", "Calendar", "Route", "Tasks", "More"])
  })

  it("uses exactly five unique destinations for phone and tablet navigation", () => {
    expect(new Set(AGENT_TAB_NAMES).size).toBe(5)
    expect(new Set(MANAGER_TAB_NAMES).size).toBe(5)
    expect(Array.from(AGENT_TAB_NAMES)).not.toContain("Planogram")
    expect(Array.from(MANAGER_TAB_NAMES)).not.toContain("Planogram")
  })

  it("returns no tabs for unsupported roles", () => {
    expect(tabNamesForNavGroup("none")).toEqual([])
  })
})
