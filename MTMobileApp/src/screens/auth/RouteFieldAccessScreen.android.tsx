import React, { useEffect, useState } from "react"
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RouteFieldAccess } from "../../services/bootstrap"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { fieldTheme } from "../../theme/fieldTheme"

type BlockedAccess = Exclude<RouteFieldAccess, "enabled" | "legacy">

function copyKey(access: BlockedAccess): "checking" | "disabled" | "unavailable" | "offline" {
  if (access === "pending") return "checking"
  if (access === "disabled") return "disabled"
  if (access === "offline") return "offline"
  return "unavailable"
}

/** Seconds between automatic retries while the server is simply not there. */
const OFFLINE_RETRY_SECONDS = 15

/**
 * Route Field is a separately admitted product shell. This screen is rendered
 * before field tabs for an HRM-only tenant, a revoked route entitlement, or a
 * malformed/unreachable capability manifest; it never falls back to a role.
 */
export default function RouteFieldAccessScreen({ access }: { access: BlockedAccess }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const logout = useAuthStore((state) => state.logout)
  const [refreshing, setRefreshing] = useState(false)
  const key = copyKey(access)
  const checking = access === "pending" || refreshing
  const offline = access === "offline"

  /**
   * While the server is unreachable the screen retries on its own. The agent
   * is standing in front of a customer; nursing an app back to life is not
   * their job, and the old screen only moved when tapped.
   */
  useEffect(() => {
    if (!offline) return
    const timer = setInterval(() => { refresh().catch(() => {}) }, OFFLINE_RETRY_SECONDS * 1_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline])

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await useBootstrapStore.getState().fetchBootstrap()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, fieldTheme.space.xl) }]}>
      {/* A light screen: the app-wide light-content icons were white on it
          (clock on the Redmi Pad SE, 2026-09-14). Not a tab, so no focus
          juggling: the bar returns to light-content when this unmounts. */}
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <View style={styles.icon}>
          {checking
            ? <ActivityIndicator color={fieldTheme.color.primaryStrong} />
            : <Icon name="lock-closed" size={30} color={fieldTheme.color.primaryStrong} />}
        </View>
        <Text style={styles.title}>{t(`routeFieldAccess.${key}Title`)}</Text>
        <Text style={styles.body}>{t(`routeFieldAccess.${key}Body`)}</Text>
        {access !== "pending" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("routeFieldAccess.refresh")}
            disabled={refreshing}
            onPress={() => { refresh().catch(() => {}) }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, refreshing && styles.disabled]}
          >
            <Text style={styles.buttonText}>{t("routeFieldAccess.refresh")}</Text>
          </Pressable>
        ) : null}
        {/* No sign-out while the server is merely unreachable: signing out
            mid-shift is the one action that actually loses the session, and
            it fixes nothing that a returning network will not fix. */}
        {offline ? null : <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("routeFieldAccess.signOut")}
          onPress={() => logout().catch(() => {})}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{t("routeFieldAccess.signOut")}</Text>
        </Pressable>}
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
  secondaryButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.pill,
  },
  secondaryButtonText: {
    color: fieldTheme.color.primaryStrong,
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
})
