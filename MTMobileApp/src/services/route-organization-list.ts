/**
 * Narrow organization projection for Route Field. The server remains the
 * source of tenant and assignee scope; this mapper prevents manager ownership,
 * assignment and commercial-potential fields from becoming mobile UI state.
 */
export type RouteOrganizationListItem = {
  id: string
  name: string
  code?: string
  objectType?: string
  category?: string
  address?: string
  phone?: string
  contactsCount?: number
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function count(value: unknown): number | undefined {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined
}

export function toRouteOrganizationListItem(raw: any): RouteOrganizationListItem {
  return {
    id: String(raw?.id ?? ""),
    name: text(raw?.name) ?? "",
    code: text(raw?.code),
    objectType: text(raw?.objectType),
    category: text(raw?.category),
    address: text(raw?.address),
    phone: text(raw?.phone),
    contactsCount: count(raw?.contactsCount),
  }
}
