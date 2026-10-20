import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { managerApi } from "../../services/manager-api"
import { notify } from "../../services/app-feedback"
import {
  clockTime,
  currentJointVisit,
  formatScore,
  jointVisitFailure,
  minutesSince,
  toJointVisitState,
  visitSubtitle,
  visitTitle,
  type JointVisitRow,
  type JointVisitState,
} from "../../services/joint-visit"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

/**
 * «Совместный визит» (owner-approved mockup, 2026-10-20): where the agent the
 * manager is with is now, and «Оценить агента» on a visit the agent marked as
 * joint; the day's visits together below it, and the visits still waiting for
 * his rating. The agent never sees any of it.
 */
export default function ManagerJointVisitScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const [state, setState] = useState<JointVisitState | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading")
  const [refreshing, setRefreshing] = useState(false)
  const [ending, setEnding] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async (mode: "initial" | "manual" | "silent") => {
    if (mode === "manual") setRefreshing(true)
    try {
      const response = await managerApi.getJointVisit()
      if (!alive.current) return
      setState(toJointVisitState(response))
      setLoadState("ready")
    } catch {
      if (alive.current && mode !== "silent") setLoadState((current) => (current === "ready" ? current : "failed"))
    } finally {
      if (alive.current) {
        setRefreshing(false)
        setNow(Date.now())
      }
    }
  }, [])

  // The agent checks in and out while the manager watches: the screen follows every 30 s.
  useAutoRefresh(useCallback(() => { load(state ? "silent" : "initial").catch(() => {}) }, [load, state]), 30_000)

  const end = async () => {
    if (ending) return
    setEnding(true)
    try {
      const response = await managerApi.endJointVisit()
      if (alive.current) setState(toJointVisitState(response))
    } catch (error) {
      const reason = jointVisitFailure(error)
      if (reason !== "session") notify({ tone: "error", title: t(reason === "offline" ? "jointVisit.errorOffline" : "jointVisit.errorFailed") })
    } finally {
      if (alive.current) setEnding(false)
    }
  }

  const rate = (visit: JointVisitRow) => navigation.navigate("ManagerVisitEvaluation", { visit })

  const session = state?.session ?? null
  const current = state ? currentJointVisit(state) : null
  const together = state && session
    ? state.visits.filter((visit) => visit.agent.id === session.agent.id && visit.id !== current?.id && visit.checkInAt >= session.startedAt)
    : []
  const shown = new Set([current?.id, ...together.map((visit) => visit.id)])
  const waiting = state ? state.visits.filter((visit) => !shown.has(visit.id) && visit.joint && visit.canEvaluate && !visit.evaluation) : []

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("jointVisit.back")} onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          {session ? <Text style={styles.eyebrow}>{t("jointVisit.eyebrow", { time: clockTime(session.startedAt) })}</Text> : null}
          <Text style={styles.title} numberOfLines={1}>{session ? session.agent.name : t("jointVisit.over")}</Text>
        </View>
      </View>
      <Text style={styles.body}>{session ? t("jointVisit.body") : t("jointVisit.overBody")}</Text>
    </View>
  )

  if (loadState !== "ready" || !state) {
    return (
      <View style={styles.root}>
        <LightScreenStatusBar />
        {header}
        <View style={styles.state}>
          {loadState === "loading" ? (
            <>
              <ActivityIndicator color={fieldTheme.color.primary} />
              <Text style={styles.stateText}>{t("jointVisit.loading")}</Text>
            </>
          ) : (
            <>
              <Icon name="cloud-offline-outline" size={34} color={fieldTheme.color.amber} />
              <Text style={styles.stateText}>{t("jointVisit.loadFailed")}</Text>
              <Pressable accessibilityRole="button" onPress={() => { setLoadState("loading"); load("initial").catch(() => {}) }} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>{t("jointVisit.retry")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <LightScreenStatusBar />
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + fieldTheme.space.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { load("manual").catch(() => {}) }} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
      >
        {/* The header scrolls with the page: nothing on this screen has a frame of its own. */}
        {header}
        <View style={[styles.content, tablet && styles.contentTablet]}>
          {session && current ? (
            <View style={styles.panel} testID="manager-joint-visit-current">
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.panelEyebrow}>{t("jointVisit.nowAtClient", { minutes: minutesSince(current.checkInAt, now) })}</Text>
              </View>
              <Text style={styles.panelTitle}>{visitTitle(current)}</Text>
              {visitSubtitle(current) ? <Text style={styles.panelSubtitle}>{visitSubtitle(current)}</Text> : null}
              {current.joint ? (
                <View style={styles.markRow}>
                  <Icon name="checkmark-circle" size={18} color={fieldTheme.color.success} />
                  <Text style={styles.markJoint}>{t("jointVisit.markedJoint")}</Text>
                </View>
              ) : (
                <Text style={styles.markNotJoint}>{t("jointVisit.notMarked")}</Text>
              )}
              {current.evaluation?.average != null ? (
                <Text style={styles.ratingLine}>{t("jointVisit.ratingValue", { score: formatScore(current.evaluation.average, i18n.language) })}</Text>
              ) : null}
              {current.canEvaluate ? (
                <Pressable
                  accessibilityRole="button"
                  testID="manager-joint-visit-rate-current"
                  onPress={() => rate(current)}
                  style={({ pressed }) => [current.evaluation ? styles.secondary : styles.primary, styles.panelButton, pressed && styles.pressed]}
                >
                  <Text style={current.evaluation ? styles.secondaryText : styles.primaryText}>
                    {current.evaluation ? t("jointVisit.change") : t("jointVisit.rate")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : session ? (
            <View style={styles.notice}>
              <Icon name="time-outline" size={22} color={fieldTheme.color.inkMuted} />
              <Text style={styles.noticeText}>{t("jointVisit.noVisitsYet")}</Text>
            </View>
          ) : null}

          {together.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t("jointVisit.todayTogether")}</Text>
                <Text style={styles.sectionCount}>{t("jointVisit.visitsCount", { count: together.length })}</Text>
              </View>
              <View style={styles.list}>
                {together.map((visit, index) => (
                  <VisitRow key={visit.id} visit={visit} first={index === 0} language={i18n.language} onRate={rate} />
                ))}
              </View>
            </>
          ) : null}

          {waiting.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t("jointVisit.waitingRating")}</Text>
                <Text style={styles.sectionCount}>{t("jointVisit.visitsCount", { count: waiting.length })}</Text>
              </View>
              <View style={styles.list}>
                {waiting.map((visit, index) => (
                  <VisitRow key={visit.id} visit={visit} first={index === 0} language={i18n.language} onRate={rate} showAgent />
                ))}
              </View>
            </>
          ) : null}

          {session ? (
            <Pressable
              accessibilityRole="button"
              testID="manager-joint-visit-end"
              disabled={ending}
              onPress={() => { end().catch(() => {}) }}
              style={({ pressed }) => [styles.secondary, styles.endButton, pressed && styles.pressed]}
            >
              {ending ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} /> : null}
              <Text style={styles.secondaryText}>{ending ? t("jointVisit.ending") : t("jointVisit.end")}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

function VisitRow({
  visit,
  first,
  language,
  onRate,
  showAgent = false,
}: {
  visit: JointVisitRow
  first: boolean
  language: string
  onRate: (visit: JointVisitRow) => void
  showAgent?: boolean
}) {
  const { t } = useTranslation()
  const time = `${clockTime(visit.checkInAt)}${visit.checkOutAt ? `–${clockTime(visit.checkOutAt)}` : ""}`
  const status = !visit.joint
    ? t("jointVisit.markedAlone")
    : visit.evaluation?.average != null
      ? t("jointVisit.ratingValue", { score: formatScore(visit.evaluation.average, language) })
      : visit.canEvaluate
        ? t("jointVisit.notRatedYet")
        : t("jointVisit.ratingClosed")
  return (
    <View style={[styles.visitRow, !first && styles.visitDivider]} testID={`manager-joint-visit-row-${visit.id}`}>
      <Text style={styles.visitTime}>{time}</Text>
      <View style={styles.visitCopy}>
        <Text style={styles.visitTitle} numberOfLines={2}>{visitTitle(visit)}</Text>
        {showAgent ? <Text style={styles.visitMeta} numberOfLines={1}>{visit.agent.name}</Text> : null}
        <Text style={[styles.visitMeta, visit.evaluation ? styles.visitRated : null]} numberOfLines={2}>{status}</Text>
      </View>
      {visit.joint && visit.canEvaluate ? (
        <Pressable accessibilityRole="button" testID={`manager-joint-visit-rate-${visit.id}`} onPress={() => onRate(visit)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
          <Text style={styles.smallButtonText}>{visit.evaluation ? t("jointVisit.change") : t("jointVisit.rate")}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  page: { flexGrow: 1 },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  headerRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "500" },
  title: { color: fieldTheme.color.ink, fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.3 },
  body: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.sm },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: fieldTheme.space.lg, gap: fieldTheme.space.md },
  contentTablet: { padding: fieldTheme.space.xl },
  panel: { padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, borderWidth: 2, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.success },
  panelEyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "700" },
  panelTitle: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 26, fontWeight: "700", marginTop: fieldTheme.space.xs },
  panelSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  markRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: fieldTheme.space.md },
  markJoint: { flexShrink: 1, color: fieldTheme.color.success, fontSize: 14, fontWeight: "600" },
  markNotJoint: { color: fieldTheme.color.amber, fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: fieldTheme.space.md },
  ratingLine: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "700", marginTop: fieldTheme.space.sm },
  panelButton: { marginTop: fieldTheme.space.md },
  notice: { flexDirection: "row", gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface },
  noticeText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: fieldTheme.space.sm, marginHorizontal: 2 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700" },
  sectionCount: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  list: { ...fieldTheme.card, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg },
  visitRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.md },
  visitDivider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  visitTime: { width: 84, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 17 },
  visitCopy: { flex: 1, minWidth: 0 },
  visitTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "700" },
  visitMeta: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 17, marginTop: 2 },
  visitRated: { color: fieldTheme.color.success, fontWeight: "700" },
  smallButton: { paddingHorizontal: fieldTheme.space.md, paddingVertical: 6, borderRadius: 10, borderWidth: 2, borderColor: fieldTheme.color.primary },
  smallButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "700" },
  primary: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: fieldTheme.space.md, borderRadius: 16, backgroundColor: fieldTheme.color.primaryStrong },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "700" },
  secondary: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: fieldTheme.space.md, borderRadius: 16, borderWidth: 2, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "700" },
  endButton: { marginTop: fieldTheme.space.sm },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.xl },
  stateText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  pressed: { opacity: 0.78 },
}))
