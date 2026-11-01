import React, { useCallback, useEffect, useMemo, useRef } from "react"
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import i18next from "i18next"
import {
  BLOCKS,
  FADE_OUT,
  HOLD_UNTIL,
  MAP_STEP_BACK,
  PINS,
  PULSE_PERIOD,
  PULSE_START,
  SPLASH_COLORS,
  STILL_HOLD,
  STREETS,
  TITLE,
  coverScene,
  routeLegs,
  segmentAngle,
  segmentLength,
  type SceneLine,
} from "./launch-splash-scene"

const PIN_SIZE = 30
const DASH = 6

/**
 * The animated opening (launch-splash-scene.ts says what it shows and when).
 * One clock drives the whole picture on the native thread; a tap skips it.
 * It lies over the app, which starts underneath meanwhile, so the splash adds
 * no waiting of its own beyond the animation.
 */
export default function LaunchSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions()
  const { scale, offsetX, offsetY } = coverScene(width, height)
  const clock = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const finished = useRef(false)

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    Animated.timing(fade, { toValue: 0, duration: FADE_OUT, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onDone())
  }, [fade, onDone])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (cancelled) return
        if (still) {
          clock.setValue(HOLD_UNTIL)
          timer = setTimeout(finish, STILL_HOLD)
          return
        }
        Animated.timing(clock, { toValue: HOLD_UNTIL, duration: HOLD_UNTIL, easing: Easing.linear, useNativeDriver: true }).start(({ finished: done }) => {
          if (done) finish()
        })
        Animated.sequence([
          Animated.delay(PULSE_START),
          Animated.loop(Animated.timing(pulse, { toValue: 1, duration: PULSE_PERIOD, easing: Easing.out(Easing.quad), useNativeDriver: true })),
        ]).start()
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      clock.stopAnimation()
      pulse.stopAnimation()
    }
  }, [clock, pulse, finish])

  const legs = useMemo(() => routeLegs(), [])
  const last = PINS[PINS.length - 1]
  const at = (x: number) => offsetX + x * scale
  const atY = (y: number) => offsetY + y * scale
  const between = (from: number, duration: number, output: number[], points?: number[]) =>
    clock.interpolate({
      inputRange: points ?? [from, from + duration],
      outputRange: output,
      extrapolate: "clamp",
    })

  const mapStyle = {
    opacity: between(MAP_STEP_BACK.delay, MAP_STEP_BACK.duration, [1, MAP_STEP_BACK.opacity]),
    transform: [
      { translateY: between(MAP_STEP_BACK.delay, MAP_STEP_BACK.duration, [0, MAP_STEP_BACK.lift * scale]) },
      { scale: between(MAP_STEP_BACK.delay, MAP_STEP_BACK.duration, [1, MAP_STEP_BACK.scale]) },
    ],
    transformOrigin: [at(135), atY(200), 0] as [number, number, number],
  }

  const line = (item: SceneLine, key: string, dashed: boolean) => {
    const length = segmentLength(item) * scale
    const thickness = Math.max(1, item.thickness * scale * (dashed ? 0.8 : 1))
    const frame = {
      position: "absolute" as const,
      left: at(item.from.x),
      top: atY(item.from.y) - thickness / 2,
      width: length,
      height: thickness,
      transformOrigin: [0, thickness / 2, 0] as [number, number, number],
    }
    if (!dashed) {
      return (
        <Animated.View
          key={key}
          style={[frame, {
            backgroundColor: item.color,
            borderRadius: thickness / 2,
            transform: [{ rotate: `${segmentAngle(item)}deg` }, { scaleX: between(item.delay, item.duration, [0.001, 1]) }],
          }]}
        />
      )
    }
    // A dashed leg slides out of its start pin: the dashes travel along the
    // road as it is drawn, as a route being laid.
    const dash = DASH * scale * 0.8
    const count = Math.ceil(length / (dash * 2)) + 1
    return (
      <View key={key} style={[frame, { overflow: "hidden", transform: [{ rotate: `${segmentAngle(item)}deg` }] }]}>
        <Animated.View style={{ flexDirection: "row", width: length, height: thickness, transform: [{ translateX: between(item.delay, item.duration, [-length, 0]) }] }}>
          {Array.from({ length: count }, (_, index) => (
            <View key={index} style={{ width: dash, height: thickness, marginRight: dash, backgroundColor: item.color, borderRadius: thickness / 2 }} />
          ))}
        </Animated.View>
      </View>
    )
  }

  const pinSize = PIN_SIZE * Math.min(scale, 1.6)
  const tagline = ready && i18next.isInitialized ? i18next.t("launchSplash.tagline") : ""

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} accessibilityLabel="LeadDrive Route Field">
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button" accessibilityHint={tagline || undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, mapStyle]} pointerEvents="none">
          {BLOCKS.map((block, index) => (
            <Animated.View
              key={`block-${index}`}
              style={{
                position: "absolute",
                left: at(block.x),
                top: atY(block.y),
                width: block.width * scale,
                height: block.height * scale,
                borderRadius: block.radius * scale,
                backgroundColor: block.color,
                opacity: between(block.delay, 800, [0, 1]),
                transform: block.rotate ? [{ rotate: `${block.rotate}deg` }] : [],
              }}
            />
          ))}
          {STREETS.map((street, index) => line(street, `street-${index}`, false))}
          {legs.map((leg, index) => line(leg, `leg-${index}`, true))}
          <Animated.View
            style={[styles.pulse, {
              left: at(last.x) - pinSize * 0.22,
              top: atY(last.y) - pinSize * 0.78,
              width: pinSize * 0.44,
              height: pinSize * 0.44,
              borderRadius: pinSize * 0.22,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 3.6] }) }],
            }]}
          />
          {PINS.map((pin, index) => (
            <Animated.View
              key={`pin-${index}`}
              style={{
                position: "absolute",
                left: at(pin.x) - pinSize / 2,
                top: atY(pin.y) - pinSize + pinSize * 0.08,
                opacity: between(pin.delay, 270, [0, 1]),
                transform: [{ translateY: between(pin.delay, 450, [-40 * scale, 4 * scale, 0], [pin.delay, pin.delay + 270, pin.delay + 450]) }],
              }}
            >
              <Icon name="location" size={pinSize} color={pin.color} />
            </Animated.View>
          ))}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[styles.title, {
            bottom: height * 0.18,
            opacity: between(TITLE.delay, TITLE.duration, [0, 1]),
            transform: [{ translateY: between(TITLE.delay, TITLE.duration, [10, 0]) }],
          }]}
        >
          <Text style={styles.name} allowFontScaling={false}>
            Lead<Text style={styles.nameAccent}>Drive</Text>
          </Text>
          <Text style={styles.product} allowFontScaling={false}>ROUTE FIELD</Text>
          {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_COLORS.ground, overflow: "hidden", zIndex: 1000, elevation: 1000 },
  pulse: { position: "absolute", borderWidth: 2, borderColor: SPLASH_COLORS.lastPin },
  title: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  name: { color: SPLASH_COLORS.title, fontSize: 34, fontWeight: "600", letterSpacing: -0.4 },
  nameAccent: { color: SPLASH_COLORS.lastPin },
  product: { color: SPLASH_COLORS.title, fontSize: 15, fontWeight: "500", letterSpacing: 3, marginTop: 2 },
  tagline: { color: SPLASH_COLORS.tagline, fontSize: 13, marginTop: 10, textAlign: "center" },
})
