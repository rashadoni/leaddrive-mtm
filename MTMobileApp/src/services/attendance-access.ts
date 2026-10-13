import type { BootstrapData, RouteFieldAccess } from "./bootstrap"
import { hasRouteFieldAccess } from "./bootstrap"
import { agentMayAttendanceRequests } from "../lib/agent-permissions"

export type AttendancePrincipal = { id: string; organizationId: string; role: string } | null | undefined
const OFFICE_ROLES = new Set(["EMPLOYEE", "ADMIN", "MANAGER", "SUPERVISOR"])

/** Separate entitlement, never a FIELD_EXECUTE or tracking grant. Bootstrap is
 * memory-only and is discarded on refusal; legacy/missing manifests stay shut. */
export function hasOfficeAttendanceAccess(data: BootstrapData | null | undefined, agent: AttendancePrincipal): boolean {
  const manifest = data?.manifest
  return !!agent && OFFICE_ROLES.has(agent.role) && !!manifest
    && manifest.tenant.id === agent.organizationId && data?.tenant?.id === agent.organizationId
    && manifest.principal.id === agent.id && data?.principal?.id === agent.id
    && manifest.principal.role === agent.role && data?.principal?.role === agent.role
    // The manifest's routeField flag is scoped to field execution. An office
    // EMPLOYEE correctly has it disabled and no field streams. Its separate
    // own-attendance grant and supported mark protocol admit only these screens.
    && data.policies.attendanceMarkVersion === 1
    && data.policies.agentPermissions?.attendanceWorkday === true
}
export function mayUseOwnAttendanceRequests(data: BootstrapData | null | undefined, agent: AttendancePrincipal, fieldAccess: RouteFieldAccess): boolean {
  return agentMayAttendanceRequests(data?.policies)
    && ((agent?.role === "AGENT" && hasRouteFieldAccess(fieldAccess)) || hasOfficeAttendanceAccess(data, agent))
}
