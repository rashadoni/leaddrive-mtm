import { AGENT_TAB_NAMES, routeFieldTabNames } from "../../src/navigation/role-tabs"

describe("Route Field tabs", () => {
  it("keeps the route shell focused on today's field workflow", () => {
    expect(routeFieldTabNames()).toEqual(AGENT_TAB_NAMES)
    expect(AGENT_TAB_NAMES).toEqual(["Today", "Calendar", "Route", "Clients", "Tasks", "More"])
  })

  it("keeps clients as a first-class destination on phone and tablet", () => {
    expect(new Set(AGENT_TAB_NAMES).size).toBe(6)
    expect(Array.from(AGENT_TAB_NAMES)).toContain("Clients")
    expect(Array.from(AGENT_TAB_NAMES)).not.toContain("Planogram")
  })
})
