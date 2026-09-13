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
  // The same bar height the navigator draws. This said 56 while the bar was
  // 63, so the last row of every tab sat seven points under it.
  return TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8) + 12
}

export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
