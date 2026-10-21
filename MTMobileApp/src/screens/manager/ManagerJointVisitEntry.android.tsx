import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { managerApi } from "../../services/manager-api"
import { notify } from "../../services/app-feedback"
import type { ManagerTeamAgent } from "../../services/manager-location-truth"
import {
  clockTime,
  currentJointVisit,
  jointVisitFailure,
  personInitials,
  toJointVisitState,
  unratedJointVisits,
  visitTitle,
  type JointVisitState,
} from "../../services/joint-visit"
import { fieldTheme, themed } from "../../theme/fieldTheme"

const FAILURE_COPY = {
  offline: "jointVisit.errorOffline",
  notInTeam: "jointVisit.errorNotInTeam",
  notJoint: "jointVisit.errorNotJoint",
  closed: "jointVisit.errorClosed",
  invalid: "jointVisit.errorInvalid",
  questionsChanged: "jointVisit.errorQuestionsChanged",
  failed: "jointVisit.errorFailed",
} as const

/**
 * «Иду на визит с агентом» on «Команда» (owner-approved mockup, 2026-10-20).
 * Under «Написать команде / Создать маршрут»: the button that opens the list
 * of the manager's agents, or — while he is in the field with one — the card
 * of that joint visit, which opens it. Visits marked as joint that still wait
 * for his rating keep the card on screen after the session is over.
 */
