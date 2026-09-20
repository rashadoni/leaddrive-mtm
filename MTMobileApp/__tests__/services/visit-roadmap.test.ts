import { visitRoadmap, visitRoadmapProgress } from "../../src/services/visit-roadmap"

const copy = {
  checkIn: "Приход",
  presentation: "Презентация",
  photo: "Фото",
  signature: "Подпись клиента",
  tasks: "Задачи",
  result: "Результат",
  checkOut: "Уход",
  visitOpen: "визит ещё идёт",
  notRequired: "не требовалось",
  required: "обязательный шаг",
  photoCount: (count: number) => `${count} фото`,
  presentationCount: (count: number) => `${count} показ`,
  taskCount: (done: number, total: number) => `${done} из ${total}`,
}

const time = (value?: string) => (value ? value.slice(11, 16) : "—")

function states(steps: ReturnType<typeof visitRoadmap>) {
  return Object.fromEntries(steps.map((step) => [step.key, step.state]))
}

describe("the visit as a road", () => {
  /**
   * The owner wanted checkpoints instead of paragraphs: green where it is
   * done, red where a required step was missed. The third state exists
   * because painting an unrequested step red would accuse the agent of
   * skipping something that was never on their road.
   */
  it("marks evidence green, a missed required step red and an unrequested one pale", () => {
    const steps = visitRoadmap({
      status: "CHECKED_OUT",
      checkInAt: "2026-09-20T13:37:00.000Z",
      checkOutAt: "2026-09-20T14:16:00.000Z",
      photosCount: 0,
      presentationSessions: [{}, {}],
      tasks: [],
      requirements: [
        { actionKey: "PHOTO", mode: "REQUIRED", done: false, waived: false },
        { actionKey: "SIGNATURE", mode: "OPTIONAL", done: false, waived: false },
      ],
      outcome: "SUCCESS",
    }, copy, time)

    expect(states(steps)).toMatchObject({
      checkIn: "done",
      presentation: "done",
      photo: "missing",
      signature: "skipped",
      tasks: "skipped",
      result: "done",
      checkOut: "done",
    })
    expect(steps.find((step) => step.key === "presentation")?.detail).toBe("2 показ")
    expect(steps.find((step) => step.key === "photo")?.detail).toBe("обязательный шаг")
  })

  it("counts a waived requirement as done, not as a red mark on the agent", () => {
    const steps = visitRoadmap({
      status: "CHECKED_OUT",
      checkInAt: "2026-09-20T13:37:00.000Z",
      requirements: [{ actionKey: "SIGNATURE", mode: "REQUIRED", done: false, waived: true }],
    }, copy, time)
    expect(states(steps).signature).toBe("done")
  })

  it("does not blame an open visit for the result it has not reached", () => {
    const steps = visitRoadmap({
      status: "CHECKED_IN",
      checkInAt: "2026-09-20T13:37:00.000Z",
      tasks: [{ status: "PENDING" }, { status: "COMPLETED" }],
    }, copy, time)
    expect(states(steps)).toMatchObject({ result: "skipped", checkOut: "skipped", tasks: "missing" })
    expect(steps.find((step) => step.key === "checkOut")?.detail).toBe("визит ещё идёт")
    expect(steps.find((step) => step.key === "tasks")?.detail).toBe("1 из 2")
  })

  it("goes green on tasks only when every one of them is closed", () => {
    const both = visitRoadmap({
      status: "CHECKED_OUT",
      checkInAt: "2026-09-20T13:37:00.000Z",
      tasks: [{ status: "COMPLETED" }, { status: "COMPLETED" }],
    }, copy, time)
    expect(states(both).tasks).toBe("done")
  })

  it("counts progress over the steps that mattered", () => {
    const steps = visitRoadmap({
      status: "CHECKED_OUT",
      checkInAt: "2026-09-20T13:37:00.000Z",
      checkOutAt: "2026-09-20T14:16:00.000Z",
      photosCount: 3,
      presentationSessions: [{}],
      outcome: "SUCCESS",
      requirements: [{ actionKey: "PHOTO", mode: "REQUIRED", done: true, waived: false }],
    }, copy, time)
    // Arrival, presentation, photo, result, departure are evidence; signature
    // and tasks were never asked for, so they are not counted against it.
    expect(visitRoadmapProgress(steps)).toEqual({ done: 5, total: 5 })
  })

  it("shows a visit that recorded nothing as a road of red and pale", () => {
    const steps = visitRoadmap({ status: "CHECKED_OUT" }, copy, time)
    expect(states(steps)).toMatchObject({ checkIn: "missing", checkOut: "skipped" })
    expect(visitRoadmapProgress(steps).done).toBe(0)
  })
})
