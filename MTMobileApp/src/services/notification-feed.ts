/**
 * The bell: one list of everything that happened to this person, newest first
 * (owner, 2026-10-18: «как в соц сетях — сверху с краю колокольчик, где будут
 * все уведомления, также сообщения, разные алерты, предложения»).
 *
 * Four sources, each answering for itself:
 *
 *  - the server's inbox (`mtm_notifications`, GET /mobile/notifications):
 *    route published or changed, route deviation, visits left open, tasks
 *    returned, decisions on the agent's requests, reminders. Until this list
 *    the app never read it — on 2026-10-18 production held 118 deviation
 *    alerts, every one unread, because nothing showed them;
 *  - message threads (GET /mobile/messages), with the read state the
 *    messages screen already keeps;
 *  - what the phone works out itself (notification-center.ts): a doctor
 *    request decided, a task due, a day left open in the evening;
 *  - for a manager, what waits for his decision (GET /mobile/manager/approvals
 *    and the new-doctor queue). Those leave the list once decided.
 *
 * Unread is counted per line of the list, not per server row: the 73 deviation
 * alerts of one route on one day are one line that says 73.
 */

import {
  buildNotifications,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationItem,
  type NotificationPreferences,
  type NotificationSources,
} from "./notification-center"
import { formatDistance, type ApprovalSubject, type FeedCopy, type RequestOutcome, type RequestSubject } from "./notification-feed-copy"

export type FeedShell = "field" | "manager"

export type FeedKind = "message" | "request" | "task" | "visit" | "workday" | "route" | "approval" | "other"

export type FeedTarget =
  | { screen: "Messages"; threadId?: string }
  | { screen: "Tasks" }
  | { screen: "Route" }
  | { screen: "Calendar" }
  | { screen: "Today" }
  | { screen: "Clients" }
  | { screen: "AttendanceRequests" }
  | { screen: "ContactDetail"; id: string }
  | { screen: "OrganizationDetail"; id: string }
  | { screen: "Approvals" }
  | { screen: "OwnWorkday" }
  | { screen: "OwnRequests" }
  | { screen: "OwnExplanations" }

export interface FeedItem {
  id: string
  kind: FeedKind
  title: string
  body?: string
  /** ISO time the thing happened; the list is sorted by it. */
  at?: string
  read: boolean
  /** Something that went wrong in the field (off the route, outside the zone, a visit left open). */
  alert?: boolean
  /** Where tapping the line leads; none — the line only says something. */
  target?: FeedTarget
  /** The server rows this line stands for, still unread there. */
  unreadServerIds: string[]
}

