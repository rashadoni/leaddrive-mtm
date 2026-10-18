import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { formatLocalizedDate } from "../lib/format-localized-date"
import { staleVisitDayDate } from "../services/stale-visit"
import { companyClock } from "../services/stale-workday"
import { fieldTheme } from "../theme/fieldTheme"

/**
 * «Bu gün» for a workday left open since an earlier day (`stale-workday.ts`).
 *
 * - `request`: the finish time can be asked for — «Указать время ухода» first,
 *   «Закрыть сейчас» beside it for whoever really means "now".
 * - `sent`: the finish time is with the manager; the only way on is to look at
 *   the request. Closing now would change the day under the request, and the
 *   server would then refuse to approve it.
 * - `closeOnly`: this company takes no requests from the phone, so «Закрыть
 *   сейчас» is the one action, and the card says so before it is pressed.
 *
 * «Fasilə» is not offered: a break inside a day that ended days ago means nothing.
 */
export type StaleWorkdayCardMode = "request" | "sent" | "closeOnly"

export default function StaleWorkdayCard({
  day,
  startedAt,
  timezone,
  mode,
  busy,
  error,
  onSetFinish,
  onOpenRequest,
  onCloseNow,
}: {
  day: string
  startedAt: string
  timezone?: string | null
  mode: StaleWorkdayCardMode
  busy: boolean
  error: string | null
  onSetFinish: () => void
  onOpenRequest: () => void
  onCloseNow: () => void
}) {
  const { t, i18n } = useTranslation()
  const date = formatLocalizedDate(staleVisitDayDate(day), i18n.language, { day: "numeric", month: "long" })
  const time = companyClock(new Date(startedAt), timezone)
  const body = mode === "sent"
    ? t("todayV2.staleDaySent")
    : t(mode === "request" ? "todayV2.staleDayBody" : "todayV2.staleDayBodyNoRequest", { date, time })

  const button = (testID: string, label: string, onPress: () => void, primary: boolean) => (
    <Pressable
      key={testID}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonOutline,
        pressed && styles.pressed,
        busy && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, primary ? styles.buttonTextPrimary : styles.buttonTextOutline]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  )

  return (
    <View testID="today-stale-workday" style={styles.panel}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Icon name="alert-circle" size={22} color={fieldTheme.color.danger} />
          <Text style={styles.title}>{t("todayV2.staleDayTitle", { date })}</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.actions}>
        {mode === "request" ? [
          button("today-stale-set-finish", t("todayV2.staleSetFinish"), onSetFinish, true),
          button("today-stale-close-now", t("todayV2.staleEndNow"), onCloseNow, false),
        ] : mode === "sent"
          ? button("today-stale-open-request", t("todayV2.staleOpenRequest"), onOpenRequest, false)
          : button("today-stale-close-now", t("todayV2.staleEndNow"), onCloseNow, true)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    padding: fieldTheme.space.lg,
    gap: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.danger,
    backgroundColor: fieldTheme.color.dangerSoft,
  },
  copy: {
    gap: fieldTheme.space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  title: {
    flex: 1,
    color: fieldTheme.color.danger,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  body: {
    color: fieldTheme.color.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  error: {
    color: fieldTheme.color.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: fieldTheme.space.sm,
  },
  button: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.pill,
  },
  buttonPrimary: {
    backgroundColor: fieldTheme.color.danger,
  },
  buttonOutline: {
    borderWidth: 1,
    borderColor: fieldTheme.color.danger,
    backgroundColor: fieldTheme.color.surface,
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  buttonTextPrimary: {
    color: fieldTheme.color.onColor,
  },
  buttonTextOutline: {
    color: fieldTheme.color.danger,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
})
