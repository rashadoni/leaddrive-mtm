import { api } from "./api"
import { initI18n } from "../i18n/index.android"
import { useWorkdayStore, workdayKey, type ActiveWorkday } from "../store/workday"
import { forgetTrackingResume, runTrackingUntilStopped, setTrackingWorkdayId } from "./location.android"

/**
 * Tracking that comes back by itself after the phone restarts or the app is
 * updated (owner 2026-09-29: two days without a point after his phone went
 * off and on again with the workday open).
 *
 * The native side starts the tracking service with this task on
 * BOOT_COMPLETED / MY_PACKAGE_REPLACED (FieldTrackingResume.kt). Nothing of
 * the app is loaded: the session, the language and the workday are read from
 * storage here, and the rule for tracking is the app's own
 * (runtime/AndroidApp.tsx) — an agent, signed in, with a confirmed workday
 * that is not on a break. Anything else ends the task, which stops the service.
 */
export function resumableWorkdayId(input: {
  loggedIn: boolean
  agent: { id?: string | null; organizationId?: string | null; role?: string | null } | null
  workday: ActiveWorkday | null
}): string | null {
  const { agent, workday } = input
  if (!input.loggedIn || agent?.role !== "AGENT" || !workday) return null
  if (workday.key !== workdayKey(agent.organizationId, agent.id)) return null
  if (workday.syncState !== "CONFIRMED" || workday.paused) return null
  return workday.workdayId
}

export async function resumeTrackingTask(): Promise<void> {
  let workdayId: string | null = null
  try {
    await api.init()
    await initI18n().catch(() => {})
    await useWorkdayStore.getState().hydrate()
    workdayId = resumableWorkdayId({
      loggedIn: await api.isLoggedIn(),
      agent: await api.getStoredAgent().catch(() => null),
      workday: useWorkdayStore.getState().activeWorkday,
    })
  } catch {
    workdayId = null
  }
  if (!workdayId) {
    forgetTrackingResume()
    return
  }
  setTrackingWorkdayId(workdayId)
  await runTrackingUntilStopped()
}
