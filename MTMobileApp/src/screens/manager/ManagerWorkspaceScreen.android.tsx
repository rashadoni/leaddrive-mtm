import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import NotesModal from "../../components/NotesModal"
import FeedbackToast from "../../components/FeedbackToast"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import NotificationBell from "../../components/NotificationBell"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth } from "../../theme/layoutBreakpoints"
import { managerApi } from "../../services/manager-api"
import { useBootstrapStore } from "../../store/bootstrap"
import { contactTransferAvailable } from "../../lib/field-contacts-policy"
import { planningTodayKey, toPlanningRoutes, type PlanningRoute } from "../../services/manager-planning"
import {
  ATTENDANCE_REJECT_NOTE_MIN,
  attendanceDecisionRefusal,
  attendanceKindLabel,
  attendancePeriod,
  toAttendanceApprovals,
  type AttendanceApproval,
  doctorDecisionRefusal,
  routeDraftsAwaitingPublish,
  routeDraftWindow,
  routePublishRefusal,
  toApprovals,
  toDoctorRequestApprovals,
  type ApprovalItem,
  type DoctorRequestApproval,
  type ManagerApprovals,
  type RouteDraftApproval,
} from "../../services/manager-approvals"
import { formatLocalizedDate, formatLocalizedDateTime } from "../../lib/format-localized-date"
import { statusLabel } from "../../lib/status-labels"
import { useAuthStore } from "../../store/auth"
import {
  formatManagerEvidenceAge,
  managerAgentTruth,
  normalizeManagerLocations,
  type ManagerAgentTruth,
  type ManagerLocationEvidence,
  type ManagerTeamAgent,
} from "../../services/manager-location-truth"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import ManagerPlanningWorkspace from "./ManagerPlanningWorkspace.android"
import ManagerLiveMap from "./ManagerLiveMap.android"
import ManagerJointVisitEntry from "./ManagerJointVisitEntry.android"
import { DayLineStrip } from "../../components/DayLine"

export type ManagerWorkspaceKind = "team" | "planning" | "approvals"

/** Which approval queue a decision targets — each hits its own decision endpoint. */
type ApprovalKind = "hrm" | "routeChange" | "customer" | "contactChange" | "doctorRequest" | "attendance"

const SCREEN_META: Record<
  ManagerWorkspaceKind,
  { titleKey: string; bodyKey: string; icon: string; color: string; tint: string }
> = themed(() => ({
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
}))

/**
 * `contactTransfer` opens the «transfer contacts» door; only a navigator that
 * registers the ContactTransfer screen may pass it. The Route Field APK's
 * manager shell does not (owner-approved mockup, 2026-10-17).
 */
export default function ManagerWorkspaceScreen({ kind, contactTransfer = false }: { kind: ManagerWorkspaceKind; contactTransfer?: boolean }) {
  return kind === "planning" ? <ManagerPlanningWorkspace /> : <ManagerReadWorkspace kind={kind} contactTransfer={contactTransfer} />
}

