import React, { useEffect, useRef } from "react"
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native"
import { fieldTheme, themed } from "../theme/fieldTheme"
import { dayRingClock, dayRingMinutes, dayRingParts, type DayRingKey, type DayRingT, type DayTime } from "./day-ring"

/**
 * The «ring of the day» (owner, 2026-11-02, variant «C. Кольцо дня»): the
 * ring fills clockwise from the top — clients, the way, the break — with the
 * day's length in the middle and the minutes beside it.
 *
 * The app has no drawing library, so each arc is two half-rings clipped to
 * the two halves of the ring and turned into view: Android draws a ring's
 * border two sides at a time, and two coloured sides of a round box are
 * exactly half of it. One clock turns every arc on the native thread.
 */
export type DayRingTone = "light" | "dark"

export const DAY_RING_COLORS: Record<DayRingTone, Record<DayRingKey, string> & { track: string; ink: string; muted: string }> = {
  light: { visits: "#E9B44C", travel: "#1C7A50", break: "#C9D6CF", track: "#EEF3F0", ink: "#13231F", muted: "#5E7069" },
  dark: { visits: "#F2C66D", travel: "#9FE1CB", break: "rgba(255,255,255,0.38)", track: "rgba(255,255,255,0.14)", ink: "#FFFFFF", muted: "rgba(255,255,255,0.72)" },
}

function HalfRing({ size, stroke, color, side, turn, shown }: {
  size: number
  stroke: number
  color: string
  side: "right" | "left"
  turn: ReturnType<Animated.Value["interpolate"]>
  /** Hidden until the sweep reaches it: a parked half-ring left a hairline at the clip's edge. */
  shown: ReturnType<Animated.Value["interpolate"]>
}) {
  const half = size / 2
  // Right half: a half-ring parked over the left half (hidden by the clip)
  // turns clockwise into view. Left half: the same, parked over the right.
  const ring = side === "right"
    ? { borderBottomColor: color, borderLeftColor: color }
    : { borderTopColor: color, borderRightColor: color }
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: side === "right" ? half : 0, width: half, height: size, overflow: "hidden", opacity: shown }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: side === "right" ? -half : 0,
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: "transparent",
          ...ring,
          transform: [{ rotate: "45deg" }, { rotate: turn }],
        }}
      />
    </Animated.View>
  )
}

/** An arc from the top, clockwise, to `end` (0..1), shown as far as the clock has swept. */
function Arc({ size, stroke, color, end, sweep }: { size: number; stroke: number; color: string; end: number; sweep: Animated.Value }) {
  const right = Math.min(end, 0.5)
  const left = Math.max(0, end - 0.5)
  return (
    <>
      {right > 0 ? (
        <HalfRing size={size} stroke={stroke} color={color} side="right"
          turn={sweep.interpolate({ inputRange: [0, right], outputRange: ["0deg", `${right * 360}deg`], extrapolate: "clamp" })}
          shown={sweep.interpolate({ inputRange: [0, 0.004], outputRange: [0, 1], extrapolate: "clamp" })} />
      ) : null}
      {left > 0 ? (
        <HalfRing size={size} stroke={stroke} color={color} side="left"
          turn={sweep.interpolate({ inputRange: [0.5, end], outputRange: ["0deg", `${left * 360}deg`], extrapolate: "clamp" })}
          shown={sweep.interpolate({ inputRange: [0.5, 0.504], outputRange: [0, 1], extrapolate: "clamp" })} />
      ) : null}
    </>
  )
}

export function DayRing({
  day,
  tone = "light",
  sinceLabel,
  t,
  size = 92,
  stroke = 9,
}: {
  day: DayTime
  tone?: DayRingTone
  /** «с 09:10» under the length of the day. */
  sinceLabel: string
  t: DayRingT
  size?: number
  stroke?: number
}) {
  const colors = DAY_RING_COLORS[tone]
  const parts = dayRingParts(day)
  const sweep = useRef(new Animated.Value(0)).current
  const legend = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (cancelled) return
        if (still) {
          sweep.setValue(1)
          legend.setValue(1)
          return
        }
        Animated.parallel([
          Animated.timing(sweep, { toValue: 1, duration: 1100, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(legend, { toValue: 1, duration: 450, delay: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start()
      })
    return () => {
      cancelled = true
      sweep.stopAnimation()
      legend.stopAnimation()
    }
  }, [sweep, legend])

  const label = parts.map((part) => `${t(`dayRing.${part.key}`)} ${dayRingMinutes(part.minutes, t)}`).join(", ")
  return (
    <View style={styles.row} testID="day-ring" accessible accessibilityLabel={`${dayRingMinutes(day.totalMinutes, t)}. ${label}`}>
      <View style={{ width: size, height: size }}>
        <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: colors.track }} />
        {/* Widest first: each arc lies over the one that ends after it. */}
        {[...parts].reverse().map((part) => (
          <Arc key={part.key} size={size} stroke={stroke} color={colors[part.key]} end={part.end} sweep={sweep} />
        ))}
        {/* A hair of the card's ground between two parts. */}
        {parts.slice(0, -1).map((part) => (
          <Animated.View
            key={`gap-${part.key}`}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {
              alignItems: "center",
              opacity: sweep.interpolate({ inputRange: [part.end, Math.min(1, part.end + 0.02)], outputRange: [0, 1], extrapolate: "clamp" }),
              transform: [{ rotate: `${part.end * 360}deg` }],
            }]}
          >
            <View style={{ width: 3, height: stroke + 2, marginTop: -1, backgroundColor: tone === "dark" ? fieldTheme.color.primaryStrong : fieldTheme.color.surface }} />
          </Animated.View>
        ))}
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.clock, { color: colors.ink }]} allowFontScaling={false}>{dayRingClock(day.totalMinutes)}</Text>
          <Text style={[styles.since, { color: colors.muted }]} numberOfLines={1} allowFontScaling={false}>{sinceLabel}</Text>
        </View>
      </View>
      <Animated.View style={[styles.legend, { opacity: legend, transform: [{ translateY: legend.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
        {parts.map((part) => (
          <View key={part.key} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: colors[part.key] }]} />
            <Text style={[styles.legendLabel, { color: colors.muted }]} numberOfLines={1}>{String(t(`dayRing.${part.key}`))}</Text>
            <Text style={[styles.legendValue, { color: colors.ink }]}>{dayRingMinutes(part.minutes, t)}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.lg },
  center: { alignItems: "center", justifyContent: "center" },
  clock: { fontSize: 17, fontWeight: "700" },
  since: { fontSize: 10.5, marginTop: 1, maxWidth: 70 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, fontSize: 12.5 },
  legendValue: { fontSize: 12.5, fontWeight: "600" },
}))
