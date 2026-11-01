import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { WebView } from "react-native-webview"
import { useTranslation } from "react-i18next"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { api } from "../../services/api"
import { managerApi } from "../../services/manager-api"
import { formatGpsPointTime, gpsDateKey } from "../../services/gps-history"
import {
  formatDistance,
  shiftDayKey,
  splitDuration,
  toEmployeeDay,
  type EmployeeDay,
  type EmployeeDayStop,
} from "../../services/manager-employee-day"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { statusLabel } from "../../lib/status-labels"
import { useBootstrapStore } from "../../store/bootstrap"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { CARTO_TILE_WEBVIEW_ORIGINS } from "../maps/carto-tiles"
import { buildEmployeeDayDocument, employeeDayHasMap } from "./employee-day-map"
import { MOVEMENT_COLORS } from "../maps/movement-icons"
import ManagerGiveTaskSheet from "./ManagerGiveTaskSheet.android"

/**
 * One employee, opened from «Komanda» (owner, 2026-10-17: «при нажатии
 * получал всю информацию — от маршрута до местонахождения на карте»). Shown
 * as a picture first and approved («да, как на картинке»): a call and a
 * WhatsApp button, the day on a map, the route point by point, the workday and
 * what went off plan. Any day can be opened; today refreshes by itself.
 */

type Employee = {
  name: string
  role: string
  phone: string | null
  team: string | null
  manager: string | null
}

// A stop's state is the colour of its number and ring, never a filled circle
// (owner-approved colours, 2026-10-18).
const STOP_STYLE: Record<EmployeeDayStop["status"], { fill: string; text: string; border: string }> = themed(() => ({
  VISITED: { fill: fieldTheme.color.surface, text: fieldTheme.color.primaryStrong, border: fieldTheme.color.primary },
  NEXT: { fill: fieldTheme.color.surface, text: fieldTheme.color.blue, border: fieldTheme.color.blue },
  PLANNED: { fill: fieldTheme.color.surface, text: fieldTheme.color.inkMuted, border: fieldTheme.color.border },
  SKIPPED: { fill: fieldTheme.color.surface, text: fieldTheme.color.danger, border: fieldTheme.color.danger },
  MISSED: { fill: fieldTheme.color.surface, text: fieldTheme.color.danger, border: fieldTheme.color.danger },
}))

function toEmployee(raw: any, fallbackName: string): Employee {
  const data = raw?.data ?? {}
  return {
    name: typeof data.name === "string" && data.name ? data.name : fallbackName,
    role: typeof data.role === "string" ? data.role : "AGENT",
    phone: typeof data.phone === "string" && data.phone.trim() ? data.phone.trim() : null,
    team: typeof data.team?.name === "string" ? data.team.name : null,
    manager: typeof data.manager?.name === "string" ? data.manager.name : null,
  }
}

/** wa.me wants the number in digits only, with the country code. */
export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "")
  return digits.length >= 9 ? `https://wa.me/${digits}` : null
}

