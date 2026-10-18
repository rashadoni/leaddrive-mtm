import { Appearance, AppState, Keyboard, NativeModules } from "react-native"
import { fieldColorScheme, fieldColorSchemeOf } from "../theme/fieldTheme"
import { useWorkdayStore } from "../store/workday"
import { colorSchemeReloadDecision } from "./color-scheme-reload-decision"

/** The watch itself; when a restart may happen is decided in color-scheme-reload-decision.ts. */

interface FieldAppearanceNativeModule {
  reload(): void
}

let started = false

export function startColorSchemeReload(): () => void {
  if (started) return () => {}
  started = true
  const native = NativeModules.FieldAppearance as FieldAppearanceNativeModule | undefined
  let reloading = false

  const check = () => {
    if (reloading) return
    const decision = colorSchemeReloadDecision({
      started: fieldColorScheme,
      current: fieldColorSchemeOf(Appearance.getColorScheme()),
      workdayOpen: useWorkdayStore.getState().activeWorkday !== null,
      keyboardOpen: Keyboard.isVisible(),
    })
    if (decision !== "reload" || !native?.reload) return
    reloading = true
    native.reload()
  }

  const appearance = Appearance.addChangeListener(check)
  const foreground = AppState.addEventListener("change", (state) => { if (state === "active") check() })
  // Not on the close of a workday: the confirmation of the close and its sync
  // would vanish under the restart. The next return to the app takes it.
  const keyboard = Keyboard.addListener("keyboardDidHide", check)

  return () => {
    started = false
    appearance.remove()
    foreground.remove()
    keyboard.remove()
  }
}
