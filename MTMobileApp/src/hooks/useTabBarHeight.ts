import { useSafeAreaInsets } from "react-native-safe-area-context"
import { TAB_BAR_BASE_HEIGHT } from "../theme/tabBarMetrics"

/**
 * The bar's height is one number, because two copies of it drift: this file
 * said 56 while the navigator drew 60, so every screen's last row sat four
 * points under the bar. It is defined in `theme/tabBarMetrics.ts`, which has no
 * `.android` twin — see there for what happened when it was defined here.
 */
export { TAB_BAR_BASE_HEIGHT }

/** Returns the dynamic bottom padding needed to clear the tab bar + safe area */
export function useTabBarPadding() {
  const insets = useSafeAreaInsets()
  // The tab bar does not overlay screens: the navigator lays them out above
  // it (measured on the phone 2026-09-13 — screens end at y=1981, the bar
  // starts there). Reserving its height again left 63 dp of empty list
  // under every tab and pushed "Today" past one screen (audit B7).
  return Math.max(insets.bottom, 8) + 12
}

/** Returns safe area top inset for headers */
export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
