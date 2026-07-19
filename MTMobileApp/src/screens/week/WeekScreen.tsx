import React, { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { toWeekData, shiftDateKey, type WeekData, type WeekDay } from "../../services/week"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"

function formatDayNumber(dateKey: string): string {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(dateKey)
  return m ? String(Number(m[1])) : ""
}

function weekdayShort(dateKey: string, lang: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" })
}

function formatRange(start: string, endExclusive: string, lang: string): string {
  const last = shiftDateKey(endExclusive, -1)
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" }
  const a = new Date(`${start}T00:00:00.000Z`)
  const b = new Date(`${last}T00:00:00.000Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return ""
  return `${a.toLocaleDateString(lang, opts)} – ${b.toLocaleDateString(lang, opts)}`
}

export default function WeekScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [anchor, setAnchor] = useState<string | null>(null)
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)

  const fetchWeek = useCallback(async (start: string | null) => {
    try {
      const res = await api.getWeek(start ?? undefined)
      if (res.success && res.data) {
        setData(toWeekData(res.data))
        setOffline(false)
      }
    } catch (e: any) {
      // No offline cache for the week yet — surface a note. (SESSION_EXPIRED is
      // handled by the api interceptor.)
      if (e.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchWeek(anchor)
  }, [anchor, fetchWeek])

  const lang = i18n.language

  return (
    <View style={styles.container}>
      {/* Header + week navigation */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>{t("week.title")}</Text>
        <View style={styles.weekNav}>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => data && setAnchor(shiftDateKey(data.weekStart, -7))}
            disabled={!data}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.navIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.weekRange}>
            {data ? formatRange(data.weekStart, data.weekEndExclusive, lang) : ""}
          </Text>
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => data && setAnchor(shiftDateKey(data.weekStart, 7))}
            disabled={!data}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.navIcon}>›</Text>
          </TouchableOpacity>
        </View>
        {data && (data.today < data.weekStart || data.today >= data.weekEndExclusive) && (
          <TouchableOpacity style={styles.todayBtn} onPress={() => setAnchor(null)}>
            <Text style={styles.todayBtnText}>{t("week.today")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6C63FF" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarPadding }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWeek(anchor) }} tintColor="#6C63FF" colors={["#6C63FF"]} />
          }
        >
          {offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineDot}>●</Text>
              <Text style={styles.offlineBannerText}>{t("week.offlineUnavailable")}</Text>
            </View>
          )}

          {data && (
            <>
              {/* Week summary */}
              <View style={styles.summaryCard}>
                <Stat value={`${data.summary.visitsCompleted}/${data.summary.visits}`} label={t("week.statVisits")} color="#22c55e" />
                <View style={styles.summaryDivider} />
                <Stat value={`${data.summary.tasksCompleted}/${data.summary.tasks}`} label={t("week.statTasks")} color="#3b82f6" />
                <View style={styles.summaryDivider} />
                <Stat value={`${data.summary.coveragePct}%`} label={t("week.statCoverage")} color="#6C63FF" />
              </View>

              {/* Day rows */}
              {data.days.map((day) => (
                <DayRow
                  key={day.date}
                  day={day}
                  lang={lang}
                  t={t}
                  onVisitPress={(id, name) => navigation.navigate("VisitWorkspace", { visitId: id, name })}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function DayRow({ day, lang, t, onVisitPress }: {
  day: WeekDay
  lang: string
  t: (k: string, o?: any) => string
  onVisitPress: (id: string, name: string) => void
}) {
  const rest = !day.isWorkingDay
  return (
    <View style={[styles.dayCard, day.isToday && styles.dayCardToday, rest && styles.dayCardRest]}>
      <View style={[styles.dayDate, day.isToday && styles.dayDateToday]}>
        <Text style={[styles.dayWeekday, day.isToday && styles.dayWeekdayToday]}>{weekdayShort(day.date, lang)}</Text>
        <Text style={[styles.dayNumber, day.isToday && styles.dayNumberToday]}>{formatDayNumber(day.date)}</Text>
      </View>
      <View style={styles.dayMain}>
        {rest ? (
          <Text style={styles.restLabel}>{day.nonWorkingReason || t("week.dayOff")}</Text>
        ) : (
          <>
            <View style={styles.chips}>
              {day.routeCount > 0 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>📍 {t("week.stopsTemplate", { n: day.plannedStops })}</Text>
                </View>
              )}
              {day.visitsTotal > 0 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>✅ {day.visitsCompleted}/{day.visitsTotal}</Text>
                </View>
              )}
              {day.tasksTotal > 0 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>📋 {t("week.tasksTemplate", { n: day.tasksTotal })}</Text>
                </View>
              )}
              {day.routeCount === 0 && day.visitsTotal === 0 && day.tasksTotal === 0 && (
                <Text style={styles.emptyDay}>{t("week.dayEmpty")}</Text>
              )}
            </View>
            {day.visits.length > 0 && (
              <View style={styles.visitList}>
                {day.visits.map((v) => (
                  <TouchableOpacity key={v.id} style={styles.visitRow} activeOpacity={0.7} onPress={() => onVisitPress(v.id, v.name)}>
                    <Text style={[styles.visitDot, v.status === "CHECKED_OUT" && styles.visitDotDone]}>●</Text>
                    <Text style={styles.visitName} numberOfLines={1}>{v.name}</Text>
                    <Text style={styles.visitChevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  navIcon: { color: "#fff", fontSize: 24, lineHeight: 26, fontWeight: "400" },
  weekRange: { color: "#fff", fontSize: 15, fontWeight: "700" },
  todayBtn: { alignSelf: "center", marginTop: 10, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6 },
  todayBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  scroll: { padding: 16 },

  offlineBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa",
  },
  offlineDot: { color: "#f59e0b", fontSize: 10 },
  offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "600" },

  summaryCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#f1f5f9",
    shadowColor: "#6C63FF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  summaryDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  dayCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff",
    borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#f1f5f9",
  },
  dayCardToday: { borderColor: "#6C63FF", borderWidth: 1.5 },
  dayCardRest: { backgroundColor: "#f8fafc" },
  dayDate: { width: 48, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 6, backgroundColor: "#f4f5f9" },
  dayDateToday: { backgroundColor: "#6C63FF" },
  dayWeekday: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },
  dayWeekdayToday: { color: "rgba(255,255,255,0.85)" },
  dayNumber: { fontSize: 18, fontWeight: "800", color: "#0B0B1E" },
  dayNumberToday: { color: "#fff" },
  dayMain: { flex: 1 },
  restLabel: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: "#f8fafc", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, color: "#475569", fontWeight: "600" },
  emptyDay: { fontSize: 12, color: "#cbd5e1" },

  visitList: { marginTop: 8, gap: 4 },
  visitRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#f8fafc", borderRadius: 8 },
  visitDot: { fontSize: 9, color: "#cbd5e1" },
  visitDotDone: { color: "#22c55e" },
  visitName: { flex: 1, fontSize: 12, color: "#334155", fontWeight: "500" },
  visitChevron: { fontSize: 16, color: "#cbd5e1", fontWeight: "300" },
})
