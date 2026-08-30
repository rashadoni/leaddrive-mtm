import type { PlanningTarget } from "./manager-planning"

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
    return {
      key: `organization:${customerId}`,
      kind: "organization",
      customerId,
      name: text(source.name) ?? "",
      address: text(source.address),
      eligible: true,
      validOnDate: date,
    }
  }

  if (kind === "contact") {
    const contactId = text(source.contactId)
    if (!contactId) return null
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
    }
  }

  return null
}
