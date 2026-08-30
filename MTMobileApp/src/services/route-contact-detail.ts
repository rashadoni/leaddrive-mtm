/**
 * Route Field's deliberately small contact projection.  Do not import the
 * full GAP-003 contact mapper here: that projection also carries commercial
 * potential, scoring and review state which this APK must neither display nor
 * use to make a route decision.
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
  phone?: string
  email?: string
  messengerPhone?: string
  workPhone?: string
  homePhone?: string
  mobilePhone?: string
  addressRegion?: string
  addressLocality?: string
  addressDistrict?: string
  addressStreet?: string
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
    name: optionalString(raw?.displayName) ?? "",
    specialty: optionalString(raw?.specialtyName),
    type: optionalString(raw?.type),
    category: optionalString(raw?.category),
    status: optionalString(raw?.status),
    phone: optionalString(raw?.phone),
    email: optionalString(raw?.email),
    messengerPhone: optionalString(raw?.messengerPhone),
    workPhone: optionalString(raw?.workPhone),
    homePhone: optionalString(raw?.homePhone),
    mobilePhone: optionalString(raw?.mobilePhone),
    addressRegion: optionalString(raw?.addressRegion),
    addressLocality: optionalString(raw?.addressLocality),
    addressDistrict: optionalString(raw?.addressDistrict),
    addressStreet: optionalString(raw?.addressStreet),
    workplaces: workplaces.map((workplace: any): RouteContactWorkplace => ({
      id: String(workplace?.id ?? ""),
      name: optionalString(workplace?.customer?.name) ?? "",
      city: optionalString(workplace?.customer?.city),
      address: optionalString(workplace?.customer?.address),
      isPrimary: Boolean(workplace?.isPrimary),
      jobTitle: optionalString(workplace?.jobTitle ?? workplace?.position),
      phone: optionalString(workplace?.phone),
    })),
  }
}
