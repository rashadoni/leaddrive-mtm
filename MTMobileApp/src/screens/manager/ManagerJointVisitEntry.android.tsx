import React, { useCallback, useEffect, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { managerApi } from "../../services/manager-api"
import type { ManagerTeamAgent } from "../../services/manager-location-truth"
import {
  clockTime,
  currentJointVisit,
  planStage,
  toJointVisitState,
  unratedJointVisits,
  visitTitle,
  type JointVisitState,
} from "../../services/joint-visit"
import { fieldTheme, themed } from "../../theme/fieldTheme"

/**
 * Joint visits on «Команда» (owner, 2026-10-20; planned ahead since
 * 2026-10-30): «Запланировать совместный визит» opens the planner — agent,
 * day, clients of his route or an extra one — and, once something is planned,
 * the card of the joint visits says where the manager goes today and how many
 * are ahead; it opens them. Visits still waiting for his rating keep a line
 * on screen.
 */
export default function ManagerJointVisitEntry({ agents }: { agents: ManagerTeamAgent[] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { t } = useTranslation()
  const [state, setState] = useState<JointVisitState | null>(null)
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

  // Only field agents can be accompanied: they are the ones who check in.
  const fieldAgents = agents.filter((agent) => agent.role === "AGENT")
  const plan = () => navigation.navigate(
    "ManagerJointVisitPlan",
    fieldAgents.length === 1 ? { agentId: fieldAgents[0].id, agentName: fieldAgents[0].name } : {},
  )
  const open = () => navigation.navigate("ManagerJointVisit")

  const session = state?.session ?? null
  const current = state ? currentJointVisit(state) : null
  const waiting = state ? unratedJointVisits(state).length : 0
  const today = state?.today ?? ""
  const plans = (state?.plans ?? []).filter((row) => planStage(row, today) !== "removed")
  const todays = plans.filter((row) => row.date === today)
  const ahead = plans.filter((row) => row.date > today).length
  const now = todays.find((row) => planStage(row, today) === "atClient")
  const next = todays.find((row) => planStage(row, today) === "planned")
  const todayAgents = [...new Set(todays.map((row) => row.agent.name))].join(", ")

  return (
    <View style={styles.wrap}>
      {session ? (
        <Pressable
          accessibilityRole="button"
          testID="manager-joint-visit-session"
          onPress={open}
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
          </View>
          <View style={styles.openPill}><Text style={styles.openText}>{t("jointVisit.open")}</Text></View>
        </Pressable>
      ) : null}

      {plans.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          testID="manager-joint-visit-card"
          onPress={open}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardIcon}><Icon name="people" size={22} color={fieldTheme.color.primaryStrong} /></View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {todays.length > 0 ? t("jointVisit.planned.todayWith", { name: todayAgents }) : t("jointVisit.jointVisits")}
            </Text>
            {now ? (
              <Text style={styles.cardBody} numberOfLines={2}>{t("jointVisit.activeAtClient", { client: now.contactName || now.customerName })}</Text>
            ) : next ? (
              <Text style={styles.cardBody} numberOfLines={2}>{t("jointVisit.planned.next", { client: next.contactName || next.customerName })}</Text>
            ) : null}
            {ahead > 0 ? <Text style={styles.cardBody}>{t("jointVisit.planned.ahead", { count: ahead })}</Text> : null}
            {waiting > 0 ? <Text style={styles.cardWaiting}>{t("jointVisit.toRate", { count: waiting })}</Text> : null}
          </View>
          <View style={styles.openPill}><Text style={styles.openText}>{t("jointVisit.open")}</Text></View>
        </Pressable>
      ) : waiting > 0 ? (
        <Pressable
          accessibilityRole="button"
          testID="manager-joint-visit-waiting"
          onPress={open}
          style={({ pressed }) => [styles.waitingRow, pressed && styles.pressed]}
        >
          <Text style={styles.cardWaiting}>{t("jointVisit.toRate", { count: waiting })}</Text>
          <Text style={styles.openText}>{t("jointVisit.open")}</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        testID="manager-joint-visit-start"
        onPress={plan}
        style={({ pressed }) => [styles.start, pressed && styles.pressed]}
      >
        <Icon name="people-outline" size={22} color={fieldTheme.color.primaryStrong} />
        <View style={styles.cardCopy}>
          <Text style={styles.startText}>{t("jointVisit.startButton")}</Text>
          <Text style={styles.startHint}>{t("jointVisit.startHint")}</Text>
        </View>
        <Icon name="chevron-forward" size={20} color={fieldTheme.color.primaryStrong} />
      </Pressable>
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
  pressed: { opacity: 0.78 },
}))
