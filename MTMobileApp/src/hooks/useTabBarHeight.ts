import { useSafeAreaInsets } from "react-native-safe-area-context"

/**
 * The phone tab bar's height above the safe area. One number, because two
 * copies of it drift: this file said 56 while the navigator drew 60, so every
 * screen's last row sat four points under the bar. Raising the captions to
 * 12 px (audit B18) would have widened that gap to seven.
 */
export const TAB_BAR_BASE_HEIGHT = 63

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
