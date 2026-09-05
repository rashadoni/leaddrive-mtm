import { ROUTE_FIELD_PROFILE, type RouteFieldStream } from "../runtime/route-field-profile"

/**
 * Pure mapping + capability helpers for the mobile bootstrap contract
 * (GET /mobile/bootstrap) — the first authenticated call after login. Kept
 * outside the store so the shape mapping and the capability → navigation
 * decision are unit-tested.
 *
 * Capabilities are server-authoritative (src/lib/mtm/mobile-capabilities.ts):
 *   AGENT                     -> FIELD_EXECUTE, FIELD_TRACK
 *   ADMIN/MANAGER/SUPERVISOR  -> TEAM_READ, TEAM_DECIDE
 *   eligible team principals  -> SELF_LOCATION_SHARE (explicit one-shot only)
 *   unknown                   -> []
 */

export type MobileCapability =
  | "FIELD_EXECUTE"
  | "FIELD_TRACK"
  | "TEAM_READ"
  | "TEAM_DECIDE"
  | "SELF_LOCATION_SHARE"

/** Which tab set the shell should mount. */
export type NavGroup = "field" | "team" | "none"

/**
 * Route Field never treats a role guess or a stale cached bootstrap as an
 * entitlement. `legacy` is deliberately narrow: it is only for a server that
 * predates the additive manifest but explicitly exposed the old routes module
 * and field capability together.
 */
export type RouteFieldAccess = "pending" | "enabled" | "legacy" | "disabled" | "unavailable"

export interface RouteFieldCapabilityManifest {
  version: 1
  protocol: { min: 1; preferred: 1 | 2 }
  tenant: { id: string; timezone: string }
  principal: { id: string; role: string }
  modules: {
    routeField: { enabled: boolean; scopeVersion: string | null }
    workforceHrm: { enabled: boolean; scopeVersion: string | null }
    commercial: { enabled: false; scopeVersion: string | null }
  }
  /** Streams this APK is allowed to read. Workforce and commercial are never
   * retained, even if another module is enabled for the same tenant. */
  streams: RouteFieldStream[]
  syncV2: { routes: boolean; routesEpoch: string | null }
}

const KNOWN_CAPABILITIES: readonly MobileCapability[] = [
  "FIELD_EXECUTE",
  "FIELD_TRACK",
  "TEAM_READ",
  "TEAM_DECIDE",
  "SELF_LOCATION_SHARE",
]

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

export type MobileRouteTargetDirection = "DOCTOR" | "PHARMACY" | "ORGANIZATION"

export interface MobileRouteTargetType {
  id: string
  labels: { az: string; ru: string; en: string }
  direction: MobileRouteTargetDirection
  objectType: "PHARMACY" | "CLINIC" | "STORE" | "OTHER" | null
  organizationKind: string | null
  enabled: boolean
}

export const DEFAULT_MOBILE_ROUTE_TARGET_TYPES: MobileRouteTargetType[] = [
  { id: "doctors", labels: { az: "Həkimlər", ru: "Врачи", en: "Doctors" }, direction: "DOCTOR", objectType: null, organizationKind: null, enabled: true },
  { id: "pharmacies", labels: { az: "Apteklər", ru: "Аптеки", en: "Pharmacies" }, direction: "PHARMACY", objectType: "PHARMACY", organizationKind: null, enabled: true },
  { id: "clinics", labels: { az: "Klinikalar", ru: "Клиники", en: "Clinics" }, direction: "ORGANIZATION", objectType: "CLINIC", organizationKind: null, enabled: true },
  { id: "organizations", labels: { az: "Digər təşkilatlar", ru: "Другие организации", en: "Other organizations" }, direction: "ORGANIZATION", objectType: "OTHER", organizationKind: null, enabled: true },
]

export interface BootstrapData {
  tenant: { id: string; name: string; slug: string } | null
  principal: { id: string; name: string; email: string; role: string } | null
  capabilities: MobileCapability[]
  timezone: string | null
  policies: BootstrapPolicies
  routeTargetTypes: MobileRouteTargetType[]
  workday: BootstrapWorkday | null
  manifest: RouteFieldCapabilityManifest | null
  routeFieldAccess: RouteFieldAccess
  /** Map settings the tenant server hands out; absent on older servers. */
  maps?: { cartoBasemapsApiKey: string | null }
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

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return str(value)
}

function manifestString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function nullableManifestString(value: unknown): string | null | undefined {
  if (value === null) return null
  return manifestString(value)
}

