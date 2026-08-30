import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
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
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth } from "../../theme/layoutBreakpoints"
import { managerApi } from "../../services/manager-api"
import { hasCapability } from "../../services/bootstrap"
import { captureOneShotLocation } from "../../services/self-location-share"
import { useBootstrapStore } from "../../store/bootstrap"
import { toPlanningRoutes, type PlanningRoute } from "../../services/manager-planning"
import { toApprovals, type ApprovalItem, type ManagerApprovals } from "../../services/manager-approvals"
import {
  formatManagerEvidenceAge,
  managerAgentTruth,
  normalizeManagerLocations,
  type ManagerAgentTruth,
  type ManagerLocationEvidence,
  type ManagerTeamAgent,
} from "../../services/manager-location-truth"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import MobileWorkflowGuide from "../../components/MobileWorkflowGuide"
import ManagerPlanningWorkspace from "./ManagerPlanningWorkspace.android"
import ManagerLiveMap from "./ManagerLiveMap.android"

export type ManagerWorkspaceKind = "team" | "planning" | "approvals"

/** Which approval queue a decision targets — each hits its own decision endpoint. */
type ApprovalKind = "hrm" | "routeChange" | "customer" | "contactChange"
type SelfShareState = "idle" | "locating" | "sending" | "success" | "permissionDenied" | "error"

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
  return kind === "planning" ? <ManagerPlanningWorkspace /> : <ManagerReadWorkspace kind={kind} />
}

