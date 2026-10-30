import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { managerApi } from "../../services/manager-api"
import { notify } from "../../services/app-feedback"
import { clockTime, personInitials } from "../../services/joint-visit"
import {
  planBody,
  planDays,
  planFailure,
  relativeDay,
  targetTypeLabel,
  toPlanDay,
  toPlanTargets,
  type PlanDay,
  type PlanFailure,
  type PlanStop,
  type PlanTarget,
} from "../../services/joint-visit-plan"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { fieldTheme, themed } from "../../theme/fieldTheme"

type Agent = { id: string; name: string }

/**
 * «Запланировать совместный визит» (owner, 2026-10-30): the manager picks an
 * agent and a day, ticks the clients of the agent's route he goes to with
 * him, or adds an extra client — it goes onto the agent's route — and saves.
 * The agent is told at once and sees the mark on his route.
 *
 * One page that scrolls whole; only the save button stays under it.
 */
export default function ManagerJointVisitPlanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "ManagerJointVisitPlan">>()
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [agentId, setAgentId] = useState<string | null>(route.params?.agentId ?? null)
  const [date, setDate] = useState<string | null>(route.params?.date ?? null)
  const [day, setDay] = useState<PlanDay | null>(null)
  const [planWindow, setPlanWindow] = useState<{ from: string; to: string } | null>(null)
  const [dayState, setDayState] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [extras, setExtras] = useState<PlanTarget[]>([])
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // His team's field agents: the ones who have a route and check in.
  useEffect(() => {
    managerApi.getTeam()
      .then((response) => {
        const rows: unknown[] = Array.isArray(response?.data?.agents) ? response.data.agents : []
        const list = rows.flatMap((raw) => {
          const row = (raw ?? {}) as { id?: unknown; name?: unknown; role?: unknown }
          return typeof row.id === "string" && typeof row.name === "string" && row.role === "AGENT" ? [{ id: row.id, name: row.name }] : []
        })
        if (!alive.current) return
        setAgents(list)
        if (!agentId && list.length === 1) setAgentId(list[0].id)
      })
      .catch(() => { if (alive.current) setAgents([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per screen; the choice is the manager's afterwards
  }, [])

  const loadDay = useCallback(async (forAgent: string, forDate: string | null) => {
    setDayState("loading")
    try {
      // Without a day yet the server's today comes back with the window.
      const answer = toPlanDay(await managerApi.getJointPlanDay(forAgent, forDate ?? new Date().toISOString().slice(0, 10)))
      if (!alive.current) return
      if (answer.window) setPlanWindow(answer.window)
      if (!forDate && answer.window && answer.window.from !== answer.date) {
        setDate(answer.window.from)
        return
      }
      setDay(answer)
      setDate(answer.date)
      setDayState("ready")
    } catch (error) {
      if (!alive.current) return
      setDayState("failed")
      const reason = planFailure(error)
      if (reason !== "session" && reason !== "offline") notify({ tone: "error", title: t(`jointVisit.plan.errors.${reason}`) })
    }
  }, [t])

  useEffect(() => {
    if (!agentId) return
    setTicked(new Set())
    setExtras([])
    loadDay(agentId, date).catch(() => {})
  }, [agentId, date, loadDay])

  const agent = agents?.find((row) => row.id === agentId) ?? (agentId && route.params?.agentName ? { id: agentId, name: route.params.agentName } : null)
  const count = ticked.size + extras.length
  const today = planWindow?.from ?? ""

  const toggle = (stop: PlanStop) => {
    if (!stop.canJoin) return
    setTicked((current) => {
      const next = new Set(current)
      if (next.has(stop.id)) next.delete(stop.id)
      else next.add(stop.id)
      return next
    })
  }

  const save = async () => {
    if (!agentId || !date || count === 0 || saving) return
    setSaving(true)
    try {
      await managerApi.saveJointPlans(planBody({ agentId, date, stopIds: [...ticked], extras }))
      notify({ tone: "success", title: t("jointVisit.plan.saved"), message: t("jointVisit.plan.savedBody", { name: agent?.name ?? "" }) })
      // Back to the list, not on top of this screen: «Back» from there must not
      // land on a planner still holding the saved choice (live check 2026-10-30).
      navigation.popTo("ManagerJointVisit")
    } catch (error) {
      const reason = planFailure(error)
      if (reason !== "session") notify({ tone: "error", title: t(`jointVisit.plan.errors.${reason}`) })
      // A stop that went away, or a route that moved on: show the day as it is now.
      if (reason === "stopGone" || reason === "routeChanged" || reason === "routeClosed") loadDay(agentId, date).catch(() => {})
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  const dayName = (key: string) => {
    const relative = relativeDay(key, today)
    const value = new Date(`${key}T12:00:00.000Z`)
    const written = formatLocalizedDate(value, i18n.language, { weekday: "long", day: "numeric", month: "long" })
    return relative ? `${t(`jointVisit.plan.${relative}`)} · ${written}` : written
  }

  const stops = day?.route?.stops ?? []
  const routeOpen = !day?.route || day.route.open

  return (
    <View style={styles.root}>
      <LightScreenStatusBar />
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: fieldTheme.space.xl }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("jointVisit.back")} onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t("jointVisit.plan.eyebrow")}</Text>
              <Text style={styles.title} numberOfLines={1}>{agent ? agent.name : t("jointVisit.plan.title")}</Text>
            </View>
          </View>
          <Text style={styles.body}>{t("jointVisit.plan.body")}</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.label}>{t("jointVisit.plan.withWhom")}</Text>
          {agents === null ? (
            <ActivityIndicator color={fieldTheme.color.primary} style={styles.inlineSpinner} />
          ) : agents.length === 0 ? (
            <Text style={styles.muted}>{t("jointVisit.pickEmpty")}</Text>
          ) : (
            <View style={styles.chips} testID="joint-plan-agents">
              {agents.map((row) => {
                const chosen = row.id === agentId
                return (
                  <Pressable
                    key={row.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => setAgentId(row.id)}
                    style={({ pressed }) => [styles.agentChip, chosen && styles.chipOn, pressed && styles.pressed]}
                    testID={`joint-plan-agent-${row.id}`}
                  >
                    <View style={[styles.avatar, chosen && styles.avatarOn]}><Text style={[styles.avatarText, chosen && styles.chipTextOn]}>{personInitials(row.name)}</Text></View>
                    <Text style={[styles.chipText, chosen && styles.chipTextOn]} numberOfLines={1}>{row.name}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          {agentId && planWindow ? (
            <>
              <Text style={styles.label}>{t("jointVisit.plan.when")}</Text>
              <View style={styles.days} testID="joint-plan-days">
                {planDays(planWindow.from, planWindow.to).map((key) => {
                  const chosen = key === date
                  const value = new Date(`${key}T12:00:00.000Z`)
                  const relative = relativeDay(key, today)
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={dayName(key)}
                      onPress={() => setDate(key)}
                      style={({ pressed }) => [styles.dayCell, chosen && styles.chipOn, pressed && styles.pressed]}
                      testID={`joint-plan-day-${key}`}
                    >
                      <Text style={[styles.dayWeek, chosen && styles.chipTextOn]} numberOfLines={1}>
                        {relative ? t(`jointVisit.plan.${relative}Short`) : formatLocalizedDate(value, i18n.language, { weekday: "short" })}
                      </Text>
                      <Text style={[styles.dayNumber, chosen && styles.chipTextOn]}>{value.getUTCDate()}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : null}

          {agentId && date ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t("jointVisit.plan.routeTitle")}</Text>
                <Text style={styles.sectionCount}>{dayName(date)}</Text>
              </View>
              {dayState === "loading" ? (
                <ActivityIndicator color={fieldTheme.color.primary} style={styles.inlineSpinner} />
              ) : dayState === "failed" ? (
                <Pressable accessibilityRole="button" onPress={() => { loadDay(agentId, date).catch(() => {}) }} style={({ pressed }) => [styles.notice, pressed && styles.pressed]}>
                  <Icon name="cloud-offline-outline" size={22} color={fieldTheme.color.amber} />
                  <Text style={styles.noticeText}>{t("jointVisit.plan.loadFailed")}</Text>
                </Pressable>
              ) : stops.length === 0 ? (
                <View style={styles.notice} testID="joint-plan-no-route">
                  <Icon name="map-outline" size={22} color={fieldTheme.color.inkMuted} />
                  <Text style={styles.noticeText}>{t("jointVisit.plan.noRoute", { name: agent?.name ?? "" })}</Text>
                </View>
              ) : (
                <View style={styles.list} testID="joint-plan-stops">
                  {stops.map((stop, index) => (
                    <StopChoice key={stop.id} stop={stop} first={index === 0} ticked={ticked.has(stop.id)} onPress={() => toggle(stop)} />
                  ))}
                </View>
              )}

              {dayState === "ready" && routeOpen ? (
                <>
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>{t("jointVisit.plan.extraTitle")}</Text>
                  </View>
                  <Text style={styles.muted}>{t("jointVisit.plan.extraBody", { name: agent?.name ?? "" })}</Text>
                  {extras.length > 0 ? (
                    <View style={styles.list} testID="joint-plan-extras">
                      {extras.map((extra, index) => (
                        <View key={extra.key} style={[styles.row, index > 0 && styles.divider]}>
                          <View style={[styles.check, styles.checkOn]}><Icon name="add" size={18} color={fieldTheme.color.onColor} /></View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle} numberOfLines={2}>{extra.title}</Text>
                            {extra.subtitle ? <Text style={styles.rowMeta} numberOfLines={2}>{extra.subtitle}</Text> : null}
                            <Text style={styles.rowTag}>{t("jointVisit.plan.extraTag")}</Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setExtras((current) => current.filter((row) => row.key !== extra.key))}
                            hitSlop={8}
                            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                          >
                            <Text style={styles.removeText}>{t("jointVisit.plan.remove")}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPicking(true)}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                    testID="joint-plan-add-extra"
                  >
                    <Icon name="add-circle-outline" size={20} color={fieldTheme.color.primaryStrong} />
                    <Text style={styles.secondaryText}>{t("jointVisit.plan.addExtra")}</Text>
                  </Pressable>
                </>
              ) : dayState === "ready" ? (
                <Text style={styles.muted}>{t("jointVisit.plan.routeClosed")}</Text>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + fieldTheme.space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: count === 0 || saving }}
          disabled={count === 0 || saving}
          onPress={() => { save().catch(() => {}) }}
          style={({ pressed }) => [styles.primary, (count === 0 || saving) && styles.primaryOff, pressed && styles.pressed]}
          testID="joint-plan-save"
        >
          {saving ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Icon name="people" size={20} color={fieldTheme.color.onColor} />}
          <Text style={styles.primaryText}>{count > 0 ? t("jointVisit.plan.save", { count }) : t("jointVisit.plan.chooseClient")}</Text>
        </Pressable>
      </View>

      {agentId && date ? (
        <ExtraClientSheet
          visible={picking}
          agentId={agentId}
          date={date}
          taken={new Set([...stops.map((stop) => stop.customerId), ...extras.map((extra) => extra.customerId)])}
          onClose={() => setPicking(false)}
          onPick={(target) => {
            setExtras((current) => (current.some((row) => row.key === target.key) ? current : [...current, target]))
            setPicking(false)
          }}
        />
      ) : null}
    </View>
  )
}

function StopChoice({ stop, first, ticked, onPress }: { stop: PlanStop; first: boolean; ticked: boolean; onPress: () => void }) {
  const { t } = useTranslation()
  const planned = Boolean(stop.myPlanId)
  const on = ticked || planned
  const note = planned
    ? t("jointVisit.plan.alreadyPlanned")
    : stop.status === "VISITED"
      ? t("jointVisit.plan.visited")
      : !stop.canJoin
        ? t("jointVisit.plan.cannotJoin")
        : null
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: !stop.canJoin }}
      disabled={!stop.canJoin}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
      testID={`joint-plan-stop-${stop.id}`}
    >
      <View style={[styles.check, on && styles.checkOn, !stop.canJoin && !planned && styles.checkOff]}>
        {on ? <Icon name="checkmark" size={18} color={fieldTheme.color.onColor} /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, !stop.canJoin && !planned && styles.rowTitleOff]} numberOfLines={2}>{stop.contactName || stop.customerName}</Text>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {[stop.plannedTime ? clockTime(stop.plannedTime) : null, stop.contactName ? [stop.contactSpecialty, stop.customerName].filter(Boolean).join(" · ") : stop.address]
            .filter(Boolean).join(" · ")}
        </Text>
        {note ? <Text style={[styles.rowTag, !planned && styles.rowTagMuted]}>{note}</Text> : null}
        {stop.otherManagers.length > 0 ? <Text style={styles.rowMeta}>{t("jointVisit.plan.alsoGoing", { name: stop.otherManagers.join(", ") })}</Text> : null}
      </View>
    </Pressable>
  )
}

/** «Добавить клиента»: the agent's clients for that day, searched on the server. */
function ExtraClientSheet({
  visible,
  agentId,
  date,
  taken,
  onClose,
  onPick,
}: {
  visible: boolean
  agentId: string
  date: string
  taken: Set<string>
  onClose: () => void
  onPick: (target: PlanTarget) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A modal is a window of its own on Android: the insets come from a provider inside it. */}
      <SafeAreaProvider>
        {visible ? <ExtraClientSheetCard agentId={agentId} date={date} taken={taken} onClose={onClose} onPick={onPick} /> : null}
      </SafeAreaProvider>
    </Modal>
  )
}

function ExtraClientSheetCard({ agentId, date, taken, onClose, onPick }: Omit<React.ComponentProps<typeof ExtraClientSheet>, "visible">) {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState("")
  const [typeId, setTypeId] = useState<string | undefined>(undefined)
  const [types, setTypes] = useState<Array<{ id: string; labels: Record<string, unknown> }>>([])
  const [items, setItems] = useState<PlanTarget[] | null>(null)
  const [failure, setFailure] = useState<PlanFailure | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setFailure(null)
      managerApi.getAgentTargets({ agentId, date, search: search.trim() || undefined, targetTypeId: typeId }, controller.signal)
        .then((response) => {
          const answer = toPlanTargets(response)
          setItems(answer.items)
          if (answer.types.length > 0) setTypes(answer.types)
          if (!typeId && answer.types[0]) setTypeId(answer.types[0].id)
        })
        .catch((error) => { if (!controller.signal.aborted) { setItems([]); setFailure(planFailure(error)) } })
    }, search ? 350 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [agentId, date, search, typeId])

  return (
    <View style={styles.scrim}>
      <Pressable accessible={false} style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingTop: fieldTheme.space.sm, paddingBottom: insets.bottom + fieldTheme.space.lg, marginTop: insets.top + fieldTheme.space.xl }]} testID="joint-plan-extra-sheet">
        <View style={styles.grab} />
        <Text accessibilityRole="header" style={styles.sheetTitle}>{t("jointVisit.plan.pickTitle")}</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("jointVisit.plan.searchPlaceholder")}
          placeholderTextColor={fieldTheme.color.inkMuted}
          style={styles.input}
          autoFocus
          testID="joint-plan-extra-search"
        />
        {types.length > 1 ? (
          <View style={styles.chips}>
            {types.map((type) => {
              const chosen = type.id === typeId
              return (
                <Pressable
                  key={type.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => { setItems(null); setTypeId(type.id) }}
                  style={({ pressed }) => [styles.typeChip, chosen && styles.chipOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.chipText, chosen && styles.chipTextOn]}>{targetTypeLabel(type.labels, i18n.language, type.id)}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
        {/* The sheet's list is part of the sheet: it grows with the results, and the page under it does not move. */}
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
          {items === null ? (
            <ActivityIndicator color={fieldTheme.color.primary} style={styles.inlineSpinner} />
          ) : failure ? (
            <Text style={styles.muted}>{t(`jointVisit.plan.errors.${failure}`)}</Text>
          ) : items.length === 0 ? (
            <Text style={styles.muted}>{t("jointVisit.plan.noClients")}</Text>
          ) : items.map((item, index) => {
            const already = taken.has(item.customerId) && !item.contactId
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                disabled={already}
                onPress={() => onPick(item)}
                style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}
                testID={`joint-plan-extra-${item.customerId}`}
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, already && styles.rowTitleOff]} numberOfLines={2}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.rowMeta} numberOfLines={2}>{item.subtitle}</Text> : null}
                  {already ? <Text style={[styles.rowTag, styles.rowTagMuted]}>{t("jointVisit.plan.onRouteAlready")}</Text> : null}
                </View>
                {already ? null : <Icon name="add-circle" size={24} color={fieldTheme.color.primaryStrong} />}
              </Pressable>
            )
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{t("jointVisit.cancel")}</Text>
        </Pressable>
      </View>
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
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: fieldTheme.space.lg, gap: fieldTheme.space.sm },
  label: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700", marginTop: fieldTheme.space.sm },
  muted: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  inlineSpinner: { paddingVertical: fieldTheme.space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  agentChip: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, minHeight: 48, paddingLeft: 6, paddingRight: fieldTheme.space.md, borderRadius: 24, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  typeChip: { minHeight: 38, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderRadius: 19, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  chipOn: { borderColor: fieldTheme.color.primaryStrong, backgroundColor: fieldTheme.color.primaryStrong },
  chipText: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: fieldTheme.color.onColor },
  avatar: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: fieldTheme.color.primarySoft },
  avatarOn: { backgroundColor: fieldTheme.color.primary },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "700" },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dayCell: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  dayWeek: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "600" },
  dayNumber: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md, marginHorizontal: 2 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700" },
  sectionCount: { flexShrink: 1, color: fieldTheme.color.inkMuted, fontSize: 12, textAlign: "right" },
  list: { ...fieldTheme.card, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg },
  row: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.md, minHeight: 60 },
  divider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  check: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 2, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  checkOn: { borderColor: fieldTheme.color.primaryStrong, backgroundColor: fieldTheme.color.primaryStrong },
  checkOff: { borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surfaceStrong },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700" },
  rowTitleOff: { color: fieldTheme.color.inkMuted },
  rowMeta: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 17, marginTop: 2 },
  rowTag: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "700", marginTop: 4 },
  rowTagMuted: { color: fieldTheme.color.inkMuted },
  removeButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderRadius: 10, borderWidth: 2, borderColor: fieldTheme.color.border },
  removeText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "700" },
  notice: { flexDirection: "row", gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface },
  noticeText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 },
  secondary: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: fieldTheme.space.md, borderRadius: 16, borderWidth: 2, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "700" },
  dock: { paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  primary: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: fieldTheme.space.md, borderRadius: 16, backgroundColor: fieldTheme.color.primaryStrong },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "700" },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: fieldTheme.color.scrim },
  sheetBackdrop: { flex: 1 },
  sheet: { maxHeight: "88%", paddingHorizontal: fieldTheme.space.lg, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: fieldTheme.color.surface, gap: fieldTheme.space.sm },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: fieldTheme.space.xs, backgroundColor: fieldTheme.color.line },
  sheetTitle: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 27, fontWeight: "700" },
  input: { minHeight: 48, paddingHorizontal: fieldTheme.space.md, borderRadius: 14, borderWidth: 2, borderColor: fieldTheme.color.border, color: fieldTheme.color.ink, fontSize: 15, backgroundColor: fieldTheme.color.canvas },
  results: { flexGrow: 0 },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.78 },
}))
