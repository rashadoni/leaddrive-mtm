import React, { useEffect, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Platform,
} from "react-native"

interface ConfirmSheetProps {
  visible: boolean
  icon?: string
  iconColor?: string
  title: string
  message: string
  cancelText?: string
  confirmText?: string
  confirmColor?: string
  destructive?: boolean
  /** Informational sheets have a single button; the backdrop still dismisses. */
  hideCancel?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmSheet({
  visible,
  icon,
  iconColor = "#6C63FF",
  title,
  message,
  cancelText = "Cancel",
  confirmText = "Confirm",
  confirmColor,
  destructive = false,
  hideCancel = false,
  onCancel,
  onConfirm,
}: ConfirmSheetProps) {
  const slideAnim = useRef(new Animated.Value(400)).current
  const backdropAnim = useRef(new Animated.Value(0)).current

  const btnColor = confirmColor || (destructive ? "#ef4444" : "#6C63FF")

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onCancel} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
            <Text style={[styles.iconText, { color: iconColor }]}>{icon}</Text>
          </View>
        )}

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.actions}>
          {hideCancel ? null : (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: btnColor }]}
            onPress={onConfirm}
          >
            <Text style={styles.confirmText}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    marginTop: 12,
    marginBottom: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  iconText: { fontSize: 28 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0B0B1E",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: "#64748b" },
  confirmBtn: {
    flex: 1.5,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  confirmText: { fontSize: 15, fontWeight: "700", color: "#fff" },
})
