/**
 * The visit as a road: arrival, what was done at the customer, departure.
 *
 * The summary screen used to answer "did the agent do everything?" only by
 * reading: four facts in one card, a result card, a task card, a presentation
 * card, each in its own words. The owner asked for checkpoints — one glance,
 * green for done and red for a missed step.
 *
 * Three states, because two would lie. `done` is evidence: a time, a file
 * opened, a photo, a signature. `missing` is a step the visit policy required
 * and nobody did — that one is red. `skipped` is a step this visit never
 * asked for; painting it red would tell the agent they failed something that
 * was never on their road.
 */

export type VisitStepState = "done" | "missing" | "skipped"

export interface VisitRoadmapStep {
  key: string
  icon: string
  state: VisitStepState
  /** Filled in by the screen from its own copy table. */
  title: string
  detail?: string
}

export interface VisitRoadmapInput {
  status?: string
  checkInAt?: string
  checkOutAt?: string
  duration?: number
  outcome?: string
  resultNotes?: string
  notes?: string
  photosCount?: number
  presentationSessions?: Array<unknown>
  tasks?: Array<{ status?: string }>
  requirements?: Array<{ actionKey: string; mode: string; done: boolean; waived: boolean }>
}

export interface VisitRoadmapCopy {
  checkIn: string
  presentation: string
  photo: string
  signature: string
  tasks: string
  result: string
  checkOut: string
  visitOpen: string
  notRequired: string
  required: string
  photoCount: (count: number) => string
  presentationCount: (count: number) => string
  taskCount: (done: number, total: number) => string
}

function requirement(input: VisitRoadmapInput, actionKey: string) {
  return input.requirements?.find((item) => item.actionKey === actionKey) ?? null
}

function isRequired(input: VisitRoadmapInput, actionKey: string): boolean {
  return requirement(input, actionKey)?.mode === "REQUIRED"
}

function stateFor(done: boolean, required: boolean): VisitStepState {
  if (done) return "done"
  return required ? "missing" : "skipped"
}

/**
 * `waived` counts as done on purpose: a supervisor who waived the signature
 * decided the step was not needed here, and the agent should not carry a red
 * mark for someone else's decision.
 */
function requirementDone(input: VisitRoadmapInput, actionKey: string): boolean {
  const found = requirement(input, actionKey)
  return Boolean(found?.done || found?.waived)
}

export function visitRoadmap(input: VisitRoadmapInput, copy: VisitRoadmapCopy, formatTime: (value?: string) => string): VisitRoadmapStep[] {
  const presentations = input.presentationSessions?.length ?? 0
  const photos = Math.max(0, input.photosCount ?? 0)
  const tasks = input.tasks ?? []
  const tasksDone = tasks.filter((task) => task.status === "COMPLETED").length
  const signatureDone = requirementDone(input, "SIGNATURE")
  const hasResult = Boolean(input.outcome || input.resultNotes || input.notes)
  const open = input.status === "CHECKED_IN"

  const steps: VisitRoadmapStep[] = [
    {
      key: "checkIn",
      icon: "log-in-outline",
      title: copy.checkIn,
      state: input.checkInAt ? "done" : "missing",
      detail: input.checkInAt ? formatTime(input.checkInAt) : undefined,
    },
    {
      key: "presentation",
      icon: "easel-outline",
      title: copy.presentation,
      state: stateFor(presentations > 0, isRequired(input, "PRESENTATION")),
      detail: presentations > 0 ? copy.presentationCount(presentations) : undefined,
    },
    {
      key: "photo",
      icon: "camera-outline",
      title: copy.photo,
      state: stateFor(photos > 0, isRequired(input, "PHOTO")),
      detail: photos > 0 ? copy.photoCount(photos) : undefined,
    },
    {
      key: "signature",
      icon: "create-outline",
      title: copy.signature,
      state: stateFor(signatureDone, isRequired(input, "SIGNATURE")),
    },
    {
      key: "tasks",
      icon: "checkbox-outline",
      title: copy.tasks,
      state: tasks.length === 0 ? "skipped" : stateFor(tasksDone === tasks.length, true),
      detail: tasks.length > 0 ? copy.taskCount(tasksDone, tasks.length) : undefined,
    },
    {
      key: "result",
      icon: "flag-outline",
      title: copy.result,
      // An open visit has not reached the result yet: that is the road ahead,
      // not a step the agent skipped.
      state: hasResult ? "done" : open ? "skipped" : stateFor(false, isRequired(input, "VISIT_NOTE")),
    },
    {
      key: "checkOut",
      icon: "log-out-outline",
      title: copy.checkOut,
      state: input.checkOutAt ? "done" : "skipped",
      detail: input.checkOutAt
        ? formatTime(input.checkOutAt)
        : open
          ? copy.visitOpen
          : undefined,
    },
  ]

  return steps.map((step) => ({
    ...step,
    detail: step.detail ?? (step.state === "skipped" ? copy.notRequired : step.state === "missing" ? copy.required : undefined),
  }))
}

/** How many of the steps that mattered are behind the agent. */
export function visitRoadmapProgress(steps: VisitRoadmapStep[]): { done: number; total: number } {
  const counted = steps.filter((step) => step.state !== "skipped")
  return { done: counted.filter((step) => step.state === "done").length, total: counted.length }
}
