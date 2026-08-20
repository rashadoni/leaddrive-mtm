import React, { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { toGpsHistory, type GpsHistory, type GpsPoint } from "../../services/gps-history"
import { shiftDateKey } from "../../services/week"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

function formatDate(dateKey: string, language: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

function formatTime(iso: string, language: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function accuracyTone(accuracy?: number): { color: string; background: string } {
  if (accuracy == null) return { color: fieldTheme.color.inkMuted, background: fieldTheme.color.surfaceStrong }
  if (accuracy <= 25) return { color: fieldTheme.color.success, background: fieldTheme.color.successSoft }
  if (accuracy <= 75) return { color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft }
  return { color: fieldTheme.color.danger, background: fieldTheme.color.dangerSoft }
}

export default function GpsHistoryScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const headerTop = useHeaderTop()
  const [anchor, setAnchor] = useState<string>(todayKey())
  const [data, setData] = useState<GpsHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)

  const fetchHistory = useCallback(async (date: string) => {
    try {
      const response = await api.getLocationHistory(date)
      if (response.success && response.data) {
        setData(toGpsHistory(response.data))
        setOffline(false)
      }
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchHistory(anchor)
  }, [anchor, fetchHistory])

  const points: GpsPoint[] = data ? [...data.points].reverse() : []
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const isToday = anchor === todayKey()
  const latestPoint = points[0]

  const moveDay = (offset: number) => {
    const next = shiftDateKey(anchor, offset)
    if (next > todayKey()) return
    setData(null)
    setAnchor(next)
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.titleRow}>
            {navigation.canGoBack() && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("gpsHistory.back")}
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.backButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
              >
                <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
              </Pressable>
            )}
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{t("gpsHistory.eyebrow")}</Text>
              <Text style={styles.headerTitle}>{t("gpsHistory.title")}</Text>
              <Text style={styles.headerSubtitle}>{t("gpsHistory.subtitle")}</Text>
            </View>
          </View>

          <View style={styles.dayNavigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("gpsHistory.previousDay")}
              onPress={() => moveDay(-1)}
              style={({ pressed }) => [styles.navButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
            >
              <Icon name="chevron-back" size={22} color={fieldTheme.color.onColor} />
            </Pressable>
            <View style={styles.dateCopy}>
              <Text style={styles.dateLabel}>{formatDate(anchor, i18n.language)}</Text>
              {!isToday && (
                <Pressable accessibilityRole="button" onPress={() => setAnchor(todayKey())} style={styles.todayButton}>
                  <Text style={styles.todayText}>{t("gpsHistory.today")}</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("gpsHistory.nextDay")}
              accessibilityState={{ disabled: isToday }}
              disabled={isToday}
              onPress={() => moveDay(1)}
              style={({ pressed }) => [
                styles.navButton,
                { width: touchTarget, height: touchTarget },
                isToday && styles.disabled,
                pressed && !isToday && styles.pressed,
              ]}
            >
              <Icon name="chevron-forward" size={22} color={fieldTheme.color.onColor} />
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={fieldTheme.color.primary} />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : (
        <FlatList
          data={points}
          keyExtractor={(point) => point.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                fetchHistory(anchor)
              }}
              tintColor={fieldTheme.color.primary}
              colors={[fieldTheme.color.primary]}
            />
          }
          ListHeaderComponent={
            <>
              {offline && (
                <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
                  <Icon name="cloud-offline-outline" size={20} color={fieldTheme.color.amber} />
                  <Text style={styles.offlineText}>{t("gpsHistory.offlineNote")}</Text>
                </View>
              )}

              <View style={[styles.summaryGrid, tablet && styles.summaryGridTablet]}>
                <SummaryCard icon="walk-outline" value={`${data?.distanceKm ?? 0}`} label={t("gpsHistory.statKm")} tone="primary" />
                <SummaryCard icon="radio-outline" value={`${data?.pointCount ?? 0}`} label={t("gpsHistory.statPoints")} tone="success" />
                <SummaryCard
                  icon="timer-outline"
                  value={data?.gpsIntervalSeconds ? `${data.gpsIntervalSeconds}s` : "—"}
                  label={t("gpsHistory.statInterval")}
                  tone="blue"
                />
              </View>

              <View style={styles.explainer}>
                <Icon name="information-circle-outline" size={21} color={fieldTheme.color.primary} />
                <Text style={styles.explainerText}>{t("gpsHistory.trackingHint")}</Text>
              </View>

              {latestPoint && (
                <View style={styles.latestRow}>
                  <View>
                    <Text style={styles.sectionEyebrow}>{t("gpsHistory.lastPoint")}</Text>
                    <Text style={styles.latestTime}>{formatTime(latestPoint.recordedAt, i18n.language)}</Text>
                  </View>
                  <Icon name="checkmark-circle" size={24} color={fieldTheme.color.success} />
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty} accessibilityLiveRegion="polite">
              <View style={styles.emptyIconWrap}>
                <Icon name="location-outline" size={34} color={fieldTheme.color.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t("gpsHistory.empty")}</Text>
              <Text style={styles.emptyBody}>{t("gpsHistory.emptyHelp")}</Text>
            </View>
          }
          renderItem={({ item }) => <PointRow point={item} language={i18n.language} t={t} />}
        />
      )}
    </View>
  )
}

