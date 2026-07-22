export const ORGANIZATION_COLUMNS = [
  "name", "type", "category", "status", "geography", "territory",
  "assignedAgent", "manager", "contacts", "visits",
] as const

export type OrganizationColumn = typeof ORGANIZATION_COLUMNS[number]

export interface OrganizationFilters {
  search?: string
  category?: string
  status?: string
  objectType?: string
  region?: string
  administrativeDistrict?: string
  locality?: string
  cityDistrict?: string
  specialization?: string
  organizationKind?: string
  territoryCode?: string
  managingManagerId?: string
  assignedAgentId?: string
  assignmentState?: "ASSIGNED" | "UNASSIGNED"
  sort?: "name" | "updatedAt" | "city" | "category" | "status"
  direction?: "asc" | "desc"
}

export interface OrganizationAgent {
  id: string
  name: string
  role?: string
  status?: string
}

export interface ExplorerOrganization {
  id: string
  name: string
  code?: string
  objectType?: string
  category?: string
  status?: string
  address?: string
  city?: string
  district?: string
  region?: string
  administrativeDistrict?: string
  locality?: string
  cityDistrict?: string
  specialization?: string
  organizationKind?: string
  territoryCode?: string
  phone?: string
  managingManager?: OrganizationAgent | null
  assignedAgents: OrganizationAgent[]
  contactsCount?: number
  visitsCount?: number
}

export interface OrganizationFacets {
  region: string[]
  administrativeDistrict: string[]
  locality: string[]
  cityDistrict: string[]
  city: string[]
  specialization: string[]
  organizationKind: string[]
  territoryCode: string[]
  managers: OrganizationAgent[]
  assignableAgents: OrganizationAgent[]
  asOf?: string
}

export interface OrganizationSavedView {
  id: string
  name: string
  filters: OrganizationFilters & { columns?: OrganizationColumn[] }
  isDefault: boolean
  isShared: boolean
  userId: string
}

export function toExplorerOrganization(raw: any): ExplorerOrganization {
  return {
    id: String(raw.id),
    name: raw.name ?? "",
    code: raw.code ?? undefined,
    objectType: raw.objectType ?? undefined,
    category: raw.category ?? undefined,
    status: raw.status ?? undefined,
    address: raw.address ?? undefined,
    city: raw.city ?? undefined,
    district: raw.district ?? undefined,
    region: raw.region ?? undefined,
    administrativeDistrict: raw.administrativeDistrict ?? undefined,
    locality: raw.locality ?? undefined,
    cityDistrict: raw.cityDistrict ?? undefined,
    specialization: raw.specialization ?? undefined,
    organizationKind: raw.organizationKind ?? undefined,
    territoryCode: raw.territoryCode ?? undefined,
    phone: raw.phone ?? undefined,
    managingManager: raw.managingManager ?? null,
    assignedAgents: (raw.agentAssignments ?? []).map((assignment: any) => assignment.agent).filter(Boolean),
    contactsCount: raw._count?.contactWorkplaces ?? undefined,
    visitsCount: raw._count?.visits ?? undefined,
  }
}

export function normalizeFacets(raw: any): OrganizationFacets {
  const array = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  return {
    region: array(raw?.region),
    administrativeDistrict: array(raw?.administrativeDistrict),
    locality: array(raw?.locality),
    cityDistrict: array(raw?.cityDistrict),
    city: array(raw?.city),
    specialization: array(raw?.specialization),
    organizationKind: array(raw?.organizationKind),
    territoryCode: array(raw?.territoryCode),
    managers: Array.isArray(raw?.managers) ? raw.managers : [],
    assignableAgents: Array.isArray(raw?.assignableAgents) ? raw.assignableAgents : [],
    asOf: raw?.asOf,
  }
}

export function makeOrganizationAssignmentIdempotencyKey(): string {
  return `org-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
