import { toBootstrap } from "../src/services/bootstrap"
export const officeAgent = { id: "office-fixture", organizationId: "org-fixture", role: "EMPLOYEE", name: "Aylin Demo" }
export function officeBootstrapPayload(role = "EMPLOYEE") {
  const fieldManifest = ["AGENT", "ADMIN", "MANAGER", "SUPERVISOR"].includes(role)
  return { tenant: { id: officeAgent.organizationId, name: "Demo" }, principal: { id: officeAgent.id, role, name: officeAgent.name }, timezone: "Asia/Baku", capabilities: role === "AGENT" ? ["FIELD_EXECUTE", "FIELD_TRACK"] : [],
    modules: { routeField: { enabled: true, scopeVersion: null } },
    policies: { attendanceMarkVersion: 1, agentPermissions: { attendanceWorkday: true, attendanceRequests: true } },
    manifest: { version: 1, protocol: { min: 1, preferred: 1 }, tenant: { id: officeAgent.organizationId, timezone: "Asia/Baku" }, principal: { id: officeAgent.id, role }, modules: { routeField: { enabled: fieldManifest, scopeVersion: null }, workforceHrm: { enabled: false, scopeVersion: null }, commercial: { enabled: false, scopeVersion: null } }, streams: fieldManifest ? ["routes", "routePoints", "visits", "customers", "contacts", "tasks", "notifications"] : [], syncV2: { routes: false, routesEpoch: null } } }
}
export function officeBootstrap(role = "EMPLOYEE") {
  return toBootstrap(officeBootstrapPayload(role))
}