function SummaryCard({ icon, value, label, tone }: {
  icon: string
  value: string
  label: string
  tone: "primary" | "success" | "blue"
}) {
  const color = tone === "success"
    ? fieldTheme.color.success
    : tone === "blue"
      ? fieldTheme.color.blue
      : fieldTheme.color.primary
  const background = tone === "success"
    ? fieldTheme.color.successSoft
    : tone === "blue"
      ? fieldTheme.color.blueSoft
      : fieldTheme.color.primarySoft
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: background }]}>
        <Icon name={icon} size={21} color={color} />
      </View>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function PointRow({ point, language, t }: {
  point: GpsPoint
  language: string
  t: (key: string, options?: any) => string
}) {
  const accuracy = accuracyTone(point.accuracy)
  return (
    <View style={styles.pointRow}>
      <View style={styles.timeline}>
        <View style={styles.timelineDot} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.pointContent}>
        <Text style={styles.pointTime}>{formatTime(point.recordedAt, language)}</Text>
        <View style={styles.pointMeta}>
          {point.accuracy != null && (
            <View style={[styles.metaChip, { backgroundColor: accuracy.background }]}>
              <Icon name="locate-outline" size={14} color={accuracy.color} />
              <Text style={[styles.metaText, { color: accuracy.color }]}>{t("gpsHistory.accuracy", { value: Math.round(point.accuracy) })}</Text>
            </View>
          )}
          {point.speed != null && point.speed > 0 && (
            <View style={styles.metaChip}>
              <Icon name="speedometer-outline" size={14} color={fieldTheme.color.inkMuted} />
              <Text style={styles.metaText}>{t("gpsHistory.speed", { value: Math.round(point.speed * 3.6) })}</Text>
            </View>
          )}
          {point.battery != null && (
            <View style={styles.metaChip}>
              <Icon name="battery-half-outline" size={14} color={fieldTheme.color.inkMuted} />
              <Text style={styles.metaText}>{t("gpsHistory.battery", { value: Math.round(point.battery) })}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingBottom: fieldTheme.space.lg, paddingHorizontal: fieldTheme.space.lg },
  headerInner: { width: "100%", maxWidth: 1000, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: { borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  titleCopy: { flex: 1 },
  eyebrow: { color: "#BBD6CB", fontSize: 12, lineHeight: 16, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 2 },
  headerSubtitle: { color: "#D7E9E1", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  dayNavigation: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  navButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  dateCopy: { flex: 1, alignItems: "center" },
  dateLabel: { color: fieldTheme.color.onColor, fontSize: 16, lineHeight: 21, fontWeight: "800", textAlign: "center" },
  todayButton: { minHeight: 32, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, marginTop: 2 },
  todayText: { color: "#C7E6DA", fontSize: 12, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 14 },
  listContent: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xxl, flexGrow: 1 },
  offlineBanner: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.amberSoft, marginBottom: fieldTheme.space.md },
  offlineText: { flex: 1, color: fieldTheme.color.amber, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  summaryGrid: { flexDirection: "row", gap: fieldTheme.space.sm },
  summaryGridTablet: { gap: fieldTheme.space.md },
  summaryCard: { flex: 1, minHeight: 112, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md },
  summaryIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summaryValue: { fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: fieldTheme.space.sm },
  summaryLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", marginTop: 1 },
  explainer: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.md, marginTop: fieldTheme.space.md },
  explainerText: { flex: 1, color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  latestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: fieldTheme.space.xl, marginBottom: fieldTheme.space.sm },
  sectionEyebrow: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  latestTime: { color: fieldTheme.color.ink, fontSize: 19, fontWeight: "900", marginTop: 2 },
  pointRow: { minHeight: 70, flexDirection: "row", backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, marginBottom: fieldTheme.space.sm },
  timeline: { width: 18, alignItems: "center", marginRight: fieldTheme.space.sm },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: fieldTheme.color.primary, marginTop: 5 },
  timelineLine: { flex: 1, width: 2, backgroundColor: fieldTheme.color.primarySoft, marginTop: 4 },
  pointContent: { flex: 1 },
  pointTime: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  pointMeta: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  metaChip: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: fieldTheme.color.surfaceStrong, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm },
  metaText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 44 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.lg },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 440, marginTop: fieldTheme.space.sm },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.72 },
})
