/**
 * Route Field's deliberately small v2 contact projection. Do not import the
 * full GAP-003 contact mapper here: that projection also carries commercial
 * potential, scoring, review state and personal contact data which this APK
 * must neither display nor use to make a route decision.
 */

export interface RouteContactWorkplace {
  id: string
  name: string
  city?: string
  address?: string
  isPrimary: boolean
  jobTitle?: string
  phone?: string
}

export interface RouteContactDetail {
  id: string
  name: string
  specialty?: string
  type?: string
  category?: string
  status?: string
  workplaces: RouteContactWorkplace[]
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

export function toRouteContactDetail(raw: any): RouteContactDetail {
  const workplaces = Array.isArray(raw?.workplaces) ? raw.workplaces : []
  return {
    id: String(raw?.id ?? ""),
    name: optionalString(raw?.name) ?? "",
    specialty: optionalString(raw?.specialty),
    type: optionalString(raw?.type),
    category: optionalString(raw?.category),
    status: optionalString(raw?.status),
    workplaces: workplaces.map((workplace: any): RouteContactWorkplace => ({
      id: String(workplace?.id ?? ""),
      name: optionalString(workplace?.name) ?? "",
      city: optionalString(workplace?.city),
      address: optionalString(workplace?.address),
      isPrimary: Boolean(workplace?.isPrimary),
      jobTitle: optionalString(workplace?.jobTitle),
      phone: optionalString(workplace?.phone),
    })),
  }
}
