import Geolocation from "@react-native-community/geolocation"
import { Platform } from "react-native"
import type { LocationFixReading } from "../screens/base/organization-location-fix-model"

/**
 * One reading of where the phone is, for «Клиент здесь» — with what the
 * request needs and the tracking readers drop: the moment of the fix by the
 * phone's own clock (the server is told how OLD the fix is, not when it was,
 * so a phone whose clock is wrong is neither refused nor believed about a
 * place it left) and Android's own word on whether a mock provider answered.
 *
 * Asked precisely first; a phone indoors that cannot answer in time is asked
 * again for whatever it knew within the last half minute. An older place than
 * that is not where the agent stands.
 */
function read(enableHighAccuracy: boolean, timeout: number, maximumAge: number): Promise<LocationFixReading> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
          reject(new Error("INVALID_LOCATION"))
          return
        }
        const mocked = (position as unknown as { mocked?: unknown }).mocked
        resolve({
          latitude,
          longitude,
          accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
          timestamp: typeof position.timestamp === "number" && Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
          ...(typeof mocked === "boolean" ? { mocked } : {}),
        })
      },
      reject,
      { enableHighAccuracy, timeout, maximumAge },
    )
  })
}

/**
 * Roughly where the phone is, without waking the GPS for it: whatever the
 * system knew within the last two minutes. For the customer's card, which
 * only wonders whether the agent is near the pin. Null when nothing is known.
 */
export async function readRoughLocation(): Promise<LocationFixReading | null> {
  try {
    return await read(false, 8_000, 120_000)
  } catch {
    return null
  }
}

export async function readLocationFix(): Promise<LocationFixReading> {
  if (Platform.OS === "android") {
    try {
      Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: "android" })
    } catch {
      // A provider configured earlier can still answer.
    }
  }
  try {
    return await read(true, 15_000, 0)
  } catch {
    return read(false, 10_000, 30_000)
  }
}
