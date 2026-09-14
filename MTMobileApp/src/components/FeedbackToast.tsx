import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme } from "../theme/fieldTheme"
import type { FeedbackTone } from "../services/app-feedback"
import { FEEDBACK_TONE_COLORS } from "./feedback-tone"

interface FeedbackToastProps {
  visible: boolean
  type: FeedbackTone
  title: string
  message?: string
  duration?: number
  onDismiss: () => void
}

/**
 * A screen-owned toast, left on the screens not yet moved to `notify()` from
 * `services/app-feedback`: tasks, task detail, contact detail and the manager
 * workspace (the visit screen moved on 2026-09-14). It wore Tailwind's green,
 * red, amber and blue with a slate body — nothing else in the field app does —
 * and sat at a fixed 40 dp from the top, under the status bar on a phone with
 * a cutout. Colours now come from the same tone table as the app-wide notice,
 * so those four screens look different on the device from that day.
 */
export default function FeedbackToast({
  visible,
  type,
  title,
  message,
  duration = 2500,
  onDismiss,
}: FeedbackToastProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(-120)).current
  const opacity = useRef(new Animated.Value(0)).current
  const tone = FEEDBACK_TONE_COLORS[type]

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => onDismiss())
      }, duration)

      return () => clearTimeout(timer)
    } else {
      translateY.setValue(-120)
      opacity.setValue(0)
    }
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          top: insets.top + fieldTheme.space.md,
          left: insets.left + fieldTheme.space.lg,
          right: insets.right + fieldTheme.space.lg,
          backgroundColor: tone.background,
          borderColor: tone.border,
          borderLeftColor: tone.accent,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Icon name={tone.icon} size={26} color={tone.accent} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderLeftWidth: 5,
    gap: fieldTheme.space.md,
    zIndex: 9999,
    elevation: 10,
    shadowColor: fieldTheme.color.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  textWrap: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: "800", color: fieldTheme.color.ink },
  message: { fontSize: 15, lineHeight: 20, color: fieldTheme.color.ink },
})
