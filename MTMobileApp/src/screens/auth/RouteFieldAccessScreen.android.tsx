import React, { useCallback, useEffect, useRef, useState } from "react"
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
 * A single attempt may not hang for ever. Without this, one unresolved
 * promise froze the retry loop: the screen kept saying "the app keeps
 * checking" while nothing was being checked (21 September, owner's phone).
 */
const ATTEMPT_TIMEOUT_MS = 12_000

/** After a minute of failures the way out is offered again, quietly. */
const ATTEMPTS_BEFORE_ESCAPE = 4

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
  const [attempts, setAttempts] = useState(0)
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null)
  // A ref, not the state flag: a stuck attempt must not be able to wedge the
  // loop shut, and the loop must not depend on a re-render to unwedge it.
  const attemptRunning = useRef(false)
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
    void refresh()
    const timer = setInterval(() => { refresh().catch(() => {}) }, OFFLINE_RETRY_SECONDS * 1_000)
    return () => clearInterval(timer)
  }, [offline, refresh])

  const refresh = useCallback(async () => {
    if (attemptRunning.current) return
    attemptRunning.current = true
    setRefreshing(true)
    try {
      // Whichever finishes first: the answer, or the deadline. A request the
      // platform never settles must not cost the next attempt.
      await Promise.race([
        useBootstrapStore.getState().fetchBootstrap(),
        new Promise((resolve) => setTimeout(resolve, ATTEMPT_TIMEOUT_MS)),
      ])
    } finally {
      attemptRunning.current = false
      setRefreshing(false)
      setAttempts((value) => value + 1)
      setLastAttemptAt(Date.now())
    }
  }, [])

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
        {/* "It keeps checking" is a claim; this is the evidence for it. */}
        {offline && lastAttemptAt !== null ? (
          <Text style={styles.attempt}>
            {t("routeFieldAccess.offlineLastAttempt", {
              time: new Date(lastAttemptAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
            })}
          </Text>
        ) : null}
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
        {offline && attempts < ATTEMPTS_BEFORE_ESCAPE ? null : <Pressable
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
  attempt: { color: fieldTheme.color.inkMuted, fontSize: 12, textAlign: "center" },
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