function ManagerReadWorkspace({ kind, contactTransfer }: { kind: ManagerWorkspaceKind; contactTransfer: boolean }) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const meta = SCREEN_META[kind]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  // No "transfer contacts" door when the organization switched contacts off.
  const canTransferContacts = useBootstrapStore((state) => contactTransferAvailable(state.data?.policies)) && contactTransfer
  const timezone = useBootstrapStore((state) => state.data?.timezone)
  const [team, setTeam] = useState<ManagerTeamAgent[]>([])
  const [locations, setLocations] = useState<ManagerLocationEvidence[]>([])
  const [planning, setPlanning] = useState<PlanningRoute[]>([])
  const [approvals, setApprovals] = useState<ManagerApprovals | null>(null)
  const [routeDrafts, setRouteDrafts] = useState<RouteDraftApproval[]>([])
  const [doctorRequests, setDoctorRequests] = useState<DoctorRequestApproval[]>([])
  const [attendance, setAttendance] = useState<AttendanceApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [observedAt, setObservedAt] = useState(() => Date.now())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ kind: ApprovalKind; id: string } | null>(null)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })
  const requestId = useRef(0)
  const scrollRef = useRef<ScrollView>(null)
  const teamListY = useRef(0)

  const reload = useCallback(async (mode: "initial" | "manual" | "silent" = "initial") => {
    const currentRequestId = ++requestId.current
    setObservedAt(Date.now())
    if (mode === "initial") setLoading(true)
    if (mode === "manual") setRefreshing(true)
    const today = planningTodayKey(new Date(), timezone)
    const draftWindow = routeDraftWindow(today)
    // «Komanda» reads the approval queues too: «Təsdiq gözləyir» counts them.
    // A queue the manager may not read answers as empty, not as an error.
    const request = kind === "team"
      ? Promise.all([managerApi.getTeam(), managerApi.getLocations(), approvalQueues(draftWindow).catch(() => null)])
      : kind === "planning"
        ? managerApi.getPlanning()
        : approvalQueues(draftWindow)
    try {
      const response: any = await request
      if (currentRequestId !== requestId.current) return
      if (kind === "team") {
        setTeam(Array.isArray(response?.[0]?.data?.agents) ? response[0].data.agents : [])
        setLocations(normalizeManagerLocations(response?.[1]?.data?.locations))
        const queues = response?.[2]
        if (queues?.approvals) {
          setApprovals(toApprovals(queues.approvals.data))
          setAttendance(toAttendanceApprovals(queues.approvals.data))
        }
        if (queues?.drafts) setRouteDrafts(routeDraftsAwaitingPublish(queues.drafts.data, today))
        if (queues?.doctors) setDoctorRequests(toDoctorRequestApprovals(queues.doctors.data))
      } else if (kind === "planning") {
        setPlanning(toPlanningRoutes(response?.data))
      } else {
        // Each queue answers for itself: a manager the server lets publish
        // routes but not decide doctors still sees his drafts.
        if (response.approvals) {
          setApprovals(toApprovals(response.approvals.data))
          setAttendance(toAttendanceApprovals(response.approvals.data))
        }
        if (response.drafts) setRouteDrafts(routeDraftsAwaitingPublish(response.drafts.data, today))
        if (response.doctors) setDoctorRequests(toDoctorRequestApprovals(response.doctors.data))
      }
      setLoadError(false)
      const receivedAt = Date.now()
      setUpdatedAt(receivedAt)
      setObservedAt(receivedAt)
    } catch (error: any) {
      if (currentRequestId !== requestId.current || error?.message === "SESSION_EXPIRED") return
      // Keep the last trustworthy snapshot on a weak connection. Replacing it
      // with an empty roster would make employees appear to have disappeared.
      setLoadError(true)
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [kind, timezone])

  useAutoRefresh(useCallback(() => { void reload(updatedAt == null ? "initial" : "silent") }, [reload, updatedAt]))

  const viewerId = useAuthStore((state) => state.agent?.id)
  // The people the manager looks after — not the manager. The server's team
  // includes the viewer's own card; on the phone the owner read it as a bug
  // (2026-10-17: «менеджер сам себя видит, открывается у него карточка»).
  // His own day is the «İş günü» tab, his position the share button above.
  const teamRows = useMemo(() => {
    return team
      .filter((agent) => !viewerId || agent.id !== viewerId)
      .map((agent) => ({ agent, truth: managerAgentTruth(agent, locations, observedAt) }))
  }, [locations, observedAt, team, viewerId])

  const decide = async (queue: ApprovalKind, id: string, decision: "APPROVED" | "REJECTED", note?: string) => {
    if (busyId) return
    setBusyId(id)
    try {
      const res = queue === "hrm"
        ? await managerApi.hrmDecision(id, decision, note)
        : queue === "routeChange"
          ? await managerApi.routeChangeDecision(id, decision, note)
          : queue === "customer"
            ? await managerApi.customerCreateDecision(id, decision, note)
            : queue === "doctorRequest"
              ? await managerApi.contactCreateDecision(id, decision, note)
              : await managerApi.contactChangeDecision(id, decision, note || (decision === "APPROVED" ? t("managerShell.contactChangeApprovedNote") : t("managerShell.contactChangeRejectedNote")))
      if (res?.success) {
        setToast({ visible: true, type: "success", title: t(decision === "APPROVED" ? "managerShell.approved" : "managerShell.rejected") })
        reload("silent")
      }
    } catch (e: any) {
      if (e?.message === "SESSION_EXPIRED") return
      if (queue === "doctorRequest") {
        const refusal = doctorDecisionRefusal(e)
        setToast({ visible: true, type: "error", title: t(refusal.key) })
        if (refusal.reload) reload("silent")
      } else {
        setToast({ visible: true, type: "error", title: t("common.error") })
      }
    } finally {
      setBusyId(null)
    }
  }

  /**
   * An employee's Personnel request. The decision carries the version the
   * manager saw: a request changed meanwhile is refused, said in words, and
   * the list reloads. A rejection must give a reason; the server takes none
   * shorter than three letters, so the app asks again instead of sending it.
   */
  const decideAttendance = async (item: AttendanceApproval, decision: "APPROVED" | "REJECTED", note?: string) => {
    if (busyId) return
    if (decision === "REJECTED" && (note?.trim().length ?? 0) < ATTENDANCE_REJECT_NOTE_MIN) {
      setToast({ visible: true, type: "error", title: t("managerShell.attendanceReasonRequired") })
      return
    }
    setBusyId(item.id)
    try {
      const res = await managerApi.attendanceDecision(item.id, decision, item.version, note)
      if (res?.success) {
        setToast({ visible: true, type: "success", title: t(decision === "APPROVED" ? "managerShell.approved" : "managerShell.rejected") })
        reload("silent")
      }
    } catch (e: any) {
      if (e?.message === "SESSION_EXPIRED") return
      const refusal = attendanceDecisionRefusal(e)
      setToast({ visible: true, type: "error", title: t(refusal.key) })
      if (refusal.reload) reload("silent")
    } finally {
      setBusyId(null)
    }
  }

  const publishDraft = async (draft: RouteDraftApproval) => {
    if (busyId) return
    setBusyId(draft.id)
    try {
      const res = await managerApi.publishRouteDraft(draft.id, draft.version)
      if (res?.success) {
        setToast({ visible: true, type: "success", title: t("managerShell.published") })
        reload("silent")
      }
    } catch (e: any) {
      if (e?.message === "SESSION_EXPIRED") return
      const refusal = routePublishRefusal(e)
      setToast({ visible: true, type: "error", title: t(refusal.key) })
      if (refusal.reload) reload("silent")
    } finally {
      setBusyId(null)
    }
  }

  const draftItems: ApprovalItem[] = routeDrafts.map((draft) => ({
    id: draft.id,
    agentName: draft.agentName,
    primary: formatLocalizedDate(draft.date, i18n.language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) || draft.date,
    details: [t("managerShell.draftStops", { count: draft.stops }), draft.name].filter(Boolean).join(" · "),
  }))
  const doctorItems: ApprovalItem[] = doctorRequests.map((request) => ({
    id: request.id,
    agentName: request.agentName,
    primary: [request.displayName, request.specialtyName].filter(Boolean).join(" · "),
    details: [request.clinicName, request.address, request.phone].filter(Boolean).join(" · ") || undefined,
    reason: request.notes,
  }))
  const attendanceItems: ApprovalItem[] = attendance.map((item) => ({
    id: item.id,
    agentName: [item.employeeName, item.teamName].filter(Boolean).join(" · "),
    primary: attendanceKindLabel(item, i18n.language, t),
    details: attendancePeriod(item, (day) => formatLocalizedDate(day, i18n.language, { day: "numeric", month: "long", timeZone: "UTC" }) || day),
    reason: item.reason,
  }))
  const approvalsTotal = (approvals?.total ?? 0) + draftItems.length + doctorItems.length + attendanceItems.length

  // «Bu gün» (owner-approved mockup, 2026-10-17): four live numbers where a
  // memo of the tab bar and «share my location» stood. A tile opens the tab
  // it counts, or scrolls to the team list under the map.
  const shellTabs: string[] = (navigation.getState()?.routeNames as string[] | undefined) ?? []
  const showTeamList = () => scrollRef.current?.scrollTo({ y: Math.max(0, teamListY.current - fieldTheme.space.md), animated: true })
  const visitsPlanned = teamRows.reduce((sum, { agent }) => sum + (agent.routeToday?.planned ?? 0), 0)
  const visitsDone = teamRows.reduce((sum, { agent }) => sum + (agent.routeToday?.visited ?? 0), 0)
  const atWork = teamRows.filter(({ agent }) => agent.workday?.status === "STARTED" || agent.workday?.status === "PAUSED").length
  const needsAttention = teamRows.filter(({ agent, truth }) => (
    truth.gpsFreshness === "STALE" || truth.gpsFreshness === "NO_COORDINATES" || Boolean(agent.openVisitSince)
  )).length
  const todayTiles: TodayTile[] = [
    ...(shellTabs.includes("Approvals") ? [{
      key: "approvals",
      label: t("managerShell.tileApprovals"),
      value: String(approvalsTotal),
      hint: t("managerShell.tileApprovalsHint"),
      tone: approvalsTotal > 0 ? "primary" as const : "plain" as const,
      onPress: () => navigation.navigate("Approvals" as never),
    }] : []),
    {
      key: "visits",
      label: t("managerShell.tileVisits"),
      value: `${visitsDone} / ${visitsPlanned}`,
      hint: t("managerShell.tileVisitsHint"),
      tone: "plain",
      onPress: shellTabs.includes("Planning") ? () => navigation.navigate("Planning" as never) : showTeamList,
    },
    {
      key: "atWork",
      label: t("managerShell.tileAtWork"),
      value: `${atWork} / ${teamRows.length}`,
      hint: t("managerShell.tileAtWorkHint"),
      tone: "plain",
      onPress: showTeamList,
    },
    {
      key: "attention",
      label: t("managerShell.tileAttention"),
      value: String(needsAttention),
      hint: t("managerShell.tileAttentionHint"),
      tone: needsAttention > 0 ? "warning" : "plain",
      onPress: showTeamList,
    },
  ]

  return (
    <View style={styles.root}>
      {/* The header is white: the app-wide light icons vanished on it
          (Komanda, Təsdiqlər — 2026-10-17, only «100» of the battery read). */}
      <LightScreenStatusBar />
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, tablet && styles.headerInnerTablet]}>
          {/* No coloured square above the title, and the bell level with it
              (owner-approved mockups, 2026-10-18). */}
          <View style={[styles.headerCopy, tablet && styles.headerCopyTablet]}>
            <View style={styles.iconRow}>
              <View style={styles.titleCopy}>
                <Text style={styles.eyebrow}>{t("dashboardV2.managerWorkspace")}</Text>
                <Text style={styles.title}>{t(meta.titleKey)}</Text>
              </View>
              <NotificationBell />
            </View>
            <Text style={styles.body}>{t(meta.bodyKey)}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, tablet && styles.contentTablet]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void reload("manual") }}
            colors={[fieldTheme.color.primary]}
            tintColor={fieldTheme.color.primary}
          />
        )}
      >
        {kind === "team" ? (
          <>
            {canTransferContacts ? (
              <Pressable accessibilityRole="button" style={styles.transferAction} onPress={() => navigation.navigate("ContactTransfer")}>
                <View style={styles.transferActionIcon}><Icon name="swap-horizontal" size={22} color={fieldTheme.color.primaryStrong} /></View>
                <View style={styles.transferActionCopy}>
                  <Text style={styles.transferActionTitle}>{t("managerShell.transferContacts")}</Text>
                  <Text style={styles.transferActionBody}>{t("managerShell.transferContactsBody")}</Text>
                </View>
                <Icon name="chevron-forward" size={21} color={fieldTheme.color.primary} />
              </Pressable>
            ) : null}
            <TodayTiles
              tiles={todayTiles}
              title={t("managerShell.todayTitle")}
              updated={updatedAt
                ? t("managerShell.updatedAt", { defaultValue: "Updated at {{time}}", time: formatLocalizedDateTime(updatedAt, i18n.language) })
                : t("common.loading")}
              tablet={expandedTablet}
            />
            {/* The approved pair under the tiles (2026-10-17): write to the team, create a route. */}
            <View style={styles.homeActions}>
              <Pressable
                accessibilityRole="button"
                testID="manager-home-write-team"
                style={({ pressed }) => [styles.homeAction, styles.writeTeam, pressed && styles.buttonPressed]}
                onPress={() => navigation.navigate("ManagerTeamMessage")}
              >
                <Icon name="chatbox-outline" size={21} color={fieldTheme.color.primaryStrong} />
                <Text style={styles.writeTeamText} numberOfLines={2}>{t("managerShell.writeTeam")}</Text>
              </Pressable>
              {shellTabs.includes("Planning") ? (
                <Pressable
                  accessibilityRole="button"
                  testID="manager-home-create-route"
                  style={({ pressed }) => [styles.homeAction, styles.createRoute, pressed && styles.buttonPressed]}
                  onPress={() => navigation.navigate("PlanningBuilder", { initialDate: planningTodayKey(new Date(), timezone), initialHorizon: 1 })}
                >
                  <Icon name="add" size={22} color={fieldTheme.color.onColor} />
                  <Text style={styles.createRouteText} numberOfLines={2}>{t("managerShell.createRoute")}</Text>
                </Pressable>
              ) : null}
            </View>
            {/* «Иду на визит с агентом» (owner-approved mockup, 2026-10-20): the
                joint visit, or the button that starts one, under the pair. */}
            {shellTabs.includes("Planning") ? <ManagerJointVisitEntry agents={teamRows.map(({ agent }) => agent)} /> : null}
            {loadError && (
              <View style={styles.errorNotice}>
                <Icon name="cloud-offline-outline" size={21} color={fieldTheme.color.amber} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("managerShell.teamLoadError", { defaultValue: "Could not refresh team status" })}</Text>
                  <Text style={styles.errorBody}>{t("managerShell.teamSnapshotPreserved", { defaultValue: "The last loaded information is still shown." })}</Text>
                </View>
              </View>
            )}
            {/* The team, each with the line of his day, comes before the map
                (owner-approved mockup, 2026-10-18): it was a 360 dp map and a
                scroll away. */}
            {teamRows.length > 0 ? (
              <View style={styles.teamSection}>
              <Text style={styles.teamNowTitle}>{t("managerShell.teamNow")}</Text>
              <View style={[styles.teamList, expandedTablet && styles.teamListTablet]} onLayout={(event) => { teamListY.current = event.nativeEvent.layout.y }}>
                {teamRows.map(({ agent, truth }) => (
                  <AgentTruthCard
                    key={agent.id}
                    agent={agent}
                    truth={truth}
                    t={t}
                    language={i18n.language}
                    tablet={expandedTablet}
                    onOpen={() => navigation.navigate("ManagerEmployee", { agentId: agent.id, name: agent.name, isOnline: truth.isOnline })}
                  />
                ))}
              </View>
              </View>
            ) : (
              <StatusPanel
                icon={loadError ? "cloud-offline-outline" : "people-outline"}
                color={loadError ? fieldTheme.color.amber : meta.color}
                title={loading ? t("common.loading") : loadError ? t("managerShell.teamLoadError", { defaultValue: "Could not load team status" }) : t("managerShell.teamEmpty")}
                body={loadError ? t("managerShell.pullToRetry", { defaultValue: "Pull down or tap Refresh to try again." }) : t(meta.bodyKey)}
              />
            )}
            <ManagerLiveMap rows={teamRows} loading={loading} loadError={loadError} />
          </>
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
          approvalsTotal > 0 ? (
            <View style={styles.itemList}>
              <ApprovalSection
                title={t("managerShell.approvalsRouteDrafts")}
                items={draftItems}
                t={t}
                busyId={busyId}
                approveLabel={t("managerShell.publish")}
                onApprove={(id) => { const draft = routeDrafts.find((item) => item.id === id); if (draft) void publishDraft(draft) }}
              />
              <ApprovalSection
                title={t("managerShell.approvalsDoctors")}
                items={doctorItems}
                t={t}
                busyId={busyId}
                onApprove={(id) => decide("doctorRequest", id, "APPROVED")}
                onReject={(id) => setRejectTarget({ kind: "doctorRequest", id })}
              />
              <ApprovalSection
                title={t("managerShell.approvalsAttendance")}
                items={attendanceItems}
                t={t}
                busyId={busyId}
                onApprove={(id) => { const item = attendance.find((entry) => entry.id === id); if (item) void decideAttendance(item, "APPROVED") }}
                onReject={(id) => setRejectTarget({ kind: "attendance", id })}
              />
              {approvals ? (
                <>
              <ApprovalSection title={t("managerShell.approvalsHrm")} items={approvals.hrm} t={t} busyId={busyId} onApprove={(id) => decide("hrm", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "hrm", id })} />
              <ApprovalSection title={t("managerShell.approvalsRouteChanges")} items={approvals.routeChanges} t={t} busyId={busyId} onApprove={(id) => decide("routeChange", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "routeChange", id })} />
              <ApprovalSection title={t("managerShell.approvalsCustomers")} items={approvals.customers} t={t} busyId={busyId} onApprove={(id) => decide("customer", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "customer", id })} />
              <ApprovalSection title={t("managerShell.approvalsContactChanges")} items={approvals.contactChanges} t={t} busyId={busyId} onApprove={(id) => decide("contactChange", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "contactChange", id })} />
                </>
              ) : null}
            </View>
          ) : (
            <StatusPanel
              icon={loadError ? "cloud-offline-outline" : "checkmark-done-outline"}
              color={loadError ? fieldTheme.color.amber : meta.color}
              title={loading ? t("common.loading") : loadError ? t("managerShell.approvalsLoadError") : t("managerShell.approvalsEmpty")}
              body={loadError ? t("managerShell.pullToRetry") : t(meta.bodyKey)}
            />
          )
        )}
      </ScrollView>

      <NotesModal
        visible={rejectTarget !== null}
        title={t("managerShell.rejectTitle")}
        message={t("managerShell.rejectMessage")}
        onCancel={() => setRejectTarget(null)}
        onSubmit={(note) => {
          const target = rejectTarget
          setRejectTarget(null)
          if (!target) return
          if (target.kind === "attendance") {
            const item = attendance.find((entry) => entry.id === target.id)
            if (item) void decideAttendance(item, "REJECTED", note)
          } else {
            decide(target.kind, target.id, "REJECTED", note)
          }
        }}
      />
      <FeedbackToast visible={toast.visible} type={toast.type} title={toast.title} onDismiss={() => setToast((s) => ({ ...s, visible: false }))} />
    </View>
  )
}

