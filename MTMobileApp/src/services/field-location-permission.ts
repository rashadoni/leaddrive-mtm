import Geolocation from "@react-native-community/geolocation"
import i18next from "i18next"
import { PermissionsAndroid, Platform } from "react-native"
import { askLocationDisclosure, requestLocationAfterDisclosure } from "./location-disclosure"

/**
 * The phone's location grant for field work, asked only after the app's own
 * disclosure (location-disclosure.ts). Android's sheet opens from here, from
 * the visit screen's check-in (with its own rationale) and, for office
 * attendance only, from attendance-location-fix.ts — the test
 * `location-disclosure-paths` keeps that list.
 */

const translate = (key: string) => i18next.t(key)

/** Precise or approximate: either lets the workday be recorded. */
export async function fieldLocationGranted(): Promise<boolean> {
  if (Platform.OS !== "android") return true
  const [fine, coarse] = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
  ])
  return fine || coarse
}

/** Android's own sheet. Call it only after the disclosure said «Продолжить». */
export async function requestFieldLocationSheet(): Promise<boolean> {
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ])
  return result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
    result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
}

export function discloseFieldLocation(): Promise<boolean> {
  return askLocationDisclosure(translate)
}

/** For an action the agent pressed (a check-in): disclosure, then the sheet. */
export async function ensureFieldLocation(): Promise<boolean> {
  if (Platform.OS !== "android") return true
  try {
    return await requestLocationAfterDisclosure({ t: translate, granted: fieldLocationGranted, request: requestFieldLocationSheet })
  } catch {
    return false
  }
}

/**
 * The geolocation library asks for location by itself on a read without a
 * grant (GeolocationModule.getCurrentPosition → requestAuthorization) unless
 * told not to — and nothing of ours precedes that sheet. Opening «Маршрут»
 * or «Визиты» brought it up before the workday did. Told once at launch, a
 * read without a grant just fails («No location provider available»), and
 * the sheet comes only after the disclosure.
 */
export function stopLibraryLocationPrompts(): void {
  if (Platform.OS !== "android") return
  try {
    Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: "android" })
  } catch {
    // The library keeps its default then; tracking and the one-shot readers
    // set this again before they read.
  }
}
