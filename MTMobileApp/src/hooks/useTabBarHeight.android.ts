import { useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { isTabletWidth } from "../theme/layoutBreakpoints"
import { TAB_BAR_BASE_HEIGHT } from "../theme/tabBarMetrics"

/**
 * This is the file Android actually loads for `hooks/useTabBarHeight`. It must
 * export everything the plain `.ts` file exports: an import that Jest resolves
 * there is `undefined` here, silently.
 */
export { TAB_BAR_BASE_HEIGHT }

export function useTabBarPadding() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  if (isTabletWidth(width)) return 24 + insets.bottom
  // The tab bar does not overlay screens: the navigator lays them out above
  // it (measured on the phone 2026-09-13 — screens end at y=1981, the bar
  // starts there). Reserving its height again left 63 dp of empty list
  // under every tab and pushed "Today" past one screen (audit B7).
  return Math.max(insets.bottom, 8) + 12
}

export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
