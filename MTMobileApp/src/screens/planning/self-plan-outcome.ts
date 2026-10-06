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
