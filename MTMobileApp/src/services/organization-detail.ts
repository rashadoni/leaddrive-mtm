import { summarizePotential, type PotentialSummary } from "./field-potential"

/**
 * Pure mapper for the organization detail card (SWM-06). Kept outside the
 * screen so the flattening of the rich GET /organizations/[id] payload
 * (contactWorkplaces -> contacts, visits, counts, field potential) is
 * unit-tested.
 */

export interface OrgDetailContact {
  id: string
  name: string
  specialty?: string
  type?: string
  phone?: string
  isPrimary: boolean
  position?: string
}

export interface OrgDetailVisit {
  id: string
  status: string
  checkInAt?: string
  outcome?: string
  agentName?: string
}

export interface OrganizationDetail {
  id: string
  name: string
  code?: string
  objectType?: string
  category?: string
  status?: string
  address?: string
  region?: string
  administrativeDistrict?: string
  locality?: string
  cityDistrict?: string
  city?: string
  district?: string
  specialization?: string
  organizationKind?: string
  territoryCode?: string
  phone?: string
  contactPerson?: string
  notes?: string
  managingManagerName?: string
  assignedAgentNames: string[]
  contacts: OrgDetailContact[]
  visits: OrgDetailVisit[]
  potential: PotentialSummary | null
}

function opt(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

export function toOrganizationDetail(raw: any): OrganizationDetail {
  const workplaces = Array.isArray(raw?.contactWorkplaces) ? raw.contactWorkplaces : []
  const visits = Array.isArray(raw?.visits) ? raw.visits : []
  const assignments = Array.isArray(raw?.agentAssignments) ? raw.agentAssignments : []
  const assignedAgentNames = [...new Set<string>(assignments
    .map((assignment: any): string | undefined => opt(assignment?.agent?.name))
    .filter((name: string | undefined): name is string => Boolean(name)))]
  return {
    id: String(raw?.id),
    name: opt(raw?.name) ?? "",
    code: opt(raw?.code),
    objectType: opt(raw?.objectType),
    category: opt(raw?.category),
    status: opt(raw?.status),
    address: opt(raw?.address),
    region: opt(raw?.region),
    administrativeDistrict: opt(raw?.administrativeDistrict),
    locality: opt(raw?.locality),
    cityDistrict: opt(raw?.cityDistrict),
    city: opt(raw?.city),
    district: opt(raw?.district),
    specialization: opt(raw?.specialization),
    organizationKind: opt(raw?.organizationKind),
    territoryCode: opt(raw?.territoryCode),
    phone: opt(raw?.phone),
    contactPerson: opt(raw?.contactPerson),
    notes: opt(raw?.notes),
    managingManagerName: opt(raw?.managingManager?.name),
    assignedAgentNames,
    contacts: workplaces.map((wp: any) => ({
      id: String(wp?.contact?.id ?? wp?.contactId ?? ""),
      name: opt(wp?.contact?.displayName) ?? "",
      specialty: opt(wp?.contact?.specialtyName),
      type: opt(wp?.contact?.type),
      phone: opt(wp?.contact?.phone),
      isPrimary: Boolean(wp?.isPrimary),
      position: opt(wp?.position),
    })),
    visits: visits.map((v: any) => ({
      id: String(v?.id),
      status: opt(v?.status) ?? "",
      checkInAt: opt(v?.checkInAt),
      outcome: opt(v?.outcome),
      agentName: opt(v?.agent?.name),
    })),
    potential: summarizePotential(raw?.fieldPotentials),
  }
}
