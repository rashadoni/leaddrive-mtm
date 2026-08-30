import React, { useCallback, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, type NavigationProp } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import SyncStatusChip from "../../components/SyncStatusChip"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { api } from "../../services/api"
import { readOfflineRoute, readOfflineTasks } from "../../services/offline-reads"
import { useAuthStore } from "../../store/auth"
import { useKpiStore } from "../../store/kpi"
import { useWorkdayStore, workdayKey } from "../../store/workday"
import { refreshRouteFieldSession } from "../../services/field-session"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import {
  cachedRouteAsTodaySummary,
  localDateKey,
  selectTodayRoute,
  todayRoutePrimaryAction,
  type TodayRouteSummary,
} from "./today-state"
import { submitRouteCommand } from "../../services/route-command-journal"

type TodayNavigationParams = {
  Route: undefined
  Calendar: undefined
  Tasks: undefined
  Visits: undefined
}

type Destination = keyof TodayNavigationParams
type NextKind = "route" | "tasks" | "empty" | "unknown" | "loading"
type DataSource = "live" | "cached" | "unknown"

type QuickAction = {
  destination: Destination
  icon: string
  labelKey: string
  color: string
  background: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    destination: "Route",
    icon: "navigate-outline",
    labelKey: "todayV2.quickRoute",
    color: fieldTheme.color.primaryStrong,
    background: fieldTheme.color.primarySoft,
  },
  {
    destination: "Calendar",
    icon: "calendar-number-outline",
    labelKey: "todayV2.quickCalendar",
    color: fieldTheme.color.blue,
    background: fieldTheme.color.blueSoft,
  },
  {
    destination: "Tasks",
    icon: "checkbox-outline",
    labelKey: "todayV2.quickTasks",
    color: fieldTheme.color.amber,
    background: fieldTheme.color.amberSoft,
  },
  {
    destination: "Visits",
    icon: "checkmark-circle-outline",
    labelKey: "todayV2.quickVisits",
    color: fieldTheme.color.coral,
    background: fieldTheme.color.coralSoft,
  },
]

function progress(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, value / total))
}

