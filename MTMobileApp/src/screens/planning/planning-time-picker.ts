import { normalizePlanningTimeSlot } from "../../services/manager-planning"

export const PLANNING_TIME_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))
export const PLANNING_TIME_MINUTES = ["00", "30"] as const

export type PlanningTimeMinute = (typeof PLANNING_TIME_MINUTES)[number]

export function planningTimeParts(value?: string | null): { hour: string; minute: PlanningTimeMinute } {
  const normalized = normalizePlanningTimeSlot(value) ?? "09:00"
  const minute = normalized.slice(3) as PlanningTimeMinute

  return {
    hour: normalized.slice(0, 2),
    minute,
  }
}

export function planningTimeValue(hour: string, minute: PlanningTimeMinute): string {
  const candidate = `${hour}:${minute}`
  return normalizePlanningTimeSlot(candidate) ?? "09:00"
}
