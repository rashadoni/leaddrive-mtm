import React, { useCallback, useEffect, useState } from "react"
import { Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native"
import NotesModal from "../../components/NotesModal"
import FeedbackToast from "../../components/FeedbackToast"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"
import { api } from "../../services/api"
import { toPlanningRoutes, type PlanningRoute } from "../../services/manager-planning"
import { toApprovals, type ApprovalItem, type ManagerApprovals } from "../../services/manager-approvals"

export type ManagerWorkspaceKind = "team" | "planning" | "approvals"

/** Which approval queue a decision targets — each hits its own decision endpoint. */
type ApprovalKind = "hrm" | "routeChange" | "customer"

const SCREEN_META: Record<
  ManagerWorkspaceKind,
  { titleKey: string; bodyKey: string; icon: string; color: string; tint: string }
> = {
  team: {
    titleKey: "managerShell.teamTitle",
    bodyKey: "managerShell.teamBody",
    icon: "people",
    color: fieldTheme.color.primary,
    tint: fieldTheme.color.primarySoft,
  },
  planning: {
    titleKey: "managerShell.planningTitle",
    bodyKey: "managerShell.planningBody",
    icon: "calendar",
    color: fieldTheme.color.blue,
    tint: fieldTheme.color.blueSoft,
  },
  approvals: {
    titleKey: "managerShell.approvalsTitle",
    bodyKey: "managerShell.approvalsBody",
    icon: "shield-checkmark",
    color: fieldTheme.color.amber,
    tint: fieldTheme.color.amberSoft,
  },
}

export default function ManagerWorkspaceScreen({ kind }: { kind: ManagerWorkspaceKind }) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const meta = SCREEN_META[kind]
  const tablet = isTabletWidth(width)
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string; isOnline: boolean; workday: { status: string } | null }>>([])
  const [locations, setLocations] = useState<Array<{ agentId: string; latitude: number | null; longitude: number | null; accuracy: number | null; battery: number | null; recordedAt: string | null }>>([])
  const [planning, setPlanning] = useState<PlanningRoute[]>([])
  const [approvals, setApprovals] = useState<ManagerApprovals | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ kind: ApprovalKind; id: string } | null>(null)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })

  const reload = useCallback(() => {
    setLoading(true)
    const request = kind === "team"
      ? Promise.all([api.getManagerTeam(), api.getManagerLocations()])
      : kind === "planning"
        ? api.getManagerPlanning()
        : api.getManagerApprovals()
    request.then((response: any) => {
        if (kind === "team") {
          setTeam(response?.[0]?.data?.agents || [])
          setLocations(response?.[1]?.data?.locations || [])
        } else if (kind === "planning") setPlanning(toPlanningRoutes(response?.data))
        else setApprovals(toApprovals(response?.data))
      })
      .catch(() => { setTeam([]); setPlanning([]); setApprovals(null) })
      .finally(() => setLoading(false))
  }, [kind])

  useEffect(() => { reload() }, [reload])

  const decide = async (queue: ApprovalKind, id: string, decision: "APPROVED" | "REJECTED", note?: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      const res = queue === "hrm"
        ? await api.hrmDecision(id, decision, note)
        : queue === "routeChange"
          ? await api.routeChangeDecision(id, decision, note)
          : await api.customerCreateDecision(id, decision, note)
      if (res?.success) {
        setToast({ visible: true, type: "success", title: t(decision === "APPROVED" ? "managerShell.approved" : "managerShell.rejected") })
        reload()
      }
    } catch (e: any) {
      if (e?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: t("common.error") })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, tablet && styles.headerInnerTablet]}>
          <View style={[styles.icon, { backgroundColor: meta.tint }]}>
            <Icon name={meta.icon} size={28} color={meta.color} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t("dashboardV2.managerWorkspace")}</Text>
            <Text style={styles.title}>{t(meta.titleKey)}</Text>
            <Text style={styles.body}>{t(meta.bodyKey)}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]}>
        {kind === "team" ? (
          team.length > 0 ? (
          <View style={styles.teamList}>
            {team.map((agent) => (
              <View key={agent.id} style={styles.agentRow}>
                <View style={[styles.presenceDot, { backgroundColor: agent.isOnline ? fieldTheme.color.success : fieldTheme.color.border }]} />
                <View style={styles.agentCopy}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentMeta}>{agent.role} · {agent.workday?.status || t("dashboardV2.unavailable")}</Text>
                {(() => {
                  const location = locations.find((item) => item.agentId === agent.id)
                  if (!location || location.latitude == null || location.longitude == null) return <Text style={styles.locationMeta}>Location unavailable</Text>
                  const coords = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                  const accuracy = location.accuracy == null ? "" : ` · ±${Math.round(location.accuracy)}m`
                  const battery = location.battery == null ? "" : ` · ${Math.round(location.battery)}%`
                  const recordedAt = location.recordedAt ? ` · ${new Date(location.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""
                  return (
                    <View style={styles.locationBlock}>
                      <Text style={styles.locationMeta}>{coords}{accuracy}{battery}{recordedAt}</Text>
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel="Open location on map"
                        onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`)}
                      >
                        <Text style={styles.mapLink}>Open on map</Text>
                      </Pressable>
                    </View>
                  )
                })()}
                </View>
                <Text style={styles.agentState}>{agent.isOnline ? "ONLINE" : "OFFLINE"}</Text>
              </View>
            ))}
          </View>
          ) : (
            <StatusPanel icon="people-outline" color={meta.color} title={loading ? t("common.loading") : t("managerShell.teamEmpty")} body={t(meta.bodyKey)} />
          )
        ) : kind === "planning" ? (
          planning.length > 0 ? (
            <View style={styles.itemList}>
              {planning.map((r) => (
                <View key={r.id} style={styles.itemCard}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{r.name || t("managerShell.routeFallback")}</Text>
                    <Text style={styles.itemMeta}>{r.agentName}{r.total > 0 ? ` · ${r.visited}/${r.total}` : ""}</Text>
                  </View>
                  <View style={styles.itemPill}><Text style={styles.itemPillText}>{r.status}</Text></View>
                </View>
              ))}
            </View>
          ) : (
            <StatusPanel icon="calendar-outline" color={meta.color} title={loading ? t("common.loading") : t("managerShell.planningEmpty")} body={t(meta.bodyKey)} />
          )
        ) : (
          approvals && approvals.total > 0 ? (
            <View style={styles.itemList}>
              <ApprovalSection title={t("managerShell.approvalsHrm")} items={approvals.hrm} t={t} busyId={busyId} onApprove={(id) => decide("hrm", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "hrm", id })} />
              <ApprovalSection title={t("managerShell.approvalsRouteChanges")} items={approvals.routeChanges} t={t} busyId={busyId} onApprove={(id) => decide("routeChange", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "routeChange", id })} />
              <ApprovalSection title={t("managerShell.approvalsCustomers")} items={approvals.customers} t={t} busyId={busyId} onApprove={(id) => decide("customer", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "customer", id })} />
            </View>
          ) : (
            <StatusPanel icon="checkmark-done-outline" color={meta.color} title={loading ? t("common.loading") : t("managerShell.approvalsEmpty")} body={t(meta.bodyKey)} />
          )
        )}
      </ScrollView>

      <NotesModal
        visible={rejectTarget !== null}
        title={t("managerShell.rejectTitle")}
        message={t("managerShell.rejectMessage")}
        onCancel={() => setRejectTarget(null)}
        onSubmit={(note) => { const target = rejectTarget; setRejectTarget(null); if (target) decide(target.kind, target.id, "REJECTED", note) }}
      />
      <FeedbackToast visible={toast.visible} type={toast.type} title={toast.title} onDismiss={() => setToast((s) => ({ ...s, visible: false }))} />
    </View>
  )
}