function ManagerReadWorkspace({ kind }: { kind: ManagerWorkspaceKind }) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const meta = SCREEN_META[kind]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const canShareSelfLocation = useBootstrapStore((state) => hasCapability(state.capabilities, "SELF_LOCATION_SHARE"))
  const [team, setTeam] = useState<ManagerTeamAgent[]>([])
  const [locations, setLocations] = useState<ManagerLocationEvidence[]>([])
  const [planning, setPlanning] = useState<PlanningRoute[]>([])
  const [approvals, setApprovals] = useState<ManagerApprovals | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [observedAt, setObservedAt] = useState(() => Date.now())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selfShareState, setSelfShareState] = useState<SelfShareState>("idle")
  const [rejectTarget, setRejectTarget] = useState<{ kind: ApprovalKind; id: string } | null>(null)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })
  const requestId = useRef(0)

  const reload = useCallback(async (mode: "initial" | "manual" | "silent" = "initial") => {
    const currentRequestId = ++requestId.current
    setObservedAt(Date.now())
    if (mode === "initial") setLoading(true)
    if (mode === "manual") setRefreshing(true)
    const request = kind === "team"
      ? Promise.all([managerApi.getTeam(), managerApi.getLocations()])
      : kind === "planning"
        ? managerApi.getPlanning()
        : managerApi.getApprovals()
    try {
      const response: any = await request
      if (currentRequestId !== requestId.current) return
      if (kind === "team") {
        setTeam(Array.isArray(response?.[0]?.data?.agents) ? response[0].data.agents : [])
        setLocations(normalizeManagerLocations(response?.[1]?.data?.locations))
      } else if (kind === "planning") {
        setPlanning(toPlanningRoutes(response?.data))
      } else {
        setApprovals(toApprovals(response?.data))
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
  }, [kind])

  useAutoRefresh(useCallback(() => { void reload(updatedAt == null ? "initial" : "silent") }, [reload, updatedAt]))

  const teamRows = useMemo(() => {
    return team.map((agent) => ({ agent, truth: managerAgentTruth(agent, locations, observedAt) }))
  }, [locations, observedAt, team])
  const onlineCount = teamRows.filter(({ truth }) => truth.isOnline).length
  const gpsAttentionCount = teamRows.filter(({ truth }) => truth.gpsFreshness === "STALE" || truth.gpsFreshness === "NO_COORDINATES").length
  const selfShareBusy = selfShareState === "locating" || selfShareState === "sending"

  const requestForegroundLocation = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true
    try {
      const [fineGranted, coarseGranted] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
      ])
      if (fineGranted || coarseGranted) return true
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: t("managerShell.shareLocationPermissionTitle"),
        message: t("managerShell.shareLocationPermissionBody"),
        buttonPositive: t("permission.allow"),
        buttonNegative: t("permission.deny"),
      })
      if (result === PermissionsAndroid.RESULTS.GRANTED) return true
      // Android 12+ may grant approximate (COARSE) location when the user
      // declines precise (FINE). A one-shot approximate point is still useful
      // and must not be misreported as a total permission denial.
      return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION)
    } catch {
      return false
    }
  }

  const shareSelfLocation = async () => {
    if (!canShareSelfLocation || selfShareBusy) return
    setSelfShareState("locating")
    const permitted = await requestForegroundLocation()
    if (!permitted) {
      setSelfShareState("permissionDenied")
      setToast({ visible: true, type: "error", title: t("managerShell.shareLocationPermissionDenied") })
      return
    }

    try {
      const position = await captureOneShotLocation()
      setSelfShareState("sending")
      const response = await managerApi.shareSelfLocation(position)
      if (!response?.success) throw new Error("SELF_LOCATION_SHARE_FAILED")
      setSelfShareState("success")
      setToast({ visible: true, type: "success", title: t("managerShell.shareLocationSuccess") })
      await reload("silent")
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      setSelfShareState("error")
      setToast({ visible: true, type: "error", title: t("managerShell.shareLocationError") })
    }
  }

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
            : await managerApi.contactChangeDecision(id, decision, note || (decision === "APPROVED" ? t("managerShell.contactChangeApprovedNote") : t("managerShell.contactChangeRejectedNote")))
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

      <ScrollView
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
        <MobileWorkflowGuide
          title={t("managerShell.workflowTitle")}
          body={t("managerShell.workflowBody")}
          steps={[
            { icon: "people-outline", label: t("managerShell.teamTitle"), active: kind === "team" },
            { icon: "calendar-outline", label: t("managerShell.planningTitle"), active: kind === "planning" },
            { icon: "shield-checkmark-outline", label: t("managerShell.approvalsTitle"), active: kind === "approvals" },
          ]}
        />
        {kind === "team" ? (
          <>
            {canShareSelfLocation && (
              <View style={[styles.selfShareCard, expandedTablet && styles.selfShareCardTablet]}>
                <View style={styles.selfShareIcon}>
                  <Icon name={selfShareState === "success" ? "checkmark" : "navigate"} size={24} color={fieldTheme.color.onColor} />
                </View>
                <View style={styles.selfShareCopy}>
                  <Text style={styles.selfShareTitle}>{t("managerShell.shareLocationTitle")}</Text>
                  <Text style={styles.selfShareBody}>
                    {selfShareState === "locating"
                      ? t("managerShell.shareLocationLocating")
                      : selfShareState === "sending"
                        ? t("managerShell.shareLocationSending")
                        : selfShareState === "success"
                          ? t("managerShell.shareLocationSuccessBody")
                          : selfShareState === "permissionDenied"
                            ? t("managerShell.shareLocationPermissionDeniedBody")
                            : selfShareState === "error"
                              ? t("managerShell.shareLocationErrorBody")
                              : t("managerShell.shareLocationBody")}
                  </Text>
                  {selfShareState === "permissionDenied" && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("permission.openSettings")}
                      style={({ pressed }) => [styles.settingsLink, pressed && styles.buttonPressed]}
                      onPress={() => { void Linking.openSettings() }}
                    >
                      <Icon name="settings-outline" size={17} color={fieldTheme.color.primaryStrong} />
                      <Text style={styles.settingsLinkText}>{t("permission.openSettings")}</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("managerShell.shareLocationTitle")}
                  accessibilityState={{ busy: selfShareBusy, disabled: selfShareBusy }}
                  disabled={selfShareBusy}
                  style={({ pressed }) => [styles.selfShareButton, pressed && styles.buttonPressed, selfShareBusy && styles.buttonDisabled]}
                  onPress={() => { void shareSelfLocation() }}
                >
                  {selfShareBusy ? (
                    <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
                  ) : (
                    <Icon name={selfShareState === "success" ? "refresh" : "location"} size={20} color={fieldTheme.color.onColor} />
                  )}
                  <Text style={styles.selfShareButtonText}>
                    {selfShareState === "success"
                      ? t("managerShell.shareLocationAgain")
                      : selfShareState === "permissionDenied" || selfShareState === "error"
                        ? t("managerShell.shareLocationRetry")
                        : selfShareState === "locating"
                          ? t("managerShell.shareLocationLocatingShort")
                          : selfShareState === "sending"
                            ? t("managerShell.shareLocationSendingShort")
                            : t("managerShell.shareLocationAction")}
                  </Text>
                </Pressable>
              </View>
            )}
            <Pressable accessibilityRole="button" style={styles.transferAction} onPress={() => navigation.navigate("ContactTransfer")}>
              <View style={styles.transferActionIcon}><Icon name="swap-horizontal" size={22} color={fieldTheme.color.onColor} /></View>
              <View style={styles.transferActionCopy}>
                <Text style={styles.transferActionTitle}>{t("managerShell.transferContacts")}</Text>
                <Text style={styles.transferActionBody}>{t("managerShell.transferContactsBody")}</Text>
              </View>
              <Icon name="chevron-forward" size={21} color={fieldTheme.color.primary} />
            </Pressable>
            <View style={[styles.teamSnapshot, expandedTablet && styles.teamSnapshotTablet]}>
              <View style={styles.snapshotCopy}>
                <Text style={styles.snapshotTitle}>{t("managerShell.teamSnapshot", { defaultValue: "Team status" })}</Text>
                <Text style={styles.snapshotMeta}>
                  {updatedAt
                    ? t("managerShell.updatedAt", { defaultValue: "Updated at {{time}}", time: formatTimestamp(updatedAt) })
                    : t("common.loading")}
                </Text>
              </View>
              <View style={styles.snapshotCounts}>
                <SummaryCount color={fieldTheme.color.success} value={onlineCount} label={t("managerShell.online", { defaultValue: "Online" })} />
                <SummaryCount color={fieldTheme.color.inkMuted} value={Math.max(0, teamRows.length - onlineCount)} label={t("managerShell.offline", { defaultValue: "Offline" })} />
                <SummaryCount color={fieldTheme.color.amber} value={gpsAttentionCount} label={t("managerShell.gpsNeedsAttention", { defaultValue: "GPS attention" })} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("managerShell.refreshTeam", { defaultValue: "Refresh team status" })}
                disabled={refreshing}
                style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed, refreshing && styles.buttonDisabled]}
                onPress={() => { void reload("manual") }}
              >
                <Icon name="refresh" size={19} color={fieldTheme.color.primaryStrong} />
                <Text style={styles.refreshButtonText}>{t("managerShell.refresh", { defaultValue: "Refresh" })}</Text>
              </Pressable>
            </View>
            {loadError && (
              <View style={styles.errorNotice}>
                <Icon name="cloud-offline-outline" size={21} color={fieldTheme.color.amber} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("managerShell.teamLoadError", { defaultValue: "Could not refresh team status" })}</Text>
                  <Text style={styles.errorBody}>{t("managerShell.teamSnapshotPreserved", { defaultValue: "The last loaded information is still shown." })}</Text>
                </View>
              </View>
            )}
            <ManagerLiveMap rows={teamRows} loading={loading} loadError={loadError} />
            {teamRows.length > 0 ? (
              <View style={[styles.teamList, expandedTablet && styles.teamListTablet]}>
                {teamRows.map(({ agent, truth }) => (
                  <AgentTruthCard key={agent.id} agent={agent} truth={truth} t={t} tablet={expandedTablet} />
                ))}
              </View>
            ) : (
              <StatusPanel
                icon={loadError ? "cloud-offline-outline" : "people-outline"}
                color={loadError ? fieldTheme.color.amber : meta.color}
                title={loading ? t("common.loading") : loadError ? t("managerShell.teamLoadError", { defaultValue: "Could not load team status" }) : t("managerShell.teamEmpty")}
                body={loadError ? t("managerShell.pullToRetry", { defaultValue: "Pull down or tap Refresh to try again." }) : t(meta.bodyKey)}
              />
            )}
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
          approvals && approvals.total > 0 ? (
            <View style={styles.itemList}>
              <ApprovalSection title={t("managerShell.approvalsHrm")} items={approvals.hrm} t={t} busyId={busyId} onApprove={(id) => decide("hrm", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "hrm", id })} />
              <ApprovalSection title={t("managerShell.approvalsRouteChanges")} items={approvals.routeChanges} t={t} busyId={busyId} onApprove={(id) => decide("routeChange", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "routeChange", id })} />
              <ApprovalSection title={t("managerShell.approvalsCustomers")} items={approvals.customers} t={t} busyId={busyId} onApprove={(id) => decide("customer", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "customer", id })} />
              <ApprovalSection title={t("managerShell.approvalsContactChanges")} items={approvals.contactChanges} t={t} busyId={busyId} onApprove={(id) => decide("contactChange", id, "APPROVED")} onReject={(id) => setRejectTarget({ kind: "contactChange", id })} />
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

