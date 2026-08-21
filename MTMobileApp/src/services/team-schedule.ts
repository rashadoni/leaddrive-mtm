/**
 * Privacy-preserving mapper for the optional team calendar shown to field
 * agents. Team schedule data is intentionally never written to offline
 * storage: turning the tenant switch off must remove colleague details on the
 * next request or foreground refresh.
 */

export interface TeamMeeting {
  id: string
  date: string
  plannedTime?: string
  agent: {
    id: string
    name: string
  }
  customerName: string
  contactName?: string
  address?: string
  city?: string
  routeStatus: string
  pointStatus: string
}

export interface TeamScheduleData {
  enabled: boolean
  from: string
  to: string
  truncated: boolean
  meetings: TeamMeeting[]
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function dateKey(value: unknown): string | undefined {
  const normalized = optionalString(value)
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

/**
 * Allow-lists every field consumed by the calendar. Extra server properties
 * (phones, notes, coordinates or database object IDs) are discarded instead
 * of being retained in application state.
 */
export function toTeamScheduleData(raw: any): TeamScheduleData {
  const enabled = raw?.enabled === true
  const source = enabled && Array.isArray(raw?.meetings) ? raw.meetings : []
  const meetings: TeamMeeting[] = []

  for (const item of source) {
    const id = optionalString(item?.id)
    const date = dateKey(item?.date)
    const agentId = optionalString(item?.agent?.id)
    const agentName = optionalString(item?.agent?.name)
    const customerName = optionalString(item?.customer?.name) ?? optionalString(item?.customerName)
    if (!id || !date || !agentId || !agentName || !customerName) continue

    meetings.push({
      id,
      date,
      plannedTime: optionalString(item?.plannedTime),
      agent: { id: agentId, name: agentName },
      customerName,
      contactName: optionalString(item?.contact?.displayName) ?? optionalString(item?.contactName),
      address: optionalString(item?.location?.address) ?? optionalString(item?.address),
      city: optionalString(item?.location?.city) ?? optionalString(item?.city),
      routeStatus: optionalString(item?.routeStatus) ?? "",
      pointStatus: optionalString(item?.pointStatus) ?? "",
    })
  }

  meetings.sort((left, right) => (
    left.date.localeCompare(right.date)
    || (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "")
    || left.agent.name.localeCompare(right.agent.name)
    || left.id.localeCompare(right.id)
  ))

  return {
    enabled,
    from: dateKey(raw?.from) ?? "",
    to: dateKey(raw?.to) ?? "",
    truncated: raw?.truncated === true,
    meetings,
  }
}

export function teamMeetingsByDate(meetings: TeamMeeting[]): Record<string, TeamMeeting[]> {
  return meetings.reduce<Record<string, TeamMeeting[]>>((grouped, meeting) => {
    if (!grouped[meeting.date]) grouped[meeting.date] = []
    grouped[meeting.date].push(meeting)
    return grouped
  }, {})
}
