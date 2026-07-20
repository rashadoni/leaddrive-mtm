import React, { useState, useCallback } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { readOfflineTasks } from "../../services/offline-reads"
import { flushOutbox } from "../../services/outbox"
import { countPendingTaskUpdates, queueTaskStatusUpdate } from "../../services/task-outbox"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import FeedbackToast from "../../components/FeedbackToast"
import NotesModal from "../../components/NotesModal"
import HintCard from "../../components/HintCard"

interface Task {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  dueDate?: string
  customer?: { name: string; address?: string }
}

const STATUS_TABS = ["PENDING", "IN_PROGRESS", "COMPLETED"]
const STATUS_LABEL_KEY: Record<string, string> = {
  PENDING: "task.statusToDo",
  IN_PROGRESS: "task.statusActive",
  COMPLETED: "task.statusDone",
}

export default function TasksScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [activeTab, setActiveTab] = useState("PENDING")
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string; message?: string }>({
    visible: false, type: "success", title: "",
  })
  const [notesVisible, setNotesVisible] = useState(false)
  const [pendingCompleteTask, setPendingCompleteTask] = useState<Task | null>(null)
  const [pendingSync, setPendingSync] = useState(0)

  const refreshPending = useCallback(async () => {
    try {
      setPendingSync(await countPendingTaskUpdates())
    } catch {}
  }, [])

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.getTasks()
      if (res.success) {
        setTasks(res.data?.tasks || [])
        setOffline(false)
      }
    } catch (e: any) {
      // SESSION_EXPIRED is handled by the api interceptor (logs the agent out);
      // anything else is a network/timeout failure — fall back to the durable
      // sync cache so the rep still sees their last-synced tasks offline.
      if (e.message !== "SESSION_EXPIRED") {
        const agent = useAuthStore.getState().agent
        if (agent) {
          try {
            const cached = await readOfflineTasks(agent.organizationId, agent.id)
            if (cached.length > 0) setTasks(cached)
          } catch {}
        }
        setOffline(true)
        console.warn("Failed to fetch tasks:", e.message)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load + keep fresh: tasks created in the admin panel appear
  // by themselves (focus / foreground / 60s poll; fetchTasks is silent).
  useAutoRefresh(
    useCallback(() => { fetchTasks(); refreshPending() }, [fetchTasks, refreshPending])
  )

  /**
   * Durable task status change: update the card optimistically, queue the
   * change in the outbox (so it survives offline / cold restart), then try an
   * immediate flush. When the flush reaches the server we re-fetch to reconcile
   * with server truth (a rejected transition reverts the optimistic status);
   * when offline the change stays queued and the pending indicator shows it.
   */
  const applyTaskStatus = async (
    task: Task,
    newStatus: string,
    result: string | undefined,
    toastTitle: string,
    failureMessage: string,
  ) => {
    setUpdatingTaskId(task.id)
    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: newStatus } : item)))
    try {
      await queueTaskStatusUpdate(task.id, newStatus, result)
      const flush = await flushOutbox((ops) => api.syncPush(ops))
      await refreshPending()
      // sent > 0 means the server accepted (or conflicted on) the batch — we are
      // online, so reconcile with authoritative state. deferred-only means we
      // are offline: keep the optimistic status until the lifecycle flush lands.
      if (flush.sent > 0) await fetchTasks()
      setToast({ visible: true, type: "success", title: toastTitle, message: task.title })
    } catch (e: any) {
      console.warn("[TasksScreen] queue-task error:", e?.message ?? e)
      setToast({ visible: true, type: "error", title: t("common.error"), message: failureMessage })
      fetchTasks()
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleStatusChange = async (task: Task, newStatus: string) => {
    if (updatingTaskId) return

    // Show notes modal for completion
    if (newStatus === "COMPLETED") {
      setPendingCompleteTask(task)
      setNotesVisible(true)
      return
    }

    await applyTaskStatus(task, newStatus, undefined, t("task.startedToastTitle"), t("task.updateFailed"))
  }

  const handleCompleteWithNotes = async (notes: string) => {
    if (!pendingCompleteTask || updatingTaskId) return
    const task = pendingCompleteTask
    setPendingCompleteTask(null)
    await applyTaskStatus(task, "COMPLETED", notes || undefined, t("task.completedToastTitle"), t("task.completeFailed"))
  }

  const filtered = tasks.filter((t) => t.status === activeTab)
  const urgentCount = tasks.filter(t => t.priority === "HIGH" || t.priority === "URGENT").length
  const overdueCount = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "COMPLETED").length
  const dueTodayCount = tasks.filter(t => {
    if (!t.dueDate || t.status === "COMPLETED") return false
    return new Date(t.dueDate).toDateString() === new Date().toDateString()
  }).length

  const priorityColor = (p: string) => {
    switch (p) {
      case "HIGH": case "URGENT": return "#ef4444"
      case "MEDIUM": return "#f59e0b"
      default: return "#22c55e"
    }
  }

  const isOverdue = (task: Task) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "COMPLETED"

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>{t("task.title")}</Text>
            <Text style={styles.headerSubtitle}>
              {t("task.totalTemplate", { n: tasks.length })} •{" "}
              {overdueCount > 0 ? t("task.overdueTemplate", { n: overdueCount }) : t("task.allOnTrack")}
            </Text>
          </View>
          {urgentCount > 0 && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentNum}>{urgentCount}</Text>
              <Text style={styles.urgentLabel}>{t("task.urgentLabel")}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <StatItem value={tasks.length} label={t("task.statTotal")} color="#0B0B1E" />
        <View style={styles.statDivider} />
        <StatItem value={urgentCount} label={t("task.statUrgent")} color="#ef4444" />
        <View style={styles.statDivider} />
        <StatItem value={dueTodayCount} label={t("task.statDueToday")} color="#f59e0b" />
        <View style={styles.statDivider} />
        <StatItem value={overdueCount} label={t("task.statOverdue")} color={overdueCount > 0 ? "#ef4444" : "#94a3b8"} />
      </View>

      {/* Offline indicator — cache-backed data when the network is unreachable */}
      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineDot}>●</Text>
          <Text style={styles.offlineBannerText}>{t("common.offlineCached")}</Text>
        </View>
      )}

      {/* Pending-sync indicator — queued task changes awaiting the server */}
      {pendingSync > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncDot}>⟳</Text>
          <Text style={styles.syncBannerText}>{t("task.pendingSyncTemplate", { n: pendingSync })}</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = tasks.filter((t) => t.status === tab).length
          const isActive = activeTab === tab
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t(STATUS_LABEL_KEY[tab])}
              </Text>
              <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <HintCard id="tasks.status" text={t("hints.tasksStatus")} />

      {/* Tasks list */}
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks() }} tintColor="#6C63FF" colors={["#6C63FF"]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>
                {activeTab === "COMPLETED" ? "🎉" : "📋"}
              </Text>
            </View>
            <Text style={styles.emptyTitle}>
              {loading
                ? t("common.loading")
                : activeTab === "COMPLETED"
                  ? t("task.emptyCompleted")
                  : t("task.emptyAllClear")}
            </Text>
            <Text style={styles.emptySubtitle}>
              {!loading && activeTab !== "COMPLETED" ? t("task.emptyPendingHint") : ""}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.taskCard, isOverdue(item) && styles.taskOverdue]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("TaskDetail", { task: item })}
          >
            <View style={styles.taskTop}>
              <View style={[styles.priorityDot, { backgroundColor: priorityColor(item.priority) }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.taskHeader}>
                  <View style={[styles.priorityBadge, { backgroundColor: priorityColor(item.priority) + "15" }]}>
                    <Text style={[styles.priorityText, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
                  </View>
                  {isOverdue(item) && (
                    <View style={styles.overdueBadge}>
                      <Text style={styles.overdueText}>{t("task.overdueBadge")}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.taskTitle}>{item.title}</Text>
                {item.description && (
                  <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
                )}
              </View>
            </View>

            {/* Meta */}
            <View style={styles.taskMeta}>
              {item.customer && (
                <View style={styles.metaTag}>
                  <Text style={styles.metaText}>{item.customer.name}</Text>
                </View>
              )}
              {item.dueDate && (
                <View style={[styles.metaTag, isOverdue(item) && { backgroundColor: "#fef2f2" }]}>
                  <Text style={[styles.metaText, isOverdue(item) && { color: "#ef4444" }]}>
                    {new Date(item.dueDate).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
                  </Text>
                </View>
              )}
            </View>

            {/* Action buttons */}
            {item.status !== "COMPLETED" && (
              <View style={styles.taskActions}>
                {item.status === "PENDING" && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.startBtn, updatingTaskId === item.id && { opacity: 0.5 }]}
                    onPress={() => handleStatusChange(item, "IN_PROGRESS")}
                    disabled={updatingTaskId === item.id}
                  >
                    <Text style={styles.startBtnText}>
                      {updatingTaskId === item.id ? t("task.starting") : t("task.startButton")}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.status === "IN_PROGRESS" && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.completeBtn, updatingTaskId === item.id && { opacity: 0.5 }]}
                    onPress={() => handleStatusChange(item, "COMPLETED")}
                    disabled={updatingTaskId === item.id}
                  >
                    <Text style={styles.completeBtnText}>
                      {updatingTaskId === item.id ? t("task.completing") : t("task.completeButton")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      <NotesModal
        visible={notesVisible}
        title={t("task.resultModalTitle")}
        message={t("task.resultModalMessage")}
        onCancel={() => { setNotesVisible(false); setPendingCompleteTask(null) }}
        onSubmit={(text) => { setNotesVisible(false); handleCompleteWithNotes(text) }}
      />

      <FeedbackToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onDismiss={() => setToast(t => ({ ...t, visible: false }))}
      />
    </View>
  )
}

function StatItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  headerSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  urgentBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  urgentNum: { color: "#fff", fontSize: 20, fontWeight: "800" },
  urgentLabel: { color: "rgba(255,255,255,0.8)", fontSize: 10, textTransform: "uppercase" },

  // Stats
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  // Offline banner
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  offlineDot: { color: "#f59e0b", fontSize: 10 },
  offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "600" },

  // Pending-sync banner
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  syncDot: { color: "#6C63FF", fontSize: 12, fontWeight: "800" },
  syncBannerText: { color: "#4338ca", fontSize: 12, fontWeight: "600" },

  // Tabs
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    gap: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  tabActive: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  tabText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#fff" },
  tabCount: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  tabCountText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  tabCountTextActive: { color: "#fff" },

  // Empty
  empty: { padding: 40, alignItems: "center" },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0B0B1E", marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: "#94a3b8" },

  // Task cards
  taskCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  taskOverdue: { borderLeftWidth: 3, borderLeftColor: "#ef4444" },
  taskTop: { flexDirection: "row", gap: 10 },
  priorityDot: { width: 4, height: 4, borderRadius: 2, marginTop: 8 },
  taskHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityText: { fontSize: 9, fontWeight: "700" },
  overdueBadge: { backgroundColor: "#fef2f2", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  overdueText: { color: "#ef4444", fontSize: 9, fontWeight: "700" },
  taskTitle: { fontSize: 15, fontWeight: "700", color: "#0B0B1E" },
  taskDesc: { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 18 },

  taskMeta: { flexDirection: "row", gap: 8, marginTop: 10 },
  metaTag: { backgroundColor: "#f8fafc", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaText: { fontSize: 11, color: "#64748b", fontWeight: "500" },

  taskActions: { marginTop: 12, flexDirection: "row", gap: 8 },
  actionBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  startBtn: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe" },
  startBtnText: { color: "#3b82f6", fontSize: 13, fontWeight: "700" },
  completeBtn: { backgroundColor: "#22c55e" },
  completeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
})
