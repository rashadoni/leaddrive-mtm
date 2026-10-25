import { NativeModules } from "react-native"
import { ROUTE_FIELD_PROFILE } from "./route-field-profile"

/** Identify the installed product through the existing wire header. */
export function clientApkVersion(): string {
  const attendance = NativeModules?.AttendanceIdentity
  if (attendance?.applicationId === "com.leaddrive.attendance"
      && typeof attendance.apkVersion === "string"
      && /^\d+\.\d+\.\d+\+\d+$/.test(attendance.apkVersion)) return attendance.apkVersion
  return ROUTE_FIELD_PROFILE.apkVersion
}
