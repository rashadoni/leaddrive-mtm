import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAuthStore } from "../../store/auth"
import { fieldTheme } from "../../theme/fieldTheme"

export default function UnsupportedRoleScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const logout = useAuthStore((state) => state.logout)

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, fieldTheme.space.xl) }]}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Icon name="lock-closed" size={30} color={fieldTheme.color.primaryStrong} />
        </View>
        <Text style={styles.title}>{t("unsupportedRole.title")}</Text>
        <Text style={styles.body}>{t("unsupportedRole.body")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("unsupportedRole.signOut")}
          onPress={() => logout().catch(() => {})}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{t("unsupportedRole.signOut")}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: fieldTheme.space.xl,
    backgroundColor: fieldTheme.color.canvas,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.xxl,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  icon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  title: {
    color: fieldTheme.color.ink,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: fieldTheme.color.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    marginTop: fieldTheme.space.sm,
    justifyContent: "center",
    paddingHorizontal: fieldTheme.space.xl,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primaryStrong,
  },
  buttonText: {
    color: fieldTheme.color.onColor,
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: { opacity: 0.8 },
})
