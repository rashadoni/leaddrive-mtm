import {
  LOCATION_FIX_MIN_MOVE_METERS,
  locationFixDistanceMeters,
  type LocationFixPoint,
} from "../screens/base/organization-location-fix-model"

/**
 * «Адрес и точка» in «Предложить изменение» (owner, 2026-11-04: «я предлагаю
 * местоположение и адрес также сделать в этом разделе, а не искать где-то в
 * другом месте»; «должно быть и до и на месте»).
 *
 * A doctor has no address of his own: the address and the pin belong to the
 * place he works at. So the form picks one of his workplaces and proposes its
 * street address and its pin — in advance, from wherever the agent is. The
 * request is the one «Клиент здесь» sends from the spot, marked as made in
 * advance (leaddrive-v2 `evaluateRemoteCustomerLocationRequest`); the agent
 * confirms it standing at the place later, on the place's card.
 *
 * Free of React Native imports: the rules are tested on their own.
 */

/** How long an address may be — the server's own limit. */
export const PLACE_ADDRESS_MAX = 300

/** An address as words: trimmed, one space between them; nothing written is null. */
export function normalizePlaceAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const words = value.replace(/\s+/g, " ").trim()
  return words || null
}

/** The address proposed: what the agent wrote, if it says something other than the card. */
export function placeAddressChange(current: string | null | undefined, written: string): string | null {
  const proposed = normalizePlaceAddress(written)
  if (!proposed) return null
  const now = normalizePlaceAddress(current)
  if (now && now.toLocaleLowerCase() === proposed.toLocaleLowerCase()) return null
  return proposed
}

/** The pin proposed: the one the agent put on the map, if it moves the place at all. */
export function placePinChange(current: LocationFixPoint | null, picked: LocationFixPoint | null): LocationFixPoint | null {
  if (!picked) return null
  if (current && locationFixDistanceMeters(current, picked) < LOCATION_FIX_MIN_MOVE_METERS) return null
  return picked
}

export interface PlaceChange {
  address: string | null
  pin: LocationFixPoint | null
}

export function placeChange(
  current: { address?: string | null; pin: LocationFixPoint | null },
  form: { address: string; picked: LocationFixPoint | null },
): PlaceChange {
  return { address: placeAddressChange(current.address, form.address), pin: placePinChange(current.pin, form.picked) }
}

export function placeChanged(change: PlaceChange): boolean {
  return change.address !== null || change.pin !== null
}

/**
 * Where the request says the place is. The server always wants a point: an
 * address-only correction sends the pin as it stands (it stays there). A place
 * with no pin at all needs one first.
 */
export function placeProposedPoint(change: PlaceChange, current: LocationFixPoint | null): LocationFixPoint | null {
  return change.pin ?? current
}

/** What the request in advance sends (leaddrive-v2 `…/organizations/:id/location-request`, `origin: "REMOTE"`). */
export function advancePlacePayload(idempotencyKey: string, proposed: LocationFixPoint, change: PlaceChange, reason: string) {
  const said = reason.trim()
  return {
    idempotencyKey,
    origin: "REMOTE" as const,
    proposed: { latitude: proposed.latitude, longitude: proposed.longitude },
    ...(change.address ? { address: change.address.slice(0, PLACE_ADDRESS_MAX) } : {}),
    ...(said ? { comment: said.slice(0, 300) } : {}),
  }
}
