jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: {
    getBundleId: jest.fn(() => "com.mtmobileapp"),
    getVersion: jest.fn(() => "3.11.54"),
    getBuildNumber: jest.fn(() => "1802"),
  },
}))

import DeviceInfo from "react-native-device-info"
import { NativeModules } from "react-native"
import { clientApkVersion, clientApplication } from "../../src/runtime/client-release"
import { ROUTE_FIELD_PROFILE } from "../../src/runtime/route-field-profile"
afterEach(() => { delete NativeModules.AttendanceIdentity })
beforeEach(() => {
  jest.mocked(DeviceInfo.getBundleId).mockReturnValue("com.mtmobileapp")
  jest.mocked(DeviceInfo.getVersion).mockReturnValue("3.11.54")
  jest.mocked(DeviceInfo.getBuildNumber).mockReturnValue("1802")
})
it("uses the installed Field release through the existing wire header", () => {
  expect(clientApkVersion()).toBe("3.11.54+1802")
  expect(clientApplication()).toBe("ROUTE_FIELD")
})
it("sends the installed attendance version through the existing server protocol", () => {
  NativeModules.AttendanceIdentity = { applicationId: "com.leaddrive.attendance", apkVersion: "1.0.0+1001" }
  expect(clientApkVersion()).toBe("1.0.0+1001")
  expect(clientApplication()).toBe("TIME")
})
it("does not accept an unrelated native identity as attendance", () => {
  NativeModules.AttendanceIdentity = { applicationId: "com.other", apkVersion: "9.0.0+1" }
  expect(clientApkVersion()).toBe(ROUTE_FIELD_PROFILE.apkVersion)
  expect(clientApplication()).toBe("ROUTE_FIELD")
})
it("does not mislabel Time when its native release metadata is unavailable", () => {
  jest.mocked(DeviceInfo.getBundleId).mockReturnValue("com.leaddrive.attendance")
  expect(clientApkVersion()).toBe("unknown")
  expect(clientApplication()).toBe("TIME")
})
