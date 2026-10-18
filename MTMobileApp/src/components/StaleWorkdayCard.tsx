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
 * One button, «Günü bağla» — the words the owner used for it. The first
 * version had two («Bitmə vaxtını göstər», read as "show me the finish time",
 * and «İndi bağla») and sent the agent into «Mənim müraciətlərim», a screen of
 * eight request kinds, documents and limits where the time fields had to be
 * scrolled to (owner's phone, 2026-10-18). Now:
 *
 * - `request`: «Günü bağla» opens the close-the-day sheet on this screen.
 * - `sent`: the finish time is with the manager — the card says which time,
 *   and offers nothing: closing now would change the day under the request,
 *   and the server would refuse to approve it.
 * - `approved`: closed on the server, by the manager or at once where the
 *   company lets that through; the screen is reading the day again.
 * - `closeOnly`: this company takes no requests from the phone, so «Günü
 *   bağla» closes the day now, after a warning that says how many hours that
 *   writes into it.
 *
 * «Fasilə» is not offered: a break inside a day that ended days ago means nothing.
 */
export type StaleWorkdayCardMode = "request" | "sent" | "approved" | "closeOnly"

export default function StaleWorkdayCard({
  day,
  startedAt,
  timezone,
  mode,
  sentFinish,
  busy,
  error,
  onCloseDay,
}: {
  day: string
  startedAt: string
  timezone?: string | null
  mode: StaleWorkdayCardMode
  /** The finish time sent to the manager, shown in `sent`. */
  sentFinish?: string | null
  busy: boolean
  error: string | null
  onCloseDay: () => void
}) {
  const { t, i18n } = useTranslation()
  const date = formatLocalizedDate(staleVisitDayDate(day), i18n.language, { day: "numeric", month: "long" })
  const time = companyClock(new Date(startedAt), timezone)
  const body = mode === "sent" || mode === "approved"
    ? t(mode === "sent" ? "todayV2.staleDaySent" : "todayV2.staleDayApproved", { time: sentFinish || "—" })
    : t(mode === "request" ? "todayV2.staleDayBody" : "todayV2.staleDayBodyNoRequest", { date, time })

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
      {mode === "sent" || mode === "approved" ? null : (
        <Pressable
          testID="today-stale-close-day"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCloseDay}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.buttonText}>{t("todayV2.staleCloseDay")}</Text>
        </Pressable>
      )}
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
  button: {
    minHeight: 52,
    paddingHorizontal: fieldTheme.space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.danger,
  },
  buttonText: {
    color: fieldTheme.color.onColor,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
})
