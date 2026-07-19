/**
 * Pure mapper for the contact detail card (SWM-03). Kept outside the screen so
 * the flattening of GET /contacts/[id] (workplaces -> organizations the person
 * works at) is unit-tested.
 */

export interface ContactWorkplace {
  customerId: string
  name: string
  objectType?: string
  city?: string
  address?: string
  isPrimary: boolean
  position?: string
}

export interface ContactDetail {
  id: string
  name: string
  specialty?: string
  type?: string
  category?: string
  status?: string
  phone?: string
  email?: string
  externalCode?: string
  notes?: string
  workplaces: ContactWorkplace[]
}

function opt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

export function toContactDetail(raw: any): ContactDetail {
  const workplaces = Array.isArray(raw?.workplaces) ? raw.workplaces : []
  return {
    id: String(raw?.id),
    name: opt(raw?.displayName) ?? "",
    specialty: opt(raw?.specialtyName),
    type: opt(raw?.type),
    category: opt(raw?.category),
    status: opt(raw?.status),
    phone: opt(raw?.phone),
    email: opt(raw?.email),
    externalCode: opt(raw?.externalCode),
    notes: opt(raw?.notes),
    workplaces: workplaces.map((wp: any) => ({
      customerId: String(wp?.customer?.id ?? wp?.customerId ?? ""),
      name: opt(wp?.customer?.name) ?? "",
      objectType: opt(wp?.customer?.objectType),
      city: opt(wp?.customer?.city),
      address: opt(wp?.customer?.address),
      isPrimary: Boolean(wp?.isPrimary),
      position: opt(wp?.position),
    })),
  }
}
