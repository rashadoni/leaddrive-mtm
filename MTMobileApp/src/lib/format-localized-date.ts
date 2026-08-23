const AZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"]
const AZ_MONTHS_LONG = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"]
const AZ_WEEKDAYS_SHORT = ["baz", "b.e.", "ç.a.", "ç.", "c.a.", "c.", "ş."]
const AZ_WEEKDAYS_LONG = ["bazar", "bazar ertəsi", "çərşənbə axşamı", "çərşənbə", "cümə axşamı", "cümə", "şənbə"]

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date
    ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAzerbaijaniDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  const utc = options.timeZone === "UTC"
  const monthIndex = utc ? date.getUTCMonth() : date.getMonth()
  const weekdayIndex = utc ? date.getUTCDay() : date.getDay()
  const dayNumber = utc ? date.getUTCDate() : date.getDate()
  const yearNumber = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = options.month
    ? (options.month === "long" ? AZ_MONTHS_LONG : AZ_MONTHS_SHORT)[monthIndex]
    : ""
  const day = options.day
    ? (options.day === "2-digit" ? String(dayNumber).padStart(2, "0") : String(dayNumber))
    : ""
  const year = options.year ? String(yearNumber) : ""
  const datePart = [day, month, year].filter(Boolean).join(" ")
  const weekday = options.weekday
    ? (options.weekday === "long" ? AZ_WEEKDAYS_LONG : AZ_WEEKDAYS_SHORT)[weekdayIndex]
    : ""
  return [datePart, weekday].filter(Boolean).join(datePart && weekday ? ", " : "")
}

export function formatLocalizedDate(
  value: Date | string,
  language: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value)
  if (!date) return typeof value === "string" ? value : ""
  if (language.toLowerCase().startsWith("az") && (options.month || options.weekday)) {
    return formatAzerbaijaniDate(date, options)
  }
  return date.toLocaleDateString(language, options)
}
