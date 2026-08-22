/**
 * Pure mapping + capability helpers for the mobile bootstrap contract
 * (GET /mobile/bootstrap) — the first authenticated call after login. Kept
 * outside the store so the shape mapping and the capability → navigation
 * decision are unit-tested.
 *
 * Capabilities are server-authoritative (src/lib/mtm/mobile-capabilities.ts):
 *   AGENT                     -> FIELD_EXECUTE, FIELD_TRACK
 *   ADMIN/MANAGER/SUPERVISOR  -> TEAM_READ, TEAM_DECIDE
 *   unknown                   -> []
 */

export type MobileCapability = "FIELD_EXECUTE" | "FIELD_TRACK" | "TEAM_READ" | "TEAM_DECIDE"

/** Which tab set the shell should mount. */
export type NavGroup = "field" | "team" | "none"

const KNOWN_CAPABILITIES: readonly MobileCapability[] = ["FIELD_EXECUTE", "FIELD_TRACK", "TEAM_READ", "TEAM_DECIDE"]

/**
 * Tenant policies the field app must obey. Server-authoritative — the app
 * keeps no local override, so a tenant decision cannot be undone by a stale
 * build.
 */
export interface BootstrapPolicies {
  /**
   * Burn a visible plaque (time, agent, customer, GPS) into field photos.
   * Defaults to FALSE when the server omits it: the plaque travels inside the
   * image, so a forwarded photo would leak a customer name and coordinates
   * irreversibly. An unknown answer must not switch that on.
   */
  photoWatermark: boolean
  /** Whether this particular field agent may create and edit only own routes. */
  canPlanOwnRoutes: boolean
}

export interface BootstrapData {
  tenant: { id: string; name: string; slug: string } | null
  principal: { id: string; name: string; email: string; role: string } | null
  capabilities: MobileCapability[]
  timezone: string | null
  policies: BootstrapPolicies
  workday: BootstrapWorkday | null
}

export interface BootstrapWorkday {
  id: string
  status: string
  workDate?: string
  startedAt?: string
  pausedAt?: string
  completedAt?: string
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function toBootstrap(raw: any): BootstrapData {
  const tenant = record(raw?.tenant)
  const principal = record(raw?.principal)
  const workday = record(raw?.workday)
  const capabilities = Array.isArray(raw?.capabilities)
    ? (raw.capabilities.filter((c: unknown): c is MobileCapability =>
        KNOWN_CAPABILITIES.includes(c as MobileCapability)))
    : []
  return {
    tenant: tenant
      ? { id: String(tenant.id ?? ""), name: str(tenant.name) ?? "", slug: str(tenant.slug) ?? "" }
      : null,
    principal: principal
      ? {
          id: String(principal.id ?? ""),
          name: str(principal.name) ?? "",
          email: str(principal.email) ?? "",
          role: str(principal.role) ?? "",
        }
      : null,
    capabilities,
    timezone: str(raw?.timezone) ?? null,
    // Strict `=== true`: anything else (missing field, older server, junk)
    // resolves to "no plaque", which is the non-leaking direction.
    policies: {
      photoWatermark: record(raw?.policies)?.photoWatermark === true,
      // Missing means an older server: do not expose a planning action that
      // cannot be confirmed by the server yet.
      canPlanOwnRoutes: record(raw?.policies)?.canPlanOwnRoutes === true,
    },
    workday: workday
      ? {
          id: String(workday.id ?? ""),
          status: str(workday.status) ?? "",
          workDate: str(workday.workDate),
          startedAt: str(workday.startedAt),
          pausedAt: str(workday.pausedAt),
          completedAt: str(workday.completedAt),
        }
      : null,
  }
}

/**
 * True when the server considers a workday currently open (started, not
 * completed). Used to reconcile the client-local workday state with the
 * authoritative server shift on bootstrap.
 */
export function isWorkdayOpen(workday: BootstrapWorkday | null | undefined): boolean {
  return !!(workday && workday.startedAt && !workday.completedAt && workday.status !== "COMPLETED")
}

/** True if `caps` grants `cap`. */
export function hasCapability(caps: readonly MobileCapability[], cap: MobileCapability): boolean {
  return caps.includes(cap)
}

/**
 * Map server capabilities to the navigation group. Field access wins the agent
 * shell, team access the manager shell; anything else (revoked / unknown role)
 * gets the unsupported-role screen. Callers fall back to the role-derived group
 * when capabilities haven't loaded yet (empty array), so the shell never breaks
 * if bootstrap is slow or offline.
 */
export function navGroupFromCapabilities(caps: readonly MobileCapability[]): NavGroup {
  if (caps.includes("FIELD_EXECUTE")) return "field"
  if (caps.includes("TEAM_READ")) return "team"
  return "none"
}
