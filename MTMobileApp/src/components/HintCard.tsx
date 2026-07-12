import React from "react"
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from "react-native"
import { useHintsStore } from "../store/hints"

/**
 * Dismissible inline hint. Renders nothing when the hint was dismissed or
 * hints are disabled in Profile. Usage:
 *
 *   <HintCard id="route.pull" text={t("hints.routePull")} />
 */
export default function HintCard({ id, text, style }: { id: string; text: string; style?: ViewStyle }) {
  // Subscribe to the pieces that affect visibility so dismiss/toggle re-renders us.
  const enabled = useHintsStore((s) => s.enabled)
  const dismissed = useHintsStore((s) => s.dismissed)
  const hydrated = useHintsStore((s) => s.hydrated)
  const dismiss = useHintsStore((s) => s.dismiss)

  if (!hydrated || !enabled || dismissed.includes(id)) return null

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.bulb}>💡</Text>
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity
        onPress={() => dismiss(id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Close hint"
      >
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#6C63FF",
    gap: 8,
  },
  bulb: { fontSize: 14 },
  text: { flex: 1, color: "#3730a3", fontSize: 13, lineHeight: 18 },
  close: { color: "#6C63FF", fontSize: 14, fontWeight: "700", paddingHorizontal: 4 },
})
