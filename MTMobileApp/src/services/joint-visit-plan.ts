/**
 * Planning a joint visit ahead (owner, 2026-10-30: «агент составляет себе
 * маршрут по дням, менеджер должен иметь право выбирать, к какому клиенту
 * сделает визит вместе с агентом… и выбор клиента, к которому он хочет экстра
 * сделать визит с определённым агентом — тогда он попадает в маршрут»).
 *
 * The manager picks an agent and a day, ticks stops of the agent's route that
 * day, or adds an extra client of the agent's — the server puts it on the
 * route — and saves. The agent is told at once; his route marks those stops
 * «Совместный визит». The server (leaddrive-v2, src/lib/mtm/joint-visit-plan.ts)
 * holds the rules; this file reads its answers.
 */

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export type PlanStop = {
  id: string
  status: "PENDING" | "VISITED" | "SKIPPED"
  plannedTime: string | null
  customerId: string
  customerName: string
  address: string | null
  contactName: string | null
  contactSpecialty: string | null
  /** Planned by this manager already. */
  myPlanId: string | null
  /** Other managers who plan to go to this stop. */
  otherManagers: string[]
  canJoin: boolean
}

export type PlanDay = {
  date: string
  /** The days that can be planned: the organization's today and two weeks on. */
  window: { from: string; to: string } | null
  route: { id: string; status: string; open: boolean; stops: PlanStop[] } | null
}

export function toPlanDay(response: unknown): PlanDay {
  const data = (response as { data?: Record<string, unknown> } | null)?.data ?? {}
  const window = (data.window ?? null) as Record<string, unknown> | null
  const route = (data.route ?? null) as Record<string, unknown> | null
  const stops = route && Array.isArray(route.stops) ? route.stops : []
  return {
    date: text(data.date),
    window: window && DATE_KEY.test(text(window.from)) && DATE_KEY.test(text(window.to))
      ? { from: text(window.from), to: text(window.to) }
      : null,
    route: route && text(route.id)
      ? {
          id: text(route.id),
          status: text(route.status),
          open: route.open === true,
          stops: stops.flatMap((raw): PlanStop[] => {
            const row = (raw ?? {}) as Record<string, unknown>
            const customer = (row.customer ?? {}) as Record<string, unknown>
            const contact = (row.contact ?? null) as Record<string, unknown> | null
            const status = text(row.status)
            if (!text(row.id) || !text(customer.id)) return []
            return [{
              id: text(row.id),
              status: status === "VISITED" || status === "SKIPPED" ? status : "PENDING",
              plannedTime: text(row.plannedTime) || null,
              customerId: text(customer.id),
              customerName: text(customer.name),
              address: text(customer.address) || null,
              contactName: (contact && text(contact.displayName)) || null,
              contactSpecialty: (contact && text(contact.specialtyName)) || null,
              myPlanId: text(row.myPlanId) || null,
              otherManagers: Array.isArray(row.otherManagers)
                ? row.otherManagers.map((manager) => text((manager as { name?: unknown })?.name)).filter(Boolean)
                : [],
              canJoin: row.canJoin === true,
            }]
          }),
        }
      : null,
  }
}

/** A client the manager may add for the agent that day, from the route planner's picker. */
export type PlanTarget = {
  key: string
  customerId: string
  contactId: string | null
  title: string
  subtitle: string
}

export function toPlanTargets(response: unknown): { items: PlanTarget[]; types: Array<{ id: string; labels: Record<string, unknown> }> } {
  const data = (response as { data?: Record<string, unknown> } | null)?.data ?? {}
  const rows = Array.isArray(data.items) ? data.items : []
  const items = rows.flatMap((raw): PlanTarget[] => {
    const row = (raw ?? {}) as Record<string, unknown>
    const customer = (row.customer ?? {}) as Record<string, unknown>
    const contact = (row.contact ?? null) as Record<string, unknown> | null
    const customerId = text(customer.id)
    if (!customerId) return []
    const contactId = contact ? text(contact.id) || null : null
    const contactName = contact ? text(contact.displayName) : ""
    return [{
      key: text(row.targetKey) || `${customerId}:${contactId ?? ""}`,
      customerId,
      contactId,
      title: contactName || text(customer.name),
      subtitle: contactName
        ? [text(contact?.specialtyName), text(customer.name)].filter(Boolean).join(" · ")
        : [text(customer.address), text(customer.city)].filter(Boolean).join(", "),
    }]
  })
  const types = Array.isArray(data.targetTypes)
    ? data.targetTypes.flatMap((raw) => {
        const row = (raw ?? {}) as { id?: unknown; labels?: Record<string, unknown> }
        const id = text(row.id)
        return id ? [{ id, labels: row.labels && typeof row.labels === "object" ? row.labels : {} }] : []
      })
    : []
  return { items, types }
}

/** The label in the manager's language from a target type's labels. */
export function targetTypeLabel(labels: Record<string, unknown> | undefined, language: string, fallback: string): string {
  const lang = language.slice(0, 2).toLowerCase()
  return text(labels?.[lang]) || text(labels?.az) || text(labels?.ru) || text(labels?.en) || fallback
}

/** Every day from `from` to `to`, both included. */
export function planDays(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${from}T12:00:00.000Z`)
  for (let guard = 0; guard < 31; guard++) {
    const key = cursor.toISOString().slice(0, 10)
    if (key > to) break
    days.push(key)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/** «Сегодня», «Завтра», or none — the screen then writes the date. */
export function relativeDay(date: string, today: string): "today" | "tomorrow" | null {
  if (!today) return null
  if (date === today) return "today"
  return planDays(today, date).length === 2 ? "tomorrow" : null
}

/** What the planner sends: the ticked stops, and the extra clients. */
export function planBody(input: {
  agentId: string
  date: string
  stopIds: string[]
  extras: PlanTarget[]
}): { agentId: string; date: string; routePointIds: string[]; extras: Array<{ customerId: string; contactId: string | null }> } {
  return {
    agentId: input.agentId,
    date: input.date,
    routePointIds: [...new Set(input.stopIds)],
    extras: input.extras.map((extra) => ({ customerId: extra.customerId, contactId: extra.contactId })),
  }
}

export type PlanFailure =
  | "offline"
  | "notInTeam"
  | "stopGone"
  | "clientNotHis"
  | "routeClosed"
  | "routeChanged"
  | "dayInvalid"
  | "alreadyVisited"
  | "session"
  | "failed"

const PLAN_CODES: Record<string, PlanFailure> = {
  MTM_JOINT_VISIT_AGENT_FORBIDDEN: "notInTeam",
  MTM_JOINT_PLAN_STOP_UNAVAILABLE: "stopGone",
  MTM_JOINT_PLAN_CLIENT_UNAVAILABLE: "clientNotHis",
  MTM_JOINT_PLAN_ROUTE_CLOSED: "routeClosed",
  MTM_JOINT_PLAN_ROUTE_CHANGED: "routeChanged",
  MTM_JOINT_PLAN_DAY_INVALID: "dayInvalid",
  MTM_JOINT_PLAN_ALREADY_VISITED: "alreadyVisited",
  MTM_JOINT_PLAN_NOT_FOUND: "alreadyVisited",
}

export function planFailure(error: unknown): PlanFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string" && PLAN_CODES[code]) return PLAN_CODES[code]
  const message = error instanceof Error ? error.message : ""
  if (message === "SESSION_EXPIRED") return "session"
  if (message === "REQUEST_TIMEOUT" || message === "Network request failed" || message === "ABORTED") return "offline"
  return "failed"
}
