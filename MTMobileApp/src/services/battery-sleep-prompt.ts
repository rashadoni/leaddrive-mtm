import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * Asking the agent to let the app stay awake.
 *
 * Android puts a stationary app to sleep and suspends its network. For a
 * field day that is the whole point of the app: the phone rests on a counter
 * while the agent talks to a doctor, and the route stops being recorded. The
 * outbox added afterwards means nothing is lost any more — the coordinates
 * simply arrive up to half an hour late, which is still enough to make a live
 * map lie about where someone is.
 *
 * The exemption is the agent's decision, so the rules here are about not
 * wearing out the asking: once a week at most, only while a workday is open
 * (the one moment the reason is visible), and never again once granted.
 */

export const BATTERY_PROMPT_KEY = "@mtm_battery_prompt_v1"

/** A refusal is respected for a week, not for ever: phones change hands. */
export const ASK_AGAIN_AFTER_DAYS = 7

export function shouldAskBatterySleepExemption(input: {
  exempt: boolean
  workdayActive: boolean
  lastAskedAt: number | null
  now: number
}): boolean {
  if (input.exempt) return false
  if (!input.workdayActive) return false
  if (input.lastAskedAt == null) return true
  const elapsedDays = (input.now - input.lastAskedAt) / (24 * 60 * 60 * 1_000)
  // A clock that jumped backwards must not turn into a prompt every morning.
  if (elapsedDays < 0) return false
  return elapsedDays >= ASK_AGAIN_AFTER_DAYS
}

export async function lastBatteryPromptAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(BATTERY_PROMPT_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function rememberBatteryPrompt(now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(BATTERY_PROMPT_KEY, String(now))
  } catch {}
}
