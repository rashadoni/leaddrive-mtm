import React, { useEffect, useRef } from "react"
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme, themed } from "../theme/fieldTheme"
import { dayStripHereIndex, dayStripStops } from "./day-line"

/**
 * An agent's day drawn as a parcel's way in a delivery app (owner,
 * 2026-11-01: «сделать красивее как на видео в инстаграме», mockup approved
 * with «Давай»): dotted road behind him, dashed road ahead, his marker on it
 * with a bubble saying what he is doing, a ribbon in the card's corner and
 * «started / left» under it. «light» stands on a white card (the manager's
 * «Komanda»), «dark» on the agent's own green card of the day.
 */
export type DayTrackTone = "light" | "dark"

export interface DayTrackMarker {
  icon: string
  /** The marker's fill and the bubble's. */
  color: string
  /** The icon and the bubble's text on that fill. */
  ink: string
  text: string
}

const DOTS = 24
const BUBBLE_WIDTH = 180
const BUBBLE_FRAME = {
  center: { left: (34 - BUBBLE_WIDTH) / 2, alignItems: "center" as const },
  "flex-start": { left: 0, alignItems: "flex-start" as const },
  "flex-end": { right: 0, alignItems: "flex-end" as const },
}

function Road({ done, tone }: { done: boolean; tone: DayTrackTone }) {
  const color = done
    ? tone === "dark" ? TRACK_COLORS.darkDone : fieldTheme.color.successFill
    : tone === "dark" ? TRACK_COLORS.darkAhead : fieldTheme.color.line
  // Android draws a dashed border only on a box with all four sides, so the
  // road is a row of dots clipped to the space between two stops.
  return (
    <View style={styles.road}>
      {Array.from({ length: DOTS }, (_, index) => (
        <View key={index} style={[done ? styles.dot : styles.dash, { backgroundColor: color }]} />
      ))}
    </View>
  )
}

function Marker({ marker, align }: { marker: DayTrackMarker; align: "center" | "flex-start" | "flex-end" }) {
  const lift = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (cancelled || still) return
        loop = Animated.loop(Animated.sequence([
          Animated.timing(lift, { toValue: -3, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(lift, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]))
        loop.start()
      })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [lift])
  return (
    <Animated.View testID="day-track-marker" style={[styles.markerBox, { alignItems: align, transform: [{ translateY: lift }] }]}>
      {/* A wide frame around the bubble: Android measures an absolute child
          within its parent, and the 34 dp marker cut the words to «в…»
          (phone, 3.11.66). */}
      <View pointerEvents="none" style={[styles.bubbleFrame, BUBBLE_FRAME[align]]}>
        <View style={[styles.bubble, { backgroundColor: marker.color }]}>
          <Text style={[styles.bubbleText, { color: marker.ink }]} numberOfLines={1}>{marker.text}</Text>
        </View>
      </View>
      <View style={[styles.bubbleTip, { backgroundColor: marker.color }, align === "flex-start" && styles.tipStart, align === "flex-end" && styles.tipEnd]} />
      <View style={[styles.marker, { backgroundColor: marker.color }]}>
        <Icon name={marker.icon} size={18} color={marker.ink} />
      </View>
    </Animated.View>
  )
}

export function DayTrack({
  visited,
  planned,
  marker,
  tone = "light",
  label,
}: {
  visited: number
  planned: number
  marker: DayTrackMarker | null
  tone?: DayTrackTone
  label: string
}) {
  const stops = dayStripStops(visited, planned)
  if (stops.length === 0) return null
  const at = marker ? dayStripHereIndex(stops) : null
  const align = at === 0 ? "flex-start" : at === stops.length ? "flex-end" : "center"
  return (
    <View style={[styles.track, marker ? styles.trackWithMarker : null]} accessible accessibilityLabel={[label, marker?.text].filter(Boolean).join(", ")} testID="day-track">
      {stops.map((state, index) => {
        const done = state === "done"
        return (
          <React.Fragment key={index}>
            {index > 0 ? <Road done={done} tone={tone} /> : null}
            {marker && at === index ? (
              <>
                <Marker marker={marker} align={align} />
                <Road done={false} tone={tone} />
              </>
            ) : null}
            {done ? (
              <View style={[styles.done, tone === "dark" && styles.doneDark]}>
                <Icon name="checkmark" size={12} color={tone === "dark" ? TRACK_COLORS.darkDoneInk : fieldTheme.color.onColor} />
              </View>
            ) : (
              <View style={[styles.ahead, tone === "dark" && styles.aheadDark]} />
            )}
          </React.Fragment>
        )
      })}
    </View>
  )
}

