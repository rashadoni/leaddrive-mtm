import type { TFunction } from "i18next"
import { api } from "./api"
import { ask } from "./app-feedback"
import {
  JOINT_ANSWER_ALONE,
  JOINT_ANSWER_DISMISSED,
  jointCheckInButtons,
  jointManagersForCheckIn,
} from "./joint-visit"

/**
 * «Этот визит — вместе с руководителем?» at the agent's check-in, on the
 * route and for an unplanned visit alike (joint visit, owner 2026-10-20).
 * Asked only while a manager is in the field with this agent. Only a «yes»
 * lets the manager rate the visit; closing the sheet starts no visit — the
 * agent must choose.
 */
export async function askJointManagerForCheckIn(t: TFunction): Promise<{ proceed: boolean; jointManagerId?: string }> {
  const managers = await jointManagersForCheckIn(() => api.getJointVisitManagers())
  if (managers.length === 0) return { proceed: true }
  const answer = await ask<string>({
    title: t("jointVisit.askTitle"),
    message: t("jointVisit.askBody", { name: managers.map((manager) => manager.name).join(", ") }),
    tone: "info",
    buttons: jointCheckInButtons(managers, t),
    dismissValue: JOINT_ANSWER_DISMISSED,
  })
  if (answer === JOINT_ANSWER_DISMISSED) return { proceed: false }
  return answer === JOINT_ANSWER_ALONE ? { proceed: true } : { proceed: true, jointManagerId: answer }
}
