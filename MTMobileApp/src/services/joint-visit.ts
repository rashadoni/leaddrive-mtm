import AsyncStorage from "@react-native-async-storage/async-storage"
import type { TFunction } from "i18next"
import { requireOfflineScope } from "./offline-scope"

/**
 * Joint visit — the manager goes to a client together with an agent and rates
 * the agent's work there (owner, 2026-10-20; mockup approved with «Давай,
 * агент оценку не видит»). The server (leaddrive-v2, src/lib/mtm/joint-visit.ts)
 * holds the rules:
 *
 * - the manager opens a session with one agent of his team («Иду на визит с
 *   агентом»); it ends with «Закончить совместный визит» or with the day;
 * - at «Я приехал — начать визит» the agent answers whether the manager is on
 *   this visit; only that answer makes the visit joint;
 * - the manager rates such a visit — six points 1..5, a skipped point did not
 *   happen — until the end of the next day. The agent never sees a rating.
 */

export const EVALUATION_CRITERIA = [
  "PREPARATION",
  "RAPPORT",
  "NEEDS",
  "PRESENTATION",
  "OBJECTIONS",
  "CLOSING",
] as const

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number]
export type EvaluationScores = Partial<Record<EvaluationCriterion, number>>

export const EVALUATION_COMMENT_MAX = 2000

export type JointVisitEvaluation = {
  scores: EvaluationScores
  average: number | null
  comment: string | null
  updatedAt: string
}

export type JointVisitRow = {
  id: string
  status: string
  checkInAt: string
  checkOutAt: string | null
  agent: { id: string; name: string }
  customerName: string
  /** The doctor the visit was to, when the stop names one. */
  contactName: string | null
  contactSpecialty: string | null
  joint: boolean
  canEvaluate: boolean
  evaluateUntil: string
  evaluation: JointVisitEvaluation | null
}

export type JointVisitSession = { id: string; startedAt: string; agent: { id: string; name: string } }

/**
 * A joint visit the manager planned ahead (2026-10-30): a stop of the agent's
 * route on that day, or an extra client he added to it.
 */
export type ManagerJointPlan = {
  id: string
  date: string
  source: "ROUTE" | "EXTRA"
  agent: { id: string; name: string }
  customerName: string
  contactName: string | null
  contactSpecialty: string | null
  plannedTime: string | null
  /** REMOVED: the stop left the agent's route. */
  stopStatus: "PENDING" | "VISITED" | "SKIPPED" | "REMOVED"
  visit: { id: string; status: string; checkInAt: string; checkOutAt: string | null; joint: boolean } | null
}

export type JointVisitState = {
  session: JointVisitSession | null
  visits: JointVisitRow[]
  plans: ManagerJointPlan[]
  /** The organization's today, YYYY-MM-DD; empty from a server before plans. */
  today: string
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Only the known points with a 1..5 integer. */
export function readScores(value: unknown): EvaluationScores {
  const scores: EvaluationScores = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return scores
  for (const key of EVALUATION_CRITERIA) {
    const score = (value as Record<string, unknown>)[key]
    if (typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5) scores[key] = score
  }
  return scores
}

/** The mean of the rated points, to one decimal; null when none is rated. */
export function scoresAverage(scores: EvaluationScores): number | null {
  const values = EVALUATION_CRITERIA.map((key) => scores[key]).filter((score): score is number => typeof score === "number")
  if (!values.length) return null
  return Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10
}

function readEvaluation(value: unknown): JointVisitEvaluation | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const scores = readScores(row.scores)
  return {
    scores,
    average: scoresAverage(scores),
    comment: text(row.comment) || null,
    updatedAt: text(row.updatedAt),
  }
}

