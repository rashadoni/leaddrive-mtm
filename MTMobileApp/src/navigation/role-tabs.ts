import { hasCapability, hasRouteFieldAccess, type BootstrapData, type RouteFieldAccess } from "../services/bootstrap"

/**
 * The field agent's shell. Unchanged by the manager shell below: an AGENT is
 * admitted only by the server's Route Field grant, never by a role guess.
 */
export const AGENT_TAB_NAMES = ["Today", "Route", "Clients", "Tasks", "More"] as const

export type RouteFieldTabName = typeof AGENT_TAB_NAMES[number]

export function routeFieldTabNames(): readonly RouteFieldTabName[] {
  return AGENT_TAB_NAMES
}

/**
 * The manager's shell: his team, its plan, what waits for his decision, and
 * his own profile.
 *
 * 2026-10-17, the owner's phone, tenant Zeytun Pharma: a manager signed in
 * and got a locked screen — «İş vaxtı uçotu hazırda əlçatan deyil» — because
 * the capability-gated shell of 2026-08-30 sent everyone who is not an AGENT
 * there. The screens were still in the app, wired to nothing.
 */
export const MANAGER_TAB_NAMES = ["Team", "Planning", "Approvals", "More"] as const

/** A manager who also keeps his own working day gets it as one more tab. */
export const MANAGER_OWN_WORKDAY_TAB = "OwnWorkday" as const

export type ManagerTabName = typeof MANAGER_TAB_NAMES[number] | typeof MANAGER_OWN_WORKDAY_TAB

const MANAGER_ROLES = new Set(["MANAGER", "SUPERVISOR", "ADMIN"])

export type ShellPrincipal = { id: string; organizationId: string; role: string } | null | undefined

/**
 * Whether the server granted this signed-in principal the team view.
 *
 * Decided from the bootstrap, as every other door in this app: the role alone
 * opens nothing. The answer must name the same person and organization as the
 * session (a late bootstrap of the previous user must not open his shell), it
 * must carry the strict manifest (a legacy server keeps today's screen), and
 * the server must hand out TEAM_READ, which every /mobile/manager/* route
 * requires. No bootstrap yet means no.
 *
 * Not the manifest's routeField module: the server turns it on only with
 * ROUTE_EXECUTE — the agent's own route — which a manager does not have. On
 * the owner's phone (2026-10-17, build 486) that kept every real manager on
 * the lock screen. Each /mobile/manager/* section checks the tenant's modules
 * itself.
 */
export function hasManagerShellAccess(data: BootstrapData | null | undefined, agent: ShellPrincipal): boolean {
  const manifest = data?.manifest
  return !!agent && MANAGER_ROLES.has(agent.role) && !!data && !!manifest
    && data.tenant?.id === agent.organizationId && manifest.tenant.id === agent.organizationId
    && data.principal?.id === agent.id && manifest.principal.id === agent.id
    && data.principal?.role === agent.role && manifest.principal.role === agent.role
    && hasCapability(data.capabilities, "TEAM_READ")
}

export function managerTabNames(ownWorkday: boolean): readonly ManagerTabName[] {
  return ownWorkday
    ? ["Team", "Planning", "Approvals", MANAGER_OWN_WORKDAY_TAB, "More"]
    : MANAGER_TAB_NAMES
}

export type MainShell =
  | { kind: "field" }
  | { kind: "manager"; tabs: readonly ManagerTabName[] }
  | { kind: "office" }
  | { kind: "blocked"; attendance: boolean; access: Exclude<RouteFieldAccess, "enabled" | "legacy"> }

/**
 * Which shell the signed-in principal gets.
 *
 * - AGENT: exactly as before — the field tabs with the server's Route Field
 *   grant, the access screen without it.
 * - MANAGER / SUPERVISOR / ADMIN with the team grant: the manager tabs, plus
 *   his own workday when he also has office attendance.
 * - Anyone else with office attendance: the own-attendance tabs, as before.
 * - Everyone else: the access screen, as before.
 */
export function mainShell({ agent, data, routeFieldAccess, office }: {
  agent: ShellPrincipal
  data: BootstrapData | null | undefined
  routeFieldAccess: RouteFieldAccess
  office: boolean
}): MainShell {
  if (agent?.role === "AGENT") {
    return hasRouteFieldAccess(routeFieldAccess)
      ? { kind: "field" }
      : { kind: "blocked", attendance: false, access: routeFieldAccess }
  }
  if (hasManagerShellAccess(data, agent)) return { kind: "manager", tabs: managerTabNames(office) }
  if (office) return { kind: "office" }
  return { kind: "blocked", attendance: true, access: hasRouteFieldAccess(routeFieldAccess) ? "unavailable" : routeFieldAccess }
}
