import React, { useMemo, useState } from "react"
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { toTaskDetail, taskTimeline, type TaskTimelineKey } from "../../services/task-detail"
import { api } from "../../services/api"
import { useAuthStore } from "../../store/auth"
import { isManagerRole } from "../../auth/roles"
import EditTaskModal, { type TaskEditFields } from "../../components/EditTaskModal"
import FeedbackToast from "../../components/FeedbackToast"
import NotesModal from "../../components/NotesModal"

const STATUS_KEY: Record<string, string> = {
  PENDING: "task.statusToDo",
  IN_PROGRESS: "task.statusActive",
  COMPLETED: "task.statusDone",
  CANCELLED: "task.statusCancelled",
  OVERDUE: "task.statusOverdue",
}

const PRIORITY_KEY: Record<string, string> = {
  LOW: "task.priorityLow",
  MEDIUM: "task.priorityMedium",
  HIGH: "task.priorityHigh",
  URGENT: "task.priorityUrgent",
}

const TIMELINE_KEY: Record<TaskTimelineKey, string> = {
  created: "task.tlCreated",
  accepted: "task.tlAccepted",
  started: "task.tlStarted",
  due: "task.tlDue",
  completed: "task.tlCompleted",
}

const RECUR_KEY: Record<string, string> = {
  DAILY: "task.recurDaily",
  WEEKLY: "task.recurWeekly",
  MONTHLY: "task.recurMonthly",
}

function priorityColor(p: string): string {
  switch (p) {
    case "HIGH":
    case "URGENT":
      return "#ef4444"
    case "MEDIUM":
      return "#f59e0b"
    default:
      return "#22c55e"
  }
}

