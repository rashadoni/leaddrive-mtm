import type { PlanningClinicChoice, PlanningTarget } from "./manager-planning"

export type RoutePlanningTargetHint = {
  kind: "contact" | "organization"
  id: string
  name: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Strict adapter for the fixed v2 planning-target projection. It intentionally
 * ignores any accidental extra fields and binds every result to the exact date
 * that the server evaluated, so a stale card cannot be reused for another
 * route day before the server-side write check runs.
 */
export function toRoutePlanningTarget(raw: unknown, date: string): PlanningTarget | null {
  if (!isDateKey(date)) return null
  const source = record(raw)
  if (!source) return null
  const kind = text(source.kind)
  const customerId = text(source.customerId)
  if (!customerId) return null

  if (kind === "organization") {
    const objectType = text(source.objectType)
    const doctorCount = typeof source.doctorCount === "number" && Number.isInteger(source.doctorCount) && source.doctorCount >= 0
      ? source.doctorCount
      : undefined
    return {
      key: `organization:${customerId}`,
      kind: "organization",
      customerId,
      name: text(source.name) ?? "",
      address: text(source.address),
      eligible: true,
      validOnDate: date,
      ...(objectType ? { objectType } : {}),
      ...(doctorCount !== undefined ? { doctorCount } : {}),
    }
  }

  if (kind === "contact") {
    const contactId = text(source.contactId)
    if (!contactId) return null
    const clinicChoices = contactClinicChoices(source.workplaces)
    return {
      key: `contact:${contactId}`,
      kind: "contact",
      customerId,
      contactId,
      name: text(source.name) ?? "",
      organizationName: text(source.organizationName),
      address: text(source.address),
      eligible: true,
      contactStatus: "ACTIVE",
      validOnDate: date,
      ...(clinicChoices ? { clinicChoices } : {}),
    }
  }

  return null
}

/**
 * The clinics of a doctor who works in several (server, 2026-11-13): each one
 * the save would accept, the one of his last visit first. Fewer than two is no
 * choice at all.
 */
function contactClinicChoices(value: unknown): PlanningClinicChoice[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const choices: PlanningClinicChoice[] = []
  for (const raw of value) {
    const place = record(raw)
    const customerId = text(place?.customerId)
    if (!place || !customerId || seen.has(customerId)) continue
    seen.add(customerId)
    choices.push({
      customerId,
      organizationName: text(place.name),
      address: text(place.address),
      lastVisited: place.lastVisited === true,
    })
  }
  return choices.length > 1 ? choices : undefined
}
