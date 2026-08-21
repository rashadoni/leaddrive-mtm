import Geolocation from "@react-native-community/geolocation"
import { Platform } from "react-native"

export interface OneShotLocation {
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
  altitude?: number
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function nonNegativeOrUndefined(value: number | null | undefined): number | undefined {
  const finite = finiteOrUndefined(value)
  return finite != null && finite >= 0 ? finite : undefined
}

function headingOrUndefined(value: number | null | undefined): number | undefined {
  const finite = finiteOrUndefined(value)
  return finite != null && finite >= 0 && finite <= 360 ? finite : undefined
}

function readPosition(enableHighAccuracy: boolean, timeout: number, maximumAge: number): Promise<OneShotLocation> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error("INVALID_LOCATION"))
          return
        }

        // Android providers commonly use -1 for unavailable speed/bearing.
        // Omit those sentinels so the server does not reject an otherwise
        // valid coordinate as malformed telemetry.
        const speedMetersPerSecond = nonNegativeOrUndefined(position.coords.speed)
        resolve({
          latitude,
          longitude,
          accuracy: nonNegativeOrUndefined(position.coords.accuracy),
          speed: speedMetersPerSecond == null ? undefined : speedMetersPerSecond * 3.6,
          heading: headingOrUndefined(position.coords.heading),
          altitude: finiteOrUndefined(position.coords.altitude),
        })
      },
      reject,
      { enableHighAccuracy, timeout, maximumAge },
    )
  })
}

/**
 * Capture one foreground GPS point. The second attempt deliberately accepts a
 * recent OS-cached point so a weak indoor signal does not leave the manager
 * without a useful, clearly timestamped server position.
 */
export async function captureOneShotLocation(): Promise<OneShotLocation> {
  if (Platform.OS === "android") {
    try {
      Geolocation.setRNConfiguration({
        skipPermissionRequests: true,
        locationProvider: "android",
      })
    } catch {
      // Keep going: a previously configured provider can still return the
      // requested foreground fix.
    }
  }

  try {
    return await readPosition(true, 15_000, 5_000)
  } catch {
    return readPosition(false, 12_000, 120_000)
  }
}
