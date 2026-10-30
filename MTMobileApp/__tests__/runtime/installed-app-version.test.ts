jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: {
    getBundleId: jest.fn(() => "com.mtmobileapp"),
    getVersion: jest.fn(() => "3.11.53"),
    getBuildNumber: jest.fn(() => "1795"),
  },
}))

import DeviceInfo from "react-native-device-info"
import { ROUTE_FIELD_PROFILE } from "../../src/runtime/route-field-profile"

beforeEach(() => {
  jest.mocked(DeviceInfo.getBundleId).mockReturnValue("com.mtmobileapp")
  jest.mocked(DeviceInfo.getVersion).mockReturnValue("3.11.53")
  jest.mocked(DeviceInfo.getBuildNumber).mockReturnValue("1795")
})

describe("installed Route & Field version", () => {
  it("reports the installed APK and follows the next native build without a JS version edit", () => {
    expect(ROUTE_FIELD_PROFILE.apkVersion).toBe("3.11.53+1795")
    jest.mocked(DeviceInfo.getVersion).mockReturnValue("3.11.54")
    jest.mocked(DeviceInfo.getBuildNumber).mockReturnValue("1802")
    expect(ROUTE_FIELD_PROFILE.apkVersion).toBe("3.11.54+1802")
  })

  it("does not attribute the separate Time package to Route & Field", () => {
    jest.mocked(DeviceInfo.getBundleId).mockReturnValue("com.leaddrive.attendance")
    jest.mocked(DeviceInfo.getVersion).mockReturnValue("1.0.0")
    jest.mocked(DeviceInfo.getBuildNumber).mockReturnValue("1042")
    expect(ROUTE_FIELD_PROFILE.applicationId).toBe("com.mtmobileapp")
    expect(ROUTE_FIELD_PROFILE.apkVersion).toBe("unknown")
  })

  it.each([
    ["3.11.53\r\nx-injected: 1", "1795"],
    ["unknown", "1795"],
    ["3.11.53", "0"],
    ["3.11.53", "-1"],
    ["3.11.53", "1795.5"],
    ["3.11.53", "2147483648"],
  ])("keeps unreadable release metadata unknown: %j / %j", (version, code) => {
    jest.mocked(DeviceInfo.getVersion).mockReturnValue(version)
    jest.mocked(DeviceInfo.getBuildNumber).mockReturnValue(code)
    expect(ROUTE_FIELD_PROFILE.apkVersion).toBe("unknown")
  })

  it("does not crash API callers when native metadata cannot be read", () => {
    jest.mocked(DeviceInfo.getVersion).mockImplementationOnce(() => { throw new Error("native unavailable") })
    expect(ROUTE_FIELD_PROFILE.apkVersion).toBe("unknown")
  })
})
