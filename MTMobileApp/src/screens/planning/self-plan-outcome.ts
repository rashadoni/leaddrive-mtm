/**
 * What the agent's own planner tells him after a save, and what it offers next.
 *
 * Tablet in the field, 2026-10-06. An agent whose routes the manager approves
 * built today's route and pressed «Marşrutu yadda saxla». The screen answered
 * «Marşrut yadda saxlanıldı», the only button went grey, and nothing said what
 * happens now. The route was on the server as a draft waiting for the manager;
 * the agent, reading «saved», went to the Route tab to start it and found
 * «no route today». The owner: «нет следующего шага».
 *
 * The agent still never chooses between «draft» and «publish» — the tenant and
 * his card decide that. But the two outcomes are different days for him: one
 * route he can start, the other he has to wait for. The planner must say which
 * one he got, and leave him a way forward.
 */

export type SelfPlanSaveMode = "draft" | "publish"

/**
 * - `published`: the route is live — it is on the Route tab now.
 * - `sent-for-approval`: stops were saved, and a manager has to approve them.
 * - `saved`: nothing is waiting on anyone — the agent emptied the day.
 */
export type SelfPlanSaveOutcome = "published" | "sent-for-approval" | "saved"

export function selfPlanSaveOutcome({
  mode,
  savedStopCounts,
  published,
}: {
  /** How this save was allowed to end, decided by the server's capabilities. */
  mode: SelfPlanSaveMode
  /** Stops in each day that was written, in the order the days were saved. */
  savedStopCounts: readonly number[]
  /** Routes the server confirmed as published during this save. */
  published: number
}): SelfPlanSaveOutcome {
  if (mode === "publish") return published > 0 ? "published" : "saved"
  return savedStopCounts.some((stops) => stops > 0) ? "sent-for-approval" : "saved"
}

/**
 * Whether the planner closes itself after a save.
 *
 * The owner, the same day, about the screen that stayed on the list of doctors
 * after «saved»: «что дальше происходит — так же останется?». It must not. A
 * route that is live or on its way to the manager leaves nothing to do in the
 * planner: the next step — start the route, or wait for it — is on the screen
 * the agent came from, so the planner says what happened and goes back there.
 * An emptied day is the exception: nothing was sent anywhere, and the agent is
 * most likely about to pick other stops.
 */
export function selfPlanLeavesAfterSave({
  outcome,
  canClose,
}: {
  outcome: SelfPlanSaveOutcome
  /** The planner was opened from somewhere it can go back to. */
  canClose: boolean
}): boolean {
  return canClose && outcome !== "saved"
}

/**
 * The one button under the planner. While there is something to save it saves;
 * once a save went through and nothing is left, it closes the planner instead
 * of standing there disabled. Any further change brings «save» back, because a
 * change clears the result the agent was shown.
 */
export function selfPlannerNextStep({
  savedShown,
  canSave,
  saving,
  canClose,
}: {
  /** The success of the last save is still on the screen. */
  savedShown: boolean
  canSave: boolean
  saving: boolean
  /** The planner was opened from somewhere it can go back to. */
  canClose: boolean
}): "save" | "done" {
  return savedShown && !canSave && !saving && canClose ? "done" : "save"
}

/**
 * Whether the planner closes after a change to a published route went through.
 *
 * 7 October 2026, owner's phone: «Planı dəyiş» on the Route tab, one more
 * client added, the change sent. The server took it; the planner stayed where
 * it was, with the day's clients greyed out, «Saxlanacaq qaralama yoxdur» and
 * a disabled «Marşrutu yadda saxla» — «и так осталось». The first save of a
 * route had been taught to lead on the day before; changing a published one
 * had not.
 *
 * The agent came here from his route to change it. Once it is changed there is
 * nothing left for him in the planner, so it says so and goes back. A manager's
 * planner, and one with nowhere to go back to, stays: more days are waiting.
 */
export function selfPlanLeavesAfterPublishedEdit({
  selfPlanning,
  canClose,
}: {
  /** The agent's own planner, as opposed to the manager's. */
  selfPlanning: boolean
  /** The planner was opened from somewhere it can go back to. */
  canClose: boolean
}): boolean {
  return selfPlanning && canClose
}

