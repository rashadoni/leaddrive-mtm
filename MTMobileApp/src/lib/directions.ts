/**
 * The Google Maps address that BUILDS the drive to a client from where the
 * phone is (owner, 2026-10-19: «Yolu aç» only showed where he was).
 *
 * It used to open a search for the client's address text. An address such as
 * «Nəsimi, Bakı ş., Mikayıl Rəfili / Rəşid Behbudov, 389 məhəllə» finds
 * nothing, and Google Maps then opens on the phone's own position — no route.
 * The client's pin is exact, so the pin comes first and the address only when
 * there is no pin. The `dir` action with a destination and no origin is
 * «from my location»: Google Maps draws the route and offers «Start».
 */

export interface DirectionsTarget {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
}

function usablePin(latitude: unknown, longitude: unknown): latitude is number {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false
  // 0,0 is what an empty import leaves behind, not a place (the Gulf of Guinea).
  return !(latitude === 0 && longitude === 0)
}

/** The route to the target, or null when neither a pin nor an address is known. */
export function directionsUrl(target: DirectionsTarget): string | null {
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="
  if (usablePin(target.latitude, target.longitude)) {
    return `${base}${target.latitude},${target.longitude}`
  }
  const address = target.address?.trim()
  return address ? `${base}${encodeURIComponent(address)}` : null
}
