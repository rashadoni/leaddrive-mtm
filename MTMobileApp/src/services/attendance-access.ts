import type { BootstrapData, RouteFieldAccess } from "./bootstrap"
import { agentMayAttendanceRequests } from "../lib/agent-permissions"
import { offlineCaptureValid } from './attendance-offline-policy'

export type AttendancePrincipal = { id: string; organizationId: string; role: string } | null | undefined
const OFFICE_ROLES = new Set(["EMPLOYEE", "ADMIN", "MANAGER", "SUPERVISOR"])

/** Offline snapshots permit provisional own capture only, never field work.
 * Refusals discard the snapshot; missing/legacy manifests remain closed. */
export function hasOfficeAttendanceAccess(data: BootstrapData | null | undefined, agent: AttendancePrincipal): boolean {
  const manifest = data?.manifest
  return !!agent && OFFICE_ROLES.has(agent.role) && !!manifest
    && (!data?.attendanceOffline || offlineCaptureValid(data.attendanceOffline))
    && manifest.tenant.id === agent.organizationId && data?.tenant?.id === agent.organizationId
    && manifest.principal.id === agent.id && data?.principal?.id === agent.id
    && manifest.principal.role === agent.role && data?.principal?.role === agent.role
    // The manifest's routeField flag is scoped to field execution. An office
    // EMPLOYEE correctly has it disabled and no field streams. Its separate
    // own-attendance grant and supported mark protocol admit only these screens.
    && data.policies.attendanceMarkVersion === 1
    && data.policies.agentPermissions?.attendanceWorkday === true
}
/**
 * Own requests — leave, absence, time correction — are HR accounting, and a
 * field agent is outside it (owner, 2026-10-14: «агент — полевой, его учёт не
 * ведётся»; 2026-10-20: «у полевого агента всё кадровое убрать совсем:
 * заявки остаются только в «Mənim uçotum» у сотрудников, которых ведёт отдел
 * кадров»). So only the office shell gets them, whatever the tenant's switch
 * says for agents. `_fieldAccess` stays in the signature for the callers.
 */
export function mayUseOwnAttendanceRequests(data: BootstrapData | null | undefined, agent: AttendancePrincipal, _fieldAccess: RouteFieldAccess): boolean {
  return agentMayAttendanceRequests(data?.policies) && hasOfficeAttendanceAccess(data, agent)
}
