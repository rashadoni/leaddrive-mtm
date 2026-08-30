/** Narrow v2 card projection for the active Route Field contact catalog. */
export interface RouteContactListItem {
  id: string
  name: string
  specialty?: string
  type?: string
  category?: string
  phone?: string
  workplace?: string
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

/**
 * Map only fields emitted by `/mobile/route-field/contacts`. In particular,
 * do not fall back to the old top-level contact phone or an arbitrary cached
 * workplace: the server already chose one accessible current workplace.
 */
export function toRouteContactListItem(raw: any): RouteContactListItem {
  const workplace = raw?.workplace && typeof raw.workplace === "object" ? raw.workplace : null
  return {
    id: String(raw?.id ?? ""),
    name: optionalString(raw?.name) ?? "",
    specialty: optionalString(raw?.specialty),
    type: optionalString(raw?.type),
    category: optionalString(raw?.category),
    workplace: optionalString(workplace?.name),
    phone: optionalString(workplace?.phone),
  }
}
