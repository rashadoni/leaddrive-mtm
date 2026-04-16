import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native"
import { api } from "../../services/api"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import ConfirmSheet from "../../components/ConfirmSheet"

interface MtmAlert {
  id: string
  type: string
  category: string
  title: string
  description?: string
  isResolved: boolean
  createdAt: string
}

export default function ProfileScreen() {
  const { agent, logout, switchServer, serverDomain } = useAuthStore()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [profile, setProfile] = useState<any>(null)
  const [alerts, setAlerts] = useState<MtmAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<"logout" | "switch" | null>(null)

  useEffect(() => {
    Promise.all([
      api.getProfile().catch(() => null),
      api.getAlerts({ resolved: false }).catch(() => null),
    ]).then(([profileRes, alertsRes]) => {
      if (profileRes?.success) setProfile(profileRes.data)
      if (alertsRes?.success) setAlerts(alertsRes.data?.alerts || [])
    }).finally(() => setLoading(false))
  }, [])

  const handleConfirm = () => {
    if (confirmAction === "logout") logout()
    else if (confirmAction === "switch") switchServer()
    setConfirmAction(null)
  }

  const summary = profile?.todaySummary
  const completionPct = summary?.routePoints > 0
    ? Math.round((summary.routeVisited / summary.routePoints) * 100)
    : 0

  const severityColor = (cat?: string) => {
    switch (cat) {
      case "CRITICAL": return "#ef4444"
      case "WARNING": return "#f59e0b"
      default: return "#3b82f6"
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ color: "#94a3b8", marginTop: 12, fontSize: 13 }}>Loading profile...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: tabBarPadding }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {agent?.name?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
        <Text style={styles.name}>{agent?.name}</Text>
        <Text style={styles.role}>{agent?.role}</Text>
        <Text style={styles.org}>{agent?.organizationName}</Text>
      </View>

      {/* Today's Summary */}
      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Today's Performance</Text>
          <View style={styles.statsRow}>
            <StatBox value={summary?.visits ?? 0} label="Visits" color="#0B0B1E" />
            <View style={styles.statDivider} />
            <StatBox value={summary?.tasksCompleted ?? 0} label="Tasks" color="#22c55e" />
            <View style={styles.statDivider} />
            <StatBox value={`${completionPct}%`} label="Route" color="#6C63FF" />
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.max(completionPct, 2)}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            Route: {summary?.routeVisited ?? 0}/{summary?.routePoints ?? 0} points
          </Text>
        </View>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Active Alerts</Text>
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{alerts.length}</Text>
            </View>
          </View>
          {alerts.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.alertRow}>
              <View style={[styles.alertDot, { backgroundColor: severityColor(a.category) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{a.title || a.type?.replace(/_/g, " ")}</Text>
                {a.description && <Text style={styles.alertDesc} numberOfLines={1}>{a.description}</Text>}
              </View>
              <Text style={styles.alertTime}>
                {new Date(a.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Contact Info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Contact Info</Text>
        <InfoRow label="Email" value={agent?.email || "—"} />
        <InfoRow label="Phone" value={agent?.phone || "—"} />
      </View>

      {/* Server info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <InfoRow label="Server" value={serverDomain || "—"} />
        <InfoRow label="Status" value="Connected" valueColor="#22c55e" />
      </View>

      {/* Actions */}
      <TouchableOpacity style={styles.logoutBtn} onPress={() => setConfirmAction("logout")}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.switchBtn} onPress={() => setConfirmAction("switch")}>
        <Text style={styles.switchText}>Switch Company</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Route & Field v1.1.0</Text>

      {/* Confirm sheets */}
      <ConfirmSheet
        visible={confirmAction === "logout"}
        icon="👋"
        iconColor="#ef4444"
        title="Logout"
        message="Are you sure you want to logout? You'll need to sign in again."
        confirmText="Logout"
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
      <ConfirmSheet
        visible={confirmAction === "switch"}
        icon="🔄"
        iconColor="#6C63FF"
        title="Switch Company"
        message="This will log you out and clear server settings. You'll need to enter a new server address."
        confirmText="Switch"
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
    </ScrollView>
  )
}

function StatBox({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 32,
    alignItems: "center",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "800" },
  name: { color: "#fff", fontSize: 22, fontWeight: "800" },
  role: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  org: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 },

  // Summary
  summaryCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },
  progressTrack: { height: 6, backgroundColor: "#f1f5f9", borderRadius: 3, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: "#6C63FF", borderRadius: 3 },
  progressLabel: { fontSize: 10, color: "#94a3b8", marginTop: 8, textAlign: "center" },

  // Cards
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Alerts
  alertBadge: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginBottom: 14,
  },
  alertBadgeText: { color: "#ef4444", fontSize: 11, fontWeight: "700" },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
    gap: 10,
  },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertTitle: { fontSize: 13, fontWeight: "600", color: "#0B0B1E" },
  alertDesc: { fontSize: 11, color: "#64748b", marginTop: 2 },
  alertTime: { fontSize: 10, color: "#94a3b8" },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  infoLabel: { fontSize: 13, color: "#94a3b8", flex: 1 },
  infoValue: { fontSize: 13, fontWeight: "600", color: "#0B0B1E" },

  // Action buttons
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "700" },
  switchBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: "#f0f0ff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0ff",
  },
  switchText: { color: "#6C63FF", fontSize: 15, fontWeight: "700" },
  version: { textAlign: "center", color: "#cbd5e1", fontSize: 11, marginTop: 20, marginBottom: 10 },
})