export default function TodayScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NavigationProp<TodayNavigationParams>>()
  const { width } = useWindowDimensions()
  const twoPane = isExpandedTabletWidth(width)
  const compactHeader = width < 420
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()
  const agent = useAuthStore((state) => state.agent)
  const { stats, loading: kpiLoading, error: kpiError, fetchKpi } = useKpiStore()
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const startWorkday = useWorkdayStore((state) => state.start)
  const endWorkday = useWorkdayStore((state) => state.end)
  const [route, setRoute] = useState<TodayRouteSummary | null>(null)
  const [routeLoading, setRouteLoading] = useState(true)
  const [routeError, setRouteError] = useState(false)
  const [routeSource, setRouteSource] = useState<DataSource>("unknown")
  const [cachedOpenTasks, setCachedOpenTasks] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [startingRoute, setStartingRoute] = useState(false)
  const [workdayBusy, setWorkdayBusy] = useState(false)
  const [workdayError, setWorkdayError] = useState(false)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const currentWorkday = activeWorkday?.key === currentWorkdayKey ? activeWorkday : null
  const workdayPaused = currentWorkday?.syncState === "CONFIRMED" && currentWorkday.paused === true
  const workdayActive = workdayHydrated && currentWorkday?.syncState === "CONFIRMED" && !workdayPaused
  const workdayOpen = workdayActive || workdayPaused
  const workdayStarting = currentWorkday?.syncState === "START_PENDING"
  const workdayEnding = currentWorkday?.syncState === "FINISH_PENDING"
  const todayKey = localDateKey()

  const refresh = useCallback(async () => {
    let liveRouteFailed = false

    const routeRequest = (async () => {
      try {
        const response = await api.getRoutes(todayKey)
        if (!response?.success) throw new Error("ROUTE_UNAVAILABLE")
        const routes = Array.isArray(response.data?.routes) ? response.data.routes : []
        setRoute(selectTodayRoute(routes, todayKey))
        setRouteSource("live")
        setRouteError(false)
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "SESSION_EXPIRED") return
        liveRouteFailed = true
        const currentAgent = useAuthStore.getState().agent
        let cached: TodayRouteSummary | null = null
        if (currentAgent) {
          try {
            cached = cachedRouteAsTodaySummary(
              await readOfflineRoute(currentAgent.organizationId, currentAgent.id),
              todayKey,
            )
          } catch {}
        }
        setRoute((previous) => cached ?? previous)
        setRouteSource("cached")
        setRouteError(!cached)
      } finally {
        setRouteLoading(false)
      }
    })()

    await Promise.all([routeRequest, fetchKpi("today")])

    const latestKpi = useKpiStore.getState()
    if (latestKpi.error && agent) {
      try {
        const cachedTasks = await readOfflineTasks(agent.organizationId, agent.id)
        setCachedOpenTasks(cachedTasks.filter((task) =>
          task.status === "PENDING" || task.status === "IN_PROGRESS"
        ).length)
      } catch {
        setCachedOpenTasks(null)
      }
    } else {
      setCachedOpenTasks(null)
    }

    if (liveRouteFailed) setRouteSource("cached")
  }, [agent, fetchKpi, todayKey])

  useAutoRefresh(() => { refresh().catch(() => {}) })

  const manualRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh, refreshing])

  const syncWorkday = useCallback(async () => {
    if (workdayBusy || !workdayHydrated) return
    setWorkdayBusy(true)
    setWorkdayError(false)
    try {
      if (workdayOpen) {
        await endWorkday(currentWorkdayKey)
      } else {
        await startWorkday(currentWorkdayKey)
      }
      await refreshRouteFieldSession()
      await refresh()
    } catch {
      setWorkdayError(true)
    } finally {
      setWorkdayBusy(false)
    }
  }, [currentWorkdayKey, endWorkday, refresh, startWorkday, workdayBusy, workdayHydrated, workdayOpen])

  const requestWorkdayAction = useCallback(() => {
    if (workdayBusy || !workdayHydrated || workdayStarting || workdayEnding) return
    if (!workdayOpen) {
      syncWorkday().catch(() => {})
      return
    }
    Alert.alert(
      t("todayV2.endDayConfirmTitle"),
      t("todayV2.endDayConfirmBody"),
      [
        { text: t("todayV2.endDayConfirmCancel"), style: "cancel" },
        { text: t("todayV2.endDayConfirmAction"), style: "destructive", onPress: () => { syncWorkday().catch(() => {}) } },
      ],
    )
  }, [syncWorkday, t, workdayBusy, workdayEnding, workdayHydrated, workdayOpen, workdayStarting])

  const taskRemaining = stats
    ? Math.max(stats.tasks.total - stats.tasks.done, 0)
    : cachedOpenTasks
  const loading = routeLoading || (kpiLoading && stats === null)

  const nextKind: NextKind = useMemo(() => {
    if (route) return "route"
    if (loading) return "loading"
    if (routeError) return "unknown"
    if (taskRemaining != null && taskRemaining > 0) return "tasks"
    if (kpiError) return "unknown"
    return "empty"
  }, [kpiError, loading, route, routeError, taskRemaining])

  const nextCopy = useMemo(() => {
    if (nextKind === "route") {
      const routeCanStart = route != null && todayRoutePrimaryAction(route, routeSource) === "start"
      const canStartRoute = workdayActive && routeCanStart
      const routeNeedsWorkday = routeCanStart && !workdayActive
      const nextName = route?.nextPoint?.customer?.name
      const nextAddress = route?.nextPoint?.customer?.address
      const remaining = route?.remainingPoints ?? 0
      const body = routeNeedsWorkday
        ? t("todayV2.dayStartHint")
        : nextAddress
        ? nextAddress
        : route?.totalPoints === 0
          ? t("todayV2.routeNoStopsBody")
          : remaining === 0
          ? t("todayV2.routeCompleteBody")
          : t("todayV2.routeRemaining", { count: remaining })
      return {
        eyebrow: nextName ? t("todayV2.nextStop") : t("todayV2.routeReady"),
        title: nextName ?? t("todayV2.routeTitle"),
        body,
        supporting: nextName && remaining > 0
          ? t("todayV2.routeRemaining", { count: remaining })
          : null,
        button: routeNeedsWorkday
          ? (workdayStarting ? t("todayV2.dayStarting") : t("todayV2.startDay"))
          : canStartRoute
          ? (startingRoute ? t("todayV2.startingRoute") : t("todayV2.startRoute"))
          : t("todayV2.openRoute"),
        icon: canStartRoute ? "play" : routeNeedsWorkday ? "play-circle" : "navigate",
        destination: canStartRoute || routeNeedsWorkday ? null : "Route" as Destination,
        startRoute: canStartRoute,
        startWorkday: routeNeedsWorkday,
      }
    }
    if (nextKind === "tasks") {
      return {
        eyebrow: t("todayV2.nextAction"),
        title: t("todayV2.tasksTitle"),
        body: t("todayV2.tasksRemaining", { count: taskRemaining ?? 0 }),
        supporting: null,
        button: t("todayV2.openTasks"),
        icon: "checkbox",
        destination: "Tasks" as Destination,
        startRoute: false,
        startWorkday: false,
      }
    }
    if (nextKind === "empty") {
      return {
        eyebrow: t("todayV2.nextAction"),
        title: t("todayV2.emptyTitle"),
        body: t("todayV2.emptyBody"),
        supporting: null,
        button: t("todayV2.openCalendar"),
        icon: "checkmark-circle",
        destination: "Calendar" as Destination,
        startRoute: false,
        startWorkday: false,
      }
    }
    if (nextKind === "unknown") {
      return {
        eyebrow: t("todayV2.dataUnavailable"),
        title: t("todayV2.checkConnectionTitle"),
        body: t("todayV2.checkConnectionBody"),
        supporting: null,
        button: t("todayV2.refresh"),
        icon: "cloud-offline-outline",
        destination: null,
        startRoute: false,
        startWorkday: false,
      }
    }
    return {
      eyebrow: t("todayV2.loadingEyebrow"),
      title: t("todayV2.loadingTitle"),
      body: t("todayV2.loadingBody"),
      supporting: null,
      button: null,
      icon: "time-outline",
      destination: null,
      startRoute: false,
      startWorkday: false,
    }
  }, [nextKind, route, routeSource, startingRoute, t, taskRemaining, workdayActive, workdayStarting])

  const open = (destination: Destination) => navigation.navigate(destination)
  const startRoute = async () => {
    if (startingRoute || !workdayActive || !route || todayRoutePrimaryAction(route, routeSource) !== "start") return
    setStartingRoute(true)
    try {
      const response = await submitRouteCommand({
        command: "START",
        routeId: route.id,
        payload: { expectedVersion: route.version! },
      }, (request) => api.executeRouteCommand(request))
      setRoute((current) => current?.id === response.data.id
        ? {
            ...current,
            status: response.data.status ?? "IN_PROGRESS",
            version: response.data.version,
          }
        : current)
      navigation.navigate("Route")
    } catch (error: unknown) {
      const code = (error as { code?: unknown } | null)?.code
      if (code === "MOBILE_ROUTE_COMMAND_QUEUED") {
        Alert.alert(t("todayV2.startRouteQueuedTitle"), t("todayV2.startRouteQueuedBody"))
      } else if (code === "MTM_ROUTE_WORKDAY_REQUIRED") {
        Alert.alert(t("todayV2.dayNotStarted"), t("todayV2.dayStartHint"))
      } else {
        Alert.alert(t("common.error"), t("todayV2.startRouteFailed"))
      }
      await refresh()
    } finally {
      setStartingRoute(false)
    }
  }
  const nextAction = () => {
    if (nextCopy.startRoute) {
      startRoute().catch(() => {})
      return
    }
    if (nextCopy.startWorkday) {
      requestWorkdayAction()
      return
    }
    if (nextCopy.destination) open(nextCopy.destination)
    else if (nextKind === "unknown") manualRefresh().catch(() => {})
  }

  const dateLabel = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const dataIsPartial = routeSource === "cached" || Boolean(kpiError) || stats?.authoritative === false
  const nextDark = nextKind === "route" || nextKind === "tasks"
  const startedAt = workdayActive && currentWorkday?.startedAt
    ? new Date(currentWorkday.startedAt).toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { manualRefresh().catch(() => {}) }}
            colors={[fieldTheme.color.primary]}
            tintColor={fieldTheme.color.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={[styles.headerInner, compactHeader && styles.headerInnerCompact]}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t("todayV2.eyebrow")}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {t("todayV2.greeting", { name: agent?.name ?? "" })}
              </Text>
              <Text style={styles.date}>{dateLabel}</Text>
            </View>
            <View style={[styles.headerActions, compactHeader && styles.headerActionsCompact]}>
              <SyncStatusChip inverse />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("todayV2.refresh")}
                disabled={refreshing}
                onPress={() => { manualRefresh().catch(() => {}) }}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed && styles.pressed,
                  refreshing && styles.disabled,
                ]}
              >
                {refreshing
                  ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
                  : <Icon name="refresh" size={20} color={fieldTheme.color.onColor} />}
                <Text style={styles.refreshText}>{t("todayV2.refresh")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.content, twoPane && styles.contentTablet]}>
          <View style={[styles.primaryColumn, twoPane && styles.primaryColumnTablet]}>
            <View style={[styles.workdayPanel, !twoPane && styles.workdayPanelSingle]}>
              <View style={styles.workdayCopy}>
                <View style={styles.workdayTitleRow}>
                  <View style={[styles.statusDot, workdayActive && styles.statusDotActive]} />
                  <Text style={styles.workdayTitle}>
                    {t(!workdayHydrated
                      ? "todayV2.dayChecking"
                      : workdayStarting
                        ? "todayV2.dayStarting"
                        : workdayEnding
                          ? "todayV2.dayEnding"
                          : workdayPaused
                            ? "todayV2.dayPaused"
                          : workdayActive
                            ? "todayV2.dayActive"
                            : "todayV2.dayNotStarted")}
                  </Text>
                </View>
                <Text style={styles.workdayBody}>
                  {!workdayHydrated
                    ? t("todayV2.dayCheckingBody")
                    : workdayStarting
                      ? t("todayV2.dayStartingBody")
                        : workdayEnding
                          ? t("todayV2.dayEndingBody")
                          : workdayPaused
                            ? t("todayV2.dayPausedBody")
                          : workdayActive && startedAt
                          ? t("todayV2.dayStartedAt", { time: startedAt })
                          : t("todayV2.dayStartHint")}
                </Text>
                {workdayError ? <Text style={styles.inlineError}>{t("todayV2.workdayError")}</Text> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: workdayOpen, disabled: workdayBusy || !workdayHydrated || workdayStarting || workdayEnding }}
                disabled={workdayBusy || !workdayHydrated || workdayStarting || workdayEnding}
                onPress={requestWorkdayAction}
                style={({ pressed }) => [
                  styles.workdayButton,
                  workdayOpen && styles.workdayButtonActive,
                  pressed && styles.pressed,
                  (workdayBusy || !workdayHydrated || workdayStarting || workdayEnding) && styles.disabled,
                ]}
              >
                {workdayBusy || !workdayHydrated ? (
                  <ActivityIndicator size="small" color={workdayOpen ? fieldTheme.color.primaryStrong : fieldTheme.color.onColor} />
                ) : (
                  <Icon
                    name={workdayOpen ? "stop-circle-outline" : "play-circle"}
                    size={22}
                    color={workdayOpen ? fieldTheme.color.primaryStrong : fieldTheme.color.onColor}
                  />
                )}
                <Text style={[styles.workdayButtonText, workdayOpen && styles.workdayButtonTextActive]}>
                  {t(workdayOpen ? "todayV2.endDay" : workdayEnding ? "todayV2.endDayPendingButton" : "todayV2.startDay")}
                </Text>
              </Pressable>
            </View>
            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.nextPanel,
                nextKind === "route" && styles.nextPanelRoute,
                nextKind === "tasks" && styles.nextPanelTasks,
                nextKind === "unknown" && styles.nextPanelUnknown,
              ]}
            >
              <View style={[styles.nextIcon, nextDark && styles.nextIconDark]}>
                {nextKind === "loading"
                  ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} />
                  : <Icon
                      name={nextCopy.icon}
                      size={29}
                      color={nextDark ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong}
                    />}
              </View>
              <Text style={[styles.nextEyebrow, nextDark && styles.nextTextOnDark]}>
                {nextCopy.eyebrow}
              </Text>
              <Text style={[styles.nextTitle, nextDark && styles.nextTextOnDark]}>
                {nextCopy.title}
              </Text>
              <Text style={[styles.nextBody, nextDark && styles.nextBodyOnDark]}>
                {nextCopy.body}
              </Text>
              {nextCopy.supporting ? (
                <Text style={[styles.nextSupporting, nextDark && styles.nextBodyOnDark]}>
                  {nextCopy.supporting}
                </Text>
              ) : null}
              {routeSource === "cached" && nextKind === "route" ? (
                <View style={styles.cachedBadge}>
                  <Icon name="cloud-offline-outline" size={16} color={fieldTheme.color.amber} />
                  <Text style={styles.cachedBadgeText}>{t("todayV2.savedRoute")}</Text>
                </View>
              ) : null}
              {nextKind === "tasks" && !stats && cachedOpenTasks != null ? (
                <View style={styles.cachedBadge}>
                  <Icon name="cloud-offline-outline" size={16} color={fieldTheme.color.amber} />
                  <Text style={styles.cachedBadgeText}>{t("todayV2.savedTasks")}</Text>
                </View>
              ) : null}
              {nextCopy.button ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={nextAction}
                  style={({ pressed }) => [
                    styles.nextButton,
                    !nextDark && styles.nextButtonLight,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.nextButtonText, !nextDark && styles.nextButtonTextLight]}>
                    {nextCopy.button}
                  </Text>
                  <Icon
                    name={nextKind === "unknown" ? "refresh" : nextCopy.startRoute || nextCopy.startWorkday ? "play" : "arrow-forward"}
                    size={20}
                    color={nextDark ? fieldTheme.color.primaryStrong : fieldTheme.color.onColor}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={[styles.secondaryColumn, twoPane && styles.secondaryColumnTablet]}>
            <View style={styles.progressSection}>
              <View style={styles.sectionHeadingRow}>
                <View>
                  <Text style={styles.sectionTitle}>{t("todayV2.progressTitle")}</Text>
                  <Text style={styles.sectionSubtitle}>{t("todayV2.progressBody")}</Text>
                </View>
                {dataIsPartial ? (
                  <View style={styles.partialBadge}>
                    <Text style={styles.partialBadgeText}>{t("todayV2.partial")}</Text>
                  </View>
                ) : null}
              </View>

              {stats ? (
                <View style={styles.metrics}>
                  <ProgressRow
                    icon="navigate-outline"
                    label={t("todayV2.visitsProgress")}
                    value={stats.visits.completed}
                    total={stats.visits.total}
                    color={fieldTheme.color.primary}
                  />
                  <ProgressRow
                    icon="checkbox-outline"
                    label={t("todayV2.tasksProgress")}
                    value={stats.tasks.done}
                    total={stats.tasks.total}
                    color={fieldTheme.color.amber}
                  />
                  {stats.tasks.overdue > 0 ? (
                    <View style={styles.attentionRow}>
                      <Icon name="alert-circle-outline" size={18} color={fieldTheme.color.coral} />
                      <Text style={styles.attentionText}>
                        {t("todayV2.overdueTasks", { count: stats.tasks.overdue })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.metricsUnavailable}>
                  {kpiLoading
                    ? <ActivityIndicator size="small" color={fieldTheme.color.primary} />
                    : <Icon name="cloud-offline-outline" size={22} color={fieldTheme.color.inkMuted} />}
                  <Text style={styles.metricsUnavailableText}>
                    {kpiLoading ? t("todayV2.loadingProgress") : t("todayV2.progressUnavailable")}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.quickSection}>
              <Text style={styles.sectionTitle}>{t("todayV2.quickTitle")}</Text>
              <Text style={styles.sectionSubtitle}>{t("todayV2.quickBody")}</Text>
              <View style={styles.quickGrid}>
                {QUICK_ACTIONS.map((action) => (
                  <Pressable
                    key={action.destination}
                    accessibilityRole="button"
                    accessibilityLabel={t(action.labelKey)}
                    onPress={() => open(action.destination)}
                    style={({ pressed }) => [
                      styles.quickAction,
                      pressed && styles.quickActionPressed,
                    ]}
                  >
                    <View style={[styles.quickIcon, { backgroundColor: action.background }]}>
                      <Icon name={action.icon} size={23} color={action.color} />
                    </View>
                    <Text style={styles.quickLabel}>{t(action.labelKey)}</Text>
                    <Icon name="chevron-forward" size={19} color={fieldTheme.color.inkMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function ProgressRow({
  icon,
  label,
  value,
  total,
  color,
}: {
  icon: string
  label: string
  value: number
  total: number
  color: string
}) {
  const percentage = progress(value, total)
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: Math.max(total, 1),
        now: Math.min(value, Math.max(total, 1)),
        text: `${value} / ${total}`,
      }}
      style={styles.metricRow}
    >
      <View style={styles.metricLabelRow}>
        <View style={styles.metricName}>
          <Icon name={icon} size={19} color={color} />
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
        <Text style={styles.metricValue}>{value} / {total}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { backgroundColor: color, width: `${percentage * 100}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: fieldTheme.color.canvas,
  },
  header: {
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.xl,
  },
  headerInner: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: fieldTheme.space.lg,
  },
  headerCopy: {
    flex: 1,
    gap: fieldTheme.space.xs,
  },
  headerInnerCompact: {
    flexDirection: "column",
  },
  eyebrow: {
    color: fieldTheme.color.primarySoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    color: fieldTheme.color.onColor,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    letterSpacing: -0.45,
  },
  date: {
    color: "#CFE3DA",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  headerActions: {
    alignItems: "flex-end",
    gap: fieldTheme.space.sm,
  },
  headerActionsCompact: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refreshButton: {
    minHeight: LAYOUT_TOUCH_TARGETS.compact,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    borderWidth: 1,
    borderColor: "#5B8B7D",
    backgroundColor: "#174F43",
  },
  refreshText: {
    color: fieldTheme.color.onColor,
    fontSize: 13,
    fontWeight: "800",
  },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    paddingHorizontal: fieldTheme.space.lg,
    paddingTop: fieldTheme.space.lg,
    gap: fieldTheme.space.lg,
  },
  contentTablet: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: fieldTheme.space.xl,
    paddingTop: fieldTheme.space.xl,
    gap: fieldTheme.space.xl,
  },
  primaryColumn: {
    gap: fieldTheme.space.lg,
  },
  primaryColumnTablet: {
    flex: 1.18,
    minWidth: 0,
  },
  workdayPanel: {
    minHeight: 126,
    padding: fieldTheme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
  },
  workdayPanelSingle: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  workdayCopy: {
    flex: 1,
    gap: fieldTheme.space.xs,
  },
  workdayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: fieldTheme.color.amber,
  },
  statusDotActive: {
    backgroundColor: fieldTheme.color.success,
  },
  workdayTitle: {
    color: fieldTheme.color.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  workdayBody: {
    color: fieldTheme.color.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  inlineError: {
    color: fieldTheme.color.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  workdayButton: {
    minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet,
    paddingHorizontal: fieldTheme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primaryStrong,
  },
  workdayButtonActive: {
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  workdayButtonText: {
    color: fieldTheme.color.onColor,
    fontSize: 15,
    fontWeight: "900",
  },
  workdayButtonTextActive: {
    color: fieldTheme.color.primaryStrong,
  },
  secondaryColumn: {
    gap: fieldTheme.space.lg,
  },
  secondaryColumnTablet: {
    flex: 0.82,
    minWidth: 0,
  },
  nextPanel: {
    minHeight: 310,
    padding: fieldTheme.space.xl,
    alignItems: "flex-start",
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  nextPanelRoute: {
    borderColor: fieldTheme.color.primaryStrong,
    backgroundColor: fieldTheme.color.primaryStrong,
  },
  nextPanelTasks: {
    borderColor: fieldTheme.color.blue,
    backgroundColor: fieldTheme.color.blue,
  },
  nextPanelUnknown: {
    borderColor: "#E7CB8A",
    backgroundColor: fieldTheme.color.amberSoft,
  },
  nextIcon: {
    width: 52,
    height: 52,
    marginBottom: fieldTheme.space.xl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  nextIconDark: {
    backgroundColor: "rgba(248,252,250,0.16)",
  },
  nextEyebrow: {
    color: fieldTheme.color.primaryStrong,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  nextTitle: {
    marginTop: fieldTheme.space.sm,
    color: fieldTheme.color.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  nextBody: {
    marginTop: fieldTheme.space.sm,
    maxWidth: 560,
    color: fieldTheme.color.inkMuted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "500",
  },
  nextSupporting: {
    marginTop: fieldTheme.space.xs,
    color: fieldTheme.color.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  nextTextOnDark: {
    color: fieldTheme.color.onColor,
  },
  nextBodyOnDark: {
    color: fieldTheme.color.onColor,
  },
  cachedBadge: {
    minHeight: 30,
    marginTop: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.amberSoft,
  },
  cachedBadgeText: {
    color: fieldTheme.color.amber,
    fontSize: 12,
    fontWeight: "800",
  },
  nextButton: {
    minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet,
    marginTop: "auto",
    paddingHorizontal: fieldTheme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.onColor,
  },
  nextButtonLight: {
    backgroundColor: fieldTheme.color.primaryStrong,
  },
  nextButtonText: {
    color: fieldTheme.color.primaryStrong,
    fontSize: 15,
    fontWeight: "900",
  },
  nextButtonTextLight: {
    color: fieldTheme.color.onColor,
  },
  progressSection: {
    padding: fieldTheme.space.lg,
    gap: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
  },
  sectionTitle: {
    color: fieldTheme.color.ink,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  sectionSubtitle: {
    marginTop: fieldTheme.space.xs,
    color: fieldTheme.color.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  partialBadge: {
    minHeight: 28,
    paddingHorizontal: fieldTheme.space.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.amberSoft,
  },
  partialBadgeText: {
    color: fieldTheme.color.amber,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  metrics: {
    gap: fieldTheme.space.lg,
  },
  metricRow: {
    gap: fieldTheme.space.sm,
  },
  metricLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: fieldTheme.space.md,
  },
  metricName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  metricLabel: {
    flex: 1,
    color: fieldTheme.color.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  metricValue: {
    color: fieldTheme.color.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  progressFill: {
    height: "100%",
    borderRadius: fieldTheme.radius.pill,
  },
  attentionRow: {
    minHeight: LAYOUT_TOUCH_TARGETS.compact,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.coralSoft,
  },
  attentionText: {
    flex: 1,
    color: fieldTheme.color.coral,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  metricsUnavailable: {
    minHeight: 76,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surfaceStrong,
  },
  metricsUnavailableText: {
    flex: 1,
    color: fieldTheme.color.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  quickSection: {
    gap: fieldTheme.space.xs,
  },
  quickGrid: {
    marginTop: fieldTheme.space.md,
    flexDirection: "column",
    gap: fieldTheme.space.md,
  },
  quickAction: {
    minHeight: 68,
    width: "100%",
    padding: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  quickActionPressed: {
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.primarySoft,
    transform: [{ scale: 0.985 }],
  },
  quickIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.sm,
  },
  quickLabel: {
    flex: 1,
    color: fieldTheme.color.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.6,
  },
})
