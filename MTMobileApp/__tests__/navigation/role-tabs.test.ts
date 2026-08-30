import { AGENT_TAB_NAMES, routeFieldTabNames } from "../../src/navigation/role-tabs"

describe("Route Field tabs", () => {
  it("keeps the route shell focused on today's field workflow", () => {
    expect(routeFieldTabNames()).toEqual(AGENT_TAB_NAMES)
    expect(AGENT_TAB_NAMES).toEqual(["Today", "Calendar", "Route", "Tasks", "More"])
  })

  it("uses exactly five unique route destinations for phone and tablet navigation", () => {
    expect(new Set(AGENT_TAB_NAMES).size).toBe(5)
    expect(Array.from(AGENT_TAB_NAMES)).not.toContain("Planogram")
  })
})
