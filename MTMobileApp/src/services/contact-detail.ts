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

export interface DoctorAssessment {
  id: string
  clientAssessmentId: string
  office?: string
  patientsPerMonth?: number
  bedCount?: number
  isKol: boolean
  kolLevel?: string
  profile?: string
  psychotype?: string
  granularCategory?: string
  actualScore?: number
  targetScore?: number
  periodStart: string
  periodEnd?: string
  source: string
  formulaVersion: string
  formulaName?: string
  formulaSignedAt?: string
  status: string
  reviewComment?: string
  reviewedAt?: string
  enteredByName?: string
  reviewedByName?: string
  createdAt?: string
}

export interface BrandPotentialEvidenceVisit {
  id: string
  checkInAt?: string
  checkOutAt?: string
  status?: string
  customerName?: string
}

export interface BrandPotential {
  id: string
  clientPotentialId: string
  brandExternalId: string
  brandName: string
  productExternalId?: string
  productName?: string
  category?: string
  categoryLabel?: string
  potentialValue: number
  coverageValue: number
  coveragePct: number
  periodStart: string
  periodEnd?: string
  source: string
  formulaVersion?: string
  status: string
  reviewComment?: string
  reviewedAt?: string
  closedAt?: string
  supersedesPotentialId?: string
  agentId?: string
  agentName?: string
  enteredByName?: string
  reviewedByName?: string
  createdAt?: string
  evidenceVisits: BrandPotentialEvidenceVisit[]
}

export interface BrandPotentialEligibleVisit extends BrandPotentialEvidenceVisit {
  agentId?: string
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
  doctorAssessments: DoctorAssessment[]
  brandPotentials: BrandPotential[]
  brandPotentialEligibleVisits: BrandPotentialEligibleVisit[]
  canRecordBrandPotential: boolean
  canReviewBrandPotential: boolean
  brandPotentialPerAgent: boolean
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
  const assessments = Array.isArray(raw?.doctorAssessments) ? raw.doctorAssessments : []
  const potentials = Array.isArray(raw?.fieldPotentials) ? raw.fieldPotentials : []
  const eligibleVisits = Array.isArray(envelope?.eligibleBrandPotentialVisits) ? envelope.eligibleBrandPotentialVisits : []
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
    doctorAssessments: assessments.map((assessment: any) => ({
      id: String(assessment?.id ?? ""),
      clientAssessmentId: opt(assessment?.clientAssessmentId) ?? "",
      office: opt(assessment?.office),
      patientsPerMonth: assessment?.patientsPerMonth == null ? undefined : Number(assessment.patientsPerMonth),
      bedCount: assessment?.bedCount == null ? undefined : Number(assessment.bedCount),
      isKol: Boolean(assessment?.isKol),
      kolLevel: opt(assessment?.kolLevel),
      profile: opt(assessment?.profile),
      psychotype: opt(assessment?.psychotype),
      granularCategory: opt(assessment?.granularCategory),
      actualScore: assessment?.actualScore == null ? undefined : Number(assessment.actualScore),
      targetScore: assessment?.targetScore == null ? undefined : Number(assessment.targetScore),
      periodStart: date(assessment?.periodStart) ?? "",
      periodEnd: date(assessment?.periodEnd),
      source: opt(assessment?.source) ?? "",
      formulaVersion: opt(assessment?.formulaVersion) ?? "",
      formulaName: opt(assessment?.formula?.name),
      formulaSignedAt: opt(assessment?.formula?.signedAt),
      status: opt(assessment?.status) ?? "PENDING",
      reviewComment: opt(assessment?.reviewComment),
      reviewedAt: opt(assessment?.reviewedAt),
      enteredByName: opt(assessment?.enteredByAgent?.name),
      reviewedByName: opt(assessment?.reviewedByAgent?.name),
      createdAt: opt(assessment?.createdAt),
    })),
    brandPotentials: potentials.map((potential: any) => {
      const potentialValue = Number(potential?.potentialValue) || 0
      const coverageValue = Number(potential?.coverageValue) || 0
      const evidence = Array.isArray(potential?.evidenceVisits) ? potential.evidenceVisits : []
      return {
        id: String(potential?.id ?? ""),
        clientPotentialId: opt(potential?.clientPotentialId) ?? "",
        brandExternalId: opt(potential?.brandExternalId) ?? "",
        brandName: opt(potential?.brandName) ?? opt(potential?.brandExternalId) ?? "",
        productExternalId: opt(potential?.productExternalId),
        productName: opt(potential?.productName),
        category: opt(potential?.category),
        categoryLabel: opt(potential?.categoryLabel),
        potentialValue,
        coverageValue,
        coveragePct: potentialValue > 0 ? Math.round((coverageValue / potentialValue) * 1000) / 10 : 0,
        periodStart: date(potential?.periodStart) ?? "",
        periodEnd: date(potential?.periodEnd),
        source: opt(potential?.source) ?? "",
        formulaVersion: opt(potential?.formulaVersion),
        status: opt(potential?.status) ?? "PENDING",
        reviewComment: opt(potential?.reviewComment),
        reviewedAt: opt(potential?.reviewedAt),
        closedAt: opt(potential?.closedAt),
        supersedesPotentialId: opt(potential?.supersedesPotentialId),
        agentId: opt(potential?.agentId),
        agentName: opt(potential?.agent?.name),
        enteredByName: opt(potential?.enteredByAgent?.name),
        reviewedByName: opt(potential?.reviewedByAgent?.name),
        createdAt: opt(potential?.createdAt),
        evidenceVisits: evidence.map((link: any) => ({
          id: String(link?.visit?.id ?? link?.visitId ?? ""),
          checkInAt: opt(link?.visit?.checkInAt),
          checkOutAt: opt(link?.visit?.checkOutAt),
          status: opt(link?.visit?.status),
          customerName: opt(link?.visit?.customer?.name),
        })),
      }
    }),
    brandPotentialEligibleVisits: eligibleVisits.map((visit: any) => ({
      id: String(visit?.id ?? ""),
      checkInAt: opt(visit?.checkInAt),
      checkOutAt: opt(visit?.checkOutAt),
      status: opt(visit?.status),
      customerName: opt(visit?.customer?.name),
      agentId: opt(visit?.agentId),
    })),
    canRecordBrandPotential: Boolean(envelope?.capabilities?.canRecordBrandPotential),
    canReviewBrandPotential: Boolean(envelope?.capabilities?.canReviewBrandPotential),
    brandPotentialPerAgent: envelope?.capabilities?.brandPotentialPerAgent !== false,
    canManage: Boolean(envelope?.capabilities?.canManage),
    canRequestChanges: Boolean(envelope?.capabilities?.canRequestChanges),
  }
}
