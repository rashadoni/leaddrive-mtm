/**
 * The «ring of the day» (owner, 2026-11-02, variant «C. Кольцо дня»): where an
 * agent's day went — with clients, on the way, on a break — as the server
 * counts it (leaddrive-v2 `src/lib/mtm/day-time.ts`).
 */
export interface DayTime {
  startedAt: string
  totalMinutes: number
  visitMinutes: number
  breakMinutes: number
  travelMinutes: number
}

export type DayRingKey = "visits" | "travel" | "break"

export interface DayRingPart {
  key: DayRingKey
  minutes: number
  /** Share of the day, 0..1. */
  share: number
  /** Where the part ends on the ring, 0..1 from the top, clockwise. */
  end: number
}

/** A server answer read defensively: anything malformed is no ring at all. */
export function readDayTime(value: unknown): DayTime | null {
  if (!value || typeof value !== "object") return null
  const day = value as Record<string, unknown>
  const numbers = ["totalMinutes", "visitMinutes", "breakMinutes", "travelMinutes"] as const
  if (typeof day.startedAt !== "string" || numbers.some((key) => typeof day[key] !== "number" || !Number.isFinite(day[key] as number) || (day[key] as number) < 0)) {
    return null
  }
  return day as unknown as DayTime
}

/**
 * The ring's parts in their order around it: clients first, then the way,
 * then the break. Parts with no minutes are left out; the ends add up to 1.
 */
export function dayRingParts(day: DayTime): DayRingPart[] {
  const raw: Array<[DayRingKey, number]> = [
    ["visits", day.visitMinutes],
    ["travel", day.travelMinutes],
    ["break", day.breakMinutes],
  ]
  const total = raw.reduce((sum, [, minutes]) => sum + minutes, 0)
  if (total <= 0) return []
  let end = 0
  return raw.filter(([, minutes]) => minutes > 0).map(([key, minutes]) => {
    const share = minutes / total
    end = Math.min(1, end + share)
    return { key, minutes, share, end }
  })
}

/** «3:48» — the length of the day in the ring's middle. */
export function dayRingClock(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** «1 ч 52 мин» / «25 мин» through the caller's translations. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DayRingT = (key: string, values?: any) => any

export function dayRingMinutes(minutes: number, t: DayRingT): string {
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  return hours > 0
    ? String(t("dayRing.hoursMinutes", { hours, minutes: whole % 60 }))
    : String(t("dayRing.minutes", { minutes: whole }))
}
