import { AGENT_TAB_NAMES, MANAGER_TAB_NAMES, tabNamesForNavGroup } from "../../src/navigation/role-tabs"

describe("role-safe mobile tabs", () => {
  it("keeps organization master data reachable for managers", () => {
    expect(tabNamesForNavGroup("team")).toEqual(MANAGER_TAB_NAMES)
    expect(MANAGER_TAB_NAMES).toContain("Base")
  })

  it("preserves the agent field navigation", () => {
    expect(tabNamesForNavGroup("field")).toEqual(AGENT_TAB_NAMES)
    expect(AGENT_TAB_NAMES).toEqual(["Home", "Week", "Route", "Visits", "Tasks", "Base", "Profile"])
  })

  it("returns no tabs for unsupported roles", () => {
    expect(tabNamesForNavGroup("none")).toEqual([])
  })
})