export interface ServerNotification {
  id: string
  title: string
  body?: string
  type: string
  isRead: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

export interface MessageThread {
  id: string
  unread: boolean
  lastMessageAt?: string
  lastMessage: { id: string; senderAgentId?: string; senderName?: string; body?: string; sentAt?: string } | null
}

export interface PendingApproval {
  subject: ApprovalSubject
  id: string
  who: string
  what?: string
  at?: string
}

export interface FeedContext {
  shell: FeedShell
  /** The signed-in card; a thread whose last word is his own is not news to him. */
  selfId?: string
  /** «Sorğularım» is open to this person (the agent's More, the manager's own workday). */
  attendanceRequests: boolean
  /** The manager keeps his own workday: the tab and its explanations. */
  ownWorkday: boolean
}

export interface FeedSources {
  /** null: the source did not answer. */
  server?: ServerNotification[] | null
  threads?: MessageThread[] | null
  local?: Omit<NotificationSources, "messages">
  approvals?: PendingApproval[] | null
}

/** Read lines stay this long; unread ones stay until they are read. */
export const FEED_READ_HISTORY_DAYS = 30
export const FEED_LIMIT = 150

const DAY_MS = 24 * 60 * 60 * 1000

function str(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function num(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined
}

/** The device-local calendar day of a moment, YYYY-MM-DD. */
export function localDayKey(value: string | Date | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? "")
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** The inbox as GET /mobile/notifications sends it; null when it is not that answer. */
export function toServerNotifications(response: unknown): ServerNotification[] | null {
  const data = (response as { success?: unknown; data?: { items?: unknown } } | null)
  if (!data || data.success !== true || !Array.isArray(data.data?.items)) return null
  return data.data!.items.flatMap((row: any): ServerNotification[] => {
    const id = str(row?.id)
    const createdAt = str(row?.createdAt)
    if (!id || !createdAt || typeof row?.isRead !== "boolean") return []
    const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}
    return [{
      id,
      title: str(row?.title) ?? "",
      body: str(row?.body),
      type: str(row?.type) ?? "info",
      isRead: row.isRead,
      metadata,
      createdAt,
    }]
  })
}

/** The threads as GET /mobile/messages sends them; null when it is not that answer. */
export function toMessageThreads(response: unknown): MessageThread[] | null {
  const data = response as { success?: unknown; data?: { threads?: unknown } } | null
  if (!data || data.success !== true || !Array.isArray(data.data?.threads)) return null
  return data.data!.threads.flatMap((thread: any): MessageThread[] => {
    const id = str(thread?.id)
    if (!id) return []
    const last = thread?.lastMessage
    const lastId = str(last?.id)
    return [{
      id,
      unread: thread?.unread === true,
      lastMessageAt: str(thread?.lastMessageAt),
      lastMessage: lastId
        ? {
            id: lastId,
            senderAgentId: str(last?.senderAgentId),
            senderName: str(last?.senderName),
            body: str(last?.body),
            sentAt: str(last?.sentAt),
          }
        : null,
    }]
  })
}

const OUTCOMES: Record<string, RequestOutcome> = {
  APPROVED: "approved",
  ACCEPTED: "approved",
  REJECTED: "rejected",
  NEEDS_INFO: "needsInfo",
  CANCELLED: "cancelled",
  RESCHEDULE: "rescheduled",
  RESCHEDULED: "rescheduled",
}

function decisionTitle(copy: FeedCopy, subject: RequestSubject, decision: unknown): string | undefined {
  const outcome = OUTCOMES[String(decision ?? "").toUpperCase()]
  return outcome ? `${copy.requestSubject[subject]} ${copy.requestOutcome[outcome]}` : undefined
}

const FIELD_TARGETS = new Set<FeedTarget["screen"]>([
  "Messages", "Tasks", "Route", "Calendar", "Today", "Clients", "AttendanceRequests", "ContactDetail", "OrganizationDetail",
])
const MANAGER_TARGETS = new Set<FeedTarget["screen"]>(["Approvals", "OwnWorkday", "OwnRequests", "OwnExplanations"])

/** A place only where this shell has it: the manager's phone has no route tab to open. */
function allowed(target: FeedTarget | undefined, context: FeedContext): FeedTarget | undefined {
  if (!target) return undefined
  if (target.screen === "AttendanceRequests" || target.screen === "OwnRequests") {
    if (!context.attendanceRequests) return undefined
  }
  if ((target.screen === "OwnWorkday" || target.screen === "OwnExplanations") && !context.ownWorkday) return undefined
  return (context.shell === "field" ? FIELD_TARGETS : MANAGER_TARGETS).has(target.screen) ? target : undefined
}

type Classified = {
  kind: FeedKind
  title: string
  body?: string
  target?: FeedTarget
  alert?: boolean
  /** Rows with the same key are one line: the deviation alerts of one route on one day. */
  group?: string
  deviationMeters?: number
}

const ISO_DAY = /\b(\d{4}-\d{2}-\d{2})\b/

/**
 * What one server row means, from its metadata — never from its English
 * title. `null` drops it: a manager's «needs review» row stands for a request
 * the approvals queue already lists, and that queue forgets it once decided.
 */
export function classifyServerNotification(
  row: ServerNotification,
  context: FeedContext,
  copy: FeedCopy,
  formatDay: (dateKey: string) => string,
  todayKey: string,
): Classified | null {
  const m = row.metadata
  const field = context.shell === "field"
  const as = (kind: FeedKind, title: string | undefined, body?: string, target?: FeedTarget): Classified => ({
    kind,
    title: title || row.title,
    body,
    target: allowed(target, context),
  })

  const threadId = str(m.threadId)
  if (threadId) return as("message", row.title || copy.messageFrom(""), row.body, { screen: "Messages", threadId })

  // A task given to the agent (2026-10-20): the server writes it in his
  // language — who gave it and what — and the line opens his tasks.
  if (m.event === "task_assigned" || str(m.assignedTaskId)) return as("task", undefined, row.body, { screen: "Tasks" })

  const deviationMeters = num(m.deviationMeters)
  if (deviationMeters !== undefined) {
    return {
      ...as("route", copy.routeDeviation, undefined, { screen: "Route" }),
      alert: true,
      group: `deviation:${str(m.routeId) ?? ""}:${localDayKey(row.createdAt)}`,
      deviationMeters,
    }
  }

  const distanceMeters = num(m.distanceMeters)
  if (distanceMeters !== undefined && str(m.customerId)) {
    return { ...as("visit", copy.outOfZone, copy.outOfZoneBody(formatDistance(distanceMeters, copy)), { screen: "Route" }), alert: true }
  }

  if (str(m.taskId)) return as("task", copy.taskReturned, str(m.reason) ?? row.body, { screen: "Tasks" })

  if (str(m.documentId)) {
    return as("other", row.type === "document_required" ? copy.documentRequired : copy.documentNew, row.body)
  }

  if (str(m.attendanceReminderId)) {
    const kind = str(m.attendanceReminderKind)
    const title = kind === "EMPLOYEE_START" ? copy.reminderStart : kind === "EMPLOYEE_FINISH" ? copy.reminderFinish : undefined
    return as("workday", title, undefined, field ? { screen: "Today" } : { screen: "OwnWorkday" })
  }

  if (str(m.attendanceExplanationId)) {
    const status = str(m.status)?.toUpperCase()
    const title = status === "ACCEPTED" ? copy.explanationAccepted
      : status === "REJECTED" ? copy.explanationRejected
        : status ? undefined : copy.explanationAsked
    return as("workday", title, undefined, { screen: "OwnExplanations" })
  }

  // The server writes this one in the employee's language and says nothing
  // about the outcome in metadata: its own words are the only ones.
  if (str(m.attendanceInstallationRequestId)) return as("request", undefined, row.body)

  if (str(m.attendanceRequestId)) {
    return as("request", decisionTitle(copy, "request", m.status), undefined,
      field ? { screen: "AttendanceRequests" } : { screen: "OwnRequests" })
  }

  if (m.domain === "workforce" || str(m.hrmRequestId)) return as("request", decisionTitle(copy, "hr", m.status), row.body)

  // Pharmacy promotion reviews: localized by the server, nowhere to open here.
  if (str(m.executionId) && str(m.reviewId)) return as("request", undefined, row.body)

  const event = str(m.event)
  // Joint visits (2026-10-30): where the manager goes with the agent, in the
  // agent's language as the server wrote it. The line opens his route of that
  // day — a line that led nowhere was the bug the owner found. Notices of the
  // older «manager is with you today» kind carry only the session.
  if (event === "joint_visit_planned" || event === "joint_visit_cancelled" || event === "joint_visit_session" || str(m.jointSessionId)) {
    const day = str(m.date)
    return as("route", undefined, row.body, day && day !== todayKey ? { screen: "Calendar" } : { screen: "Route" })
  }

  if (event === "route_published" || event === "route_updated" || event === "route_published_update") {
    const day = row.body?.match(ISO_DAY)?.[1]
    return as(
      "route",
      event === "route_published" ? copy.routePublished : copy.routeUpdated,
      day ? copy.routeFor(formatDay(day)) : undefined,
      day && day !== todayKey ? { screen: "Calendar" } : { screen: "Route" },
    )
  }

  const customerId = str(m.customerId)
  if (m.kind === "customer_location_request_decision") {
    return as("request", decisionTitle(copy, "location", m.decision), undefined,
      customerId ? { screen: "OrganizationDetail", id: customerId } : { screen: "Clients" })
  }

  if (str(m.contactChangeRequestId)) {
    if (m.decision === undefined) return field ? as("other", undefined, row.body) : null
    const contactId = str(m.contactId)
    return as("request", decisionTitle(copy, "contactChange", m.decision), row.body,
      contactId ? { screen: "ContactDetail", id: contactId } : { screen: "Clients" })
  }

  if (str(m.requestId)) {
    if (str(m.routeId) && (m.decision !== undefined || m.rescheduled !== undefined)) {
      return as("request", decisionTitle(copy, "routeChange", m.decision), row.body, { screen: "Route" })
    }
    if (customerId) {
      return as("request", decisionTitle(copy, "customer", "APPROVED"), undefined, { screen: "OrganizationDetail", id: customerId })
    }
    if (m.decision !== undefined) return as("request", decisionTitle(copy, "customer", m.decision), row.body, { screen: "Clients" })
    // A new customer or route change waiting for the manager.
    return field ? as("other", undefined, row.body) : null
  }

  if (str(m.visitId)) return { ...as("visit", copy.visitStillOpen, copy.visitStillOpenBody, { screen: "Route" }), alert: true }

  if (str(m.routeId)) return as("route", undefined, row.body, { screen: "Route" })

  return as("other", undefined, row.body)
}

function localTarget(target: NotificationItem["target"]): FeedTarget | undefined {
  if (!target) return undefined
  return target === "Messages" ? { screen: "Messages" } : { screen: target }
}

function time(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildNotificationFeed(input: {
  sources: FeedSources
  context: FeedContext
  copy: FeedCopy
  formatDay: (dateKey: string) => string
  preferences?: NotificationPreferences
  readIds?: ReadonlyArray<string>
  now?: Date
}): FeedItem[] {
  const now = input.now ?? new Date()
  const { context, copy } = input
  const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...input.preferences }
  const read = new Set(input.readIds ?? [])
  const todayKey = localDayKey(now)
  const items: FeedItem[] = []

  // Message threads first, so the server's message rows can fold into them.
  const threads = context.shell === "field" ? input.sources.threads : null
  const threadIds = new Set((threads ?? []).map((thread) => thread.id))
  const rowsByThread = new Map<string, ServerNotification[]>()
  for (const row of input.sources.server ?? []) {
    const threadId = str(row.metadata.threadId)
    if (threadId && threadIds.has(threadId)) rowsByThread.set(threadId, [...(rowsByThread.get(threadId) ?? []), row])
  }
  for (const thread of threads ?? []) {
    const last = thread.lastMessage
    if (!last || (context.selfId && last.senderAgentId === context.selfId)) continue
    const id = `message:${thread.id}:${last.id}`
    const rows = rowsByThread.get(thread.id) ?? []
    // The thread's own read state is the one the messages screen shows; a
    // line read here and still «new» there would be two answers to one question.
    const isRead = !thread.unread || read.has(id)
    items.push({
      id,
      kind: "message",
      title: copy.messageFrom(last.senderName ?? ""),
      body: last.body,
      at: last.sentAt ?? thread.lastMessageAt,
      read: isRead,
      target: allowed({ screen: "Messages", threadId: thread.id }, context),
      unreadServerIds: rows.filter((row) => !row.isRead).map((row) => row.id),
    })
  }

  // The server inbox.
  const groups = new Map<string, { classified: Classified; rows: ServerNotification[] }>()
  for (const row of input.sources.server ?? []) {
    const threadId = str(row.metadata.threadId)
    if (threadId && threadIds.has(threadId)) continue
    const classified = classifyServerNotification(row, context, copy, input.formatDay, todayKey)
    if (!classified) continue
    if (classified.group) {
      const group = groups.get(classified.group)
      if (group) group.rows.push(row)
      else groups.set(classified.group, { classified, rows: [row] })
      continue
    }
    const id = `server:${row.id}`
    items.push({
      id,
      kind: classified.kind,
      title: classified.title,
      body: classified.body,
      at: row.createdAt,
      read: row.isRead || read.has(id),
      alert: classified.alert,
      target: classified.target,
      unreadServerIds: row.isRead ? [] : [row.id],
    })
  }
  for (const [key, group] of groups) {
    const rows = [...group.rows].sort((left, right) => time(right.createdAt) - time(left.createdAt))
    const latest = rows[0]
    // The id carries the newest row: a deviation after the line was read
    // makes it new again instead of hiding under the old «read».
    const id = `server-group:${key}:${latest.id}`
    const distance = num(latest.metadata.deviationMeters)
    const unreadServerIds = rows.filter((row) => !row.isRead).map((row) => row.id)
    items.push({
      id,
      kind: group.classified.kind,
      title: group.classified.title,
      body: distance !== undefined ? copy.deviationBody(rows.length, formatDistance(distance, copy)) : group.classified.body,
      at: latest.createdAt,
      read: unreadServerIds.length === 0 || read.has(id),
      alert: group.classified.alert,
      target: group.classified.target,
      unreadServerIds,
    })
  }

  // What the phone works out itself.
  if (context.shell === "field" && input.sources.local) {
    const local = buildNotifications({
      copy: {
        messageFrom: copy.messageFrom,
        requestApproved: copy.doctorApproved,
        requestRejected: copy.doctorRejected,
        requestNeedsInfo: copy.doctorNeedsInfo,
        taskOverdue: copy.taskOverdue,
        taskToday: copy.taskToday,
        visitLong: copy.visitLong,
        workdayOpen: copy.workdayOpen,
        workdayOpenBody: copy.workdayOpenBody,
      },
      preferences,
      readIds: input.readIds,
      now,
      sources: { ...input.sources.local, messages: undefined },
    })
    for (const item of local) {
      items.push({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        at: item.at,
        read: item.read,
        target: allowed(localTarget(item.target), context),
        unreadServerIds: [],
      })
    }
  }

  // What waits for the manager.
  if (context.shell === "manager") {
    for (const approval of input.sources.approvals ?? []) {
      const id = `approval:${approval.subject}:${approval.id}`
      items.push({
        id,
        kind: "approval",
        title: copy.approval[approval.subject],
        body: [approval.who, approval.what].filter((part) => part && part.trim()).join(" — ") || undefined,
        at: approval.at,
        read: read.has(id),
        target: allowed({ screen: "Approvals" }, context),
        unreadServerIds: [],
      })
    }
  }

  const historyStart = now.getTime() - FEED_READ_HISTORY_DAYS * DAY_MS
  return items
    .filter((item) => preferences[item.kind] !== false)
    .filter((item) => !item.read || !item.at || time(item.at) >= historyStart)
    .sort((left, right) => time(right.at) - time(left.at))
    .slice(0, FEED_LIMIT)
}

export function feedUnreadCount(items: readonly FeedItem[]): number {
  return items.filter((item) => !item.read).length
}

/** The badge: «9+» keeps the circle a circle. */
export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count)
}