function moduleEntry(value: unknown): { enabled: boolean; scopeVersion: string | null } | null {
  const entry = record(value)
  if (!entry || typeof entry.enabled !== "boolean") return null
  const scopeVersion = nullableManifestString(entry.scopeVersion)
  if (scopeVersion === undefined) return null
  return { enabled: entry.enabled, scopeVersion }
}

function isRouteFieldStream(value: string): value is RouteFieldStream {
  return (ROUTE_FIELD_PROFILE.supportedStreams as readonly string[]).includes(value)
}

/**
 * Strictly parse the additive server manifest. The surrounding bootstrap
 * tenant/principal are supplied as a second binding so a response cannot mix
 * one user's legacy data with another user's manifest.
 */
export function parseRouteFieldManifest(
  raw: unknown,
  expected: Pick<BootstrapData, "tenant" | "principal">,
): RouteFieldCapabilityManifest | null {
  const manifest = record(raw)
  const protocol = record(manifest?.protocol)
  const tenant = record(manifest?.tenant)
  const principal = record(manifest?.principal)
  const modules = record(manifest?.modules)
  const syncV2 = record(manifest?.syncV2)
  if (
    !manifest ||
    manifest.version !== 1 ||
    protocol?.min !== 1 ||
    (protocol.preferred !== 1 && protocol.preferred !== 2) ||
    !tenant ||
    !principal ||
    !modules ||
    !syncV2 ||
    !expected.tenant?.id ||
    !expected.principal?.id
  ) return null

  const tenantId = manifestString(tenant.id)
  const timezone = manifestString(tenant.timezone)
  const principalId = manifestString(principal.id)
  const principalRole = manifestString(principal.role)
  if (
    !tenantId ||
    !timezone ||
    !principalId ||
    !principalRole ||
    tenantId !== expected.tenant.id ||
    principalId !== expected.principal.id ||
    principalRole !== expected.principal.role
  ) return null

  const routeField = moduleEntry(modules.routeField)
  const workforceHrm = moduleEntry(modules.workforceHrm)
  const commercial = moduleEntry(modules.commercial)
  if (!routeField || !workforceHrm || !commercial || commercial.enabled !== false) return null

  if (!Array.isArray(manifest.streams) || manifest.streams.some((stream) => typeof stream !== "string")) return null
  const streams = Array.from(new Set(manifest.streams.filter(isRouteFieldStream)))
  // Existing v1 Route Field screens may request every route-domain endpoint.
  // Until each screen is individually stream-gated, an incomplete enabled
  // manifest must fail closed rather than expose one partially-disabled shell.
  if (routeField.enabled && !ROUTE_FIELD_PROFILE.supportedStreams.every((stream) => streams.includes(stream))) return null

  const routes = syncV2.routes === true
  const routesEpoch = nullableManifestString(syncV2.routesEpoch)
  // A routes-v2 grant is not inferred from either field alone. The server
  // advertises protocol 2 and the exact stream cohort together; accepting a
  // contradictory manifest would turn a partial rollout into an APK guess.
  if (
    routesEpoch === undefined
    || (routes && (!routesEpoch || protocol.preferred !== 2))
    || (!routes && routesEpoch !== null)
  ) return null

  return {
    version: 1,
    protocol: { min: 1, preferred: protocol.preferred },
    tenant: { id: tenantId, timezone },
    principal: { id: principalId, role: principalRole },
    modules: {
      routeField,
      workforceHrm,
      commercial: { enabled: false, scopeVersion: commercial.scopeVersion },
    },
    streams,
    syncV2: { routes, routesEpoch },
  }
}

function hasOwn(object: Record<string, unknown> | null, key: string): boolean {
  return !!object && Object.prototype.hasOwnProperty.call(object, key)
}

function legacyRouteFieldAccess(raw: Record<string, unknown> | null, capabilities: readonly MobileCapability[]): boolean {
  const modules = record(raw?.modules)
  return record(modules?.routes)?.enabled === true && capabilities.includes("FIELD_EXECUTE")
}

/**
 * This is the field-agent APK, not a generic route administration client.
 * The manifest's route module is tenant-scoped and can also be true for a
 * manager who has route permissions on the server.  That must not make the
 * manager/team shell reappear here: an admitted v3 Route Field session needs
 * both the exact AGENT principal and the server's FIELD_EXECUTE capability.
 */
function routeFieldPrincipalIsEligible(
  manifest: RouteFieldCapabilityManifest,
  capabilities: readonly MobileCapability[],
): boolean {
  return manifest.principal.role === "AGENT" && capabilities.includes("FIELD_EXECUTE")
}

export function hasRouteFieldAccess(access: RouteFieldAccess): access is "enabled" | "legacy" {
  return access === "enabled" || access === "legacy"
}