function StatusPanel({ icon, color, title, body }: { icon: string; color: string; title: string; body: string }) {
  return (
    <View style={styles.statusPanel}>
      <View style={styles.statusIcon}><Icon name={icon} size={22} color={color} /></View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusBody}>{body}</Text>
      </View>
    </View>
  )
}

function ApprovalSection({ title, items, t, busyId, onApprove, onReject }: {
  title: string
  items: ApprovalItem[]
  t: (k: string) => string
  busyId?: string | null
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (items.length === 0) return null
  const actionable = !!(onApprove && onReject)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title} · {items.length}</Text>
      {items.map((it) => (
        <View key={it.id} style={styles.itemCard}>
          <View style={styles.itemMain}>
            <Text style={styles.itemTitle}>{it.primary}</Text>
            <Text style={styles.itemMeta} numberOfLines={2}>{it.agentName}{it.reason ? ` · ${it.reason}` : ""}</Text>
          </View>
          {actionable && (
            <View style={styles.decisionBtns}>
              <TouchableOpacity style={[styles.approveBtn, busyId === it.id && styles.btnBusy]} disabled={busyId === it.id} onPress={() => onApprove!(it.id)}>
                <Text style={styles.approveBtnText}>{t("managerShell.approve")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rejectBtn, busyId === it.id && styles.btnBusy]} disabled={busyId === it.id} onPress={() => onReject!(it.id)}>
                <Text style={styles.rejectBtnText}>{t("managerShell.reject")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.surface,
    borderBottomColor: fieldTheme.color.border,
    borderBottomWidth: 1,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.xl,
  },
  headerInner: { gap: fieldTheme.space.lg },
  headerInnerTablet: {
    // Content cap, not a viewport breakpoint: keep copy comfortably wide on
    // expanded tablets while the shared 840dp helper decides when this row is used.
    maxWidth: 960,
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: fieldTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, gap: fieldTheme.space.xs },
  eyebrow: {
    color: fieldTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: { color: fieldTheme.color.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.7 },
  body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 680 },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.xl },
  contentTablet: { padding: fieldTheme.space.xl, maxWidth: 1180 },
  statusPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCopy: { flex: 1, gap: 3 },
  statusTitle: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "800" },
  statusBody: { color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 19 },
  teamList: { gap: fieldTheme.space.sm },
  agentRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  presenceDot: { width: 10, height: 10, borderRadius: fieldTheme.radius.pill },
  agentCopy: { flex: 1, gap: 2 },
  agentName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  agentMeta: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  locationBlock: { gap: 2 },
  locationMeta: { color: fieldTheme.color.blue, fontSize: 11, fontWeight: "700" },
  mapLink: { color: fieldTheme.color.primary, fontSize: 11, fontWeight: "800" },
  agentState: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800" },
  skeletonGrid: { gap: fieldTheme.space.md },
  skeletonGridTablet: { flexDirection: "row", flexWrap: "wrap" },
  skeleton: {
    minHeight: 154,
    padding: fieldTheme.space.lg,
    gap: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  skeletonTablet: { width: "48%" },
  skeletonDot: { width: 38, height: 38, borderRadius: fieldTheme.radius.md },
  skeletonLineStrong: {
    height: 14,
    width: "62%",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  skeletonLine: {
    height: 9,
    width: "88%",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  skeletonLineShort: { width: "46%" },

  itemList: { gap: fieldTheme.space.sm },
  itemCard: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border },
  itemMain: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.ink },
  itemMeta: { fontSize: 12, color: fieldTheme.color.inkMuted, marginTop: 2 },
  itemPill: { backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  itemPillText: { fontSize: 10, fontWeight: "700", color: fieldTheme.color.primaryStrong },
  section: { gap: fieldTheme.space.sm, marginBottom: fieldTheme.space.md },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: fieldTheme.color.inkMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  decisionBtns: { flexDirection: "row", gap: fieldTheme.space.xs },
  approveBtn: { backgroundColor: fieldTheme.color.successSoft, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  approveBtnText: { color: fieldTheme.color.success, fontSize: 12, fontWeight: "700" },
  rejectBtn: { backgroundColor: fieldTheme.color.dangerSoft, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  rejectBtnText: { color: fieldTheme.color.danger, fontSize: 12, fontWeight: "700" },
  btnBusy: { opacity: 0.5 },
})