/**
 * The navigator call a line's target stands for.
 *
 * The list lies over the tabs, so a tab is reached by going back to them:
 * `pop`. In React Navigation 7 a plain navigate("Main") from here pushes a
 * second copy of every tab (StackRouter NAVIGATE: only the focused route or
 * `pop` reuses one). A card is pushed over the list, and back returns to it.
 */
export function feedNavigation(target: FeedTarget): { name: string; params?: Record<string, unknown>; pop?: true } {
  switch (target.screen) {
    case "Messages":
      return { name: "Main", params: { screen: "More", params: { screen: "Messages", params: target.threadId ? { threadId: target.threadId } : undefined } }, pop: true }
    case "AttendanceRequests":
      return { name: "Main", params: { screen: "More", params: { screen: "AttendanceRequests" } }, pop: true }
    case "Calendar":
      // The calendar is «Маршрут» → «Месяц» since 2026-10-20.
      return { name: "Main", params: { screen: "Route", params: { view: "month" } }, pop: true }
    case "ContactDetail":
    case "OrganizationDetail":
      return { name: target.screen, params: { id: target.id } }
    case "OwnRequests":
    case "OwnExplanations":
      return { name: target.screen }
    default:
      return { name: "Main", params: { screen: target.screen }, pop: true }
  }
}

