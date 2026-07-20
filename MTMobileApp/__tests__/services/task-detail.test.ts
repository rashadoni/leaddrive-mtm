import { toTaskDetail, taskTimeline, type RawTask } from "../../src/services/task-detail"

const base: RawTask = {
  id: "t-1",
  title: "Visit clinic",
  status: "IN_PROGRESS",
  priority: "HIGH",
  createdAt: "2026-07-10T08:00:00.000Z",
}

describe("toTaskDetail", () => {
  it("normalizes a full task row", () => {
    const d = toTaskDetail({
      ...base,
      description: "Deliver samples",
      dueDate: "2026-07-15T00:00:00.000Z",
      acceptedAt: "2026-07-11T09:00:00.000Z",
      startedAt: "2026-07-12T10:00:00.000Z",
      completedAt: null,
      result: null,
      customer: { name: "Alpha Clinic", address: "5 May St" },
      agent: { name: "Aysel" },
      recurrenceRule: "WEEKLY",
      recurrenceInterval: 2,
      recurrenceUntil: "2026-09-01T00:00:00.000Z",
    })
    expect(d).toMatchObject({
      id: "t-1",
      title: "Visit clinic",
      description: "Deliver samples",
      status: "IN_PROGRESS",
      priority: "HIGH",
      customerName: "Alpha Clinic",
      customerAddress: "5 May St",
      agentName: "Aysel",
      recurrence: { rule: "WEEKLY", interval: 2, until: "2026-09-01T00:00:00.000Z" },
    })
  })

  it("coerces blank/missing optionals to null and defaults status/priority", () => {
    const d = toTaskDetail({ id: "t-2", title: "x", description: "", customer: null, agent: null })
    expect(d.description).toBeNull()
    expect(d.customerName).toBeNull()
    expect(d.agentName).toBeNull()
    expect(d.status).toBe("PENDING")
    expect(d.priority).toBe("MEDIUM")
    expect(d.recurrence).toBeNull()
  })

  it("defaults recurrence interval to 1 when absent or non-positive", () => {
    expect(toTaskDetail({ ...base, recurrenceRule: "DAILY" }).recurrence).toEqual({ rule: "DAILY", interval: 1, until: null })
    expect(toTaskDetail({ ...base, recurrenceRule: "DAILY", recurrenceInterval: 0 }).recurrence?.interval).toBe(1)
  })

  it("carries progress (clamped/rounded 0..100) and agentId", () => {
    expect(toTaskDetail({ ...base, progress: 40, agentId: "a-9" })).toMatchObject({ progress: 40, agentId: "a-9" })
    expect(toTaskDetail({ ...base, progress: 150 }).progress).toBe(100)
    expect(toTaskDetail({ ...base, progress: -5 }).progress).toBe(0)
    expect(toTaskDetail({ ...base, progress: 33.6 }).progress).toBe(34)
    expect(toTaskDetail(base).progress).toBeNull()
  })
})

describe("taskTimeline", () => {
  it("builds a chronological lifecycle, due as target before completion", () => {
    const d = toTaskDetail({
      ...base,
      acceptedAt: "2026-07-11T09:00:00.000Z",
      startedAt: "2026-07-12T10:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
    })
    const tl = taskTimeline(d)
    expect(tl.map((e) => e.key)).toEqual(["created", "accepted", "started", "due"])
    expect(tl.find((e) => e.key === "due")?.kind).toBe("target")
    expect(tl.find((e) => e.key === "created")?.kind).toBe("done")
  })

  it("drops the due marker once completed and appends completion", () => {
    const d = toTaskDetail({
      ...base,
      dueDate: "2026-07-15T00:00:00.000Z",
      completedAt: "2026-07-14T16:00:00.000Z",
    })
    const tl = taskTimeline(d)
    expect(tl.map((e) => e.key)).toEqual(["created", "completed"])
  })

  it("returns a single entry when only createdAt exists", () => {
    expect(taskTimeline(toTaskDetail(base)).map((e) => e.key)).toEqual(["created"])
  })

  it("sorts entries ascending by timestamp regardless of field order", () => {
    const d = toTaskDetail({
      id: "t-3",
      title: "x",
      createdAt: "2026-07-10T08:00:00.000Z",
      startedAt: "2026-07-12T10:00:00.000Z",
      acceptedAt: "2026-07-11T09:00:00.000Z",
      completedAt: "2026-07-13T12:00:00.000Z",
    })
    const times = taskTimeline(d).map((e) => new Date(e.at).getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})
