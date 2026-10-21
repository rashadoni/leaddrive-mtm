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
 * - the manager rates such a visit — the company's questions, 1..5 each, a
 *   skipped point did not happen — until the end of the next day. The agent
 *   never sees a rating.
 *
 * The questions are the company's own (owner, 2026-10-21: «в параметрах
 * MTM»): the server sends its list of today with the joint visit, and every
 * rating comes with the list it was given against. A server from before the
 * lists sends neither: then the six below, in the words of this app.
 */

/** The six questions every company had, and still has until it edits its list. */
export const EVALUATION_CRITERIA = [
  "PREPARATION",
  "RAPPORT",
  "NEEDS",
  "PRESENTATION",
  "OBJECTIONS",
  "CLOSING",
] as const

export type QuestionLabels = { az: string; ru: string; en: string }
/** One question of the sheet. `labels` null: one of the six, in this app's own words. */
export type EvaluationQuestion = { id: string; labels: QuestionLabels | null }
/** `{ PREPARATION: 4, … }` — the rated questions only, each 1..5. */
export type EvaluationScores = Record<string, number>

export const DEFAULT_EVALUATION_QUESTIONS: EvaluationQuestion[] = EVALUATION_CRITERIA.map((id) => ({ id, labels: null }))

export const EVALUATION_COMMENT_MAX = 2000

export type JointVisitEvaluation = {
  /** The questions this rating was given against. */
  questions: EvaluationQuestion[]
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

export type JointVisitState = {
  session: JointVisitSession | null
  visits: JointVisitRow[]
  /** What the sheet asks today, in this order: the company's list. */
  questions: EvaluationQuestion[]
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/**
 * A list of questions as the server sent it; null when there is none to read
 * (an older server), and the caller takes the six. A language left empty
 * reads as one that is not.
 */
export function readQuestions(value: unknown): EvaluationQuestion[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const questions = value.flatMap((raw): EvaluationQuestion[] => {
    const row = (raw ?? {}) as Record<string, unknown>
    const id = text(row.id)
    const labels = (row.labels ?? {}) as Record<string, unknown>
    const az = text(labels.az)
    const ru = text(labels.ru)
    const en = text(labels.en)
    const any = ru || az || en
    if (!id || seen.has(id) || !any) return []
    seen.add(id)
    return [{ id, labels: { az: az || any, ru: ru || any, en: en || any } }]
  })
  return questions.length ? questions : null
}

/** The question in the phone's language; one of the six without words from the server, in the app's own. */
export function questionLabel(question: EvaluationQuestion, language: string, t: TFunction): string {
  if (question.labels) {
    const lang = language.toLowerCase()
    return (lang.startsWith("az") ? question.labels.az : lang.startsWith("en") ? question.labels.en : question.labels.ru)
      || question.labels.ru || question.labels.az || question.labels.en
  }
  return (EVALUATION_CRITERIA as readonly string[]).includes(question.id) ? t(`jointVisit.criteria.${question.id}`) : question.id
}

/** Only the points of `questions` with a 1..5 integer. */
export function readScores(value: unknown, questions: EvaluationQuestion[] = DEFAULT_EVALUATION_QUESTIONS): EvaluationScores {
  const scores: EvaluationScores = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return scores
  for (const { id } of questions) {
    const score = (value as Record<string, unknown>)[id]
    if (typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5) scores[id] = score
  }
  return scores
}

/** The mean of the rated points, to one decimal; null when none is rated. */
export function scoresAverage(scores: EvaluationScores): number | null {
  const values = Object.values(scores).filter((score) => typeof score === "number")
  if (!values.length) return null
  return Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10
}

function readEvaluation(value: unknown): JointVisitEvaluation | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const questions = readQuestions(row.questions) ?? DEFAULT_EVALUATION_QUESTIONS
  const scores = readScores(row.scores, questions)
  return {
    questions,
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
  return { session, visits, questions: readQuestions(data.questions) ?? DEFAULT_EVALUATION_QUESTIONS }
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
export type JointVisitFailure = "offline" | "notInTeam" | "notJoint" | "closed" | "invalid" | "questionsChanged" | "session" | "failed"

const SERVER_CODES: Record<string, JointVisitFailure> = {
  MTM_JOINT_VISIT_AGENT_FORBIDDEN: "notInTeam",
  MTM_VISIT_EVALUATION_NOT_JOINT: "notJoint",
  MTM_VISIT_EVALUATION_CLOSED: "closed",
  MTM_VISIT_EVALUATION_INVALID: "invalid",
  // The office edited the questions after the sheet was opened.
  MTM_VISIT_EVALUATION_QUESTIONS_CHANGED: "questionsChanged",
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
  const managers = toJointManagers(await fetchManagers())
  await rememberJointManagers(managers, now).catch(() => {})
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
