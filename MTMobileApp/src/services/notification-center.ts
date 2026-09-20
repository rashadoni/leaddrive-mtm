/**
 * The notification centre: everything the app already knows and never said.
 *
 * The app could only tell an agent something while they were looking at the
 * screen that held it — a manager's announcement lived in Team Messages, a
 * decision on a new doctor lived on the clients screen, an overdue task lived
 * in the task list. Nothing gathered them, and nothing remembered what the
 * agent had already seen.
 *
 * This builds one list from data the phone already has. It is a digest, not a
 * log of pushes: nothing here claims a notification was delivered, because
 * without Firebase none was. Read state lives on the device.
 */

export type NotificationKind = "message" | "request" | "task" | "visit" | "workday"

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  /** ISO time the underlying thing happened; sorting and grouping use it. */
  at?: string
  read: boolean
  /** Where tapping it should take the agent. */
  target?: "Messages" | "Clients" | "Tasks" | "Route" | "Today"
}

export interface NotificationSources {
  messages?: Array<{ id: string; subject?: string; body?: string; createdAt?: string; read?: boolean; senderName?: string }>
  requests?: Array<{ id: string; status: string; displayName: string; clinicName?: string; decisionComment?: string; reviewedAt?: string; submittedAt?: string }>
  tasks?: Array<{ id: string; title: string; status: string; dueDate?: string }>
  visit?: { id: string; customerName?: string; checkInAt?: string; minutes: number } | null
  workday?: { open: boolean; startedAt?: string } | null
}

export interface NotificationCopy {
  messageFrom: (name: string) => string
  requestApproved: (name: string) => string
  requestRejected: (name: string) => string
  requestNeedsInfo: (name: string) => string
  taskOverdue: (title: string) => string
  taskToday: (title: string) => string
  visitLong: (minutes: number) => string
  workdayOpen: string
  workdayOpenBody: string
}

export interface NotificationPreferences {
  message: boolean
  request: boolean
  task: boolean
  visit: boolean
  workday: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  message: true,
  request: true,
  task: true,
  visit: true,
  workday: true,
}

/** A visit is worth mentioning here at the same threshold the reminder uses. */
export const NOTIFICATION_VISIT_MINUTES = 30
/** A workday still open this late at night is almost always a forgotten one. */
export const NOTIFICATION_WORKDAY_HOUR = 20

function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function dueState(dueDate: string | undefined, now: Date): "overdue" | "today" | null {
  if (!dueDate) return null
  const due = Date.parse(dueDate)
  if (!Number.isFinite(due)) return null
  const dayStart = startOfDay(now)
  const dayEnd = dayStart + 24 * 60 * 60 * 1000
  if (due < now.getTime() && due < dayEnd) return due < dayStart ? "overdue" : "today"
  return due >= dayStart && due < dayEnd ? "today" : null
}

export function buildNotifications(input: {
  sources: NotificationSources
  copy: NotificationCopy
  preferences?: NotificationPreferences
  readIds?: ReadonlyArray<string>
  now?: Date
}): NotificationItem[] {
  const now = input.now ?? new Date()
  const preferences = input.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES
  const read = new Set(input.readIds ?? [])
  const items: NotificationItem[] = []

  if (preferences.message) {
    for (const message of input.sources.messages ?? []) {
      const id = `message:${message.id}`
      items.push({
        id,
        kind: "message",
        title: message.subject?.trim() || input.copy.messageFrom(message.senderName?.trim() || ""),
        body: message.body?.trim(),
        at: message.createdAt,
        // A message the agent has already opened is read here too: two lists
        // disagreeing about the same message is worse than no list.
        read: read.has(id) || message.read === true,
        target: "Messages",
      })
    }
  }

  if (preferences.request) {
    for (const request of input.sources.requests ?? []) {
      if (request.status === "SUBMITTED" || request.status === "IN_REVIEW") continue
      const id = `request:${request.id}:${request.status}`
      const title = request.status === "APPROVED"
        ? input.copy.requestApproved(request.displayName)
        : request.status === "NEEDS_INFO"
          ? input.copy.requestNeedsInfo(request.displayName)
          : input.copy.requestRejected(request.displayName)
      items.push({
        id,
        kind: "request",
        title,
        body: request.decisionComment?.trim() || request.clinicName?.trim(),
        at: request.reviewedAt || request.submittedAt,
        read: read.has(id),
        target: "Clients",
      })
    }
  }

  if (preferences.task) {
    for (const task of input.sources.tasks ?? []) {
      if (task.status === "COMPLETED" || task.status === "CANCELLED") continue
      const state = dueState(task.dueDate, now)
      if (!state) continue
      const id = `task:${task.id}:${state}`
      items.push({
        id,
        kind: "task",
        title: state === "overdue" ? input.copy.taskOverdue(task.title) : input.copy.taskToday(task.title),
        at: task.dueDate,
        read: read.has(id),
        target: "Tasks",
      })
    }
  }

  const visit = input.sources.visit
  if (preferences.visit && visit && visit.minutes >= NOTIFICATION_VISIT_MINUTES) {
    // The id carries the half-hour the visit has passed, so a long visit says
    // it once per half hour instead of once for ever or once a minute.
    const bucket = Math.floor(visit.minutes / NOTIFICATION_VISIT_MINUTES)
    const id = `visit:${visit.id}:${bucket}`
    items.push({
      id,
      kind: "visit",
      title: input.copy.visitLong(visit.minutes),
      body: visit.customerName,
      at: visit.checkInAt,
      read: read.has(id),
      target: "Route",
    })
  }

  const workday = input.sources.workday
  if (preferences.workday && workday?.open && now.getHours() >= NOTIFICATION_WORKDAY_HOUR) {
    const id = `workday:${startOfDay(now)}`
    items.push({
      id,
      kind: "workday",
      title: input.copy.workdayOpen,
      body: input.copy.workdayOpenBody,
      at: workday.startedAt,
      read: read.has(id),
      target: "Today",
    })
  }

  return items.sort((left, right) => {
    const leftAt = left.at ? Date.parse(left.at) : 0
    const rightAt = right.at ? Date.parse(right.at) : 0
    return (Number.isFinite(rightAt) ? rightAt : 0) - (Number.isFinite(leftAt) ? leftAt : 0)
  })
}

export function unreadCount(items: readonly NotificationItem[]): number {
  return items.filter((item) => !item.read).length
}

/**
 * Read state is kept as ids, and ids are derived from the thing itself, so a
 * list that stops mentioning something drops its id with it. Keeping the last
 * few hundred is enough to stay small without forgetting what is on screen.
 */
export const NOTIFICATION_READ_LIMIT = 300

export function mergeReadIds(previous: ReadonlyArray<string>, added: ReadonlyArray<string>): string[] {
  const merged = [...added, ...previous.filter((id) => !added.includes(id))]
  return merged.slice(0, NOTIFICATION_READ_LIMIT)
}