/**
 * The approvals tab reads three queues side by side. Each may be refused on
 * its own — the server decides per permission — so one refusal leaves the
 * others on screen; only when all three fail does the tab say it could not load.
 */
async function approvalQueues(window: { start: string; endExclusive: string }) {
  const [approvals, drafts, doctors] = await Promise.allSettled([
    managerApi.getApprovals(),
    managerApi.getRouteDrafts(window.start, window.endExclusive),
    managerApi.getContactCreateRequests(),
  ])
  if (approvals.status === "rejected" && drafts.status === "rejected" && doctors.status === "rejected") throw approvals.reason
  return {
    approvals: approvals.status === "fulfilled" ? approvals.value : null,
    drafts: drafts.status === "fulfilled" ? drafts.value : null,
    doctors: doctors.status === "fulfilled" ? doctors.value : null,
  }
}

function ageLabel(ageMs: number | null, t: any) {
  const age = formatManagerEvidenceAge(ageMs)
  if (!age) return t("managerShell.timeUnknown", { defaultValue: "time unknown" })
  const key = age.unit === "minute"
    ? "managerShell.minutesAgo"
    : age.unit === "hour"
      ? "managerShell.hoursAgo"
      : "managerShell.daysAgo"
  return t(key, { count: age.value, defaultValue: `${age.value} ${age.unit}${age.value === 1 ? "" : "s"} ago` })
}