/**
 * An `unavailable` access value alone is not proof of a tenant revocation:
 * the bootstrap store deliberately uses it when an offline/network request
 * fails closed.  Only a successfully parsed bootstrap payload may withdraw
 * the locally retained, non-authoritative v2 shadow projection.
 */
export function isConfirmedRouteFieldWithdrawal(
  bootstrap: BootstrapData | null | undefined,
  access: RouteFieldAccess,
): boolean {
  return bootstrap !== null
    && bootstrap !== undefined
    && bootstrap.routeFieldAccess === access
    && !hasRouteFieldAccess(access)
}

function routeTargetTypes(value: unknown): MobileRouteTargetType[] {
  if (!Array.isArray(value)) return DEFAULT_MOBILE_ROUTE_TARGET_TYPES.map((entry) => ({ ...entry, labels: { ...entry.labels } }))
  const seen = new Set<string>()
  const mapped = value.flatMap((raw): MobileRouteTargetType[] => {
    const item = record(raw)
    const labels = record(item?.labels)
    const id = str(item?.id)?.trim().toLowerCase()
    const direction = str(item?.direction) as MobileRouteTargetDirection | undefined
    const objectType = str(item?.objectType) as MobileRouteTargetType["objectType"] | undefined
    if (!id || seen.has(id) || !labels || !direction || !["DOCTOR", "PHARMACY", "ORGANIZATION"].includes(direction)) return []
    const az = str(labels.az)?.trim()
    const ru = str(labels.ru)?.trim()
    const en = str(labels.en)?.trim()
    if (!az || !ru || !en || item?.enabled !== true) return []
    if (objectType && !["PHARMACY", "CLINIC", "STORE", "OTHER"].includes(objectType)) return []
    seen.add(id)
    return [{
      id,
      labels: { az, ru, en },
      direction,
      objectType: direction === "DOCTOR" ? null : objectType ?? null,
      organizationKind: direction === "DOCTOR" ? null : (str(item?.organizationKind)?.trim() ?? null),
      enabled: true,
    }]
  })
  return mapped.length > 0 ? mapped : DEFAULT_MOBILE_ROUTE_TARGET_TYPES.map((entry) => ({ ...entry, labels: { ...entry.labels } }))
}

export function mobileRouteTargetLabel(target: MobileRouteTargetType, language: string): string {
  const locale = language.toLowerCase()
  if (locale.startsWith("az")) return target.labels.az
  if (locale.startsWith("en")) return target.labels.en
  return target.labels.ru
}

export function toBootstrap(raw: any): BootstrapData {
  const tenant = record(raw?.tenant)
  const principal = record(raw?.principal)
  const workday = record(raw?.workday)
  const capabilities = Array.isArray(raw?.capabilities)
    ? (raw.capabilities.filter((c: unknown): c is MobileCapability =>
        KNOWN_CAPABILITIES.includes(c as MobileCapability)))
    : []
  const mappedTenant = tenant
    ? { id: String(tenant.id ?? ""), name: str(tenant.name) ?? "", slug: str(tenant.slug) ?? "" }
    : null
  const mappedPrincipal = principal
    ? {
        id: String(principal.id ?? ""),
        name: str(principal.name) ?? "",
        email: str(principal.email) ?? "",
        role: str(principal.role) ?? "",
      }
    : null
  const manifest = parseRouteFieldManifest(raw?.manifest, {
    tenant: mappedTenant,
    principal: mappedPrincipal,
  })
  const rawRecord = record(raw)
  const routeFieldAccess: RouteFieldAccess = manifest
    ? !manifest.modules.routeField.enabled
      ? "disabled"
      : routeFieldPrincipalIsEligible(manifest, capabilities)
        ? "enabled"
        : "unavailable"
    : hasOwn(rawRecord, "manifest")
      ? "unavailable"
      : legacyRouteFieldAccess(rawRecord, capabilities) ? "legacy" : "unavailable"

  return {
    tenant: mappedTenant,
    principal: mappedPrincipal,
    capabilities,
    timezone: str(raw?.timezone) ?? null,
    maps: { cartoBasemapsApiKey: str(record(raw?.maps)?.cartoBasemapsApiKey) ?? null },
    // Strict `=== true`: anything else (missing field, older server, junk)
    // resolves to "no plaque", which is the non-leaking direction.
    policies: {
      photoWatermark: record(raw?.policies)?.photoWatermark === true,
      // Missing means an older server: do not expose a planning action that
      // cannot be confirmed by the server yet.
      canPlanOwnRoutes: record(raw?.policies)?.canPlanOwnRoutes === true,
    },
    routeTargetTypes: routeTargetTypes(raw?.routeTargetTypes),
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
    manifest,
    routeFieldAccess,
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
