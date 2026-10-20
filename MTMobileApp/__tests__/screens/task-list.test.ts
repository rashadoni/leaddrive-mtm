import {
  filterCounts,
  filterTasks,
  isReturnedTask,
  orderClosedTasks,
  orderOpenTasks,
  taskState,
  type ListTask,
} from "../../src/screens/tasks/task-list"

/**
 * The agent's tasks as one list (owner, 2026-10-20: «все задачи отображались…
 * фильтровать которые взяты, выполненные, ещё не взяты… сортировку
 * придумай»). The order «сначала срочное», read off a fixed morning.
 */
const NOW = new Date(2026, 9, 20, 10, 0).getTime()
const at = (day: number, hour = 18) => new Date(2026, 9, day, hour, 0).toISOString()
const task = (id: string, extra: Partial<ListTask> = {}): ListTask => ({ id, title: id, status: "PENDING", priority: "MEDIUM", ...extra })

const TASKS: ListTask[] = [
  task("later-low", { dueDate: at(23), priority: "LOW" }),
  task("no-due-old", { createdAt: at(1, 9) }),
  task("today-pending", { dueDate: at(20) }),
  task("overdue-2d", { status: "OVERDUE", persistedStatus: "PENDING", dueDate: at(18) }),
  task("returned", { status: "IN_PROGRESS", returnReason: "No photo of the price tags", dueDate: at(25) }),
  task("later-urgent", { dueDate: at(23, 9), priority: "URGENT" }),
  task("today-taken", { status: "IN_PROGRESS", dueDate: at(20, 17) }),
  task("no-due-new", { createdAt: at(19, 9) }),
  task("overdue-1d", { status: "OVERDUE", persistedStatus: "IN_PROGRESS", dueDate: at(19) }),
  task("done-old", { status: "COMPLETED", completedAt: at(15) }),
  task("done-new", { status: "COMPLETED", completedAt: at(19) }),
  task("cancelled", { status: "CANCELLED", updatedAt: at(17) }),
]

describe("the order «сначала срочное»", () => {
  it("puts overdue, then returned, then today (taken first), then by day, then undated (newest first)", () => {
    expect(orderOpenTasks(TASKS, "urgent", NOW).map((item) => item.id)).toEqual([
      "overdue-2d",
      "overdue-1d",
      "returned",
      "today-taken",
      "today-pending",
      // Same day: the more important first, whatever the hour.
      "later-urgent",
      "later-low",
      "no-due-new",
      "no-due-old",
    ])
  })

  it("can instead go by due date, by importance, or newest first", () => {
    expect(orderOpenTasks(TASKS, "due", NOW).map((item) => item.id).slice(0, 3)).toEqual(["overdue-2d", "overdue-1d", "today-taken"])
    expect(orderOpenTasks(TASKS, "priority", NOW)[0].id).toBe("later-urgent")
    expect(orderOpenTasks(TASKS, "newest", NOW).map((item) => item.id).slice(0, 2)).toEqual(["no-due-new", "no-due-old"])
  })

  it("keeps closed tasks out of the open list, the latest finished first", () => {
    expect(orderClosedTasks(TASKS).map((item) => item.id)).toEqual(["done-new", "cancelled", "done-old"])
    expect(orderOpenTasks(TASKS, "urgent", NOW).some((item) => ["done-new", "done-old", "cancelled"].includes(item.id))).toBe(false)
  })
})

describe("the filter «Все / Не взяты / Взяты / Выполнены»", () => {
  it("counts each by the task's own state, an overdue one by what it really is", () => {
    expect(filterCounts(TASKS)).toEqual({ ALL: 12, PENDING: 6, IN_PROGRESS: 3, COMPLETED: 2 })
    expect(filterTasks(TASKS, "IN_PROGRESS").map((item) => item.id).sort()).toEqual(["overdue-1d", "returned", "today-taken"])
    expect(filterTasks(TASKS, "ALL")).toHaveLength(12)
  })

  it("never shows a cancelled task as one to do", () => {
    expect(taskState({ status: "CANCELLED" })).toBe("CANCELLED")
    expect(filterTasks(TASKS, "PENDING").map((item) => item.id)).not.toContain("cancelled")
  })

  it("calls a task returned only while it is back in work with a reason", () => {
    expect(isReturnedTask(task("a", { status: "IN_PROGRESS", returnReason: "Redo" }))).toBe(true)
    expect(isReturnedTask(task("b", { status: "COMPLETED", returnReason: "Redo" }))).toBe(false)
    expect(isReturnedTask(task("c", { status: "IN_PROGRESS", returnReason: "  " }))).toBe(false)
  })
})
