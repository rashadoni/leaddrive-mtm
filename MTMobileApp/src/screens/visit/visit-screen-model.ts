import { isTabletWidth } from "../../theme/layoutBreakpoints"

export type VisitScreenLanguage = "ru" | "az" | "en"
export type VisitScreenLayout = "phone" | "tablet"

export type VisitCustomerSearchItem = {
  id: string
  name: string
}

export function visitScreenLanguage(language: string): VisitScreenLanguage {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

export function visitScreenLayout(width: number): VisitScreenLayout {
  return isTabletWidth(width) ? "tablet" : "phone"
}

export function filterVisitCustomers<T extends VisitCustomerSearchItem>(
  customers: T[],
  query: string,
  limit = 20,
): T[] {
  const normalized = query.trim().toLocaleLowerCase()
  const filtered = normalized
    ? customers.filter((customer) => customer.name.toLocaleLowerCase().includes(normalized))
    : customers
  return filtered.slice(0, Math.max(0, limit))
}

const DURATION_UNITS: Record<VisitScreenLanguage, { minutes: string; hours: string; days: string }> = {
  ru: { minutes: "мин", hours: "ч", days: "дн" },
  az: { minutes: "dəq", hours: "saat", days: "gün" },
  en: { minutes: "min", hours: "h", days: "d" },
}

/**
 * How long a visit took, in the units a person says (owner-approved mockup,
 * 2026-10-31): «15 мин», «2 ч 22 мин», «5 дн 2 ч». The history wrote «7321
 * мин» for a visit left open five days.
 */
export function visitDurationLabel(minutes: number, language: VisitScreenLanguage): string {
  const units = DURATION_UNITS[language]
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} ${units.minutes}`
  if (total < 24 * 60) {
    const hours = Math.floor(total / 60)
    const rest = total % 60
    return rest ? `${hours} ${units.hours} ${rest} ${units.minutes}` : `${hours} ${units.hours}`
  }
  const days = Math.floor(total / (24 * 60))
  const hours = Math.floor((total % (24 * 60)) / 60)
  return hours ? `${days} ${units.days} ${hours} ${units.hours}` : `${days} ${units.days}`
}

/**
 * Whether a visit ended on the calendar day it began, on the phone's clock.
 * When it did not, the history names the end's day too: «21:21 – 23:23» read
 * as two hours for a visit closed five days later.
 */
export function visitEndsSameDay(checkInAt: string | undefined, checkOutAt: string | undefined): boolean {
  if (!checkInAt || !checkOutAt) return true
  const start = new Date(checkInAt)
  const end = new Date(checkOutAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true
  return start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()
}
