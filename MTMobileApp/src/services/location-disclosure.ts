import { ask } from "./app-feedback"

/**
 * What the app says before Android asks for location.
 *
 * The tracking service records the route while a workday is open, also with
 * the app closed (FieldTrackingResume.kt even brings it back after a restart).
 * Google Play then requires a «prominent disclosure» in the app's normal flow,
 * shown immediately before the system sheet: that location is collected, for
 * which features, that it happens even when the app is closed or not in use,
 * and how it is used — the agent agreeing with a button of the app
 * (support.google.com/googleplay/android-developer/answer/9799150). Until
 * 2026-10-18 «Начать день» went straight to Android's sheet.
 *
 * «Не сейчас», the back button, a tap outside and a logout all keep the
 * system sheet closed. No React and no React Native here, so the rule is
 * unit-tested on the real feedback store.
 */

type Translate = (key: string) => string

export const LOCATION_DISCLOSURE_KEYS = {
  title: "locationDisclosure.title",
  body: "locationDisclosure.body",
  accept: "locationDisclosure.continue",
  decline: "locationDisclosure.notNow",
} as const

let open: Promise<boolean> | null = null

/** True only for «Продолжить». */
export function askLocationDisclosure(t: Translate): Promise<boolean> {
  // The workday's GPS and a check-in asking at the same moment share one
  // sheet and one answer, instead of the agent reading it twice.
  if (open) return open
  const pending = ask({
    title: t(LOCATION_DISCLOSURE_KEYS.title),
    message: t(LOCATION_DISCLOSURE_KEYS.body),
    tone: "info",
    buttons: [
      { text: t(LOCATION_DISCLOSURE_KEYS.decline), value: false, style: "cancel" },
      { text: t(LOCATION_DISCLOSURE_KEYS.accept), value: true },
    ],
    dismissValue: false,
  }).finally(() => {
    if (open === pending) open = null
  })
  open = pending
  return pending
}

/** A grant already given asks nothing; otherwise the disclosure, then Android's sheet. */
export async function requestLocationAfterDisclosure(input: {
  t: Translate
  granted: () => Promise<boolean>
  request: () => Promise<boolean>
}): Promise<boolean> {
  if (await input.granted()) return true
  if (!(await askLocationDisclosure(input.t))) return false
  return input.request()
}
