import { useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function useTabBarPadding() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  if (width >= 720) return 24 + insets.bottom
  return 56 + Math.max(insets.bottom, 8) + 12
}

export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
