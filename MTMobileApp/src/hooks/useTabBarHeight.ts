import { useSafeAreaInsets } from "react-native-safe-area-context"

/** Returns the dynamic bottom padding needed to clear the tab bar + safe area */
export function useTabBarPadding() {
  const insets = useSafeAreaInsets()
  // Tab bar height = 56 base + max(insets.bottom, 8) padding
  // Add 12px extra breathing room
  return 56 + Math.max(insets.bottom, 8) + 12
}

/** Returns safe area top inset for headers */
export function useHeaderTop() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.top, 20) + 10
}
