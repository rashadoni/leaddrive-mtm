import React, { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { api } from "../../services/api"
import { toGpsHistory, type GpsHistory, type GpsPoint } from "../../services/gps-history"
import { shiftDateKey } from "../../services/week"
import { useHeaderTop } from "../../hooks/useTabBarHeight"

function fmtDate(dateKey: string, lang: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

function fmtTime(iso: string, lang: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function todayKey(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`
}

export default function GpsHistoryScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const headerTop = useHeaderTop()
  const [anchor, setAnchor] = useState<string>(todayKey())
  const [data, setData] = useState<GpsHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)

  const fetchHistory = useCallback(async (date: string) => {
    try {
      const res = await api.getLocationHistory(date)
      if (res.success && res.data) {
        setData(toGpsHistory(res.data))
        setOffline(false)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory(anchor)
  }, [anchor, fetchHistory])

  const lang = i18n.language
  const points: GpsPoint[] = data ? [...data.points].reverse() : []

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("gpsHistory.title")}</Text>
        </View>
        <View style={styles.dayNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setAnchor(shiftDateKey(anchor, -1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.navIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.dayLabel}>{fmtDate(anchor, lang)}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => setAnchor(shiftDateKey(anchor, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.navIcon}>›</Text>
          </TouchableOpacity>
        </View>
        {anchor !== todayKey() && (
          <TouchableOpacity style={styles.todayBtn} onPress={() => setAnchor(todayKey())}>
            <Text style={styles.todayBtnText}>{t("gpsHistory.today")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6C63FF" /></View>
      ) : (
        <FlatList
          data={points}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHistory(anchor) }} tintColor="#6C63FF" colors={["#6C63FF"]} />}
          ListHeaderComponent={
            <>
              {offline && (
                <View style={styles.offlineBanner}>
                  <Text style={styles.offlineDot}>●</Text>
                  <Text style={styles.offlineBannerText}>{t("gpsHistory.offlineNote")}</Text>
                </View>
              )}
              {data && (
                <View style={styles.summaryCard}>
                  <Stat value={`${data.distanceKm}`} label={t("gpsHistory.statKm")} color="#6C63FF" />
                  <View style={styles.divider} />
                  <Stat value={`${data.pointCount}`} label={t("gpsHistory.statPoints")} color="#22c55e" />
                  <View style={styles.divider} />
                  <Stat value={data.gpsIntervalSeconds ? `${data.gpsIntervalSeconds}s` : "—"} label={t("gpsHistory.statInterval")} color="#3b82f6" />
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>{loading ? t("common.loading") : t("gpsHistory.empty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.pointRow}>
              <Text style={styles.pointTime}>{fmtTime(item.recordedAt, lang)}</Text>
              <View style={styles.pointMeta}>
                {item.accuracy != null && <Text style={styles.pointChip}>±{Math.round(item.accuracy)} m</Text>}
                {item.speed != null && item.speed > 0 && <Text style={styles.pointChip}>{Math.round(item.speed * 3.6)} km/h</Text>}
                {item.battery != null && <Text style={styles.pointChip}>{Math.round(item.battery)}%</Text>}
              </View>
            </View>
          )}
        />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: { backgroundColor: "#6C63FF", paddingBottom: 16, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  backIcon: { color: "#fff", fontSize: 34, lineHeight: 34, fontWeight: "300", marginTop: -4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  navIcon: { color: "#fff", fontSize: 22, lineHeight: 24 },
  dayLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  todayBtn: { alignSelf: "center", marginTop: 8, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 5 },
  todayBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  scroll: { padding: 16, flexGrow: 1 },

  offlineBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  offlineDot: { color: "#f59e0b", fontSize: 10 },
  offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "600" },

  summaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#f1f5f9" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4 },
  divider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  pointRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#f1f5f9" },
  pointTime: { fontSize: 13, fontWeight: "700", color: "#0B0B1E" },
  pointMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end", flex: 1 },
  pointChip: { fontSize: 11, color: "#64748b", backgroundColor: "#f8fafc", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, fontWeight: "500", overflow: "hidden" },

  empty: { padding: 40, alignItems: "center", flex: 1, justifyContent: "center" },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#0B0B1E" },
})
