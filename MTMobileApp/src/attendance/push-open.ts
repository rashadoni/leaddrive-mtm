import { NativeModules, PermissionsAndroid, Platform } from "react-native"

/**
 * LeadDrive Time receives server notifications since 2026-11-03 (owner: an
 * explanation request from HR arrived without any notification, «надо
 * посмотреть, откроется ли та страница»). A tap leads to the screen the push
 * names; any other target simply opens the app where it was.
 */
// A decided request (owner, 2026-11-03) opens «Sorğular».
const TIME_PUSH_ROUTES: Readonly<Record<string, string>> = { AttendanceExplanations: "OwnExplanations", AttendanceRequests: "OwnRequests" }

export function timeRouteForPushTarget(target: unknown): string | null {
  return typeof target === "string" && Object.prototype.hasOwnProperty.call(TIME_PUSH_ROUTES, target) ? TIME_PUSH_ROUTES[target] : null
}

/** The target of the notification that opened or resumed the app, read once. */
export async function consumeOpenedPushTarget(): Promise<string | null> {
  const native = NativeModules.FieldPush as { consumeOpenedTarget?: () => Promise<unknown> } | undefined
  if (typeof native?.consumeOpenedTarget !== "function") return null
  try {
    const target = await native.consumeOpenedTarget()
    return typeof target === "string" ? target : null
  } catch {
    return null
  }
}

/**
 * Android 13+ draws no notification of an app that was never granted
 * POST_NOTIFICATIONS. Asked once per launch after sign-in; a refusal changes
 * nothing else — the inbox still lists everything.
 */
export async function askTimeNotificationPermission(): Promise<void> {
  try {
    if (Platform.OS !== "android" || Number(Platform.Version) < 33) return
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    if (!permission) return
    if (await PermissionsAndroid.check(permission)) return
    await PermissionsAndroid.request(permission)
  } catch {
    // Notifications are optional.
  }
}
