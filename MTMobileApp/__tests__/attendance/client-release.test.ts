import { NativeModules } from "react-native"
import { clientApkVersion } from "../../src/runtime/client-release"
import { ROUTE_FIELD_PROFILE } from "../../src/runtime/route-field-profile"
afterEach(() => { delete NativeModules.AttendanceIdentity })
it("preserves the original MTM wire version", () => {
  expect(clientApkVersion()).toBe(ROUTE_FIELD_PROFILE.apkVersion)
})
it("sends the installed attendance version through the existing server protocol", () => {
  NativeModules.AttendanceIdentity = { applicationId: "com.leaddrive.attendance", apkVersion: "1.0.0+1001" }
  expect(clientApkVersion()).toBe("1.0.0+1001")
})
it("does not accept an unrelated native identity as attendance", () => {
  NativeModules.AttendanceIdentity = { applicationId: "com.other", apkVersion: "9.0.0+1" }
  expect(clientApkVersion()).toBe(ROUTE_FIELD_PROFILE.apkVersion)
})
