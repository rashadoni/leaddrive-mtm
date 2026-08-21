export type OrganizationDetailViewState = "loading" | "ready" | "stale" | "error"
export type OrganizationPrimaryAction = "directions" | "call" | "contact" | "visit" | "none"

export function organizationDetailViewState({
  loading,
  hasDetail,
  loadFailed,
}: {
  loading: boolean
  hasDetail: boolean
  loadFailed: boolean
}): OrganizationDetailViewState {
  if (loading && !hasDetail) return "loading"
  if (loadFailed) return hasDetail ? "stale" : "error"
  return "ready"
}

export function usableOrganizationRecordId(value?: string): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 && normalized !== "undefined" && normalized !== "null"
}

export function selectOrganizationPrimaryAction({
  hasAddress,
  phone,
  contactId,
  visitId,
}: {
  hasAddress: boolean
  phone?: string
  contactId?: string
  visitId?: string
}): OrganizationPrimaryAction {
  if (hasAddress) return "directions"
  if (phone?.trim()) return "call"
  if (usableOrganizationRecordId(contactId)) return "contact"
  if (usableOrganizationRecordId(visitId)) return "visit"
  return "none"
}

export function recentOrganizationVisits<T extends { checkInAt?: string }>(visits: T[]): T[] {
  return [...visits].sort((left, right) => {
    const leftTime = left.checkInAt ? Date.parse(left.checkInAt) : Number.NaN
    const rightTime = right.checkInAt ? Date.parse(right.checkInAt) : Number.NaN
    const safeLeft = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY
    const safeRight = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY
    return safeRight - safeLeft
  })
}

export function disclosedOrganizationItems<T>(items: T[], expanded: boolean, initialCount = 3): T[] {
  return expanded ? items : items.slice(0, Math.max(0, initialCount))
}