export default function ManagerEmployeeScreen() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, "ManagerEmployee">>()
  const { agentId, name: initialName, isOnline, pushReady } = route.params
  const headerTop = useHeaderTop()
  const timezone = useBootstrapStore((state) => state.data?.timezone)
  const tileApiKey = useBootstrapStore((state) => state.data?.maps?.cartoBasemapsApiKey ?? null)
  const todayKey = gpsDateKey(new Date(), timezone)
  const [date, setDate] = useState(todayKey)
  const isToday = date === todayKey
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [day, setDay] = useState<EmployeeDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<"forbidden" | "failed" | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [giveTaskOpen, setGiveTaskOpen] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async (mode: "initial" | "manual" | "silent", forDate: string) => {
    const current = ++requestId.current
    if (mode === "initial") setLoading(true)
    if (mode === "manual") setRefreshing(true)
    try {
      const [card, history]: any[] = await Promise.all([
        employee ? Promise.resolve(null) : managerApi.getEmployee(agentId),
        managerApi.getEmployeeDay(agentId, forDate),
      ])
      if (current !== requestId.current) return
      if (card) setEmployee(toEmployee(card, initialName ?? ""))
      const stopMinimum = Number(history?.data?.policy?.stopMinimumMinutes) || 5
      setDay(toEmployeeDay(history?.data, forDate === gpsDateKey(new Date(), timezone), stopMinimum))
      setError(null)
    } catch (failure: any) {
      if (current !== requestId.current || failure?.message === "SESSION_EXPIRED") return
      // Keep the day already on the screen: a weak connection must not blank it.
      const status = Number(failure?.status ?? failure?.response?.status)
      setError(status === 403 || status === 404 ? "forbidden" : "failed")
    } finally {
      if (current === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [agentId, employee, initialName, timezone])

  // Today follows him by itself; a past day does not change.
  useAutoRefresh(useCallback(() => {
    if (day == null) void load("initial", date)
    else if (isToday) void load("silent", date)
  }, [date, day, isToday, load]), 120_000)

  const openDay = (next: string) => {
    if (next > todayKey) return
    setDate(next)
    setDay(null)
    setMapFailed(false)
    void load("initial", next)
  }

  const mapDocument = useMemo(() => (day && employeeDayHasMap(day) ? buildEmployeeDayDocument(day, {
    language,
    accessibilityLabel: t("managerEmployee.mapAccessibility"),
    current: t("managerEmployee.mapNow"),
    mapLoading: t("managerShell.liveMapLoading"),
    mapUnavailable: t("managerShell.liveMapTilesUnavailable"),
    mapAttribution: t("managerShell.liveMapAttribution"),
    // Owner 2026-11-01: car / on foot / standing, arrows, and the day played by the clock.
    replay: {
      play: t("managerEmployee.replayPlay"),
      pause: t("managerEmployee.replayPause"),
      skipStill: t("managerEmployee.replaySkipStill"),
      time: t("managerEmployee.replayTime"),
      modes: Object.fromEntries(["DRIVE", "WALK", "STAY", "BREAK", "GAP"].map((mode) => [mode, t(`managerShell.movement${mode}`)])),
      compass: Object.fromEntries(["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((point) => [point, t(`managerShell.compass${point}`)])),
    },
  }, { apiKey: tileApiKey }) : null), [day, language, t, tileApiKey])
  const tileOrigin = tileApiKey ? api.serverOrigin() : null
  const webViewSource = useMemo(() => (mapDocument ? { html: mapDocument, baseUrl: tileOrigin ? `${tileOrigin}/` : "about:blank" } : null), [mapDocument, tileOrigin])
  const webViewOrigins = useMemo(() => (tileOrigin ? [...CARTO_TILE_WEBVIEW_ORIGINS, tileOrigin] : CARTO_TILE_WEBVIEW_ORIGINS), [tileOrigin])

  const time = (value: string | null | undefined) => (value ? formatGpsPointTime(value, language, timezone) : "—")
  const dayLabel = isToday
    ? t("managerEmployee.today")
    : date === shiftDayKey(todayKey, -1)
      ? t("managerEmployee.yesterday")
      : formatLocalizedDate(new Date(`${date}T12:00:00.000Z`), language, { day: "numeric", month: "short", weekday: "short" })
  const duration = (seconds: number | null) => {
    const parts = splitDuration(seconds)
    if (!parts) return "—"
    return parts.hours > 0
      ? t("managerEmployee.hoursMinutes", { hours: parts.hours, minutes: String(parts.minutes).padStart(2, "0") })
      : t("managerEmployee.minutesOnly", { minutes: parts.minutes })
  }

  const workdayPill = (() => {
    const workday = day?.workday
    if (!workday) return null
    if (workday.status === "COMPLETED") return { text: t("managerEmployee.workdayFinished", { time: time(workday.completedAt) }), tone: "muted" as const }
    if (workday.status === "PAUSED") {
      const open = workday.breaks.find((item) => !item.endedAt)
      return { text: t("managerEmployee.workdayPaused", { time: time(open?.startedAt ?? null) }), tone: "amber" as const }
    }
    return { text: t("managerEmployee.workdayStarted", { time: time(workday.startedAt) }), tone: "green" as const }
  })()

  const name = employee?.name || initialName || ""
  const phone = employee?.phone ?? null
  const whatsapp = phone ? whatsappUrl(phone) : null

  return (
    <View style={styles.root}>
      <LightScreenStatusBar />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load("manual", date) }} tintColor={fieldTheme.color.primary} />}
      >
        <View style={[styles.top, { paddingTop: headerTop }]}>
          <Pressable testID="manager-employee-back" accessibilityRole="button" onPress={() => navigation.goBack()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon name="arrow-back" size={18} color={fieldTheme.color.primary} />
            <Text style={styles.backText}>{t("managerEmployee.back")}</Text>
          </Pressable>
          <Text style={styles.name} testID="manager-employee-name">{name}</Text>
          <Text style={styles.sub}>
            {[statusLabel(t, "role", employee?.role ?? "AGENT"), employee?.team, employee?.manager ? t("managerEmployee.managerOf", { name: employee.manager }) : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.pills}>
            {workdayPill ? (
              <View style={[styles.pill, workdayPill.tone === "green" ? styles.pillGreen : workdayPill.tone === "amber" ? styles.pillAmber : styles.pillMuted]} testID="manager-employee-workday">
                <Text style={[styles.pillText, workdayPill.tone === "green" ? styles.pillTextGreen : workdayPill.tone === "amber" ? styles.pillTextAmber : styles.pillTextMuted]}>{workdayPill.text}</Text>
              </View>
            ) : null}
            {isOnline != null ? (
              <View style={[styles.pill, isOnline ? styles.pillGreen : styles.pillMuted]}>
                <Text style={[styles.pillText, isOnline ? styles.pillTextGreen : styles.pillTextMuted]}>{isOnline ? t("managerShell.online") : t("managerShell.offline")}</Text>
              </View>
            ) : null}
            {day?.current?.battery != null ? (
              <View style={[styles.pill, styles.pillMuted]}>
                <Text style={[styles.pillText, styles.pillTextMuted]}>{t("managerEmployee.battery", { percent: Math.round(day.current.battery) })}</Text>
              </View>
            ) : null}
          </View>
          {phone ? (
            <View style={styles.contactRow}>
              <Pressable testID="manager-employee-call" accessibilityRole="button" onPress={() => { void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`) }} style={({ pressed }) => [styles.contactButton, styles.callButton, pressed && styles.pressed]}>
                <Icon name="call" size={18} color={fieldTheme.color.onColor} />
                <Text style={styles.contactText}>{t("managerEmployee.call")}</Text>
              </Pressable>
              {whatsapp ? (
                <Pressable testID="manager-employee-whatsapp" accessibilityRole="button" onPress={() => { void Linking.openURL(whatsapp) }} style={({ pressed }) => [styles.contactButton, styles.whatsappButton, pressed && styles.pressed]}>
                  <Icon name="logo-whatsapp" size={18} color={fieldTheme.color.success} />
                  <Text style={[styles.contactText, styles.whatsappText]}>WhatsApp</Text>
                </Pressable>
              ) : null}
            </View>
          ) : employee ? (
            <Text style={styles.noPhone}>{t("managerEmployee.noPhone")}</Text>
          ) : null}
          {/* Owner, 2026-10-20: «чтоб была возможность создавать задачи
              менеджерам через приложение». Outlined: «Zəng et» stays the one
              filled button of the card. */}
          <Pressable testID="manager-employee-give-task" accessibilityRole="button" onPress={() => setGiveTaskOpen(true)} style={({ pressed }) => [styles.giveTask, pressed && styles.pressed]}>
            <Icon name="add-circle-outline" size={19} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.giveTaskText}>{t("managerTask.giveButton")}</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.dayRow} testID="manager-employee-day">
            <Pressable testID="manager-employee-previous-day" accessibilityRole="button" accessibilityLabel={t("managerEmployee.previousDay")} onPress={() => openDay(shiftDayKey(date, -1))} style={({ pressed }) => [styles.dayArrow, pressed && styles.pressed]}>
              <Icon name="chevron-back" size={20} color={fieldTheme.color.primary} />
            </Pressable>
            <Text style={styles.dayLabel}>{dayLabel}</Text>
            <Pressable testID="manager-employee-next-day" accessibilityRole="button" accessibilityLabel={t("managerEmployee.nextDay")} accessibilityState={{ disabled: isToday }} disabled={isToday} onPress={() => openDay(shiftDayKey(date, 1))} style={({ pressed }) => [styles.dayArrow, isToday && styles.disabled, pressed && styles.pressed]}>
              <Icon name="chevron-forward" size={20} color={fieldTheme.color.primary} />
            </Pressable>
            {!isToday ? (
              <Pressable testID="manager-employee-today" accessibilityRole="button" onPress={() => openDay(todayKey)} style={({ pressed }) => [styles.todayChip, pressed && styles.pressed]}>
                <Text style={styles.todayChipText}>{t("managerEmployee.today")}</Text>
              </Pressable>
            ) : null}
          </View>

          {error && !day ? (
            <View style={styles.notice} testID="manager-employee-error">
              <Icon name={error === "forbidden" ? "lock-closed-outline" : "cloud-offline-outline"} size={22} color={fieldTheme.color.amber} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>{t(error === "forbidden" ? "managerEmployee.forbidden" : "managerEmployee.loadFailed")}</Text>
                {error === "failed" ? (
                  <Pressable accessibilityRole="button" onPress={() => { void load("initial", date) }} style={styles.retry}>
                    <Text style={styles.retryText}>{t("managerShell.refresh")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : loading && !day ? (
            <View style={styles.loading}><ActivityIndicator color={fieldTheme.color.primary} /></View>
          ) : day ? (
            <>
              {error ? <Text style={styles.stale}>{t("managerEmployee.staleNote")}</Text> : null}
              {webViewSource && !mapFailed ? (
                <View style={styles.map} testID="manager-employee-map">
                  <WebView
                    source={webViewSource}
                    originWhitelist={webViewOrigins}
                    javaScriptEnabled
                    domStorageEnabled={false}
                    cacheEnabled
                    allowFileAccess={false}
                    allowUniversalAccessFromFileURLs={false}
                    mixedContentMode="never"
                    setSupportMultipleWindows={false}
                    scrollEnabled={false}
                    bounces={false}
                    overScrollMode="never"
                    onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
                    onError={() => setMapFailed(true)}
                    accessibilityLabel={t("managerEmployee.mapAccessibility")}
                    style={styles.webView}
                  />
                </View>
              ) : (
                <View style={styles.notice}>
                  <Icon name="navigate-circle-outline" size={22} color={fieldTheme.color.inkMuted} />
                  <Text style={styles.noticeTitle}>{t("managerEmployee.noMap")}</Text>
                </View>
              )}
              {webViewSource && !mapFailed ? (
                <View style={styles.legend}>
                  <Text style={styles.legendText}><Text style={{ color: MOVEMENT_COLORS.DRIVE }}>━ </Text>{t("managerEmployee.legendDrive")}</Text>
                  <Text style={styles.legendText}><Text style={{ color: MOVEMENT_COLORS.WALK }}>┈ </Text>{t("managerEmployee.legendWalk")}</Text>
                  <Text style={styles.legendText}><Text style={{ color: fieldTheme.color.primary }}>┅ </Text>{t("managerEmployee.legendAhead")}</Text>
                  {isToday ? <Text style={styles.legendText}><Text style={{ color: fieldTheme.color.blue }}>● </Text>{t("managerEmployee.mapNow")}</Text> : null}
                </View>
              ) : null}

              <View style={styles.tiles}>
                <Tile testID="manager-employee-visits" value={t("managerEmployee.visitsValue", { visited: day.summary.visited, planned: day.summary.planned })} label={t("managerEmployee.visitsLabel")} />
                <Tile value={formatDistance(day.summary.distanceMeters, language) ?? "—"} label={t("managerEmployee.distanceLabel")} />
                <Tile value={duration(day.summary.movingSeconds)} label={t("managerEmployee.movingLabel")} />
                <Tile
                  value={day.summary.lastPointAt ? time(day.summary.lastPointAt) : "—"}
                  label={day.current?.accuracy != null ? t("managerEmployee.lastPointAccuracy", { meters: Math.round(day.current.accuracy) }) : t("managerEmployee.lastPointLabel")}
                />
              </View>

              <Text style={styles.section}>{t("managerEmployee.routeTitle")}</Text>
              <View style={styles.card} testID="manager-employee-route">
                {day.stops.length === 0 && day.extraVisits.length === 0 ? (
                  <Text style={styles.empty}>{t("managerEmployee.noRoute")}</Text>
                ) : null}
                {day.stops.map((stop, index) => (
                  <View key={stop.id} style={[styles.stop, index > 0 && styles.stopDivider]} testID={`manager-employee-stop-${stop.status}`}>
                    <View style={[styles.stopNumber, { backgroundColor: STOP_STYLE[stop.status].fill, borderColor: STOP_STYLE[stop.status].border }]}>
                      <Text style={[styles.stopNumberText, { color: STOP_STYLE[stop.status].text }]}>{stop.status === "SKIPPED" || stop.status === "MISSED" ? "✕" : stop.order}</Text>
                    </View>
                    <View style={styles.stopCopy}>
                      <Text style={styles.stopTitle}>{stop.label}</Text>
                      <Text style={styles.stopMeta}>{stopLine(stop, t, time)}</Text>
                    </View>
                  </View>
                ))}
                {day.extraVisits.map((visit) => (
                  <View key={visit.id} style={[styles.stop, styles.stopDivider]} testID="manager-employee-extra-visit">
                    <View style={[styles.stopNumber, { backgroundColor: fieldTheme.color.surface, borderColor: fieldTheme.color.violet }]}>
                      <Icon name="add" size={14} color={fieldTheme.color.violet} />
                    </View>
                    <View style={styles.stopCopy}>
                      <Text style={styles.stopTitle}>{visit.label}</Text>
                      <Text style={styles.stopMeta}>{t("managerEmployee.extraVisit", { from: time(visit.checkInAt), to: time(visit.checkOutAt), minutes: visit.minutes ?? "—" })}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.section}>{t("managerEmployee.workdayTitle")}</Text>
              <View style={styles.card} testID="manager-employee-workday-card">
                {day.workday ? (
                  <>
                    <Line label={t("managerEmployee.started")} value={time(day.workday.startedAt)} />
                    {day.workday.breaks.length === 0 ? (
                      <Line label={t("managerEmployee.breaks")} value={t("managerEmployee.noBreaks")} />
                    ) : day.workday.breaks.map((item, index) => (
                      <Line key={`${item.startedAt}-${index}`} label={index === 0 ? t("managerEmployee.breaks") : ""} value={t("managerEmployee.breakSpan", { from: time(item.startedAt), to: item.endedAt ? time(item.endedAt) : t("managerEmployee.stillOnBreak") })} />
                    ))}
                    <Line label={t("managerEmployee.finished")} value={day.workday.completedAt ? time(day.workday.completedAt) : t("managerEmployee.stillWorking")} />
                    {day.workday.breaks.length > 0 ? <Text style={styles.privacy}>{t("managerEmployee.breakPrivate")}</Text> : null}
                  </>
                ) : (
                  <Text style={styles.empty}>{t("managerEmployee.noWorkday")}</Text>
                )}
              </View>

              <Text style={styles.section}>{t("managerEmployee.deviationsTitle")}</Text>
              <View style={styles.card} testID="manager-employee-deviations">
                {day.deviations.length === 0 ? (
                  <Text style={styles.empty}>{t("managerEmployee.noDeviations")}</Text>
                ) : day.deviations.map((item) => (
                  <View key={item.id} style={styles.deviation}>
                    <View style={[styles.pill, item.kind === "NO_GPS" ? styles.pillAmber : styles.pillRed]}>
                      <Text style={[styles.pillText, item.kind === "NO_GPS" ? styles.pillTextAmber : styles.pillTextRed]}>{t(item.kind === "NO_GPS" ? "managerEmployee.noGps" : "managerEmployee.stopWithoutVisit")}</Text>
                    </View>
                    <Text style={styles.deviationText}>{t("managerEmployee.span", { from: time(item.startedAt), to: time(item.endedAt), minutes: item.minutes })}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      <ManagerGiveTaskSheet visible={giveTaskOpen} agentId={agentId} agentName={name} pushReady={pushReady} onClose={() => setGiveTaskOpen(false)} />
    </View>
  )
}

function stopLine(stop: EmployeeDayStop, t: any, time: (value: string | null | undefined) => string): string {
  if (stop.status === "VISITED") {
    return stop.visit
      ? t("managerEmployee.stopVisited", { from: time(stop.visit.checkInAt), to: time(stop.visit.checkOutAt), minutes: stop.visit.minutes ?? "—" })
      : t("managerEmployee.stopVisitedNoTime")
  }
  if (stop.status === "SKIPPED") return t("managerEmployee.stopSkipped")
  if (stop.status === "MISSED") return t("managerEmployee.stopMissed")
  const planned = stop.plannedTime ? t("managerEmployee.plannedAt", { time: time(stop.plannedTime) }) : t("managerEmployee.plannedNoTime")
  return stop.status === "NEXT" ? `${t("managerEmployee.stopNext")} · ${planned}` : planned
}

function Tile({ value, label, testID }: { value: string; label: string; testID?: string }) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  content: { paddingBottom: fieldTheme.space.xxl },
  top: { backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  back: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: fieldTheme.color.primary, fontSize: 15, fontWeight: "800" },
  name: { color: fieldTheme.color.ink, fontSize: 24, lineHeight: 30, fontWeight: "900" },
  sub: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: fieldTheme.space.sm },
  // A state is the colour of its words, not a tinted pill (owner-approved colours, 2026-10-18).
  pill: { paddingRight: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: "800" },
  pillGreen: {},
  pillTextGreen: { color: fieldTheme.color.primaryStrong },
  pillAmber: {},
  pillTextAmber: { color: fieldTheme.color.amber },
  pillRed: {},
  pillTextRed: { color: fieldTheme.color.danger },
  pillMuted: {},
  pillTextMuted: { color: fieldTheme.color.inkMuted },
  contactRow: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  contactButton: { flex: 1, minHeight: 46, borderRadius: fieldTheme.radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  callButton: { backgroundColor: fieldTheme.color.primary },
  // One filled button: «Zəng et»; WhatsApp is outlined in green, a theme
  // colour so it reads in the night palette too.
  whatsappButton: { borderWidth: 1.5, borderColor: fieldTheme.color.success, backgroundColor: fieldTheme.color.surface },
  whatsappText: { color: fieldTheme.color.success },
  contactText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  noPhone: { color: fieldTheme.color.inkMuted, fontSize: 13, marginTop: fieldTheme.space.sm },
  giveTask: { minHeight: 46, marginTop: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1.5, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  giveTaskText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "900" },
  body: { padding: fieldTheme.space.lg, gap: fieldTheme.space.md },
  dayRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  dayArrow: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, borderRadius: fieldTheme.radius.md, borderWidth: 1.5, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center" },
  dayLabel: { flex: 1, textAlign: "center", color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  todayChip: { minHeight: LAYOUT_TOUCH_TARGETS.compact, borderRadius: fieldTheme.radius.pill, borderWidth: 1.5, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface, paddingHorizontal: 14, justifyContent: "center" },
  todayChipText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  // 240 of map and the replay's bar under it.
  map: { height: 288, borderRadius: fieldTheme.radius.md, overflow: "hidden", borderWidth: 1, borderColor: fieldTheme.color.border },
  webView: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.md, marginTop: -4 },
  legendText: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  tile: { width: "48.5%", flexGrow: 1, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md },
  tileValue: { color: fieldTheme.color.ink, fontSize: 19, fontWeight: "900" },
  tileLabel: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 2 },
  section: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, marginTop: fieldTheme.space.sm },
  card: { backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  empty: { color: fieldTheme.color.inkMuted, fontSize: 14, paddingVertical: fieldTheme.space.sm },
  stop: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  stopDivider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  stopNumber: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stopNumberText: { fontSize: 12, fontWeight: "900" },
  stopCopy: { flex: 1 },
  stopTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  stopMeta: { color: fieldTheme.color.inkMuted, fontSize: 12.5, marginTop: 2 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: fieldTheme.space.md, paddingVertical: 6 },
  lineLabel: { color: fieldTheme.color.inkMuted, fontSize: 14 },
  lineValue: { flexShrink: 1, textAlign: "right", color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  privacy: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 4, marginBottom: 2 },
  deviation: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, paddingVertical: 6 },
  deviationText: { flexShrink: 1, textAlign: "right", color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md },
  noticeCopy: { flex: 1, gap: 6 },
  noticeTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  retry: { alignSelf: "flex-start", minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center" },
  retryText: { color: fieldTheme.color.primary, fontSize: 14, fontWeight: "900" },
  stale: { color: fieldTheme.color.amber, fontSize: 12.5, fontWeight: "700" },
  loading: { paddingVertical: fieldTheme.space.xxl, alignItems: "center" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
}))
