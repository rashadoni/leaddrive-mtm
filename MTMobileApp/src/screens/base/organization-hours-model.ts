/**
 * «Часы приёма» of a place in the field app (owner, 2026-11-02, mockup «MTM:
 * часы приёма клиентов»): whether it is open now, the day's hours in words,
 * and «Часы не те?» — the week the agent proposes from the spot. A manager
 * accepts it in the CRM; the agent never edits the place himself.
 *
 * The CRM holds the same rules (leaddrive-v2 src/lib/mtm/customer-hours.ts);
 * this file only reads what the server sends and builds a proposal.
 */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export interface DayHours {
  open: string
  close: string
  breakFrom?: string
  breakTo?: string
}

/** null for a day = the place does not work that day. */
export type WorkingHours = Record<Weekday, DayHours | null>

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

export function clockMinutes(value: string | undefined | null): number | null {
  if (!value || !CLOCK.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

function readDay(raw: any): DayHours | null | undefined {
  if (raw === null) return null
  if (!raw || typeof raw !== "object") return undefined
  const open = clockMinutes(raw.open)
  const close = clockMinutes(raw.close)
  if (open === null || close === null || close <= open) return undefined
  const from = clockMinutes(raw.breakFrom)
  const to = clockMinutes(raw.breakTo)
  const lunch = from !== null && to !== null && open < from && from < to && to < close
  return lunch ? { open: raw.open, close: raw.close, breakFrom: raw.breakFrom, breakTo: raw.breakTo } : { open: raw.open, close: raw.close }
}

/** The server's week, or null when none is given or it does not read as a week. */
export function readWorkingHours(raw: unknown): WorkingHours | null {
  if (!raw || typeof raw !== "object") return null
  const week = {} as WorkingHours
  for (const day of WEEKDAYS) {
    const value = readDay((raw as Record<string, unknown>)[String(day)])
    if (value === undefined) return null
    week[day] = value
  }
  return WEEKDAYS.some((day) => week[day] !== null) ? week : null
}

/** ISO weekday of a moment, in the phone's own time zone (the agent is where the place is). */
export function weekdayOf(now: Date): Weekday {
  const day = now.getDay()
  return (day === 0 ? 7 : day) as Weekday
}

export type OpenState =
  | { kind: "unknown" }
  | { kind: "dayOff" }
  | { kind: "beforeOpen"; opensAt: string }
  | { kind: "open"; closesAt: string; breakFrom?: string }
  | { kind: "lunch"; reopensAt: string }
  | { kind: "closed" }

export function openStateAt(week: WorkingHours | null, now: Date): OpenState {
  if (!week) return { kind: "unknown" }
  const day = week[weekdayOf(now)]
  if (day === null) return { kind: "dayOff" }
  const minute = now.getHours() * 60 + now.getMinutes()
  const open = clockMinutes(day.open)!
  const close = clockMinutes(day.close)!
  const from = clockMinutes(day.breakFrom)
  const to = clockMinutes(day.breakTo)
  if (minute < open) return { kind: "beforeOpen", opensAt: day.open }
  if (minute >= close) return { kind: "closed" }
  if (from !== null && to !== null && minute >= from && minute < to) return { kind: "lunch", reopensAt: day.breakTo! }
  return from !== null && minute < from ? { kind: "open", closesAt: day.close, breakFrom: day.breakFrom } : { kind: "open", closesAt: day.close }
}

export type Language = "ru" | "az" | "en"

const WORDS = {
  ru: { dayOff: "не работает", lunch: (a: string, b: string) => `обед ${a}–${b}`, open: (t: string) => `Открыто до ${t}`, openLunch: (t: string) => `Открыто · обед с ${t}`, lunchNow: (t: string) => `Обед · откроется в ${t}`, before: (t: string) => `Закрыто · откроется в ${t}`, closed: "Сейчас закрыто", todayOff: "Сегодня не работает", none: "Часы не указаны" },
  az: { dayOff: "işləmir", lunch: (a: string, b: string) => `nahar ${a}–${b}`, open: (t: string) => `${t}-dək açıqdır`, openLunch: (t: string) => `Açıqdır · nahar ${t}-dan`, lunchNow: (t: string) => `Nahar · ${t}-da açılacaq`, before: (t: string) => `Bağlıdır · ${t}-da açılacaq`, closed: "İndi bağlıdır", todayOff: "Bu gün işləmir", none: "Saatlar göstərilməyib" },
  en: { dayOff: "closed", lunch: (a: string, b: string) => `lunch ${a}–${b}`, open: (t: string) => `Open until ${t}`, openLunch: (t: string) => `Open · lunch from ${t}`, lunchNow: (t: string) => `Lunch · opens at ${t}`, before: (t: string) => `Closed · opens at ${t}`, closed: "Closed now", todayOff: "Closed today", none: "No hours given" },
} as const

/** «09:00–20:00 · обед 13:00–14:00» or «не работает». */
export function dayHoursText(day: DayHours | null, language: Language): string {
  const w = WORDS[language]
  if (day === null) return w.dayOff
  const base = `${day.open}–${day.close}`
  return day.breakFrom && day.breakTo ? `${base} · ${w.lunch(day.breakFrom, day.breakTo)}` : base
}

/** The line the card shows, and how it reads: open (green), waiting (amber), closed (red), unknown. */
export function openStateText(state: OpenState, language: Language): { text: string; tone: "ok" | "wait" | "off" | "none" } {
  const w = WORDS[language]
  switch (state.kind) {
    case "open": return { text: state.breakFrom ? w.openLunch(state.breakFrom) : w.open(state.closesAt), tone: "ok" }
    case "lunch": return { text: w.lunchNow(state.reopensAt), tone: "wait" }
    case "beforeOpen": return { text: w.before(state.opensAt), tone: "wait" }
    case "closed": return { text: w.closed, tone: "off" }
    case "dayOff": return { text: w.todayOff, tone: "off" }
    default: return { text: w.none, tone: "none" }
  }
}

export type HoursFixChoice = "time" | "lunch" | "closedToday"

/**
 * The week the agent proposes: the place's week (or a plain Mon–Fri one when
 * none is given) with what he saw on the door — today, or every weekday.
 */
export function proposedWeek(
  current: WorkingHours | null,
  today: Weekday,
  choice: HoursFixChoice,
  values: { open: string; close: string; breakFrom: string; breakTo: string; allWeekdays: boolean },
): WorkingHours | null {
  const base: WorkingHours = current
    ? { ...current }
    : { 1: { open: "09:00", close: "18:00" }, 2: { open: "09:00", close: "18:00" }, 3: { open: "09:00", close: "18:00" }, 4: { open: "09:00", close: "18:00" }, 5: { open: "09:00", close: "18:00" }, 6: null, 7: null }
  const days: Weekday[] = values.allWeekdays && today <= 5 ? [1, 2, 3, 4, 5] : [today]
  for (const day of days) {
    if (choice === "closedToday") {
      base[day] = null
      continue
    }
    const was = base[day] ?? { open: "09:00", close: "18:00" }
    const next: DayHours = choice === "time"
      ? { ...was, open: values.open, close: values.close }
      : { open: was.open, close: was.close, breakFrom: values.breakFrom || undefined, breakTo: values.breakTo || undefined }
    const day1 = readDay(next)
    if (!day1) return null
    base[day] = day1
  }
  return WEEKDAYS.some((day) => base[day] !== null) ? base : null
}

export interface HoursRequest {
  id: string
  status: string
  mine: boolean
  decisionComment?: string
}

export function toHoursRequest(raw: any): HoursRequest | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null
  return { id: raw.id, status: String(raw.status ?? ""), mine: raw.mine === true, decisionComment: typeof raw.decisionComment === "string" ? raw.decisionComment : undefined }
}

/** The server's week in the shape it accepts back: every day, null for a day off. */
export function hoursPayload(week: WorkingHours): Record<string, DayHours | null> {
  const out: Record<string, DayHours | null> = {}
  for (const day of WEEKDAYS) out[String(day)] = week[day]
  return out
}
