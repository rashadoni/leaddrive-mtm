import { hasOfficeAttendanceAccess, mayUseOwnAttendanceRequests } from "../../src/services/attendance-access"
import { officeAgent, officeBootstrap, officeBootstrapPayload } from "../../test-support/office-attendance"
import { hasRouteFieldAccess, toBootstrap } from "../../src/services/bootstrap"
it.each(["EMPLOYEE", "ADMIN", "MANAGER", "SUPERVISOR"])("admits enrolled %s only to own attendance, without field authority", role => {
  const data = officeBootstrap(role), agent = { ...officeAgent, role }
  expect(hasOfficeAttendanceAccess(data, agent)).toBe(true)
  expect(mayUseOwnAttendanceRequests(data, agent, data.routeFieldAccess)).toBe(true)
  expect(hasRouteFieldAccess(data.routeFieldAccess)).toBe(false)
  expect(data.capabilities).not.toContain("FIELD_EXECUTE"); expect(data.capabilities).not.toContain("FIELD_TRACK")
})
it("requires bound current tenant/principal/role and an explicit permission on a parsed manifest", () => {
  const data = officeBootstrap()
  for (const agent of [{ ...officeAgent, id: "foreign" }, { ...officeAgent, organizationId: "foreign" }, { ...officeAgent, role: "ADMIN" }, { ...officeAgent, role: "UNKNOWN" }]) expect(hasOfficeAttendanceAccess(data, agent)).toBe(false)
  expect(hasOfficeAttendanceAccess({ ...data, manifest: null }, officeAgent)).toBe(false)
  expect(hasOfficeAttendanceAccess(toBootstrap({ policies: { agentPermissions: { attendanceWorkday: true } } }), officeAgent)).toBe(false)
  delete data.policies.agentPermissions!.attendanceWorkday
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
})
it("accepts the production office bootstrap while field execution and streams stay closed", () => {
  const raw = officeBootstrapPayload(), data = toBootstrap(raw)
  expect(raw.modules.routeField.enabled).toBe(true)
  expect(data.manifest?.modules.routeField.enabled).toBe(false)
  expect(data.manifest?.streams).toEqual([])
  expect(data.routeFieldAccess).toBe("disabled")
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(true)
  expect(mayUseOwnAttendanceRequests(data, officeAgent, data.routeFieldAccess)).toBe(true)
  expect(data.capabilities).toEqual([])
  expect(hasRouteFieldAccess(data.routeFieldAccess)).toBe(false)
})
it.each([undefined, 0, 2, "1", true])("refuses absent or unsupported attendance protocol %p", version => {
  const raw = officeBootstrapPayload()
  const data = toBootstrap({ ...raw, policies: { ...raw.policies, attendanceMarkVersion: version } })
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
})
it.each([undefined, false, "true", 1])("refuses absent, withdrawn or malformed workday grant %p", grant => {
  const raw = officeBootstrapPayload()
  const data = toBootstrap({ ...raw, policies: { ...raw.policies, agentPermissions: { ...raw.policies.agentPermissions, attendanceWorkday: grant } } })
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
})
it("does not accept a mixed tenant or principal even with an attendance grant", () => {
  for (const field of ["tenant", "principal"] as const) {
    const raw = officeBootstrapPayload()
    raw.manifest[field].id = "another-identity"
    const data = toBootstrap(raw)
    expect(data.manifest).toBeNull()
    expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
  }
  const data = officeBootstrap()
  expect(hasOfficeAttendanceAccess({ ...data, tenant: { ...data.tenant!, id: "another-tenant" } }, officeAgent)).toBe(false)
  expect(hasOfficeAttendanceAccess({ ...data, principal: { ...data.principal!, id: "another-principal" } }, officeAgent)).toBe(false)
  expect(hasOfficeAttendanceAccess(null, officeAgent)).toBe(false)
  expect(hasOfficeAttendanceAccess(data, null)).toBe(false)
})
it("does not infer requests from a workday grant or office access from the old field permission", () => {
  const data = officeBootstrap(); data.policies.agentPermissions!.attendanceRequests = false
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(true)
  expect(mayUseOwnAttendanceRequests(data, officeAgent, "enabled")).toBe(false)
  data.policies.agentPermissions!.attendanceWorkday = false
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
  const agent = { ...officeAgent, role: "AGENT" }, field = officeBootstrap("AGENT")
  expect(hasOfficeAttendanceAccess(field, agent)).toBe(false); expect(field.routeFieldAccess).toBe("enabled")
  expect(mayUseOwnAttendanceRequests(field, agent, "enabled")).toBe(true)
  expect(mayUseOwnAttendanceRequests(field, agent, "offline")).toBe(false)
})