function workdayLabel(status: string | null | undefined, t: any) {
  if (status === "STARTED") return t("managerShell.workdayStarted", { defaultValue: "Workday started" })
  if (status === "PAUSED") return t("managerShell.workdayPaused", { defaultValue: "Workday paused" })
  if (status === "COMPLETED") return t("managerShell.workdayCompleted", { defaultValue: "Workday completed" })
  return t("managerShell.workdayNotStarted", { defaultValue: "Workday not started" })
}

type TodayTile = { key: string; label: string; value: string; hint: string; tone: "primary" | "warning" | "plain"; onPress: () => void }

/** The day's numbers in an even grid: pairs of one height, a lone last tile takes the row. */
function TodayTiles({ tiles, title, updated, tablet }: { tiles: TodayTile[]; title: string; updated: string; tablet: boolean }) {
  return (
    <View style={styles.today} testID="manager-today-tiles">
      <View style={styles.todayHeading}>
        <Text style={styles.todayTitle}>{title}</Text>
        <Text style={styles.todayUpdated}>{updated}</Text>
      </View>
      <View style={styles.tileGrid}>
        {tiles.map((tile, index) => {
          const alone = !tablet && tiles.length % 2 === 1 && index === tiles.length - 1
          return (
            <Pressable
              key={tile.key}
              testID={`manager-tile-${tile.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${tile.label}: ${tile.value}. ${tile.hint}`}
              onPress={tile.onPress}
              style={({ pressed }) => [
                styles.tile,
                tablet ? styles.tileTablet : alone ? styles.tileWide : styles.tileHalf,
                tile.tone === "primary" && styles.tilePrimary,
                tile.tone === "warning" && styles.tileWarning,
                pressed && styles.buttonPressed,
              ]}
            >
              <View style={styles.tileTop}>
                <Text style={styles.tileLabel}>{tile.label}</Text>
                <Icon name="chevron-forward" size={18} color={fieldTheme.color.inkMuted} />
              </View>
              <Text style={[
                styles.tileValue,
                tile.tone === "primary" && { color: fieldTheme.color.primaryStrong },
                tile.tone === "warning" && { color: fieldTheme.color.amber },
              ]}>{tile.value}</Text>
              <Text style={styles.tileHint}>{tile.hint}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function AgentTruthCard({ agent, truth, t, language, tablet, onOpen }: {
  agent: ManagerTeamAgent
  truth: ManagerAgentTruth
  t: any
  language: string
  tablet: boolean
  /** The employee's card: his day on a map, the route, the workday (owner, 2026-10-17). */
  onOpen: () => void
}) {
  const location = truth.location
  const currentPosition = truth.isOnline && truth.gpsFreshness === "FRESH"
  const gpsConfig = truth.gpsFreshness === "FRESH"
    ? currentPosition
      ? { icon: "locate", color: fieldTheme.color.success, label: t("managerShell.gpsFresh", { defaultValue: "GPS current" }) }
      : { icon: "time", color: fieldTheme.color.blue, label: t("managerShell.gpsRecent", { defaultValue: "Recent GPS point" }) }
    : truth.gpsFreshness === "DELAYED"
      ? { icon: "time", color: fieldTheme.color.blue, label: t("managerShell.gpsDelayed", { defaultValue: "GPS delayed" }) }
      : truth.gpsFreshness === "STALE"
        ? { icon: "time-outline", color: fieldTheme.color.amber, label: t("managerShell.gpsStale", { defaultValue: "Old GPS point" }) }
        : { icon: "location-outline", color: fieldTheme.color.inkMuted, label: t("managerShell.noCoordinates", { defaultValue: "No GPS position" }) }
  const lastSeen = truth.lastSeenAt
    ? t("managerShell.lastSeenAt", { defaultValue: "Last app activity: {{time}}", time: formatLocalizedDateTime(truth.lastSeenAt, language) })
    : t("managerShell.neverSeen", { defaultValue: "No app activity recorded" })
  const locationTitle = currentPosition
    ? t("managerShell.currentPosition", { defaultValue: "Current position" })
    : t("managerShell.lastKnownPosition", { defaultValue: "Last known position" })

  const openMap = () => {
    if (!location) return
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`)
  }

  const route = agent.routeToday
  return (
    <Pressable
      testID={`manager-agent-card-${agent.id}`}
      accessibilityRole="button"
      accessibilityLabel={t("managerShell.openEmployee", { name: agent.name })}
      onPress={onOpen}
      style={({ pressed }) => [styles.agentCard, tablet && styles.agentCardTablet, pressed && styles.buttonPressed]}
    >
      <View style={styles.agentHeader}>
        <View style={styles.agentAvatar}>
          <Icon name="person" size={22} color={fieldTheme.color.inkMuted} />
        </View>
        <View style={styles.agentCopy}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentMeta}>{statusLabel(t, "role", agent.role)} · {workdayLabel(agent.workday?.status, t)}</Text>
          {agent.openVisitSince ? (
            <Text style={styles.agentOpenVisit} testID={`manager-agent-open-visit-${agent.id}`}>
              {t("managerShell.openVisitLeft", { date: formatLocalizedDate(agent.openVisitSince, language, { day: "numeric", month: "long" }) })}
            </Text>
          ) : null}
        </View>
        {/* Online or not: a dot and the word in its colour, no tinted pill
            (owner's rule, 2026-10-18). */}
        <View style={styles.presencePill}>
          <View style={[styles.presenceDot, { backgroundColor: truth.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]} />
          <Text style={[styles.presenceText, { color: truth.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]}>
            {truth.isOnline ? t("managerShell.online", { defaultValue: "Online" }) : t("managerShell.offline", { defaultValue: "Offline" })}
          </Text>
        </View>
      </View>

      {route ? (
        <View style={styles.agentDay} testID={`manager-agent-route-${agent.id}`}>
          <DayLineStrip
            visited={route.visited}
            planned={route.planned}
            label={t("managerShell.visitsToday", { visited: route.visited, planned: route.planned })}
          />
          <Text style={styles.agentDayCount}>
            {route.visited}
            <Text style={styles.agentDayTotal}>{` / ${route.planned}`}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.presenceEvidence}>
        <Icon name="phone-portrait-outline" size={17} color={fieldTheme.color.inkMuted} />
        <Text style={styles.presenceEvidenceText}>{lastSeen}</Text>
      </View>

      <View style={styles.locationPanel}>
        <View style={styles.locationHeading}>
          <View style={styles.locationTitleRow}>
            <Icon name={gpsConfig.icon} size={19} color={gpsConfig.color} />
            <Text style={[styles.locationTitle, { color: gpsConfig.color }]}>
              {location ? locationTitle : gpsConfig.label}
            </Text>
          </View>
          <View style={[styles.gpsPill, { borderColor: gpsConfig.color }]}>
            <Text style={[styles.gpsPillText, { color: gpsConfig.color }]}>{gpsConfig.label}</Text>
          </View>
        </View>

        {location ? (
          <>
            <Text style={styles.locationDescription}>
              {currentPosition
                ? t("managerShell.positionReceived", { defaultValue: "Received {{age}}", age: ageLabel(truth.locationAgeMs, t) })
                : t("managerShell.historicalPositionReceived", { defaultValue: "Historical point from {{age}}", age: ageLabel(truth.locationAgeMs, t) })}
            </Text>
            <Text style={styles.locationDetails}>
              {location.recordedAt ? formatLocalizedDateTime(location.recordedAt, language) : t("managerShell.timeUnknown", { defaultValue: "Time unknown" })}
              {location.accuracy == null ? "" : ` · ±${Math.round(location.accuracy)} m`}
              {location.battery == null ? "" : ` · ${Math.round(location.battery)}%`}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={currentPosition
                ? t("managerShell.openCurrentPosition", { defaultValue: "Open current position on map" })
                : t("managerShell.openLastKnownPosition", { defaultValue: "Open last known position on map" })}
              style={({ pressed }) => [styles.mapButton, tablet && styles.mapButtonTablet, pressed && styles.buttonPressed]}
              onPress={openMap}
            >
              <Icon name={currentPosition ? "map-outline" : "time-outline"} size={18} color={fieldTheme.color.primaryStrong} />
              <Text style={styles.mapButtonText}>
                {currentPosition
                  ? t("managerShell.openCurrentPosition", { defaultValue: "Open current position" })
                  : t("managerShell.openLastKnownPosition", { defaultValue: "Open last known position" })}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.locationDescription}>
            {t("managerShell.noCoordinatesBody", { defaultValue: "This employee has not sent a GPS position yet." })}
          </Text>
        )}
      </View>

      <View style={styles.openRow}>
        <Text style={styles.openText}>{t("managerShell.openEmployeeAction")}</Text>
        <Icon name="chevron-forward" size={18} color={fieldTheme.color.primary} />
      </View>
    </Pressable>
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

function ApprovalSection({ title, items, t, busyId, onApprove, onReject, approveLabel }: {
  title: string
  items: ApprovalItem[]
  t: (k: string) => string
  busyId?: string | null
  onApprove?: (id: string) => void
  /** Absent for a queue with one action only (publishing a draft). */
  onReject?: (id: string) => void
  approveLabel?: string
}) {
  if (items.length === 0) return null
  const actionable = !!onApprove
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title} · {items.length}</Text>
      {items.map((it) => (
        <View key={it.id} style={styles.itemCard}>
          <View style={styles.itemMain}>
            <Text style={styles.itemTitle}>{it.primary}</Text>
            <Text style={styles.itemMeta} numberOfLines={2}>{it.agentName}{it.reason ? ` · ${it.reason}` : ""}</Text>
            {!!it.details && <Text style={styles.itemDetails}>{it.details}</Text>}
          </View>
          {actionable && (
            <View style={styles.decisionBtns}>
              <TouchableOpacity accessibilityRole="button" style={[styles.approveBtn, busyId === it.id && styles.btnBusy]} disabled={busyId === it.id} onPress={() => onApprove!(it.id)}>
                <Text style={styles.approveBtnText}>{approveLabel ?? t("managerShell.approve")}</Text>
              </TouchableOpacity>
              {onReject ? (
                <TouchableOpacity accessibilityRole="button" style={[styles.rejectBtn, busyId === it.id && styles.btnBusy]} disabled={busyId === it.id} onPress={() => onReject(it.id)}>
                  <Text style={styles.rejectBtnText}>{t("managerShell.reject")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
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
  iconRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: fieldTheme.space.md },
  titleCopy: { flexShrink: 1, gap: fieldTheme.space.xs },
  // No `flex: 1` on a phone: in the column header it collapsed the copy to
  // zero height, and only the icon showed (2026-10-17). The tablet row grows it.
  headerCopy: { gap: fieldTheme.space.xs },
  headerCopyTablet: { flex: 1 },
  eyebrow: {
    color: fieldTheme.color.primary,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  title: { color: fieldTheme.color.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 680 },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.xl },
  contentTablet: { width: "100%", padding: fieldTheme.space.xl, maxWidth: 1180, alignSelf: "center" },
  statusPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    borderLeftWidth: 4,
    borderLeftColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
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
  statusTitle: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "700" },
  statusBody: { color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 19 },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.55 },
  errorNotice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    borderLeftWidth: 4,
    borderLeftColor: fieldTheme.color.amber,
  },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: fieldTheme.color.amber, fontSize: 14, fontWeight: "700" },
  errorBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  teamList: { gap: fieldTheme.space.md },
  teamListTablet: { flexDirection: "row", flexWrap: "wrap" },
  transferAction: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  transferActionIcon: { width: 32, height: 46, alignItems: "center", justifyContent: "center" },
  transferActionCopy: { flex: 1, gap: 3 },
  transferActionTitle: { color: fieldTheme.color.primaryStrong, fontSize: 16, fontWeight: "700" },
  transferActionBody: { color: fieldTheme.color.primaryStrong, fontSize: 12, lineHeight: 17 },
  agentCard: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    ...fieldTheme.card,
    borderRadius: fieldTheme.radius.lg,
  },
  teamSection: { gap: fieldTheme.space.sm },
  teamNowTitle: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "600", paddingHorizontal: 4 },
  agentDay: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  agentDayCount: { color: fieldTheme.color.primary, fontSize: 16, fontWeight: "700" },
  agentDayTotal: { color: fieldTheme.color.inkMuted, fontWeight: "400" },
  agentCardTablet: { width: "48%" },
  agentHeader: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  presenceDot: { width: 10, height: 10, borderRadius: fieldTheme.radius.pill },
  agentCopy: { flex: 1, gap: 2 },
  agentName: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "600" },
  agentMeta: { color: fieldTheme.color.inkMuted, fontSize: 12.5, lineHeight: 17 },
  agentOpenVisit: { color: fieldTheme.color.danger, fontSize: 13, fontWeight: "500", marginTop: 2 },
  today: { gap: fieldTheme.space.sm },
  todayHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: fieldTheme.space.sm, paddingHorizontal: 4 },
  todayTitle: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "600" },
  todayUpdated: { flexShrink: 1, color: fieldTheme.color.inkMuted, fontSize: 12, textAlign: "right" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  tile: {
    minHeight: 116,
    justifyContent: "space-between",
    gap: fieldTheme.space.xs,
    padding: fieldTheme.space.md,
    ...fieldTheme.card,
    borderRadius: fieldTheme.radius.lg,
  },
  tileHalf: { flexBasis: "45%", flexGrow: 1 },
  tileWide: { flexBasis: "100%" },
  tileTablet: { flexBasis: "22%", flexGrow: 1 },
  // What needs the manager shows in the number's colour, not a filled tile
  // (owner-approved colours, 2026-10-18).
  // Since the cards stand on the tinted ground the number's colour alone
  // carries it; the green outline went with the borders (mockup, 2026-10-18).
  tilePrimary: {},
  tileWarning: {},
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 4 },
  tileLabel: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "500" },
  tileValue: { color: fieldTheme.color.ink, fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.5 },
  tileHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16 },
  homeActions: { flexDirection: "row", gap: fieldTheme.space.sm },
  homeAction: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    // Both keep a 2 dp border: the flex basis counts it, and on the S23
    // (2026-10-18) the outlined one stood 4 dp wider than its pair.
    borderWidth: 2,
    borderColor: fieldTheme.color.primary,
  },
  writeTeam: { backgroundColor: fieldTheme.color.surface },
  writeTeamText: { flexShrink: 1, color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "500", textAlign: "center" },
  createRoute: { backgroundColor: fieldTheme.color.primary },
  createRouteText: { flexShrink: 1, color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "500", textAlign: "center" },
  openRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: fieldTheme.space.sm, minHeight: 28 },
  openText: { color: fieldTheme.color.primary, fontSize: 14, fontWeight: "500" },
  presencePill: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  presenceText: { fontSize: 12.5, fontWeight: "500" },
  presenceEvidence: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  presenceEvidenceText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  // Under a hairline, not on a tint: the GPS state is the colour of its icon and words.
  locationPanel: { gap: fieldTheme.space.sm, paddingTop: fieldTheme.space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: fieldTheme.color.border },
  locationHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  locationTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  locationTitle: { flex: 1, fontSize: 14, fontWeight: "600" },
  gpsPill: { minHeight: 28, justifyContent: "center", paddingHorizontal: 9, borderRadius: fieldTheme.radius.pill, borderWidth: 1 },
  gpsPillText: { fontSize: 11, fontWeight: "500" },
  locationDescription: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19 },
  locationDetails: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  mapButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: 12,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
  },
  mapButtonTablet: { minHeight: 48 },
  mapButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "500" },
  itemList: { gap: fieldTheme.space.sm },
  itemCard: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border },
  itemMain: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.ink },
  itemMeta: { fontSize: 12, color: fieldTheme.color.inkMuted, marginTop: 2 },
  itemDetails: { fontSize: 12, lineHeight: 17, color: fieldTheme.color.ink, marginTop: 6 },
  itemPill: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
  itemPillText: { fontSize: 10, fontWeight: "700", color: fieldTheme.color.primaryStrong },
  section: { gap: fieldTheme.space.sm, marginBottom: fieldTheme.space.md },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: fieldTheme.color.inkMuted, letterSpacing: 0.4 },
  decisionBtns: { flexDirection: "row", gap: fieldTheme.space.xs },
  // Outlined, both: a list of requests is not a wall of green and red pills.
  approveBtn: { borderWidth: 1, borderColor: fieldTheme.color.success, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  approveBtnText: { color: fieldTheme.color.success, fontSize: 12, fontWeight: "700" },
  rejectBtn: { borderWidth: 1, borderColor: fieldTheme.color.danger, borderRadius: fieldTheme.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  rejectBtnText: { color: fieldTheme.color.danger, fontSize: 12, fontWeight: "700" },
  btnBusy: { opacity: 0.5 },
}))
