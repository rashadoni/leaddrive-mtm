import { NativeModules } from "react-native"
import DeviceInfo from "react-native-device-info"
import { ROUTE_FIELD_PROFILE } from "./route-field-profile"

/** Installed product selects the requested grant; the server still verifies
 * that person's access. Never select a product from the entered phone/role. */
export function clientApplication(): "TIME" | "ROUTE_FIELD" {
  return NativeModules?.AttendanceIdentity?.applicationId === "com.leaddrive.attendance"
    || DeviceInfo.getBundleId() === "com.leaddrive.attendance" ? "TIME" : "ROUTE_FIELD"
}

/** Identify the installed product through the existing wire header. */
export function clientApkVersion(): string {
  const attendance = NativeModules?.AttendanceIdentity
  if (attendance?.applicationId === "com.leaddrive.attendance"
      && typeof attendance.apkVersion === "string"
      && /^\d+\.\d+\.\d+\+\d+$/.test(attendance.apkVersion)) return attendance.apkVersion
  return ROUTE_FIELD_PROFILE.apkVersion
}
