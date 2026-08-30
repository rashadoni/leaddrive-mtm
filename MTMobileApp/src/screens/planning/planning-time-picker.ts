import { normalizePlanningTimeSlot } from "../../services/manager-planning"

export type PlanningTimePeriod = "night" | "morning" | "day" | "evening"

const PERIOD_BOUNDS: Record<PlanningTimePeriod, readonly [number, number]> = {
  night: [0, 5 * 60 + 30],
  morning: [6 * 60, 11 * 60 + 30],
  day: [12 * 60, 16 * 60 + 30],
  evening: [17 * 60, 23 * 60 + 30],
}

export const PLANNING_TIME_PERIODS: PlanningTimePeriod[] = ["morning", "day", "evening", "night"]

function timeFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

function minutesFromTime(value: string): number {
  return (Number(value.slice(0, 2)) * 60) + Number(value.slice(3))
}

/** Every selectable value exactly matches the server's half-hour contract. */
export function planningTimeSlots(period: PlanningTimePeriod): string[] {
  const [from, to] = PERIOD_BOUNDS[period]
  const slots: string[] = []
  for (let minutes = from; minutes <= to; minutes += 30) slots.push(timeFromMinutes(minutes))
  return slots
}

export function planningTimePeriod(value?: string | null): PlanningTimePeriod {
  const normalized = normalizePlanningTimeSlot(value) ?? "09:00"
  const minutes = minutesFromTime(normalized)
  return PLANNING_TIME_PERIODS.find((period) => {
    const [from, to] = PERIOD_BOUNDS[period]
    return minutes >= from && minutes <= to
  }) ?? "morning"
}

/** Four immediately useful consecutive options, starting from the displayed time. */
export function planningQuickTimeSlots(value?: string | null): string[] {
  const normalized = normalizePlanningTimeSlot(value) ?? "09:00"
  const start = minutesFromTime(normalized)
  return Array.from({ length: 4 }, (_, index) => start + (index * 30))
    .filter((minutes) => minutes <= (23 * 60) + 30)
    .map(timeFromMinutes)
}
