/**
 * The agent's «Задачи» as one list (owner, 2026-10-20: «когда заходишь, не
 * понятно сразу, в какой вкладке задача. Нужно, чтоб все задачи отображались
 * и рядом статус, который можно менять»; «бери из досок»; «потом фильтровать…
 * которые взяты, выполненные, ещё не взяты, потом сортировку придумай»).
 * Mockup approved with «Давай».
 *
 * Pure: what is open and what is closed, what each filter keeps, and the
 * order — «сначала срочное» by default:
 *   1. overdue, the longest overdue first;
 *   2. returned by the manager;
 *   3. due today, the taken ones first;
 *   4. later, the nearest first;
 *   5. without a deadline, the newest first.
 * On the same day the more important one goes first. Closed tasks: the latest
 * finished first.
 */

export type TaskState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
export type TaskFilter = "ALL" | "PENDING" | "IN_PROGRESS" | "COMPLETED"
export type TaskOrder = "urgent" | "due" | "priority" | "newest"

export const TASK_FILTERS: TaskFilter[] = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"]
export const TASK_ORDERS: TaskOrder[] = ["urgent", "due", "priority", "newest"]

export interface ListTask {
  id: string
  title: string
  status: string
  persistedStatus?: string | null
  priority?: string | null
  dueDate?: string | null
  createdAt?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  returnReason?: string | null
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

/**
 * The task's own state. The server sends OVERDUE as a shown status and keeps
 * the real one in persistedStatus; a cancelled task is closed, not «to do».
 */
export function taskState(task: Pick<ListTask, "status" | "persistedStatus">): TaskState {
  const status = String(task.persistedStatus || task.status || "PENDING").toUpperCase()
  if (status === "IN_PROGRESS" || status === "COMPLETED" || status === "CANCELLED") return status
  return "PENDING"
}

export function isClosedTask(task: Pick<ListTask, "status" | "persistedStatus">): boolean {
  const state = taskState(task)
  return state === "COMPLETED" || state === "CANCELLED"
}

/** Sent back by the manager with a reason, and not finished again since. */
export function isReturnedTask(task: ListTask): boolean {
  return taskState(task) === "IN_PROGRESS" && Boolean(task.returnReason?.trim())
}

function time(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function localDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function isOverdueTask(task: ListTask, now: number): boolean {
  const due = time(task.dueDate)
  return !isClosedTask(task) && due !== null && due < now
}

export function filterCounts(tasks: readonly ListTask[]): Record<TaskFilter, number> {
  const counts: Record<TaskFilter, number> = { ALL: tasks.length, PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0 }
  for (const task of tasks) {
    const state = taskState(task)
    if (state === "PENDING" || state === "IN_PROGRESS" || state === "COMPLETED") counts[state] += 1
  }
  return counts
}

export function filterTasks<T extends ListTask>(tasks: readonly T[], filter: TaskFilter): T[] {
  return filter === "ALL" ? [...tasks] : tasks.filter((task) => taskState(task) === filter)
}

function priorityRank(task: ListTask): number {
  return PRIORITY_RANK[String(task.priority || "MEDIUM").toUpperCase()] ?? PRIORITY_RANK.MEDIUM
}

/** 0 overdue, 1 returned, 2 today, 3 later, 4 no deadline. */
function urgencyBucket(task: ListTask, now: number): number {
  const due = time(task.dueDate)
  if (due !== null && due < now) return 0
  if (isReturnedTask(task)) return 1
  if (due === null) return 4
  return localDay(due) === localDay(now) ? 2 : 3
}

const byTitle = (a: ListTask, b: ListTask) => a.title.localeCompare(b.title)
const dueAsc = (a: ListTask, b: ListTask) => (time(a.dueDate) ?? Infinity) - (time(b.dueDate) ?? Infinity)
const createdDesc = (a: ListTask, b: ListTask) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0)
const dayAsc = (a: ListTask, b: ListTask) => {
  const left = time(a.dueDate)
  const right = time(b.dueDate)
  return (left === null ? Infinity : localDay(left)) - (right === null ? Infinity : localDay(right))
}

function urgentCompare(now: number) {
  return (a: ListTask, b: ListTask): number => {
    const bucket = urgencyBucket(a, now) - urgencyBucket(b, now)
    if (bucket !== 0) return bucket
    switch (urgencyBucket(a, now)) {
      case 0:
        return dueAsc(a, b) || priorityRank(a) - priorityRank(b) || byTitle(a, b)
      case 2: {
        const taken = Number(taskState(b) === "IN_PROGRESS") - Number(taskState(a) === "IN_PROGRESS")
        return taken || priorityRank(a) - priorityRank(b) || dueAsc(a, b) || byTitle(a, b)
      }
      case 4:
        return priorityRank(a) - priorityRank(b) || createdDesc(a, b) || byTitle(a, b)
      default:
        return dayAsc(a, b) || priorityRank(a) - priorityRank(b) || dueAsc(a, b) || byTitle(a, b)
    }
  }
}

/** The open tasks in the chosen order. */
export function orderOpenTasks<T extends ListTask>(tasks: readonly T[], order: TaskOrder, now: number): T[] {
  const open = tasks.filter((task) => !isClosedTask(task))
  const compare = order === "due"
    ? (a: ListTask, b: ListTask) => dueAsc(a, b) || priorityRank(a) - priorityRank(b) || byTitle(a, b)
    : order === "priority"
      ? (a: ListTask, b: ListTask) => priorityRank(a) - priorityRank(b) || dueAsc(a, b) || byTitle(a, b)
      : order === "newest"
        ? (a: ListTask, b: ListTask) => createdDesc(a, b) || byTitle(a, b)
        : urgentCompare(now)
  return [...open].sort(compare)
}

/** Closed tasks, the latest finished first. */
export function orderClosedTasks<T extends ListTask>(tasks: readonly T[]): T[] {
  const finished = (task: ListTask) => time(task.completedAt) ?? time(task.updatedAt) ?? time(task.createdAt) ?? 0
  return tasks.filter(isClosedTask).sort((a, b) => finished(b) - finished(a) || byTitle(a, b))
}

export function isTaskOrder(value: unknown): value is TaskOrder {
  return typeof value === "string" && (TASK_ORDERS as string[]).includes(value)
}
