import React from "react"
import { StatusBar, useWindowDimensions } from "react-native"
import { useIsFocused } from "@react-navigation/native"
import { shouldUseNavigationRail } from "../theme/layoutBreakpoints"

/**
 * Dark status bar icons for a screen whose top is light.
 *
 * The app sets `light-content` once, for the green headers. Since Android 15
 * draws apps edge-to-edge the status bar has no background of its own, so on
 * a light screen the clock and battery were white on white — measured on the
 * owner's phone 2026-09-13 on "Təqvim" and "Daha çox".
 *
 * Rendered only while the screen is focused: tab screens stay mounted, and a
 * mounted `StatusBar` keeps its props on the stack. Unmounting on blur hands
 * the bar back to the app-wide `light-content`.
 *
 * Not with the side rail: there the navigator paints a green band under the
 * whole status bar, and dark icons on it would be the same problem inverted.
 */
export default function LightScreenStatusBar() {
  const focused = useIsFocused()
  const { width, height } = useWindowDimensions()
  if (shouldUseNavigationRail(width, height)) return null
  return focused ? <StatusBar barStyle="dark-content" /> : null
}
