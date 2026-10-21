import { Appearance, AppState, NativeModules } from "react-native"
import { fieldColorSchemeOf, setFieldColorScheme } from "../theme/fieldTheme"

/**
 * The app follows the phone between day and night while it is open — at
 * once, in the middle of a workday, a visit or a half-typed field (owner,
 * 2026-10-20). Nothing restarts: `setFieldColorScheme` makes every screen draw
 * itself again in the new palette (theme/fieldTheme.ts).
 *
 * Two ways in. Android tells React Native of the switch, and Appearance
 * passes it on. On every return to the app the theme is also asked of
 * Android directly (FieldAppearanceModule.kt): Appearance answers from what
 * it heard last, so a switch it missed while the app was in the background
 * would otherwise stay missed until the next one.
 */

interface PhoneAppearance {
  appearance: Pick<typeof Appearance, "getColorScheme" | "addChangeListener">
  appState: Pick<typeof AppState, "addEventListener">
  /** FieldAppearanceModule.kt; absent where react-native is stubbed (tests). */
  android?: { colorScheme(): Promise<string> }
}

let started = false

export function followPhoneColorScheme(
  phone: PhoneAppearance = { appearance: Appearance, appState: AppState, android: NativeModules?.FieldAppearance },
): () => void {
  // Nothing to follow where react-native is stubbed without these (tests).
  if (started || !phone.appearance?.addChangeListener || !phone.appState?.addEventListener) return () => {}
  started = true

  const askAndroid = () => {
    if (!phone.android?.colorScheme) return
    phone.android.colorScheme().then((scheme) => setFieldColorScheme(fieldColorSchemeOf(scheme))).catch(() => {})
  }

  setFieldColorScheme(fieldColorSchemeOf(phone.appearance.getColorScheme()))
  askAndroid()
  const appearance = phone.appearance.addChangeListener(({ colorScheme }) => setFieldColorScheme(fieldColorSchemeOf(colorScheme)))
  const foreground = phone.appState.addEventListener("change", (state) => {
    if (state === "active") askAndroid()
  })

  return () => {
    started = false
    appearance.remove()
    foreground.remove()
  }
}
