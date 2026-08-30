/**
 * Route Field's projection of the additive `section=route-field` response.
 * Keep this deliberately narrower than the legacy organization detail model:
 * manager assignment, commercial, potential and cross-agent visit payloads
 * are never represented in active Route Field state.
 */
export interface RouteOrganizationContact {
  id: string
  name: string
  specialty?: string
  type?: string
  phone?: string
  isPrimary: boolean
  position?: string
}

export interface RouteOrganizationVisit {
  id: string
  status: string
  checkInAt?: string
  outcome?: string
}

export interface RouteOrganizationDetail {
  id: string
  name: string
  code?: string
  objectType?: string
  category?: string
  status?: string
  address?: string
  locality?: string
  city?: string
  district?: string
  phone?: string
  contacts: RouteOrganizationContact[]
  visits: RouteOrganizationVisit[]
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export function toRouteOrganizationDetail(raw: any): RouteOrganizationDetail {
  const contacts = Array.isArray(raw?.contacts) ? raw.contacts : []
  const visits = Array.isArray(raw?.visits) ? raw.visits : []
  return {
    id: String(raw?.id ?? ""),
    name: text(raw?.name) ?? "",
    code: text(raw?.code),
    objectType: text(raw?.objectType),
    category: text(raw?.category),
    status: text(raw?.status),
    address: text(raw?.address),
    locality: text(raw?.locality),
    city: text(raw?.city),
    district: text(raw?.district),
    phone: text(raw?.phone),
    contacts: contacts.map((contact: any): RouteOrganizationContact => {
      return {
        id: String(contact?.id ?? ""),
        name: text(contact?.name) ?? "",
        specialty: text(contact?.specialty),
        type: text(contact?.type),
        phone: text(contact?.phone),
        isPrimary: Boolean(contact?.isPrimary),
        position: text(contact?.position),
      }
    }).filter((contact: RouteOrganizationContact) => Boolean(contact.id)),
    visits: visits.map((visit: any): RouteOrganizationVisit => ({
      id: String(visit?.id ?? ""),
      status: text(visit?.status) ?? "",
      checkInAt: text(visit?.checkInAt),
      outcome: text(visit?.outcome),
    })).filter((visit: RouteOrganizationVisit) => Boolean(visit.id)),
  }
}