export default function TaskDetailScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "TaskDetail">>()
  const headerTop = useHeaderTop()
  const [task, setTask] = useState(() => toTaskDetail(route.params.task))
  const role = useAuthStore((s) => s.agent?.role)
  const myAgentId = useAuthStore((s) => s.agent?.id)
  const canEdit = isManagerRole(role)
  const isOwnTask = !!myAgentId && task.agentId === myAgentId
  const canReportProgress = isOwnTask && task.status !== "COMPLETED" && task.status !== "CANCELLED"
  const canReturn = canEdit && task.status === "COMPLETED"
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [returnVisible, setReturnVisible] = useState(false)
  const [returning, setReturning] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })
  const timeline = taskTimeline(task)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" })
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

  const statusLabel = t(STATUS_KEY[task.status] ?? "task.statusToDo")
  const priorityLabel = t(PRIORITY_KEY[task.priority] ?? "task.priorityMedium")
  const color = priorityColor(task.priority)
  const editInitial = useMemo<TaskEditFields>(
    () => ({
      title: task.title,
      description: task.description,
      priority: task.priority,
      recurrenceRule: task.recurrence?.rule ?? null,
      recurrenceInterval: task.recurrence?.interval ?? 1,
    }),
    [task.title, task.description, task.priority, task.recurrence],
  )

  const handleSave = async (fields: TaskEditFields) => {
    if (saving) return
    setSaving(true)
    try {
      const res = await api.updateTaskFields(task.id, {
        title: fields.title,
        description: fields.description,
        priority: fields.priority,
        recurrenceRule: fields.recurrenceRule,
        ...(fields.recurrenceRule ? { recurrenceInterval: fields.recurrenceInterval } : {}),
      })
      if (res?.success) {
        setTask((prev) => ({
          ...prev,
          title: fields.title,
          description: fields.description,
          priority: fields.priority,
          recurrence: fields.recurrenceRule
            ? { rule: fields.recurrenceRule, interval: fields.recurrenceInterval, until: prev.recurrence?.until ?? null }
            : null,
        }))
        setEditing(false)
        setToast({ visible: true, type: "success", title: t("task.editSaved") })
      }
    } catch (e: any) {
      if (e?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: t("task.editFailed") })
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async () => {
    if (duplicating) return
    setDuplicating(true)
    try {
      const res = await api.duplicateTask(task.id)
      if (res?.success) setToast({ visible: true, type: "success", title: t("task.duplicated") })
    } catch (e: any) {
      if (e?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: t("task.duplicateFailed") })
    } finally {
      setDuplicating(false)
    }
  }

  const handleReturn = async (reason: string) => {
    if (returning || !reason.trim()) return
    setReturning(true)
    try {
      const res = await api.returnTask(task.id, reason.trim())
      if (res?.success) {
        setTask((t2) => ({ ...t2, status: "IN_PROGRESS", completedAt: null, returnReason: reason.trim() }))
        setToast({ visible: true, type: "success", title: t("task.returned") })
      }
    } catch (e: any) {
      if (e?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: t("task.returnFailed") })
    } finally {
      setReturning(false)
    }
  }

  // Optimistic progress: reflect the new value at once, revert on failure.
  const handleProgress = async (next: number) => {
    const clamped = Math.min(100, Math.max(0, next))
    const prev = task.progress
    if (clamped === (prev ?? 0)) return
    setTask((t2) => ({ ...t2, progress: clamped }))
    try {
      const res = await api.updateTaskProgress(task.id, clamped)
      if (!res?.success) setTask((t2) => ({ ...t2, progress: prev }))
    } catch (e: any) {
      setTask((t2) => ({ ...t2, progress: prev }))
      if (e?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: t("task.progressFailed") })
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerMain}>
            <Text style={styles.headerEyebrow}>{t("task.detailTitle")}</Text>
            <Text style={styles.headerTitle} numberOfLines={3}>{task.title}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </View>
            {canEdit && (
              <View style={styles.headerBtns}>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                  <Text style={styles.editBtnText}>{t("task.editButton")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, duplicating && styles.btnBusy]}
                  onPress={handleDuplicate}
                  disabled={duplicating}
                >
                  <Text style={styles.editBtnText}>{duplicating ? t("task.duplicating") : t("task.duplicate")}</Text>
                </TouchableOpacity>
                {canReturn && (
                  <TouchableOpacity
                    style={[styles.returnBtn, returning && styles.btnBusy]}
                    onPress={() => setReturnVisible(true)}
                    disabled={returning}
                  >
                    <Text style={styles.returnBtnText}>{t("task.returnButton")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {task.returnReason ? (
          <View style={styles.returnBanner}>
            <Text style={styles.returnBannerTitle}>{t("task.returnedBanner")}</Text>
            <Text style={styles.returnBannerBody}>{task.returnReason}</Text>
          </View>
        ) : null}

        {task.description ? (
          <View style={styles.card}>
            <Text style={styles.desc}>{task.description}</Text>
          </View>
        ) : null}

        {/* Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("task.sectionDetails")}</Text>
          <Field label={t("task.fieldStatus")} value={statusLabel} />
          <Field label={t("task.fieldPriority")} value={priorityLabel} valueColor={color} />
          {task.dueDate ? <Field label={t("task.fieldDue")} value={fmtDate(task.dueDate)} /> : null}
          {task.agentName ? <Field label={t("task.fieldAssignee")} value={task.agentName} /> : null}
          {task.customerName ? (
            <Field
              label={t("task.fieldOrg")}
              value={task.customerAddress ? `${task.customerName} · ${task.customerAddress}` : task.customerName}
            />
          ) : null}
        </View>

        {/* Progress */}
        {(task.progress !== null || canReportProgress) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("task.sectionProgress")}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${task.progress ?? 0}%` }]} />
              </View>
              <Text style={styles.progressPct}>{task.progress ?? 0}%</Text>
            </View>
            {canReportProgress && (
              <View style={styles.progressStepper}>
                <TouchableOpacity
                  style={[styles.progressStepBtn, (task.progress ?? 0) <= 0 && styles.btnBusy]}
                  onPress={() => handleProgress((task.progress ?? 0) - 10)}
                  disabled={(task.progress ?? 0) <= 0}
                >
                  <Text style={styles.progressStepText}>−10%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.progressStepBtn, (task.progress ?? 0) >= 100 && styles.btnBusy]}
                  onPress={() => handleProgress((task.progress ?? 0) + 10)}
                  disabled={(task.progress ?? 0) >= 100}
                >
                  <Text style={styles.progressStepText}>+10%</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Timeline */}
        {timeline.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("task.sectionTimeline")}</Text>
            {timeline.map((entry, index) => (
              <View key={`${entry.key}-${index}`} style={styles.tlRow}>
                <View style={styles.tlRail}>
                  <View style={[styles.tlDot, entry.kind === "target" && styles.tlDotTarget]} />
                  {index < timeline.length - 1 && <View style={styles.tlLine} />}
                </View>
                <View style={styles.tlBody}>
                  <Text style={styles.tlLabel}>{t(TIMELINE_KEY[entry.key])}</Text>
                  <Text style={styles.tlTime}>{fmtDateTime(entry.at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recurrence */}
        {task.recurrence && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("task.sectionRecurrence")}</Text>
            <Field
              label={t("task.fieldRepeats")}
              value={
                task.recurrence.interval > 1
                  ? `${t("task.recurEvery", { n: task.recurrence.interval })} · ${t(RECUR_KEY[task.recurrence.rule] ?? "task.recurDaily")}`
                  : t(RECUR_KEY[task.recurrence.rule] ?? "task.recurDaily")
              }
            />
            {task.recurrence.until ? (
              <Field label={t("task.fieldUntil")} value={fmtDate(task.recurrence.until)} />
            ) : null}
          </View>
        )}

        {/* Result */}
        {task.result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("task.sectionResult")}</Text>
            <Text style={styles.desc}>{task.result}</Text>
          </View>
        ) : null}
      </ScrollView>

      {canEdit && (
        <EditTaskModal
          visible={editing}
          saving={saving}
          initial={editInitial}
          onCancel={() => setEditing(false)}
          onSave={handleSave}
        />
      )}
      <NotesModal
        visible={returnVisible}
        title={t("task.returnTitle")}
        message={t("task.returnMessage")}
        onCancel={() => setReturnVisible(false)}
        onSubmit={(reason) => { setReturnVisible(false); if (reason.trim()) handleReturn(reason) }}
      />
      <FeedbackToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        onDismiss={() => setToast((s) => ({ ...s, visible: false }))}
      />
    </View>
  )
}

function Field({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 24,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: 2 },
  backIcon: { color: "#fff", fontSize: 30, lineHeight: 30, fontWeight: "700" },
  headerMain: { flex: 1, gap: 2 },
  headerEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerRight: { alignItems: "flex-end", gap: 6, marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.18)" },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  headerBtns: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  editBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "#fff" },
  editBtnText: { color: "#6C63FF", fontSize: 12, fontWeight: "800" },
  returnBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "#fee2e2" },
  returnBtnText: { color: "#dc2626", fontSize: 12, fontWeight: "800" },
  btnBusy: { opacity: 0.5 },
  returnBanner: { backgroundColor: "#fef2f2", borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", padding: 14 },
  returnBannerTitle: { fontSize: 12, fontWeight: "800", color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  returnBannerBody: { fontSize: 14, color: "#991b1b", lineHeight: 20 },

  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardTitle: { fontSize: 12, fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  desc: { fontSize: 14, color: "#334155", lineHeight: 21 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: "#eef2ff", overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: "#6C63FF" },
  progressPct: { fontSize: 14, fontWeight: "800", color: "#0B0B1E", minWidth: 42, textAlign: "right" },
  progressStepper: { flexDirection: "row", gap: 10, marginTop: 12 },
  progressStepBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#eef2ff" },
  progressStepText: { fontSize: 14, fontWeight: "800", color: "#6C63FF" },

  field: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  fieldLabel: { fontSize: 13, color: "#94a3b8", fontWeight: "600" },
  fieldValue: { fontSize: 14, color: "#0B0B1E", fontWeight: "600", flexShrink: 1, textAlign: "right" },

  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { alignItems: "center", width: 14 },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#6C63FF", marginTop: 4 },
  tlDotTarget: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#f59e0b" },
  tlLine: { flex: 1, width: 2, backgroundColor: "#e2e8f0", marginTop: 2, minHeight: 14 },
  tlBody: { flex: 1, paddingBottom: 14 },
  tlLabel: { fontSize: 14, fontWeight: "700", color: "#0B0B1E" },
  tlTime: { fontSize: 12, color: "#64748b", marginTop: 1 },
})
