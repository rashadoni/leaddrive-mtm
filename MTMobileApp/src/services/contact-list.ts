/**
 * Shape helpers for the Contacts list (P0-C). Kept pure and outside the screen
 * component so the mapping (esp. picking the primary workplace) is unit-tested.
 * Contacts are online-only for now: the sync-pull cache does not carry a
 * `contacts` entity, so there is no offline fallback yet (unlike organizations,
 * which reuse the cached `customers`).
 */

export interface ContactListItem {
  id: string
  name: string
  specialty?: string
  type?: string
  category?: string
  phone?: string
  workplace?: string
}

function opt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

/** Map one GET /contacts row to the list-item shape the screen renders. */
export function toContactListItem(raw: any): ContactListItem {
  const workplaces = Array.isArray(raw?.workplaces) ? raw.workplaces : []
  // The server orders workplaces isPrimary-desc, so [0] is the primary one.
  const primary = workplaces[0]
  return {
    id: String(raw?.id),
    name: opt(raw?.displayName) ?? "",
    specialty: opt(raw?.specialtyName),
    type: opt(raw?.type),
    category: opt(raw?.category),
    phone: opt(raw?.phone),
    workplace: opt(primary?.customer?.name),
  }
}
