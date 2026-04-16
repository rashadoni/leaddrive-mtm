import React, { useEffect, useRef } from "react"
import { View, Text, StyleSheet, Animated, Platform } from "react-native"

type ToastType = "success" | "error" | "warning" | "info"

interface FeedbackToastProps {
  visible: boolean
  type: ToastType
  title: string
  message?: string
  duration?: number
  onDismiss: () => void
}

const CONFIG: Record<ToastType, { bg: string; border: string; icon: string; color: string }> = {
  success: { bg: "#f0fdf4", border: "#86efac", icon: "checkmark-circle", color: "#22c55e" },
  error: { bg: "#fef2f2", border: "#fca5a5", icon: "close-circle", color: "#ef4444" },
  warning: { bg: "#fffbeb", border: "#fcd34d", icon: "warning", color: "#f59e0b" },
  info: { bg: "#eff6ff", border: "#93c5fd", icon: "information-circle", color: "#3b82f6" },
}

const ICONS: Record<string, string> = {
  "checkmark-circle": "\u2713",
  "close-circle": "\u2717",
  "warning": "!",
  "information-circle": "i",
}

export default function FeedbackToast({
  visible,
  type,
  title,
  message,
  duration = 2500,
  onDismiss,
}: FeedbackToastProps) {
  const translateY = useRef(new Animated.Value(-120)).current
  const opacity = useRef(new Animated.Value(0)).current
  const cfg = CONFIG[type]

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
      style={[
        styles.container,
        { backgroundColor: cfg.bg, borderColor: cfg.border, transform: [{ translateY }], opacity },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: cfg.color }]}>
        <Text style={styles.iconText}>{ICONS[cfg.icon]}</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: cfg.color }]}>{title}</Text>
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700" },
  message: { fontSize: 12, color: "#64748b", marginTop: 2 },
})
