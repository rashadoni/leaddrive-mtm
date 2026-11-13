import type { TFunction } from "i18next"
import { api } from "./api"
import { ask } from "./app-feedback"
import {
  JOINT_ANSWER_ALONE,
  JOINT_ANSWER_DISMISSED,
  cachedJointPlans,
  jointCheckInButtons,
  jointManagersForCheckIn,
  plannedManagersAt,
  type JointManager,
} from "./joint-visit"

const PREFETCH_FRESH_MS = 30_000
let prefetched: { at: number; managers: Promise<JointManager[]> } | null = null

/**
 * Starts asking who is in the field with the agent as the check-in press
 * begins, so the up-to-2.5 s wait runs alongside the GPS reading instead of
 * after it (owner 2026-11-13: «начать визит — секунд 6»). The question below
 * takes this answer when it is younger than half a minute.
 */
export function prefetchJointManagersForCheckIn(): void {
  prefetched = { at: Date.now(), managers: jointManagersForCheckIn(() => api.getJointVisitManagers()) }
}

/**
 * «Этот визит — вместе с руководителем?» at the agent's check-in, on the
 * route and for an unplanned visit alike (joint visit, owner 2026-10-20).
 * Asked while a manager is in the field with this agent, and — since
 * 2026-10-30 — at a stop a manager planned to visit with him, naming that
 * manager first. Only a «yes» lets the manager rate the visit; closing the
 * sheet starts no visit — the agent must choose.
 */
export async function askJointManagerForCheckIn(
  t: TFunction,
  stop?: { routePointId?: string | null; customerId: string },
): Promise<{ proceed: boolean; jointManagerId?: string }> {
  // The answer refreshes the cached plans too, so read them after it.
  const early = prefetched && Date.now() - prefetched.at < PREFETCH_FRESH_MS ? prefetched.managers : null
  prefetched = null
  const inField = await (early ?? jointManagersForCheckIn(() => api.getJointVisitManagers()))
  const planned = stop ? plannedManagersAt(await cachedJointPlans(), stop) : []
  const managers: JointManager[] = [...planned, ...inField.filter((manager) => !planned.some((row) => row.id === manager.id))]
  if (managers.length === 0) return { proceed: true }
  const names = managers.map((manager) => manager.name).join(", ")
  const answer = await ask<string>({
    title: t("jointVisit.askTitle"),
    message: planned.length > 0
      ? t("jointVisit.askPlannedBody", { name: planned.map((manager) => manager.name).join(", ") })
      : t("jointVisit.askBody", { name: names }),
    tone: "info",
    buttons: jointCheckInButtons(managers, t),
    dismissValue: JOINT_ANSWER_DISMISSED,
  })
  if (answer === JOINT_ANSWER_DISMISSED) return { proceed: false }
  return answer === JOINT_ANSWER_ALONE ? { proceed: true } : { proceed: true, jointManagerId: answer }
}