/** «НАЧАЛ 09:10 · first client» on the left, «ОСТАЛОСЬ …» on the right. */
export function DayTrackFooter({
  left,
  right,
  tone = "light",
}: {
  left: { label: string; value: string; sub?: string | null } | null
  right: { label: string; value: string; sub?: string | null } | null
  tone?: DayTrackTone
}) {
  if (!left && !right) return null
  const column = (side: typeof left, end: boolean) => side ? (
    <View style={[styles.footColumn, end && styles.footEnd]}>
      <Text style={[styles.footLabel, tone === "dark" && styles.footMutedDark]} numberOfLines={1}>{side.label}</Text>
      <Text style={[styles.footValue, tone === "dark" && styles.footValueDark, end && styles.textEnd]} numberOfLines={1}>{side.value}</Text>
      {side.sub ? <Text style={[styles.footSub, tone === "dark" && styles.footMutedDark, end && styles.textEnd]} numberOfLines={1}>{side.sub}</Text> : null}
    </View>
  ) : <View style={styles.footColumn} />
  return (
    <View style={[styles.foot, tone === "dark" && styles.footDark]}>
      {column(left, false)}
      {column(right, true)}
    </View>
  )
}

/** The status in the card's corner: «В ПУТИ», «НА ВИЗИТЕ», «ДЕНЬ ЗАКРЫТ». */
export function DayTrackRibbon({ text, color }: { text: string; color: string }) {
  return (
    <View pointerEvents="none" style={[styles.ribbon, { backgroundColor: color }]} testID="day-track-ribbon">
      <Text style={styles.ribbonText} numberOfLines={1}>{text}</Text>
    </View>
  )
}

/** Fixed colours of the green card of the day: the same in both palettes. */
export const TRACK_COLORS = {
  darkDone: "#9FE1CB",
  darkDoneInk: "#04342C",
  darkAhead: "rgba(255,255,255,0.45)",
  here: "#FAC775",
  hereInk: "#633806",
  ribbonInk: "#FFFFFF",
  /** Words on the green card: the number and names, and what stands beside them. */
  darkInk: "#FFFFFF",
  darkMuted: "rgba(255,255,255,0.75)",
} as const

const styles = themed(() => StyleSheet.create({
  track: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 4, minHeight: 24 },
  // Room for the bubble above the marker, only when there is one.
  trackWithMarker: { marginTop: 34, minHeight: 34 },
  road: { flex: 1, height: 3, marginHorizontal: 3, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  dash: { width: 6, height: 2, borderRadius: 1 },
  done: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.successFill },
  doneDark: { backgroundColor: TRACK_COLORS.darkDone },
  ahead: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: fieldTheme.color.line, backgroundColor: fieldTheme.color.surface },
  aheadDark: { borderColor: TRACK_COLORS.darkAhead, backgroundColor: "transparent" },
  markerBox: { width: 34, alignItems: "center" },
  marker: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bubbleFrame: { position: "absolute", bottom: 41, width: BUBBLE_WIDTH },
  bubble: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, maxWidth: BUBBLE_WIDTH },
  bubbleText: { fontSize: 11, fontWeight: "600" },
  bubbleTip: { position: "absolute", bottom: 37, width: 8, height: 8, transform: [{ rotate: "45deg" }] },
  tipStart: { left: 13 },
  tipEnd: { right: 13 },
  foot: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: fieldTheme.space.md,
    marginTop: fieldTheme.space.sm,
    paddingTop: fieldTheme.space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: fieldTheme.color.border,
  },
  footDark: { borderTopColor: "rgba(255,255,255,0.22)" },
  footColumn: { flex: 1, minWidth: 0 },
  footEnd: { alignItems: "flex-end" },
  footLabel: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  footValue: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "600", marginTop: 2 },
  footValueDark: { color: TRACK_COLORS.darkInk },
  footSub: { color: fieldTheme.color.inkMuted, fontSize: 11, marginTop: 1 },
  footMutedDark: { color: "rgba(255,255,255,0.68)" },
  textEnd: { textAlign: "right" },
  ribbon: { position: "absolute", top: 16, right: -36, width: 136, paddingVertical: 3, alignItems: "center", transform: [{ rotate: "38deg" }] },
  ribbonText: { color: TRACK_COLORS.ribbonInk, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
}))
