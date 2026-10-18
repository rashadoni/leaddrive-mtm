import React, { useCallback, useEffect, useRef } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import * as ReactNavigation from "@react-navigation/native"
import { guideTargetSpot, useGuideStore } from "../../store/guide"

/**
 * Screens rendered in tests without a navigator mock only useNavigation; the
 * spot then counts as on screen. In the app a hidden tab's spot stays silent,
 * so the bell of the tab in front is the one the guide points at.
 */
const useScreenFocused: () => boolean = typeof ReactNavigation.useIsFocused === "function"
  ? ReactNavigation.useIsFocused
  : () => true

let owners = 0

/**
 * Marks a real control for the first-run guide. Put it inside the control: it
 * covers it exactly (absolute, takes no room, lets every touch through) and,
 * only while the guide points at it, says where it stands on the screen.
 */
export default function GuideSpot({ id, style, anyScreen = false }: {
  id: string
  style?: StyleProp<ViewStyle>
  /**
   * For a control outside the screens: the tab bar puts every button in the
   * focus of its own tab, so the button of a tab not open yet — the one the
   * guide asks to press — would never count as on screen (SM-S918B,
   * 2026-10-18: «Təsdiqlər» was not found). The guide's own check of the
   * focused route keeps it to the right moment.
   */
  anyScreen?: boolean
}) {
  const ref = useRef<View>(null)
  const owner = useRef(0)
  if (owner.current === 0) owner.current = ++owners
  const focused = useScreenFocused()
  const targeted = useGuideStore((state) => guideTargetSpot(state) === id)
  const live = targeted && (anyScreen || focused)

  const measure = useCallback(() => {
    const node = ref.current
    console.warn("[guide-debug] measure", id, !!node, typeof node?.measureInWindow)
    if (!node || typeof node.measureInWindow !== "function") return
    node.measureInWindow((x, y, width, height) => {
      console.warn("[guide-debug] report", id, x, y, width, height)
      useGuideStore.getState().reportSpot(id, owner.current, { x, y, width, height })
    })
  }, [id])

  useEffect(() => {
    if (targeted) console.warn("[guide-debug] spot", id, "targeted", targeted, "focused", focused, "anyScreen", anyScreen, "live", live)
  }, [anyScreen, focused, id, live, targeted])

  useEffect(() => {
    if (!live) return
    // Again after a screen slides in and the list under it loads.
    measure()
    const timers = [120, 400, 900].map((delay) => setTimeout(measure, delay))
    const every = setInterval(measure, 1000)
    const self = owner.current
    return () => {
      timers.forEach(clearTimeout)
      clearInterval(every)
      useGuideStore.getState().dropSpot(id, self)
    }
  }, [id, live, measure])

  return (
    <View
      ref={ref}
      testID={`guide-spot-${id}`}
      collapsable={false}
      pointerEvents="none"
      onLayout={live ? measure : undefined}
      style={[StyleSheet.absoluteFill, style]}
    />
  )
}