/** The word on a line's button: where it leads. */
export function feedTargetLabel(target: FeedTarget, copy: FeedCopy): string {
  if (target.screen === "ContactDetail" || target.screen === "OrganizationDetail") return copy.target.Card
  return copy.target[target.screen]
}

/** «10 dəq əvvəl», «3 saat əvvəl», «dünən», then the date. */
export function feedTimeLabel(at: string | undefined, now: Date, copy: FeedCopy, formatDate: (iso: string) => string): string {
  const moment = time(at)
  if (!at || !moment) return ""
  const minutes = Math.floor((now.getTime() - moment) / 60_000)
  if (minutes < 1) return copy.justNow
  if (minutes < 60) return copy.minutesAgo(minutes)
  const today = localDayKey(now)
  const day = localDayKey(at)
  if (day === today) return copy.hoursAgo(Math.floor(minutes / 60))
  if (day === localDayKey(new Date(now.getTime() - DAY_MS))) return copy.yesterday
  return formatDate(at)
}

type ApprovalRow = { id: string; who: string; what?: string; at?: string }

/**
 * What waits for the manager, from GET /mobile/manager/approvals and the
 * new-doctor queue. Only words a person reads: a request's type code
 * («ADD_STOP», «VACATION») is not one, so it stays out.
 */
