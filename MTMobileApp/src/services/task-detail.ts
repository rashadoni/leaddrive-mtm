/**
 * Pure task-detail mapping for SWM-14. The `/tasks` list endpoint returns the
 * full MtmTask row (no `select`), so a read-only detail view can be derived
 * entirely client-side from the already-fetched task — no extra fetch, works
 * offline from the durable sync cache.
 *
 * Kept free of React / i18n so it can be unit-tested and reused; the screen
 * resolves the timeline entry `key`s and status/priority through i18n.
 */

export interface RawTask {
  id: string
  title: string
  description?: string | null
  status?: string | null
  priority?: string | null
  dueDate?: string | null
  startedAt?: string | null
  acceptedAt?: string | null
  completedAt?: string | null
  createdAt?: string | null
  result?: string | null
  customer?: { name?: string | null; address?: string | null } | null
  agent?: { name?: string | null } | null
  recurrenceRule?: string | null
  recurrenceInterval?: number | null
  recurrenceUntil?: string | null
}

export interface TaskRecurrence {
  rule: string
  interval: number
  until: string | null
}

export interface TaskDetail {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  startedAt: string | null
  acceptedAt: string | null
  completedAt: string | null
  createdAt: string | null
  result: string | null
  customerName: string | null
  customerAddress: string | null
  agentName: string | null
  recurrence: TaskRecurrence | null
}

export type TaskTimelineKey = "created" | "accepted" | "started" | "due" | "completed"

export interface TaskTimelineEntry {
  key: TaskTimelineKey
  at: string
  /** `done` = an event that has happened; `target` = a future/target date (the due date). */
  kind: "done" | "target"
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

/** Normalize a raw task row (or a partial list item) into a typed detail shape. */
export function toTaskDetail(raw: RawTask): TaskDetail {
  const interval = typeof raw.recurrenceInterval === "number" && raw.recurrenceInterval > 0
    ? raw.recurrenceInterval
    : 1
  const rule = str(raw.recurrenceRule)
  return {
    id: raw.id,
    title: raw.title,
    description: str(raw.description),
    status: str(raw.status) ?? "PENDING",
    priority: str(raw.priority) ?? "MEDIUM",
    dueDate: str(raw.dueDate),
    startedAt: str(raw.startedAt),
    acceptedAt: str(raw.acceptedAt),
    completedAt: str(raw.completedAt),
    createdAt: str(raw.createdAt),
    result: str(raw.result),
    customerName: str(raw.customer?.name),
    customerAddress: str(raw.customer?.address),
    agentName: str(raw.agent?.name),
    recurrence: rule ? { rule, interval, until: str(raw.recurrenceUntil) } : null,
  }
}

/**
 * Build a chronological lifecycle timeline from whichever timestamps the task
 * carries. Only the due date is a `target`; everything else is a completed
 * event. The due marker is dropped once the task is completed (it is then
 * historical noise next to the real completion time). Entries are sorted
 * ascending by timestamp so the rail reads top-to-bottom in real time order.
 */
export function taskTimeline(task: TaskDetail): TaskTimelineEntry[] {
  const entries: TaskTimelineEntry[] = []
  if (task.createdAt) entries.push({ key: "created", at: task.createdAt, kind: "done" })
  if (task.acceptedAt) entries.push({ key: "accepted", at: task.acceptedAt, kind: "done" })
  if (task.startedAt) entries.push({ key: "started", at: task.startedAt, kind: "done" })
  if (task.dueDate && !task.completedAt) entries.push({ key: "due", at: task.dueDate, kind: "target" })
  if (task.completedAt) entries.push({ key: "completed", at: task.completedAt, kind: "done" })
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}
