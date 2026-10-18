import type { FieldColorScheme } from "../theme/fieldTheme"

/**
 * The phone switched between day and night while the app is open.
 *
 * The colours of a run are fixed when its JS starts (theme/fieldTheme.ts), so
 * taking the new theme means starting the JS again. That is what a reload
 * costs, and when it must wait:
 *
 *  - an open workday: the GPS of the day is recorded by a JS task, and a
 *    reload in the evening, when phones turn dark by themselves, would cut
 *    the agent's track. The new theme waits for the next start of the app;
 *  - the keyboard is up: something is being typed. It waits until the
 *    keyboard goes down.
 *
 * Otherwise — a manager's phone, an agent before or after the day — the app
 * restarts at once, signed in as before, in the phone's new colours.
 */
export type ColorSchemeReload = "none" | "reload" | "wait"

export function colorSchemeReloadDecision(input: {
  started: FieldColorScheme
  current: FieldColorScheme
  workdayOpen: boolean
  keyboardOpen: boolean
}): ColorSchemeReload {
  if (input.current === input.started) return "none"
  if (input.workdayOpen || input.keyboardOpen) return "wait"
  return "reload"
}
