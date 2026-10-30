import { NativeModules } from "react-native"
import { ROUTE_FIELD_PROFILE } from "./route-field-profile"

/** Installed product selects the requested grant; the server still verifies
 * that person's access. Never select a product from the entered phone/role. */
export function clientApplication(): "TIME" | "ROUTE_FIELD" {
  if (NativeModules?.AttendanceIdentity?.applicationId === "com.leaddrive.attendance") return "TIME"
  try {
    // Match the existing lazy metadata reader: an unavailable native bridge
    // must not prevent API/company-discovery modules from loading.
    if (require("react-native-device-info").default.getBundleId() === "com.leaddrive.attendance") return "TIME"
  } catch { /* The original Field distribution remains the default. */ }
  return "ROUTE_FIELD"
}

/** Identify the installed product through the existing wire header. */
export function clientApkVersion(): string {
  const attendance = NativeModules?.AttendanceIdentity
  if (attendance?.applicationId === "com.leaddrive.attendance"
      && typeof attendance.apkVersion === "string"
      && /^\d+\.\d+\.\d+\+\d+$/.test(attendance.apkVersion)) return attendance.apkVersion
  return ROUTE_FIELD_PROFILE.apkVersion
}
