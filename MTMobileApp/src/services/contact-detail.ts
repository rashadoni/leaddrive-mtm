import { summarizePotential, type PotentialSummary } from "./field-potential"

/** Pure mapper for the GAP-003 full contact card. The same mapper consumes the
 * live detail envelope and the richer contacts sync-pull record, keeping the
 * offline card honest and visually identical to the last published snapshot. */

export interface ContactWorkplace {
  id: string
  customerId: string
  name: string
  objectType?: string
  city?: string
  address?: string
  isPrimary: boolean
  jobTitle?: string
  department?: string
  room?: string
  phone?: string
  startedOn?: string
  endedOn?: string
  source?: string
  updatedAt?: string
}

export interface ContactChangeRequest {
  id: string
  kind: string
  status: string
  reason: string
  decisionComment?: string
  submittedAt?: string
  reviewedAt?: string
  requesterName?: string
}

export interface ContactHistoryItem {
  id: string
  action: string
  entity: string
  createdAt?: string
  actorName?: string
}

export interface ContactDetail {
  id: string
  updatedAt: string
  name: string
  firstName: string
  lastName: string
  middleName?: string
  specialty?: string
  specialtyCode?: string
  qualificationCategory?: string
  profile?: string
  type?: string
  category?: string
  status?: string
  birthDate?: string
  gender?: string
  phone?: string
  email?: string
  messengerPhone?: string
  workPhone?: string
  homePhone?: string
  mobilePhone?: string
  viberPhone?: string
  whatsappPhone?: string
  telegramPhone?: string
  postalCode?: string
  addressRegion?: string
  addressLocality?: string
  addressDistrict?: string
  addressStreet?: string
  productCategory?: string
  verificationStatus?: string
  consentStatus?: string
  contactPreference?: string
  source?: string
  duplicateOfContactId?: string
  duplicateOfName?: string
  externalCode?: string
  notes?: string
  workplaces: ContactWorkplace[]
  potential: PotentialSummary | null
  changeRequests: ContactChangeRequest[]
  history: ContactHistoryItem[]
  canManage: boolean
  canRequestChanges: boolean
}

function opt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function date(value: unknown): string | undefined {
  const raw = opt(value)
  return raw ? raw.slice(0, 10) : undefined
}

export function toContactDetail(raw: any, envelope?: any): ContactDetail {
  const workplaces = Array.isArray(raw?.workplaces) ? raw.workplaces : []
  const requests = Array.isArray(raw?.changeRequests) ? raw.changeRequests : []
  const history = Array.isArray(envelope?.history) ? envelope.history : []
  return {
    id: String(raw?.id ?? ""),
    updatedAt: opt(raw?.updatedAt) ?? "",
    name: opt(raw?.displayName) ?? "",
    firstName: opt(raw?.firstName) ?? "",
    lastName: opt(raw?.lastName) ?? "",
    middleName: opt(raw?.middleName),
    specialty: opt(raw?.specialtyName),
    specialtyCode: opt(raw?.specialtyCode),
    qualificationCategory: opt(raw?.qualificationCategory),
    profile: opt(raw?.profile),
    type: opt(raw?.type),
    category: opt(raw?.category),
    status: opt(raw?.status),
    birthDate: date(raw?.birthDate),
    gender: opt(raw?.gender),
    phone: opt(raw?.phone),
    email: opt(raw?.email),
    messengerPhone: opt(raw?.messengerPhone),
    workPhone: opt(raw?.workPhone),
    homePhone: opt(raw?.homePhone),
    mobilePhone: opt(raw?.mobilePhone),
    viberPhone: opt(raw?.viberPhone),
    whatsappPhone: opt(raw?.whatsappPhone),
    telegramPhone: opt(raw?.telegramPhone),
    postalCode: opt(raw?.postalCode),
    addressRegion: opt(raw?.addressRegion),
    addressLocality: opt(raw?.addressLocality),
    addressDistrict: opt(raw?.addressDistrict),
    addressStreet: opt(raw?.addressStreet),
    productCategory: opt(raw?.productCategory),
    verificationStatus: opt(raw?.verificationStatus),
    consentStatus: opt(raw?.consentStatus),
    contactPreference: opt(raw?.contactPreference),
    source: opt(raw?.source),
    duplicateOfContactId: opt(raw?.duplicateOfContactId),
    duplicateOfName: opt(raw?.duplicateOfContact?.displayName),
    externalCode: opt(raw?.externalCode),
    notes: opt(raw?.notes),
    workplaces: workplaces.map((wp: any) => ({
      id: String(wp?.id ?? ""),
      customerId: String(wp?.customer?.id ?? wp?.customerId ?? ""),
      name: opt(wp?.customer?.name) ?? "",
      objectType: opt(wp?.customer?.objectType),
      city: opt(wp?.customer?.city),
      address: opt(wp?.customer?.address),
      isPrimary: Boolean(wp?.isPrimary),
      jobTitle: opt(wp?.jobTitle ?? wp?.position),
      department: opt(wp?.department),
      room: opt(wp?.room),
      phone: opt(wp?.phone),
      startedOn: date(wp?.startedOn),
      endedOn: date(wp?.endedOn),
      source: opt(wp?.source),
      updatedAt: opt(wp?.updatedAt),
    })),
    potential: summarizePotential(raw?.fieldPotentials),
    changeRequests: requests.map((request: any) => ({
      id: String(request?.id ?? ""),
      kind: opt(request?.kind) ?? "",
      status: opt(request?.status) ?? "",
      reason: opt(request?.reason) ?? "",
      decisionComment: opt(request?.decisionComment),
      submittedAt: opt(request?.submittedAt),
      reviewedAt: opt(request?.reviewedAt),
      requesterName: opt(request?.requestedByAgent?.name),
    })),
    history: history.map((item: any) => ({
      id: String(item?.id ?? ""),
      action: opt(item?.action) ?? "",
      entity: opt(item?.entity) ?? "",
      createdAt: opt(item?.createdAt),
      actorName: opt(item?.agent?.name),
    })),
    canManage: Boolean(envelope?.capabilities?.canManage),
    canRequestChanges: Boolean(envelope?.capabilities?.canRequestChanges),
  }
}