export default function ManagerJointVisitEntry({ agents }: { agents: ManagerTeamAgent[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { t } = useTranslation()
  const [state, setState] = useState<JointVisitState | null>(null)
  const [picking, setPicking] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    try {
      const response = await managerApi.getJointVisit()
      if (alive.current) setState(toJointVisitState(response))
    } catch {
      // The button stays; the card comes back with the next answer.
    }
  }, [])

  useAutoRefresh(useCallback(() => { load().catch(() => {}) }, [load]), 30_000)

  const start = async (agentId: string) => {
    if (startingId) return
    setStartingId(agentId)
    try {
      const response = await managerApi.startJointVisit(agentId)
      if (!alive.current) return
      setState(toJointVisitState(response))
      setPicking(false)
      navigation.navigate("ManagerJointVisit")
    } catch (error) {
      const reason = jointVisitFailure(error)
      if (reason !== "session") notify({ tone: "error", title: t(FAILURE_COPY[reason]) })
    } finally {
      if (alive.current) setStartingId(null)
    }
  }

  const fieldAgents = agents.filter((agent) => agent.role === "AGENT")
  const session = state?.session ?? null
  const current = state ? currentJointVisit(state) : null
  const waiting = state ? unratedJointVisits(state).length : 0

  return (
    <View style={styles.wrap}>
      {session ? (
        <Pressable
          accessibilityRole="button"
          testID="manager-joint-visit-card"
          onPress={() => navigation.navigate("ManagerJointVisit")}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardIcon}><Icon name="people" size={22} color={fieldTheme.color.primaryStrong} /></View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle} numberOfLines={1}>{t("jointVisit.activeTitle", { name: session.agent.name })}</Text>
            <Text style={styles.cardBody} numberOfLines={2}>
              {current
                ? t("jointVisit.activeAtClient", { client: visitTitle(current) })
                : t("jointVisit.activeSince", { time: clockTime(session.startedAt) })}
            </Text>
            {waiting > 0 ? <Text style={styles.cardWaiting}>{t("jointVisit.toRate", { count: waiting })}</Text> : null}
          </View>
          <View style={styles.openPill}><Text style={styles.openText}>{t("jointVisit.open")}</Text></View>
        </Pressable>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            testID="manager-joint-visit-start"
            onPress={() => setPicking(true)}
            style={({ pressed }) => [styles.start, pressed && styles.pressed]}
          >
            <Icon name="people-outline" size={22} color={fieldTheme.color.primaryStrong} />
            <View style={styles.cardCopy}>
              <Text style={styles.startText}>{t("jointVisit.startButton")}</Text>
              <Text style={styles.startHint}>{t("jointVisit.startHint")}</Text>
            </View>
          </Pressable>
          {waiting > 0 ? (
            <Pressable
              accessibilityRole="button"
              testID="manager-joint-visit-waiting"
              onPress={() => navigation.navigate("ManagerJointVisit")}
              style={({ pressed }) => [styles.waitingRow, pressed && styles.pressed]}
            >
              <Text style={styles.cardWaiting}>{t("jointVisit.toRate", { count: waiting })}</Text>
              <Text style={styles.openText}>{t("jointVisit.open")}</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <AgentSheet
        visible={picking}
        agents={fieldAgents}
        startingId={startingId}
        onCancel={() => { if (!startingId) setPicking(false) }}
        onPick={(agentId) => { start(agentId).catch(() => {}) }}
      />
    </View>
  )
}

function AgentSheet({
  visible,
  agents,
  startingId,
  onCancel,
  onPick,
}: {
  visible: boolean
  agents: ManagerTeamAgent[]
  startingId: string | null
  onCancel: () => void
  onPick: (agentId: string) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      {/* A modal is a window of its own on Android: the insets come from a provider inside it. */}
      <SafeAreaProvider>
        <AgentSheetCard agents={agents} startingId={startingId} onCancel={onCancel} onPick={onPick} />
      </SafeAreaProvider>
    </Modal>
  )
}

function AgentSheetCard({
  agents,
  startingId,
  onCancel,
  onPick,
}: {
  agents: ManagerTeamAgent[]
  startingId: string | null
  onCancel: () => void
  onPick: (agentId: string) => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const statusLine = (agent: ManagerTeamAgent) => {
    const working = agent.workday?.status === "STARTED" || agent.workday?.status === "PAUSED"
    const day = working ? t("jointVisit.agentAtWork") : t("jointVisit.agentNotStarted")
    const route = agent.routeToday && agent.routeToday.planned > 0
      ? t("jointVisit.agentRoute", { visited: agent.routeToday.visited, planned: agent.routeToday.planned })
      : null
    return { working, text: [day, route].filter(Boolean).join(" · ") }
  }

  return (
    <View style={styles.scrim}>
      {/* The whole sheet is the page: a long team scrolls with it, nothing has a frame of its own. */}
      <ScrollView contentContainerStyle={[styles.sheetPage, { paddingTop: insets.top + fieldTheme.space.xl }]} bounces={false}>
        <Pressable accessible={false} testID="manager-joint-visit-backdrop" onPress={onCancel} style={styles.backdrop}>
          <View
            testID="manager-joint-visit-sheet"
            onStartShouldSetResponder={() => true}
            style={[styles.sheet, { paddingBottom: insets.bottom + fieldTheme.space.lg }]}
          >
            <View style={styles.grab} />
            <Text accessibilityRole="header" style={styles.sheetTitle}>{t("jointVisit.pickTitle")}</Text>
            <Text style={styles.sheetBody}>{t("jointVisit.pickBody")}</Text>
            {agents.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t("jointVisit.pickEmpty")}</Text>
            ) : agents.map((agent, index) => {
              const status = statusLine(agent)
              const starting = startingId === agent.id
              return (
                <Pressable
                  key={agent.id}
                  accessibilityRole="button"
                  accessibilityLabel={agent.name}
                  testID={`manager-joint-visit-pick-${agent.id}`}
                  disabled={startingId !== null}
                  onPress={() => onPick(agent.id)}
                  style={({ pressed }) => [styles.agentRow, index > 0 && styles.agentDivider, pressed && styles.pressed]}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{personInitials(agent.name)}</Text></View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                    <View style={styles.agentStatusRow}>
                      {status.working ? <View style={styles.dot} /> : null}
                      <Text style={styles.agentStatus} numberOfLines={1}>{status.text}</Text>
                    </View>
                  </View>
                  <View style={styles.pickPill}>
                    {starting
                      ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} />
                      : <Text style={styles.openText}>{t("jointVisit.pick")}</Text>}
                  </View>
                </Pressable>
              )
            })}
            <Pressable accessibilityRole="button" testID="manager-joint-visit-cancel" onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>{t("jointVisit.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  start: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.lg,
    paddingVertical: fieldTheme.space.sm,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
  },
  startText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "700" },
  startHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  card: {
    ...fieldTheme.card,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 2,
    borderColor: fieldTheme.color.primary,
  },
  cardIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "700" },
  cardBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardWaiting: { color: fieldTheme.color.amber, fontSize: 13, fontWeight: "700", marginTop: 2 },
  waitingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: fieldTheme.color.amber,
    backgroundColor: fieldTheme.color.surface,
  },
  openPill: { paddingHorizontal: fieldTheme.space.md, paddingVertical: 7, borderRadius: 10, borderWidth: 2, borderColor: fieldTheme.color.primary },
  openText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "700" },
  scrim: { flex: 1, backgroundColor: fieldTheme.color.scrim },
  sheetPage: { flexGrow: 1 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    paddingHorizontal: fieldTheme.space.lg,
    paddingTop: fieldTheme.space.sm,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: fieldTheme.color.surface,
  },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.line },
  sheetTitle: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 27, fontWeight: "700" },
  sheetBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs, marginBottom: fieldTheme.space.sm },
  sheetEmpty: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, paddingVertical: fieldTheme.space.lg },
  agentRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  agentDivider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  avatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: fieldTheme.color.primarySoft },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "700" },
  agentName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700" },
  agentStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.success },
  agentStatus: { flexShrink: 1, color: fieldTheme.color.inkMuted, fontSize: 13 },
  pickPill: { minWidth: 86, minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderRadius: 12, borderWidth: 2, borderColor: fieldTheme.color.primary },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: fieldTheme.space.sm },
  cancelText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.78 },
}))
