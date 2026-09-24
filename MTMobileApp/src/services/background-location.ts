import { Linking, PermissionsAndroid, Platform } from "react-native"

/**
 * «Allow all the time» for the route.
 *
 * 2026-09-24, the owner's Galaxy S23 on build 1349: with the app open a point
 * went out every 35–42 s; minimised, with the screen still on, every 90–120 s
 * — the same holes as his drive the day before. Android computed a fused fix
 * every 7–13 s and handed it to the app about once in 90 s: the app held
 * location «only while in use», and the manifest did not even declare the
 * background permission, so no agent could ever choose «all the time».
 *
 * Since Android 10 background location is a separate grant that follows the
 * «while in use» one, and Google Play requires the screen to say what is
 * collected and why before the system is asked. The card on the route screen
 * is that disclosure; this file only reads and requests the grant.
 */

/** Whether the route screen should ask for «all the time». Pure, for tests. */
export function needsBackgroundLocation(input: {
  os: string
  apiLevel: number
  foregroundGranted: boolean
  backgroundGranted: boolean
}): boolean {
  // Before Android 10 «while in use» and «always» were one grant.
  if (input.os !== "android" || input.apiLevel < 29) return false
  // Android grants «always» only on top of «while in use»; the visit flow asks for that one.
  if (!input.foregroundGranted) return false
  return !input.backgroundGranted
}

/** Unknown counts as fine: a reading we cannot trust must not become a card every morning. */
export async function backgroundLocationMissing(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  try {
    const apiLevel = typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version)
    const [foregroundGranted, backgroundGranted] = await Promise.all([
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION),
    ])
    return needsBackgroundLocation({ os: Platform.OS, apiLevel, foregroundGranted, backgroundGranted })
  } catch {
    return false
  }
}

/**
 * On Android 11+ the request opens the app's location settings page, where
 * the agent picks «Allow all the time». After a refusal Android stops showing
 * even that, so the app settings are opened instead. The answer is the agent's.
 */
export async function askBackgroundLocation(): Promise<boolean> {
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await Linking.openSettings()
    return false
  } catch {
    await Linking.openSettings().catch(() => {})
    return false
  }
}
