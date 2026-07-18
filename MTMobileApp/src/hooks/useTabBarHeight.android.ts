import { useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { isTabletWidth } from "../theme/layoutBreakpoints"

export function useTabBarPadding() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  if (isTabletWidth(width)) return 24 + insets.bottom
  return 56 + Math.max(insets.bottom, 8) + 12
}

export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