/** The manager's joint visit as the server answered it; anything malformed is dropped. */
export function toJointVisitState(response: unknown): JointVisitState {
  const data = (response as { data?: Record<string, unknown> } | null)?.data ?? {}
  const rawSession = data.session as Record<string, unknown> | null | undefined
  const sessionAgent = rawSession?.agent as Record<string, unknown> | undefined
  const session = rawSession && text(rawSession.id) && text(sessionAgent?.id)
    ? {
        id: text(rawSession.id),
        startedAt: text(rawSession.startedAt),
        agent: { id: text(sessionAgent?.id), name: text(sessionAgent?.name) },
      }
    : null
  const rows = Array.isArray(data.visits) ? data.visits : []
  const visits = rows.flatMap((raw): JointVisitRow[] => {
    const row = (raw ?? {}) as Record<string, unknown>
    const agent = (row.agent ?? {}) as Record<string, unknown>
    const customer = (row.customer ?? {}) as Record<string, unknown>
    const contact = (row.contact ?? null) as Record<string, unknown> | null
    const id = text(row.id)
    if (!id || !text(row.checkInAt)) return []
    return [{
      id,
      status: text(row.status),
      checkInAt: text(row.checkInAt),
      checkOutAt: text(row.checkOutAt) || null,
      agent: { id: text(agent.id), name: text(agent.name) },
      customerName: text(customer.name),
      contactName: (contact && text(contact.displayName)) || null,
      contactSpecialty: (contact && text(contact.specialtyName)) || null,
      joint: row.joint === true,
      canEvaluate: row.canEvaluate === true,
      evaluateUntil: text(row.evaluateUntil),
      evaluation: readEvaluation(row.evaluation),
    }]
  })
  const planRows = Array.isArray(data.plans) ? data.plans : []
  const plans = planRows.flatMap((raw): ManagerJointPlan[] => {
    const row = (raw ?? {}) as Record<string, unknown>
    const agent = (row.agent ?? {}) as Record<string, unknown>
    const customer = (row.customer ?? {}) as Record<string, unknown>
    const contact = (row.contact ?? null) as Record<string, unknown> | null
    const visit = (row.visit ?? null) as Record<string, unknown> | null
    const id = text(row.id)
    const date = text(row.date)
    if (!id || !DATE_KEY.test(date) || !text(agent.id)) return []
    const stopStatus = text(row.stopStatus)
    return [{
      id,
      date,
      source: row.source === "EXTRA" ? "EXTRA" : "ROUTE",
      agent: { id: text(agent.id), name: text(agent.name) },
      customerName: text(customer.name),
      contactName: (contact && text(contact.displayName)) || null,
      contactSpecialty: (contact && text(contact.specialtyName)) || null,
      plannedTime: text(row.plannedTime) || null,
      stopStatus: stopStatus === "VISITED" || stopStatus === "SKIPPED" || stopStatus === "REMOVED" ? stopStatus : "PENDING",
      visit: visit && text(visit.id)
        ? {
            id: text(visit.id),
            status: text(visit.status),
            checkInAt: text(visit.checkInAt),
            checkOutAt: text(visit.checkOutAt) || null,
            joint: visit.joint === true,
          }
        : null,
    }]
  })
  return { session, visits, plans, today: DATE_KEY.test(text(data.today)) ? text(data.today) : "" }
}


/** Where a planned joint visit stands now, as the manager's screen says it. */
export type PlanStage = "planned" | "atClient" | "done" | "missed" | "removed"

export function planStage(plan: ManagerJointPlan, today: string): PlanStage {
  if (plan.visit?.status === "CHECKED_IN") return "atClient"
  if (plan.visit || plan.stopStatus === "VISITED") return "done"
  if (plan.stopStatus === "REMOVED") return "removed"
  if (plan.stopStatus === "SKIPPED" || (today && plan.date < today)) return "missed"
  return "planned"
}

/** The plans by day, the days in order; each day's plans keep the server's (agent, route) order. */
export function plansByDay(plans: ManagerJointPlan[]): Array<{ date: string; plans: ManagerJointPlan[] }> {
  const days = new Map<string, ManagerJointPlan[]>()
  for (const plan of plans) days.set(plan.date, [...(days.get(plan.date) ?? []), plan])
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, plans: rows }))
}

/** The rating row for a planned visit the agent marked joint — null while there is none to rate. */
export function planVisitRow(plan: ManagerJointPlan, state: JointVisitState): JointVisitRow | null {
  return plan.visit ? state.visits.find((visit) => visit.id === plan.visit?.id) ?? null : null
}

/** The visit going on now with the accompanied agent, if there is one. */
export function currentJointVisit(state: JointVisitState): JointVisitRow | null {
  if (!state.session) return null
  const open = state.visits.filter((visit) => visit.status === "CHECKED_IN" && visit.agent.id === state.session?.agent.id)
  return open.length ? open[open.length - 1] : null
}

