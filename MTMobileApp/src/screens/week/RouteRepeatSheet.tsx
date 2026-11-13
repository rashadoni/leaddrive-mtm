import React, { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { api as Api } from "../../services/api"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import {
  ROUTE_REPEAT_MAX_ROUTES,
  addDays,
  busyRouteDates,
  isoWeekday,
  routeRepeatDates,
  runRouteRepeat,
  toRouteRepeatSource,
  type RouteRepeatOutcome,
  type RouteRepeatSource,
} from "../../services/route-repeat"

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

/** Read when the sheet is used: screens that only show the button need not load the network client. */
function routesApi(): typeof Api {
  return require("../../services/api").api
}
/** A Monday: weekday N of its week names the day for any language. */
const A_MONDAY = "2026-11-09"

function dayText(dateKey: string, language: string, options: Intl.DateTimeFormatOptions): string {
  return formatLocalizedDate(new Date(`${dateKey}T00:00:00.000Z`), language, { ...options, timeZone: "UTC" })
}

/**
 * «Повторить маршрут» (Zeytun 2026-11-13, owner's mockup approved with
 * «Давай»): weekday, every week or every other, up to a date; the dates the
 * agent is busy on are crossed out and skipped; each copy is a route of its own.
 */
export default function RouteRepeatSheet({ routeId, today, onClose }: {
  routeId: string | null
  today: string
  /** `created`: at least one route was made, the calendar should read again. */
  onClose: (created: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [source, setSource] = useState<RouteRepeatSource | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [weekday, setWeekday] = useState(5)
  const [everyWeeks, setEveryWeeks] = useState<1 | 2>(1)
  const [until, setUntil] = useState(today)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [canPublish, setCanPublish] = useState(false)
  const [running, setRunning] = useState(false)
  const [outcomes, setOutcomes] = useState<RouteRepeatOutcome[] | null>(null)

  useEffect(() => {
    setSource(null)
    setLoadFailed(false)
    setOutcomes(null)
    if (!routeId) return
    let current = true
    routesApi().getRoute(routeId).then((response: any) => {
      if (!current) return
      const read = toRouteRepeatSource(response?.data)
      if (!read) { setLoadFailed(true); return }
      setSource(read)
      setWeekday(isoWeekday(read.date))
      setEveryWeeks(1)
      setUntil(addDays(read.date > today ? read.date : today, 7 * 6))
    }).catch(() => { if (current) setLoadFailed(true) })
    return () => { current = false }
  }, [routeId, today])

  const dates = useMemo(
    () => (source ? routeRepeatDates({ sourceDate: source.date, today, weekday, everyWeeks, until }) : []),
    [source, today, weekday, everyWeeks, until],
  )

  useEffect(() => {
    if (!source || dates.length === 0) { setBusy(new Set()); return }
    let current = true
    routesApi().getAgentRoutesBetween(source.agentId, dates[0], addDays(dates[dates.length - 1], 1)).then((response: any) => {
      if (!current) return
      setBusy(busyRouteDates(response))
      setCanPublish(response?.data?.capabilities?.canPublish === true)
    }).catch(() => {})
    return () => { current = false }
  }, [source, dates])

  const free = dates.filter((date) => !busy.has(date)).length
  const publish = canPublish && source?.status !== "DRAFT"
  const created = outcomes?.filter((outcome) => outcome.result === "created").length ?? 0

  const create = async () => {
    if (!source || running || free === 0) return
    setRunning(true)
    try {
      setOutcomes(await runRouteRepeat({
        source,
        dates,
        busyDates: busy,
        publish,
        create: (draft) => routesApi().createRouteDraft(draft),
        publishRoute: (id, version) => routesApi().publishRoute(id, version),
      }))
    } finally {
      setRunning(false)
    }
  }

  const close = () => { if (!running) onClose(created > 0) }
  const step = 7 * everyWeeks

  return (
    <Modal visible={routeId !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel={t("routeRepeat.close")}>
        <Pressable style={styles.sheet} onPress={() => undefined} testID="route-repeat-sheet">
          <Text style={styles.title}>{t("routeRepeat.title")}</Text>
          {loadFailed ? (
            <Text style={styles.body}>{t("routeRepeat.loadFailed")}</Text>
          ) : !source ? (
            <ActivityIndicator color={fieldTheme.color.primary} />
          ) : outcomes ? (
            <ScrollView style={styles.results}>
              <Text testID="route-repeat-summary" style={styles.label}>{t("routeRepeat.done", { created, skipped: outcomes.length - created })}</Text>
              {outcomes.map((outcome) => (
                <View key={outcome.date} style={styles.resultRow} testID="route-repeat-outcome">
                  <Text style={styles.body}>{dayText(outcome.date, i18n.language, { weekday: "short", day: "numeric", month: "long" })}</Text>
                  <Text style={[styles.resultText, outcome.result === "created" && styles.resultCreated]}>
                    {outcome.result === "created"
                      ? t(outcome.published || !publish ? "routeRepeat.created" : "routeRepeat.createdDraft")
                      : t(`routeRepeat.reason_${outcome.reason}`)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <>
              <Text style={styles.label}>{t("routeRepeat.weekday")}</Text>
              <View style={styles.chips}>
                {WEEKDAYS.map((day) => (
                  <Pressable
                    key={day}
                    testID={`route-repeat-weekday-${day}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: weekday === day }}
                    onPress={() => setWeekday(day)}
                    style={[styles.chip, weekday === day && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, weekday === day && styles.chipTextOn]}>{dayText(addDays(A_MONDAY, day - 1), i18n.language, { weekday: "short" })}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chips}>
                {([1, 2] as const).map((weeks) => (
                  <Pressable
                    key={weeks}
                    testID={`route-repeat-every-${weeks}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: everyWeeks === weeks }}
                    onPress={() => setEveryWeeks(weeks)}
                    style={[styles.chip, everyWeeks === weeks && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, everyWeeks === weeks && styles.chipTextOn]}>{t(weeks === 1 ? "routeRepeat.everyWeek" : "routeRepeat.everyTwoWeeks")}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.untilRow}>
                <Text style={styles.body}>{t("routeRepeat.until")}</Text>
                <Pressable testID="route-repeat-earlier" accessibilityRole="button" accessibilityLabel={t("routeRepeat.earlier")} disabled={dates.length <= 1} onPress={() => setUntil(addDays(until, -step))} style={[styles.stepper, dates.length <= 1 && styles.disabled]}>
                  <Icon name="remove" size={20} color={fieldTheme.color.primaryStrong} />
                </Pressable>
                <Text testID="route-repeat-until" style={styles.untilText}>{dayText(until, i18n.language, { day: "numeric", month: "long" })}</Text>
                <Pressable testID="route-repeat-later" accessibilityRole="button" accessibilityLabel={t("routeRepeat.later")} disabled={dates.length >= ROUTE_REPEAT_MAX_ROUTES} onPress={() => setUntil(addDays(until, step))} style={[styles.stepper, dates.length >= ROUTE_REPEAT_MAX_ROUTES && styles.disabled]}>
                  <Icon name="add" size={20} color={fieldTheme.color.primaryStrong} />
                </Pressable>
              </View>
              <View style={styles.chips}>
                {dates.map((date) => (
                  <Text key={date} testID="route-repeat-date" style={[styles.dateChip, busy.has(date) && styles.dateBusy]}>
                    {dayText(date, i18n.language, { day: "numeric", month: "short" })}
                  </Text>
                ))}
              </View>
              {dates.some((date) => busy.has(date)) ? <Text style={styles.note}>{t("routeRepeat.busyNote")}</Text> : null}
              <Pressable
                testID="route-repeat-create"
                accessibilityRole="button"
                disabled={running || free === 0}
                onPress={create}
                style={[styles.primary, (running || free === 0) && styles.disabled]}
              >
                <Icon name="repeat" size={19} color={fieldTheme.color.onColor} />
                <Text style={styles.primaryText}>{running ? t("routeRepeat.creating") : t("routeRepeat.create", { count: free })}</Text>
              </Pressable>
            </>
          )}
          <Pressable accessibilityRole="button" onPress={close} style={styles.secondary} testID="route-repeat-close">
            <Text style={styles.secondaryText}>{t("routeRepeat.close")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = themed(() => StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: fieldTheme.color.surface, borderTopLeftRadius: fieldTheme.radius.lg, borderTopRightRadius: fieldTheme.radius.lg, padding: fieldTheme.space.lg, gap: fieldTheme.space.md, maxHeight: "88%" },
  title: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  label: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  body: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20 },
  note: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.xs },
  chip: { minHeight: 40, minWidth: 44, paddingHorizontal: fieldTheme.space.md, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  chipOn: { borderColor: fieldTheme.color.primaryStrong, borderWidth: 2, backgroundColor: fieldTheme.color.surfaceStrong },
  chipText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: fieldTheme.color.primaryStrong, fontWeight: "700" },
  untilRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  untilText: { minWidth: 110, textAlign: "center", color: fieldTheme.color.ink, fontSize: 16, fontWeight: "700" },
  stepper: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border },
  dateChip: { paddingHorizontal: fieldTheme.space.sm, paddingVertical: 4, borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border, color: fieldTheme.color.ink, fontSize: 13, overflow: "hidden" },
  dateBusy: { color: fieldTheme.color.inkMuted, textDecorationLine: "line-through", borderStyle: "dashed" },
  primary: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.xs, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primaryStrong },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "700" },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "600" },
  results: { maxHeight: 360 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.xs, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  resultText: { flexShrink: 1, textAlign: "right", color: fieldTheme.color.inkMuted, fontSize: 13 },
  resultCreated: { color: fieldTheme.color.success, fontWeight: "600" },
  disabled: { opacity: 0.45 },
}))
