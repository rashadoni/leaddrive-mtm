import {
  AGENT_TAB_NAMES,
  MANAGER_TAB_NAMES,
  hasManagerShellAccess,
  mainShell,
  routeFieldTabNames,
} from "../../src/navigation/role-tabs"
import { toBootstrap } from "../../src/services/bootstrap"
import { hasOfficeAttendanceAccess } from "../../src/services/attendance-access"
import { officeBootstrapPayload } from "../../test-support/office-attendance"
import { mobileResources } from "../../src/i18n/mobile-resources"

const principal = (role: string) => ({ id: "office-fixture", organizationId: "org-fixture", role })

/** A bootstrap as the server sends it to this role, with the capabilities the server hands out. */
function bootstrapFor(role: string, options: { capabilities?: string[]; attendance?: boolean; routeField?: boolean } = {}) {
  const payload: any = officeBootstrapPayload(role)
  payload.capabilities = options.capabilities ?? (role === "AGENT" ? ["FIELD_EXECUTE", "FIELD_TRACK"] : ["TEAM_READ", "TEAM_DECIDE"])
  if (options.attendance === false) payload.policies = { agentPermissions: {} }
  if (options.routeField === false) {
    payload.manifest.modules.routeField.enabled = false
    payload.manifest.streams = []
  }
  return toBootstrap(payload)
}

function shellOf(role: string, options: Parameters<typeof bootstrapFor>[1] = {}) {
  const data = bootstrapFor(role, options)
  const agent = principal(role)
  return mainShell({ agent, data, routeFieldAccess: data.routeFieldAccess, office: hasOfficeAttendanceAccess(data, agent) })
}

describe("Route Field tabs", () => {
  it("keeps the route shell focused on today's field workflow", () => {
    expect(routeFieldTabNames()).toEqual(AGENT_TAB_NAMES)
    // «Визиты» took the calendar's place; the month is «Маршрут» → «Месяц» (owner, 2026-10-20).
    // «Plansız ziyarətlər» went back under «Daha çox» (owner, 2026-10-20: «он путает»).
    expect(AGENT_TAB_NAMES).toEqual(["Today", "Route", "Clients", "Tasks", "More"])
  })

  it("keeps clients as a first-class destination on phone and tablet", () => {
    expect(new Set(AGENT_TAB_NAMES).size).toBe(6)
    expect(Array.from(AGENT_TAB_NAMES)).toContain("Clients")
    expect(Array.from(AGENT_TAB_NAMES)).not.toContain("Planogram")
  })
})

/**
 * 2026-10-17, the owner's phone (Zeytun Pharma): a manager signed in and got
 * «İş vaxtı uçotu hazırda əlçatan deyil» — a locked screen — because every
 * principal who is not an AGENT was sent there.
 */
describe("which shell a principal gets", () => {
  it.each(["MANAGER", "SUPERVISOR", "ADMIN"])("gives a %s with the team grant the manager tabs", (role) => {
    expect(shellOf(role, { attendance: false })).toEqual({ kind: "manager", tabs: MANAGER_TAB_NAMES })
    expect(MANAGER_TAB_NAMES).toEqual(["Team", "Planning", "Approvals", "More"])
  })

  it("adds the manager's own working day as a tab instead of dropping the manager tabs", () => {
    expect(shellOf("MANAGER")).toEqual({ kind: "manager", tabs: ["Team", "Planning", "Approvals", "OwnWorkday", "More"] })
  })

  it("keeps today's screen for a manager the server did not give the team grant", () => {
    expect(shellOf("MANAGER", { capabilities: [], attendance: false })).toEqual({ kind: "blocked", attendance: true, access: "unavailable" })
    // …and his own attendance tabs, when he has them, exactly as before.
    expect(shellOf("MANAGER", { capabilities: [] })).toEqual({ kind: "office" })
  })

  // The owner's phone, 2026-10-17, build 486: the real server sends a manager
  // routeField off (it needs ROUTE_EXECUTE, an agent's grant) and TEAM_READ on.
  // Requiring the module kept every real manager on the lock screen.
  it("opens the manager tabs as the real server sends a manager: Route Field module off, team grant on", () => {
    expect(shellOf("MANAGER", { routeField: false, attendance: false })).toEqual({ kind: "manager", tabs: MANAGER_TAB_NAMES })
    expect(shellOf("SUPERVISOR", { routeField: false })).toEqual({ kind: "manager", tabs: ["Team", "Planning", "Approvals", "OwnWorkday", "More"] })
  })

  it("behaves as today while the bootstrap has not loaded", () => {
    expect(mainShell({ agent: principal("MANAGER"), data: null, routeFieldAccess: "pending", office: false }))
      .toEqual({ kind: "blocked", attendance: true, access: "pending" })
    expect(hasManagerShellAccess(null, principal("MANAGER"))).toBe(false)
  })

  it("does not open the manager shell on another person's or organization's bootstrap", () => {
    const data = bootstrapFor("MANAGER")
    expect(hasManagerShellAccess(data, { ...principal("MANAGER"), id: "someone-else" })).toBe(false)
    expect(hasManagerShellAccess(data, { ...principal("MANAGER"), organizationId: "other-org" })).toBe(false)
    expect(hasManagerShellAccess(data, principal("SUPERVISOR"))).toBe(false)
  })

  it("never opens the manager shell from the role alone", () => {
    const legacy: any = officeBootstrapPayload("MANAGER")
    delete legacy.manifest
    legacy.capabilities = ["TEAM_READ", "TEAM_DECIDE"]
    expect(hasManagerShellAccess(toBootstrap(legacy), principal("MANAGER"))).toBe(false)
    expect(hasManagerShellAccess(bootstrapFor("EMPLOYEE", { capabilities: ["TEAM_READ"] }), principal("EMPLOYEE"))).toBe(false)
  })

  it("leaves the field agent exactly where he was", () => {
    expect(shellOf("AGENT")).toEqual({ kind: "field" })
    // Even a bootstrap that (wrongly) carried TEAM_READ does not move him.
    expect(shellOf("AGENT", { capabilities: ["FIELD_EXECUTE", "TEAM_READ"] })).toEqual({ kind: "field" })
    expect(mainShell({ agent: principal("AGENT"), data: null, routeFieldAccess: "offline", office: false }))
      .toEqual({ kind: "blocked", attendance: false, access: "offline" })
  })

  it("keeps the office employee on his own attendance tabs", () => {
    expect(shellOf("EMPLOYEE", { capabilities: [] })).toEqual({ kind: "office" })
  })

  it.each(["ru", "en", "az"] as const)("has a caption for every manager tab in %s", (locale) => {
    const nav = mobileResources[locale].navV2 as Record<string, string>
    for (const key of ["team", "planning", "approvals", "more"]) expect(nav[key]?.trim()).toBeTruthy()
  })
})