/** Visits marked joint that still wait for this manager's rating. */
export function unratedJointVisits(state: JointVisitState): JointVisitRow[] {
  return state.visits.filter((visit) => visit.joint && visit.canEvaluate && !visit.evaluation)
}

/** What went wrong, in the words the screens have for it. */
export type JointVisitFailure = "offline" | "notInTeam" | "notJoint" | "closed" | "invalid" | "session" | "failed"

const SERVER_CODES: Record<string, JointVisitFailure> = {
  MTM_JOINT_VISIT_AGENT_FORBIDDEN: "notInTeam",
  MTM_VISIT_EVALUATION_NOT_JOINT: "notJoint",
  MTM_VISIT_EVALUATION_CLOSED: "closed",
  MTM_VISIT_EVALUATION_INVALID: "invalid",
}

export function jointVisitFailure(error: unknown): JointVisitFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string" && SERVER_CODES[code]) return SERVER_CODES[code]
  const message = error instanceof Error ? error.message : ""
  if (message === "SESSION_EXPIRED") return "session"
  if (message === "REQUEST_TIMEOUT" || message === "Network request failed" || message === "ABORTED") return "offline"
  return "failed"
}

/** Who the visit was to, large: the doctor, else the institution. */
export function visitTitle(visit: Pick<JointVisitRow, "contactName" | "customerName">): string {
  return visit.contactName || visit.customerName
}

/** The line under it: the doctor's specialty and the institution. */
export function visitSubtitle(visit: Pick<JointVisitRow, "contactName" | "contactSpecialty" | "customerName">): string {
  return visit.contactName ? [visit.contactSpecialty, visit.customerName].filter(Boolean).join(" · ") : ""
}

/** «4,2» in Russian and Azerbaijani, «4.2» in English; whole numbers without a decimal. */
export function formatScore(value: number, language: string): string {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return language.toLowerCase().startsWith("en") ? fixed : fixed.replace(".", ",")
}

/** «09:05» on the phone's clock. */
export function clockTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** Whole minutes since a moment, never negative. */
export function minutesSince(value: string, now = Date.now()): number {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : Math.max(0, Math.floor((now - time) / 60_000))
}

/** «Elvin Həsənov» → «EH»; one word gives its first two letters. */
export function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const letters = words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[words.length - 1])[0]]
  return letters.join("").toLocaleUpperCase()
}

// ── The agent's side ─────────────────────────────────────────────────────

/** A manager in the field with this agent today. */
export type JointManager = { id: string; name: string }

const CACHE_PREFIX = "@mtm_joint_managers_v1:"

type CachedManagers = { day: string; managers: JointManager[] }

/** The phone's own calendar day: a cached answer from yesterday is never used. */
export function localDayKey(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function toJointManagers(response: unknown): JointManager[] {
  const rows = (response as { data?: { managers?: unknown } } | null)?.data?.managers
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    const id = text((row as { id?: unknown })?.id)
    const name = text((row as { name?: unknown })?.name)
    return id && name ? [{ id, name }] : []
  })
}

function cacheKey() {
  return `${CACHE_PREFIX}${requireOfflineScope()}`
}

export async function rememberJointManagers(managers: JointManager[], now = new Date()) {
  const value: CachedManagers = { day: localDayKey(now), managers }
  await AsyncStorage.setItem(cacheKey(), JSON.stringify(value))
}

export async function cachedJointManagers(now = new Date()): Promise<JointManager[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<CachedManagers>
    if (parsed.day !== localDayKey(now) || !Array.isArray(parsed.managers)) return []
    return toJointManagers({ data: { managers: parsed.managers } })
  } catch {
    return []
  }
}

/**
 * Who is with the agent, asked of the server when it answers and kept for the
 * day: the check-in question is asked offline too, from what was known last.
 * The server checks the answer again when the check-in arrives.
 */
export async function refreshJointManagers(
  fetchManagers: () => Promise<unknown>,
  now = new Date(),
): Promise<JointManager[]> {
  const response = await fetchManagers()
  const managers = toJointManagers(response)
  await rememberJointManagers(managers, now).catch(() => {})
  // The same answer carries the planned joint visits (2026-10-30); a server
  // without them leaves the last known list alone.
  if (Array.isArray((response as { data?: { plans?: unknown } } | null)?.data?.plans)) {
    await rememberJointPlans(toAgentJointPlans(response)).catch(() => {})
  }
  return managers
}

