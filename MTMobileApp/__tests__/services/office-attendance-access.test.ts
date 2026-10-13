import { hasOfficeAttendanceAccess, mayUseOwnAttendanceRequests } from "../../src/services/attendance-access"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
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
  const denied = officeBootstrap(); denied.manifest!.modules.routeField.enabled = false
  expect(hasOfficeAttendanceAccess(denied, officeAgent)).toBe(false)
  delete data.policies.agentPermissions!.attendanceWorkday
  expect(hasOfficeAttendanceAccess(data, officeAgent)).toBe(false)
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
