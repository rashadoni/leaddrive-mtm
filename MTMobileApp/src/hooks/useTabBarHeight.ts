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
  // Plus a little breathing room, so the last row is not flush with the bar.
  return TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8) + 12
}

/** Returns safe area top inset for headers */
export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
