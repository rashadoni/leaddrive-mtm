/**
 * Small, privacy-safe mapper for the optional colleague schedule returned by
 * /mobile/team-schedule. This service deliberately keeps only the fields the
 * server exposes for the calendar card: who, client, time and place.
 */

export interface TeamScheduleMeeting {
  id: string
  date: string
  plannedTime: string | null
  agentName: string
  customerName: string
  contactName: string | null
  address: string | null
  city: string | null
}

export interface TeamScheduleData {
  enabled: boolean
  scope: "DISABLED" | "NO_TEAM" | "TEAM" | "UNKNOWN"
  meetings: TeamScheduleMeeting[]
  truncated: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function dateKey(value: unknown): string | null {
  const raw = text(value)
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function toMeeting(raw: unknown): TeamScheduleMeeting | null {
  const row = record(raw)
  const agent = record(row?.agent)
  const customer = record(row?.customer)
  const contact = record(row?.contact)
  const location = record(row?.location)
  const id = text(row?.id)
  const date = dateKey(row?.date)
  const agentName = text(agent?.name)
  const customerName = text(customer?.name)
  if (!id || !date || !agentName || !customerName) return null

  return {
    id,
    date,
    plannedTime: text(row?.plannedTime),
    agentName,
    customerName,
    contactName: text(contact?.displayName),
    address: text(location?.address),
    city: text(location?.city),
  }
}

export function toTeamSchedule(raw: unknown): TeamScheduleData {
  const value = record(raw)
  const enabled = value?.enabled === true
  const scope = text(value?.scope)
  const meetings = enabled && Array.isArray(value?.meetings)
    ? value.meetings.map(toMeeting).filter((meeting): meeting is TeamScheduleMeeting => meeting !== null)
    : []
  return {
    enabled,
    scope: scope === "DISABLED" || scope === "NO_TEAM" || scope === "TEAM" ? scope : "UNKNOWN",
    meetings,
    truncated: value?.truncated === true,
  }
}

export function teamMeetingsForDate(schedule: TeamScheduleData | null, date: string): TeamScheduleMeeting[] {
  if (!schedule?.enabled) return []
  return schedule.meetings.filter((meeting) => meeting.date === date)
}
