/**
 * A doctor who works in two clinics (Zeytun, 2026-11-13: «чтоб агент сам уже
 * принимал решение где находится врач»).
 *
 * The route stop stays planned at its clinic. When the agent presses «start
 * the visit» standing in the doctor's OTHER clinic, the app asks whether the
 * doctor is there today; on «yes» the visit is recorded at that clinic and
 * judged by its pin. The server sends, with the route, only the clinics where
 * it will accept such a visit (`otherClinics`), so the question works offline
 * and never offers a clinic the server would refuse.
 *
 * Pure, without React Native: the rule is tested on its own.
 */

export type DoctorOtherClinic = {
  id: string
  name: string
  address?: string
  latitude: number
  longitude: number
  /** The clinic's check-in zone the server enforces (its own, else the organization's). */
  geofenceRadiusMeters?: number
}

type Position = { latitude: number; longitude: number }

function usable(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && typeof longitude === "number"
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0)
}

export function distanceMeters(a: Position, b: Position): number {
  const radius = 6_371_000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b.latitude - a.latitude)
  const deltaLon = toRadians(b.longitude - a.longitude)
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLon / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** The server's `otherClinics` of a route stop, kept only where they can be measured. */
export function parseDoctorOtherClinics(value: unknown): DoctorOtherClinic[] {
  if (!Array.isArray(value)) return []
  const clinics: DoctorOtherClinic[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (typeof row.id !== "string" || !row.id || !usable(row.latitude, row.longitude)) continue
    clinics.push({
      id: row.id,
      name: typeof row.name === "string" ? row.name : "",
      ...(typeof row.address === "string" && row.address ? { address: row.address } : {}),
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      ...(typeof row.geofenceRadiusMeters === "number" && row.geofenceRadiusMeters > 0
        ? { geofenceRadiusMeters: row.geofenceRadiusMeters }
        : {}),
    })
  }
  return clinics
}

/**
 * The doctor's other clinic the agent stands in, or null. The stop's own
 * clinic wins: inside its zone nobody is asked, so two clinics on one campus
 * do not turn every visit into a question.
 */
export function doctorOtherClinicHere(input: {
  position: Position | null | undefined
  stop: { latitude?: number | null; longitude?: number | null }
  stopRadiusMeters: number
  otherClinics: readonly DoctorOtherClinic[]
  fallbackRadiusMeters: number
}): DoctorOtherClinic | null {
  const position = input.position
  if (!position || !usable(position.latitude, position.longitude) || input.otherClinics.length === 0) return null
  if (usable(input.stop.latitude, input.stop.longitude)) {
    const toStop = distanceMeters(position, { latitude: input.stop.latitude as number, longitude: input.stop.longitude as number })
    if (toStop <= input.stopRadiusMeters) return null
  }
  let best: { clinic: DoctorOtherClinic; meters: number } | null = null
  for (const clinic of input.otherClinics) {
    const meters = distanceMeters(position, clinic)
    if (meters > (clinic.geofenceRadiusMeters ?? input.fallbackRadiusMeters)) continue
    if (!best || meters < best.meters) best = { clinic, meters }
  }
  return best?.clinic ?? null
}
