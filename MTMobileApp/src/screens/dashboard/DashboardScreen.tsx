import React, { useEffect, useCallback } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useKpiStore, KpiPeriod } from "../../store/kpi"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import HintCard from "../../components/HintCard"

const PERIODS: KpiPeriod[] = ["today", "week", "month"]
const PERIOD_KEY: Record<KpiPeriod, string> = {
  today: "dashboard.today",
  week: "dashboard.week",
  month: "dashboard.month",
}

export default function DashboardScreen() {
  const { t, i18n } = useTranslation()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()

  const { stats, loading, error, period, fetchKpi, setPeriod } = useKpiStore()
  const agent = useAuthStore((s) => s.agent)

  const agentName = agent?.name ?? ""

  const load = useCallback(
    (p?: KpiPeriod) => {
      fetchKpi(p ?? period)
    },
    [fetchKpi, period]
  )

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const refreshing = loading && stats !== null

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>
              {t("dashboard.greeting", { name: agentName })}
            </Text>
            <Text style={styles.dateText}>{today}</Text>
          </View>
          {loading && !stats && (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
          )}
        </View>

        {/* Period pills */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodPill, period === p && styles.periodPillActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {t(PERIOD_KEY[p])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load()}
            tintColor="#6C63FF"
            colors={["#6C63FF"]}
          />
        }
      >
        <HintCard id="dashboard.refresh" text={t("hints.dashboardRefresh")} />
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {/* Visits card */}
            <KpiCard
              label={t("dashboard.visits")}
              color="#6C63FF"
              value={
                stats ? `${stats.visits.completed}/${stats.visits.total}` : "—"
              }
              showProgress={!!stats}
              progress={
                stats && stats.visits.total > 0
                  ? stats.visits.completed / stats.visits.total
                  : 0
              }
            />

            {/* Tasks card */}
            <KpiCard
              label={t("dashboard.tasks")}
              color="#f59e0b"
              value={
                stats ? `${stats.tasks.done}/${stats.tasks.total}` : "—"
              }
              showProgress={!!stats}
              progress={
                stats && stats.tasks.total > 0
                  ? stats.tasks.done / stats.tasks.total
                  : 0
              }
            />

            {/* Photos card */}
            <KpiCard
              label={t("dashboard.photos")}
              color="#3b82f6"
              value={stats ? String(stats.photos.count) : "—"}
            />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

interface KpiCardProps {
  label: string
  color: string
  value: string
  showProgress?: boolean
  progress?: number
}

function KpiCard({ label, color, value, showProgress = false, progress = 0 }: KpiCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: color }]} />
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      {showProgress && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: color, width: `${Math.min(progress * 100, 100)}%` },
            ]}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  dateText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 2,
  },

  // Period pills
  periodRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  periodPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  periodPillActive: {
    backgroundColor: "#fff",
  },
  periodText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  periodTextActive: {
    color: "#6C63FF",
  },

  // Error
  errorCard: {
    margin: 16,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 16,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
  },

  // KPI grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingTop: 12,
    gap: 0,
  },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    margin: "1%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  cardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: -0.5,
  },

  // Progress bar
  progressTrack: {
    height: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
})