/**
 * The check-in waits for the server a short while only: on a slow line it
 * goes on with what was known last, and the late answer still updates it.
 */
export async function jointManagersForCheckIn(
  fetchManagers: () => Promise<unknown>,
  now = new Date(),
  waitMs = 2_500,
): Promise<JointManager[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), waitMs) })
  try {
    const fresh = await Promise.race([refreshJointManagers(fetchManagers, now), late])
    return fresh ?? cachedJointManagers(now)
  } catch {
    return cachedJointManagers(now)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** A stop of the agent's route a manager plans to visit with him (2026-10-30). */
export type AgentJointPlan = {
  id: string
  date: string
  routePointId: string
  customerId: string
  contactId: string | null
  manager: JointManager
}

export function toAgentJointPlans(response: unknown): AgentJointPlan[] {
  const rows = (response as { data?: { plans?: unknown } } | null)?.data?.plans
  if (!Array.isArray(rows)) return []
  return rows.flatMap((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>
    const manager = (row.manager ?? {}) as Record<string, unknown>
    const plan = {
      id: text(row.id),
      date: text(row.date),
      routePointId: text(row.routePointId),
      customerId: text(row.customerId),
      contactId: text(row.contactId) || null,
      manager: { id: text(manager.id), name: text(manager.name) },
    }
    return plan.id && DATE_KEY.test(plan.date) && plan.routePointId && plan.customerId && plan.manager.id && plan.manager.name ? [plan] : []
  })
}

const PLANS_PREFIX = "@mtm_joint_plans_v1:"

function plansKey() {
  return `${PLANS_PREFIX}${requireOfflineScope()}`
}

export async function rememberJointPlans(plans: AgentJointPlan[]) {
  await AsyncStorage.setItem(plansKey(), JSON.stringify({ plans }))
}

/** The plans last heard of, from today on: the route shows them offline too. */
export async function cachedJointPlans(now = new Date()): Promise<AgentJointPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(plansKey())
    if (!raw) return []
    const today = localDayKey(now)
    return toAgentJointPlans({ data: JSON.parse(raw) }).filter((plan) => plan.date >= today)
  } catch {
    return []
  }
}

/** The managers who plan to be at this stop — or at this client, for a visit outside the route — today. */
export function plannedManagersAt(
  plans: AgentJointPlan[],
  stop: { routePointId?: string | null; customerId: string },
  now = new Date(),
): JointManager[] {
  const today = localDayKey(now)
  const managers = new Map<string, JointManager>()
  for (const plan of plans) {
    if (plan.date !== today) continue
    if (stop.routePointId ? plan.routePointId !== stop.routePointId && plan.customerId !== stop.customerId : plan.customerId !== stop.customerId) continue
    managers.set(plan.manager.id, plan.manager)
  }
  return [...managers.values()]
}

/** Stop id → the managers going there with the agent, for the route's «Совместный визит» mark. */
export function jointManagersByStop(plans: AgentJointPlan[]): Map<string, string[]> {
  const byStop = new Map<string, string[]>()
  for (const plan of plans) {
    const names = byStop.get(plan.routePointId) ?? []
    if (!names.includes(plan.manager.name)) byStop.set(plan.routePointId, [...names, plan.manager.name])
  }
  return byStop
}

export const JOINT_ANSWER_ALONE = "__alone__"
export const JOINT_ANSWER_DISMISSED = "__dismissed__"

/**
 * The answers to «Этот визит — вместе с руководителем?»: «no» first, drawn
 * outlined, and «yes» last, the sheet's one filled button. Two managers in the
 * field with one agent are rare; each gets his own «yes» with his name, and
 * the sheet holds three buttons at most.
 */
export function jointCheckInButtons(
  managers: JointManager[],
  t: TFunction,
): Array<{ text: string; value: string }> {
  const shown = managers.slice(0, 2)
  return [
    { text: t("jointVisit.askAlone"), value: JOINT_ANSWER_ALONE },
    ...shown.map((manager) => ({
      text: shown.length === 1 ? t("jointVisit.askYes") : t("jointVisit.askYesNamed", { name: manager.name }),
      value: manager.id,
    })),
  ]
}