function formatTimestamp(value: number | string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
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

function SummaryCount({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <View style={styles.summaryCount}>
      <View style={[styles.summaryDot, { backgroundColor: color }]} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function AgentTruthCard({ agent, truth, t, tablet }: {
  agent: ManagerTeamAgent
  truth: ManagerAgentTruth
  t: any
  tablet: boolean
}) {
  const location = truth.location
  const currentPosition = truth.isOnline && truth.gpsFreshness === "FRESH"
  const gpsConfig = truth.gpsFreshness === "FRESH"
    ? currentPosition
      ? { icon: "locate", color: fieldTheme.color.success, tint: fieldTheme.color.successSoft, label: t("managerShell.gpsFresh", { defaultValue: "GPS current" }) }
      : { icon: "time", color: fieldTheme.color.blue, tint: fieldTheme.color.blueSoft, label: t("managerShell.gpsRecent", { defaultValue: "Recent GPS point" }) }
    : truth.gpsFreshness === "DELAYED"
      ? { icon: "time", color: fieldTheme.color.blue, tint: fieldTheme.color.blueSoft, label: t("managerShell.gpsDelayed", { defaultValue: "GPS delayed" }) }
      : truth.gpsFreshness === "STALE"
        ? { icon: "time-outline", color: fieldTheme.color.amber, tint: fieldTheme.color.amberSoft, label: t("managerShell.gpsStale", { defaultValue: "Old GPS point" }) }
        : { icon: "location-outline", color: fieldTheme.color.inkMuted, tint: fieldTheme.color.surfaceStrong, label: t("managerShell.noCoordinates", { defaultValue: "No GPS position" }) }
  const lastSeen = truth.lastSeenAt
    ? t("managerShell.lastSeenAt", { defaultValue: "Last app activity: {{time}}", time: formatTimestamp(truth.lastSeenAt) })
    : t("managerShell.neverSeen", { defaultValue: "No app activity recorded" })
  const locationTitle = currentPosition
    ? t("managerShell.currentPosition", { defaultValue: "Current position" })
    : t("managerShell.lastKnownPosition", { defaultValue: "Last known position" })

  const openMap = () => {
    if (!location) return
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`)
  }

  return (
    <View style={[styles.agentCard, tablet && styles.agentCardTablet]}>
      <View style={styles.agentHeader}>
        <View style={[styles.agentAvatar, { backgroundColor: truth.isOnline ? fieldTheme.color.successSoft : fieldTheme.color.surfaceStrong }]}>
          <Icon name="person" size={22} color={truth.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted} />
        </View>
        <View style={styles.agentCopy}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentMeta}>{agent.role} · {workdayLabel(agent.workday?.status, t)}</Text>
        </View>
        <View style={[styles.presencePill, { backgroundColor: truth.isOnline ? fieldTheme.color.successSoft : fieldTheme.color.surfaceStrong }]}>
          <View style={[styles.presenceDot, { backgroundColor: truth.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]} />
          <Text style={[styles.presenceText, { color: truth.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]}>
            {truth.isOnline ? t("managerShell.online", { defaultValue: "Online" }) : t("managerShell.offline", { defaultValue: "Offline" })}
          </Text>
        </View>
      </View>

      <View style={styles.presenceEvidence}>
        <Icon name="phone-portrait-outline" size={17} color={fieldTheme.color.inkMuted} />
        <Text style={styles.presenceEvidenceText}>{lastSeen}</Text>
      </View>

      <View style={[styles.locationPanel, { backgroundColor: gpsConfig.tint }]}>
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
              {location.recordedAt ? formatTimestamp(location.recordedAt) : t("managerShell.timeUnknown", { defaultValue: "Time unknown" })}
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
            {!!it.details && <Text style={styles.itemDetails}>{it.details}</Text>}
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
  contentTablet: { width: "100%", padding: fieldTheme.space.xl, maxWidth: 1180, alignSelf: "center" },
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
  teamSnapshot: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  teamSnapshotTablet: { flexDirection: "row", alignItems: "center" },
  snapshotCopy: { flex: 1, gap: 3 },
  snapshotTitle: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  snapshotMeta: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  snapshotCounts: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  summaryCount: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.canvas,
  },
  summaryDot: { width: 8, height: 8, borderRadius: fieldTheme.radius.pill },
  summaryValue: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  summaryLabel: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  refreshButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
  },
  refreshButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.55 },
  selfShareCard: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.primarySoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
  },
  selfShareCardTablet: { flexDirection: "row", alignItems: "center" },
  selfShareIcon: {
    width: 48,
    height: 48,
    borderRadius: fieldTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primary,
  },
  selfShareCopy: { flex: 1, gap: fieldTheme.space.xs },
  selfShareTitle: { color: fieldTheme.color.primaryStrong, fontSize: 17, fontWeight: "900" },
  selfShareBody: { color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 19, maxWidth: 680 },
  selfShareButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
  },
  selfShareButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  settingsLink: {
    minHeight: 40,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
  },
  settingsLinkText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900", textDecorationLine: "underline" },
  errorNotice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.amberSoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.amber,
  },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: fieldTheme.color.amber, fontSize: 14, fontWeight: "900" },
  errorBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  teamList: { gap: fieldTheme.space.md },
  teamListTablet: { flexDirection: "row", flexWrap: "wrap" },
  transferAction: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: fieldTheme.color.primary },
  transferActionIcon: { width: 46, height: 46, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primary },
  transferActionCopy: { flex: 1, gap: 3 },
  transferActionTitle: { color: fieldTheme.color.primaryStrong, fontSize: 16, fontWeight: "900" },
  transferActionBody: { color: fieldTheme.color.primaryStrong, fontSize: 12, lineHeight: 17 },
  agentCard: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  agentCardTablet: { width: "48%" },
  agentHeader: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  agentAvatar: {
    width: 46,
    height: 46,
    borderRadius: fieldTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  presenceDot: { width: 10, height: 10, borderRadius: fieldTheme.radius.pill },
  agentCopy: { flex: 1, gap: 2 },
  agentName: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  agentMeta: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  presencePill: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: fieldTheme.radius.pill,
  },
  presenceText: { fontSize: 11, fontWeight: "900" },
  presenceEvidence: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  presenceEvidenceText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  locationPanel: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md },
  locationHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  locationTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  locationTitle: { flex: 1, fontSize: 14, fontWeight: "900" },
  gpsPill: { minHeight: 28, justifyContent: "center", paddingHorizontal: 9, borderRadius: fieldTheme.radius.pill, borderWidth: 1 },
  gpsPillText: { fontSize: 10, fontWeight: "900" },
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
  mapButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  itemList: { gap: fieldTheme.space.sm },
  itemCard: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border },
  itemMain: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.ink },
  itemMeta: { fontSize: 12, color: fieldTheme.color.inkMuted, marginTop: 2 },
  itemDetails: { fontSize: 12, lineHeight: 17, color: fieldTheme.color.ink, marginTop: 6 },
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