export function pendingApprovalsFrom(input: {
  approvals?: unknown
  doctors?: ReadonlyArray<{ id: string; agentName: string; displayName: string; submittedAt?: string }>
  attendance?: ReadonlyArray<{ id: string; employeeName: string; what: string; submittedAt?: string }>
}): PendingApproval[] {
  const data = (input.approvals ?? {}) as Record<string, unknown>
  const rows = (key: string, who: (row: any) => unknown, what?: (row: any) => unknown): ApprovalRow[] => {
    const list = Array.isArray(data[key]) ? (data[key] as any[]) : []
    return list.flatMap((row) => {
      const id = str(row?.id)
      if (!id) return []
      return [{ id, who: str(who(row)) ?? "", what: what ? str(what(row)) : undefined, at: str(row?.submittedAt) }]
    })
  }
  const out: PendingApproval[] = []
  const add = (subject: ApprovalSubject, list: ReadonlyArray<ApprovalRow>) => {
    for (const row of list) out.push({ subject, ...row })
  }
  add("attendance", (input.attendance ?? []).map((item) => ({ id: item.id, who: item.employeeName, what: item.what, at: item.submittedAt })))
  add("doctor", (input.doctors ?? []).map((item) => ({ id: item.id, who: item.agentName, what: item.displayName, at: item.submittedAt })))
  add("hr", rows("hrm", (row) => row?.agent?.name))
  add("routeChange", rows("routeChanges", (row) => row?.requestedByAgent?.name))
  add("customer", rows("customers", (row) => row?.requestedByAgent?.name, (row) => row?.name))
  add("contactChange", rows("contactChanges", (row) => row?.requestedByAgent?.name, (row) => row?.contact?.displayName))
  return out
}
