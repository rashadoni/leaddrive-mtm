import { attendanceTabs, ATTENDANCE_APP } from "../../src/attendance/profile"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"

it.each(["EMPLOYEE", "ADMIN", "MANAGER", "SUPERVISOR"])("%s receives only personal attendance even with manager permissions", role => {
  expect(attendanceTabs(officeBootstrap(role), { ...officeAgent, role })).toEqual([
    "OwnWorkday", "OwnRequests", "OwnExplanations", "OwnInbox", "OwnProfile",
  ])
})
it("cannot open attendance as a field agent, without a grant, or with a foreign identity", () => {
  expect(attendanceTabs(officeBootstrap("AGENT"), { ...officeAgent, role: "AGENT" })).toEqual([])
  expect(attendanceTabs(null, officeAgent)).toEqual([])
  expect(attendanceTabs(officeBootstrap(), { ...officeAgent, organizationId: "foreign" })).toEqual([])
  expect(attendanceTabs(officeBootstrap(), { ...officeAgent, id: "foreign" })).toEqual([])
  const data = officeBootstrap()
  data.policies.agentPermissions!.attendanceWorkday = false
  expect(attendanceTabs(data, officeAgent)).toEqual([])
})
it("revoking requests removes that destination without taking away the granted workday", () => {
  const data = officeBootstrap()
  data.policies.agentPermissions!.attendanceRequests = false
  expect(attendanceTabs(data, officeAgent)).toEqual(["OwnWorkday", "OwnExplanations", "OwnInbox", "OwnProfile"])
})
it("uses a different installed application identity from MTM", () => {
  expect(ATTENDANCE_APP.applicationId).toBe("com.leaddrive.attendance")
  expect(ATTENDANCE_APP.applicationId).not.toBe("com.mtmobileapp")
})
