import { normalizePlanningTimeSlot } from "../../services/manager-planning"

export const PLANNING_TIME_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))
export const PLANNING_TIME_MINUTES = ["00", "15", "30", "45"] as const

export type PlanningTimeMinute = string

export function planningTimeParts(value?: string | null): { hour: string; minute: PlanningTimeMinute } {
  const normalized = normalizePlanningTimeSlot(value) ?? "09:00"
  const minute = normalized.slice(3)

  return {
    hour: normalized.slice(0, 2),
    minute,
  }
}

export function planningTimeValue(hour: string, minute: PlanningTimeMinute): string {
  const candidate = `${hour}:${minute}`
  return normalizePlanningTimeSlot(candidate) ?? "09:00"
}

/**
 * Standard choices are quarter-hours, but a pre-existing valid server time
 * must remain selectable so merely opening and closing the sheet never rounds
 * a route stop behind the user's back.
 */
export function planningTimeMinuteOptions(value?: string | null): PlanningTimeMinute[] {
  const { minute } = planningTimeParts(value)
  return PLANNING_TIME_MINUTES.includes(minute as (typeof PLANNING_TIME_MINUTES)[number])
    ? [...PLANNING_TIME_MINUTES]
    : [...PLANNING_TIME_MINUTES, minute].sort()
}
