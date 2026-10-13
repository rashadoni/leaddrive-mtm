import { toBootstrap } from "../src/services/bootstrap"
export const officeAgent = { id: "office-fixture", organizationId: "org-fixture", role: "EMPLOYEE", name: "Aylin Demo" }
export function officeBootstrap(role = "EMPLOYEE") {
  return toBootstrap({ tenant: { id: officeAgent.organizationId, name: "Demo" }, principal: { id: officeAgent.id, role, name: officeAgent.name }, timezone: "Asia/Baku", capabilities: role === "AGENT" ? ["FIELD_EXECUTE", "FIELD_TRACK"] : [],
    policies: { agentPermissions: { attendanceWorkday: true, attendanceRequests: true } },
    manifest: { version: 1, protocol: { min: 1, preferred: 1 }, tenant: { id: officeAgent.organizationId, timezone: "Asia/Baku" }, principal: { id: officeAgent.id, role }, modules: { routeField: { enabled: true, scopeVersion: null }, workforceHrm: { enabled: false, scopeVersion: null }, commercial: { enabled: false, scopeVersion: null } }, streams: ["routes", "routePoints", "visits", "customers", "contacts", "tasks", "notifications"], syncV2: { routes: false, routesEpoch: null } } })
}
