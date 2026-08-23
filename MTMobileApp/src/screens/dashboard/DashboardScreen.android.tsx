import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { i18n as mobileI18n } from "../../i18n/index.android"
import { useKpiStore, type KpiStats } from "../../store/kpi"
import { useAuthStore } from "../../store/auth"
import { useDashboardLayoutStore } from "../../store/dashboard-layout"
import { useWorkdayStore, workdayKey } from "../../store/workday"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { isManagerRole } from "../../auth/roles"
import SyncStatusChip from "../../components/SyncStatusChip"
import ConfirmSheet from "../../components/ConfirmSheet"
import { fieldTheme } from "../../theme/fieldTheme"
import {
  LAYOUT_TOUCH_TARGETS,
  isExpandedTabletWidth,
  isTabletWidth,
} from "../../theme/layoutBreakpoints"
import {
  DASHBOARD_WIDGETS,
  DashboardWidgetDefinition,
  DashboardWidgetId,
  DashboardWorkspace,
  dashboardColumns,
  defaultWidgetIds,
  deviceClassFor,
  layoutStorageKey,
  managerWidgetDestination,
  moveWidget,
  sanitizeWidgetIds,
  widgetsForWorkspace,
} from "./dashboard-layout"
import { api } from "../../services/api"
import { localDateKey } from "../today/today-state"
import {
  markManagerDashboardStatsStale,
  toManagerDashboardStats,
  type ManagerDashboardStats,
} from "../../services/manager-dashboard"

/**
 * Map server KPI onto a widget. Every branch distinguishes "nothing planned"
 * from "nothing done": an empty denominator must not render as a 0% failure,
 * which is what a bare `done / total` bar would show an agent with no route.
 */
function actualMetric(id: DashboardWidgetId, stats: KpiStats | null) {
  if (!stats) return null
  if (id === "todayRoute") {
    const total = stats.visits.total
    const done = stats.visits.completed
    const supporting = total === 0
      ? (stats.unplannedCompleted > 0
          ? mobileI18n.t("dashboardV2.routeUnplanned", { count: stats.unplannedCompleted })
          : mobileI18n.t("dashboardV2.routeEmpty"))
      : total > done
        ? mobileI18n.t("dashboardV2.routeRemaining", { count: total - done })
        : mobileI18n.t("dashboardV2.routeComplete")
    return { value: `${done} / ${total}`, supporting, progress: total > 0 ? done / total : 0 }
  }
  if (id === "tasks") {
    const total = stats.tasks.total
    const done = stats.tasks.done
    const supporting = total === 0
      ? mobileI18n.t("dashboardV2.tasksEmpty")
      : total > done
        ? mobileI18n.t("dashboardV2.tasksInProgress", { count: total - done })
        : mobileI18n.t("dashboardV2.allDone")
    return { value: `${done} / ${total}`, supporting, progress: total > 0 ? done / total : 0 }
  }
  if (id === "coverage") {
    const coverage = stats.coverage
    if (!coverage) return null
    return {
      value: `${coverage.percentage}%`,
      supporting: coverage.denominator === 0
        ? mobileI18n.t("dashboardV2.coverageEmpty")
        : mobileI18n.t("dashboardV2.coverageSupporting", {
            covered: coverage.numerator,
            total: coverage.denominator,
          }),
      progress: coverage.denominator > 0 ? coverage.numerator / coverage.denominator : 0,
    }
  }
  if (id === "gps") {
    const confirmation = stats.gps.visitConfirmation
    if (!confirmation) return null
    return {
      value: `${confirmation.percentage}%`,
      supporting: confirmation.denominator === 0
        ? mobileI18n.t("dashboardV2.gpsEmpty")
        : mobileI18n.t("dashboardV2.gpsSupporting", {
            confirmed: confirmation.numerator,
            total: confirmation.denominator,
          }),
      progress: confirmation.denominator > 0 ? confirmation.numerator / confirmation.denominator : 0,
    }
  }
  return null
}

const MANAGER_COPY = {
  ru: {
    online: (online: number, total: number) => `${online} из ${total} сотрудников сейчас в сети`,
    noTeam: "В вашей команде пока нет сотрудников",
    currentGps: (count: number) => `${count} сотрудников передают свежую геопозицию`,
    gpsAttention: (count: number) => `${count} позициям нужна проверка`,
    noRoutes: "На сегодня маршруты не запланированы",
    routeProgress: (visited: number, total: number, routes: number) => `${visited} из ${total} точек · маршрутов: ${routes}`,
    approvals: (count: number) => count > 0 ? `Нужно проверить: ${count}` : "Новых запросов нет",
    exceptions: (count: number) => count > 0 ? `Проверьте GPS у ${count} сотрудников` : "Критичных отклонений не найдено",
    updated: (time: string) => `Обновлено в ${time}`,
    stale: (time: string) => `Данные могли устареть · последнее обновление в ${time}`,
    widgets: {
      teamPulse: ["Команда в сети", "Кто сейчас активен по последней активности"],
      teamMap: ["GPS команды", "Свежие позиции и геолокации, требующие проверки"],
      planFact: ["Маршруты на сегодня", "Выполненные и запланированные точки"],
      approvals: ["Запросы на проверку", "Сотрудники, маршруты, клиенты и контакты"],
      exceptions: ["GPS требует внимания", "Устаревшие позиции и сотрудники без координат"],
    },
  },
  az: {
    online: (online: number, total: number) => `${total} əməkdaşdan ${online}-i indi onlayndır`,
    noTeam: "Komandanızda hələ əməkdaş yoxdur",
    currentGps: (count: number) => `${count} əməkdaş aktual mövqe göndərir`,
    gpsAttention: (count: number) => `${count} mövqeni yoxlamaq lazımdır`,
    noRoutes: "Bu gün üçün marşrut planlaşdırılmayıb",
    routeProgress: (visited: number, total: number, routes: number) => `${total} nöqtədən ${visited}-i · marşrut: ${routes}`,
    approvals: (count: number) => count > 0 ? `Yoxlanmalı: ${count}` : "Yeni sorğu yoxdur",
    exceptions: (count: number) => count > 0 ? `${count} əməkdaşın GPS-ni yoxlayın` : "Kritik yayınma yoxdur",
    updated: (time: string) => `${time} vaxtında yenilənib`,
    stale: (time: string) => `Məlumat köhnələ bilər · son yenilənmə ${time}`,
    widgets: {
      teamPulse: ["Komanda onlayn", "Son aktivliyə görə hazırda kim onlayndır"],
      teamMap: ["Komanda GPS-i", "Aktual mövqelər və yoxlanmalı geolokasiyalar"],
      planFact: ["Bugünkü marşrutlar", "Tamamlanmış və planlaşdırılmış nöqtələr"],
      approvals: ["Yoxlanmalı sorğular", "Əməkdaş, marşrut, müştəri və kontakt dəyişiklikləri"],
      exceptions: ["GPS diqqət tələb edir", "Köhnəlmiş mövqelər və koordinatsız əməkdaşlar"],
    },
  },
  en: {
    online: (online: number, total: number) => `${online} of ${total} team members are online`,
    noTeam: "There are no team members in your scope yet",
    currentGps: (count: number) => `${count} team members have a current position`,
    gpsAttention: (count: number) => `${count} positions need attention`,
    noRoutes: "No routes are planned for today",
    routeProgress: (visited: number, total: number, routes: number) => `${visited} of ${total} stops · ${routes} routes`,
    approvals: (count: number) => count > 0 ? `${count} requests need review` : "No new requests",
    exceptions: (count: number) => count > 0 ? `Check GPS for ${count} team members` : "No critical exceptions found",
    updated: (time: string) => `Updated at ${time}`,
    stale: (time: string) => `Data may be stale · last updated at ${time}`,
    widgets: {
      teamPulse: ["Team online", "Who is active now, based on last activity"],
      teamMap: ["Team GPS", "Current positions and locations that need review"],
      planFact: ["Today's routes", "Completed and planned stops"],
      approvals: ["Requests to review", "Staff, route, customer and contact changes"],
      exceptions: ["GPS needs attention", "Stale positions and team members without coordinates"],
    },
  },
} as const

type ManagerWidgetCopyId = keyof typeof MANAGER_COPY.en.widgets

function managerLanguage(language = mobileI18n.language): keyof typeof MANAGER_COPY {
  return language?.startsWith("az") ? "az" : language?.startsWith("ru") ? "ru" : "en"
}

function managerWidgetCopy(id: DashboardWidgetId, language = mobileI18n.language) {
  const copy = MANAGER_COPY[managerLanguage(language)].widgets
  return id in copy ? copy[id as ManagerWidgetCopyId] : null
}

function managerMetric(id: DashboardWidgetId, stats: ManagerDashboardStats | null) {
  if (!stats) return null
  const copy = MANAGER_COPY[managerLanguage()]
  if (id === "teamPulse") {
    return {
      value: `${stats.online} / ${stats.teamTotal}`,
      supporting: stats.teamTotal > 0 ? copy.online(stats.online, stats.teamTotal) : copy.noTeam,
      progress: stats.teamTotal > 0 ? stats.online / stats.teamTotal : 0,
    }
  }
  if (id === "teamMap") {
    return {
      value: String(stats.currentLocations),
      supporting: stats.teamTotal === 0
        ? copy.noTeam
        : stats.gpsAttention > 0
          ? copy.gpsAttention(stats.gpsAttention)
          : copy.currentGps(stats.currentLocations),
      progress: stats.teamTotal > 0 ? stats.currentLocations / stats.teamTotal : 0,
    }
  }
  if (id === "planFact") {
    return {
      value: stats.plannedStops > 0 ? `${Math.round(stats.visitedStops / stats.plannedStops * 100)}%` : "—",
      supporting: stats.routes > 0
        ? copy.routeProgress(stats.visitedStops, stats.plannedStops, stats.routes)
        : copy.noRoutes,
      progress: stats.plannedStops > 0 ? stats.visitedStops / stats.plannedStops : 0,
    }
  }
  if (id === "approvals") {
    return { value: String(stats.approvals), supporting: copy.approvals(stats.approvals), progress: undefined }
  }
  if (id === "exceptions") {
    return { value: String(stats.gpsAttention), supporting: copy.exceptions(stats.gpsAttention), progress: undefined }
  }
  return null
}

export default function DashboardScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<any>()
  const { width, height } = useWindowDimensions()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [screenWidth, setScreenWidth] = useState(width)
  const [customizing, setCustomizing] = useState(false)
  const [focusedWidget, setFocusedWidget] = useState<DashboardWidgetId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [workdayBusy, setWorkdayBusy] = useState(false)
  const [endDayConfirmVisible, setEndDayConfirmVisible] = useState(false)
  const [managerStats, setManagerStats] = useState<ManagerDashboardStats | null>(null)
  const [managerLoading, setManagerLoading] = useState(false)
  const [managerError, setManagerError] = useState<string | null>(null)
  const managerRequestId = useRef(0)

  const agent = useAuthStore((state) => state.agent)
  const privileged = isManagerRole(agent?.role)
  const workspace: DashboardWorkspace = privileged ? "manager" : "agent"
  const expandedTablet = isExpandedTabletWidth(width)
  const { stats, loading, error, fetchKpi } = useKpiStore()
  const layouts = useDashboardLayoutStore((state) => state.layouts)
  const setLayout = useDashboardLayoutStore((state) => state.setLayout)
  const resetLayout = useDashboardLayoutStore((state) => state.resetLayout)

  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const startWorkday = useWorkdayStore((state) => state.start)
  const endWorkday = useWorkdayStore((state) => state.end)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const workdayActive = activeWorkday?.key === currentWorkdayKey
  const deviceClass = deviceClassFor(width, height)
  const context = useMemo(
    () => ({
      tenantId: agent?.organizationId ?? "unknown-tenant",
      userId: agent?.id ?? "unknown-user",
      workspace,
      deviceClass,
    }),
    [agent?.id, agent?.organizationId, workspace, deviceClass]
  )
  const layoutKey = layoutStorageKey(context.tenantId, context.userId, workspace, deviceClass)
  const selectedIds = sanitizeWidgetIds(workspace, layouts[layoutKey] ?? defaultWidgetIds(workspace))
  const availableWidgets = widgetsForWorkspace(workspace)
  const maxWidgets = Math.min(6, availableWidgets.length)
  const selectedWidgets = selectedIds
    .map((id) => DASHBOARD_WIDGETS.find((widget) => widget.id === id))
    .filter((widget): widget is DashboardWidgetDefinition => Boolean(widget))

  const fetchManagerSummary = useCallback(async (mode: "initial" | "manual" | "silent" = "manual") => {
    const requestId = ++managerRequestId.current
    if (mode !== "silent") setManagerLoading(true)
    try {
      const [team, locations, planning, approvals] = await Promise.all([
        api.getManagerTeam(),
        api.getManagerLocations(),
        api.getManagerPlanning(localDateKey()),
        api.getManagerApprovals(),
      ])
      if (requestId !== managerRequestId.current) return
      setManagerStats(toManagerDashboardStats(team?.data, locations?.data, planning?.data, approvals?.data))
      setManagerError(null)
    } catch (error: any) {
      if (requestId !== managerRequestId.current || error?.message === "SESSION_EXPIRED") return
      setManagerStats((current) => markManagerDashboardStatsStale(current))
      setManagerError(t("common.error"))
    } finally {
      if (requestId === managerRequestId.current && mode !== "silent") setManagerLoading(false)
    }
  }, [t])

  useEffect(() => {
    setFocusedWidget(null)
    setCustomizing(false)
    setMessage(null)
    if (workspace === "agent") fetchKpi()
  }, [fetchKpi, workspace])

  useAutoRefresh(useCallback(() => {
    if (workspace === "manager") {
      void fetchManagerSummary(managerStats == null ? "initial" : "silent")
    }
  }, [fetchManagerSummary, managerStats, workspace]))

  const save = useCallback(
    (ids: DashboardWidgetId[]) => {
      setLayout(context, ids).catch(() => setMessage(t("common.error")))
    },
    [context, setLayout, t]
  )

  const toggleWidget = (id: DashboardWidgetId) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length === 1) {
        setMessage(t("dashboardV2.minimum"))
        return
      }
      setMessage(null)
      save(selectedIds.filter((item) => item !== id))
      return
    }
    if (selectedIds.length >= maxWidgets) {
      setMessage(t("dashboardV2.limit"))
      return
    }
    setMessage(null)
    save([...selectedIds, id])
  }

  const toggleWorkday = async () => {
    if (workdayBusy || !workdayHydrated) return
    setWorkdayBusy(true)
    setMessage(null)
    try {
      if (workdayActive) await endWorkday(currentWorkdayKey)
      else await startWorkday(currentWorkdayKey)
    } catch {
      setMessage(t("common.error"))
    } finally {
      setWorkdayBusy(false)
    }
  }

  const requestWorkdayToggle = () => {
    if (workdayBusy || !workdayHydrated) return
    if (workdayActive) {
      setEndDayConfirmVisible(true)
      return
    }
    toggleWorkday().catch(() => {})
  }

  const confirmEndDay = () => {
    setEndDayConfirmVisible(false)
    toggleWorkday().catch(() => {})
  }

  const horizontalPadding = isTabletWidth(screenWidth) ? fieldTheme.space.xl : fieldTheme.space.lg
  const gap = fieldTheme.space.md
  const gridWidth = Math.max(280, screenWidth - horizontalPadding * 2)
  const columns = dashboardColumns(
    gridWidth,
    selectedWidgets.length,
    deviceClass !== "phone",
    gap
  )
  const cardWidth = (gridWidth - gap * (columns - 1)) / columns
  const rows = Math.max(1, Math.ceil(selectedWidgets.length / columns))
  const availableHeight = Math.max(380, height - 300)
  const cardHeight =
    selectedWidgets.length === 1
      ? Math.max(420, height - headerTop - (customizing ? 360 : 220))
      : deviceClass === "phone"
        ? 196
        : Math.max(208, Math.min(440, (availableHeight - gap * (rows - 1)) / rows))
  const dataAvailable = workspace === "agent" ? stats !== null : managerStats !== null
  const dataStale = workspace === "manager" && managerStats?.stale === true
  const dataFresh = dataAvailable && !dataStale
  const managerCopy = MANAGER_COPY[managerLanguage(i18n.language)]
  const managerUpdatedTime = managerStats
    ? new Date(managerStats.updatedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })
    : null
  const dataStateText = workspace === "manager"
    ? managerStats && managerUpdatedTime
      ? managerStats.stale ? managerCopy.stale(managerUpdatedTime) : managerCopy.updated(managerUpdatedTime)
      : t("dashboardV2.unavailable")
    : t(dataAvailable ? "dashboardV2.actual" : "dashboardV2.unavailable")
  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const openManagerWidget = (id: DashboardWidgetId) => {
    navigation.navigate(managerWidgetDestination(id))
  }

  if (focusedWidget) {
    const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === focusedWidget)
    if (definition) {
      const copy = workspace === "manager" ? managerWidgetCopy(definition.id, i18n.language) : null
      return (
        <View style={styles.root} onLayout={(event) => setScreenWidth(event.nativeEvent.layout.width)}>
          <View style={[styles.focusHeader, { paddingTop: headerTop }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFocusedWidget(null)}
              style={[styles.backButton, expandedTablet && styles.expandedTouchHeight]}
            >
              <Icon name="arrow-back" size={21} color={fieldTheme.color.onColor} />
              <Text style={styles.backText}>{t("dashboardV2.back")}</Text>
            </Pressable>
          </View>
          <View style={styles.focusBody}>
            <DashboardWidget
              definition={definition}
              label={copy?.[0]}
              caption={copy?.[1]}
              metric={workspace === "manager" ? managerMetric(definition.id, managerStats) : actualMetric(definition.id, stats)}
              preview={false}
              width={Math.max(280, screenWidth - horizontalPadding * 2)}
              height={Math.max(360, height - headerTop - 120)}
              focused
              onPress={() => {}}
            />
          </View>
        </View>
      )
    }
  }

  return (
    <View
      style={styles.root}
      onLayout={(event) => setScreenWidth(event.nativeEvent.layout.width)}
    >
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerTop}>
          <View style={styles.identity}>
            <Text style={styles.eyebrow}>
              {t(workspace === "manager" ? "dashboardV2.managerWorkspace" : "dashboardV2.agentWorkspace")}
            </Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {t("dashboardV2.greeting", { name: agent?.name ?? "" })}
            </Text>
            <Text style={styles.date}>{today}</Text>
          </View>

          <View style={styles.headerActions}>
            {workspace === "agent" && <SyncStatusChip inverse />}
            {!privileged && workspace === "agent" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(workdayActive ? "dashboardV2.endDay" : "dashboardV2.startDay")}
                accessibilityState={{ disabled: workdayBusy || !workdayHydrated, selected: workdayActive }}
                disabled={workdayBusy || !workdayHydrated}
                onPress={requestWorkdayToggle}
                style={({ pressed }) => [
                  styles.workdayButton,
                  expandedTablet && styles.expandedTouchHeight,
                  workdayActive && styles.workdayButtonActive,
                  !workdayHydrated && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name={workdayActive ? "stop-circle" : "play-circle"} size={19} color={fieldTheme.color.onColor} />
                <Text style={styles.workdayText}>
                  {t(workdayActive ? "dashboardV2.endDay" : "dashboardV2.startDay")}
                </Text>
              </Pressable>
            )}

            {workspace === "manager" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("managerShell.refresh", { defaultValue: "Refresh" })}
                disabled={managerLoading}
                onPress={() => { void fetchManagerSummary("manual") }}
                style={({ pressed }) => [
                  styles.customizeButton,
                  expandedTablet && styles.expandedTouchHeight,
                  managerLoading && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {managerLoading
                  ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} />
                  : <Icon name="refresh" size={19} color={fieldTheme.color.primaryStrong} />}
                <Text style={styles.customizeText}>{t("managerShell.refresh", { defaultValue: "Refresh" })}</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: customizing }}
              onPress={() => setCustomizing((current) => !current)}
              style={({ pressed }) => [
                styles.customizeButton,
                expandedTablet && styles.expandedTouchHeight,
                pressed && styles.pressed,
              ]}
            >
              <Icon name={customizing ? "checkmark" : "options"} size={19} color={fieldTheme.color.primaryStrong} />
              <Text style={styles.customizeText}>
                {t(customizing ? "dashboardV2.finishCustomize" : "dashboardV2.customize")}
              </Text>
            </Pressable>
          </View>
        </View>

      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={(
          <RefreshControl
            refreshing={workspace === "agent" ? loading && stats !== null : managerLoading}
            onRefresh={() => workspace === "agent" ? fetchKpi() : void fetchManagerSummary("manual")}
            tintColor={fieldTheme.color.primary}
            colors={[fieldTheme.color.primary]}
          />
        )}
      >
        {customizing && (
          <View style={[styles.customizer, { marginHorizontal: horizontalPadding }]}>
            <View style={styles.customizerHeading}>
              <View style={styles.customizerCopy}>
                <Text style={styles.customizerTitle}>{t("dashboardV2.customizeTitle")}</Text>
                <Text style={styles.customizerBody}>{t("dashboardV2.customizeBody")}</Text>
              </View>
              <Text style={styles.counter}>{selectedIds.length} / {maxWidgets}</Text>
            </View>

            <View style={styles.widgetPicker}>
              {availableWidgets.map((widget) => {
                const selected = selectedIds.includes(widget.id)
                const copy = workspace === "manager" ? managerWidgetCopy(widget.id, i18n.language) : null
                const label = copy?.[0] ?? t(widget.labelKey)
                return (
                  <Pressable
                    key={widget.id}
                    testID={`dashboard-widget-toggle-${widget.id}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={label}
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleWidget(widget.id)}
                    style={[
                      styles.pickerItem,
                      expandedTablet && styles.expandedTouchHeight,
                      selected && { backgroundColor: widget.tint, borderColor: widget.color },
                    ]}
                  >
                    <Icon
                      name={selected ? "checkmark-circle" : widget.icon}
                      size={19}
                      color={selected ? widget.color : fieldTheme.color.inkMuted}
                    />
                    <Text style={[styles.pickerText, selected && { color: widget.color }]}>
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.orderTitle}>{t("dashboardV2.selectedOrder")}</Text>
            <View style={styles.orderList}>
              {selectedWidgets.map((widget, index) => (
                <View key={widget.id} style={styles.orderItem}>
                  <Text style={styles.orderNumber}>{index + 1}</Text>
                  <Text style={styles.orderLabel} numberOfLines={1}>
                    {workspace === "manager" ? managerWidgetCopy(widget.id, i18n.language)?.[0] : t(widget.labelKey)}
                  </Text>
                  <Pressable
                    testID={`dashboard-widget-move-earlier-${widget.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${workspace === "manager" ? managerWidgetCopy(widget.id, i18n.language)?.[0] : t(widget.labelKey)}: ${t("dashboardV2.moveEarlier")}`}
                    disabled={index === 0}
                    onPress={() => save(moveWidget(selectedIds, widget.id, -1))}
                    style={[
                      styles.orderButton,
                      expandedTablet && styles.expandedTouchSquare,
                      index === 0 && styles.disabled,
                    ]}
                  >
                    <Icon name="arrow-back" size={17} color={fieldTheme.color.ink} />
                  </Pressable>
                  <Pressable
                    testID={`dashboard-widget-move-later-${widget.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${workspace === "manager" ? managerWidgetCopy(widget.id, i18n.language)?.[0] : t(widget.labelKey)}: ${t("dashboardV2.moveLater")}`}
                    disabled={index === selectedWidgets.length - 1}
                    onPress={() => save(moveWidget(selectedIds, widget.id, 1))}
                    style={[
                      styles.orderButton,
                      expandedTablet && styles.expandedTouchSquare,
                      index === selectedWidgets.length - 1 && styles.disabled,
                    ]}
                  >
                    <Icon name="arrow-forward" size={17} color={fieldTheme.color.ink} />
                  </Pressable>
                </View>
              ))}
            </View>

            {message && <Text style={styles.message}>{message}</Text>}
            <Pressable
              accessibilityRole="button"
              onPress={() => resetLayout(context).catch(() => setMessage(t("common.error")))}
              style={[styles.resetButton, expandedTablet && styles.expandedTouchHeight]}
            >
              <Icon name="refresh" size={17} color={fieldTheme.color.primary} />
              <Text style={styles.resetText}>{t("dashboardV2.reset")}</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.sectionHeading, { paddingHorizontal: horizontalPadding }]}>
          <Text style={styles.sectionTitle}>
            {t(workspace === "manager" ? "dashboardV2.managerWorkspace" : "dashboardV2.agentWorkspace")}
          </Text>
          <View style={styles.dataState}>
            <View style={[styles.dataDot, dataFresh ? styles.liveDot : dataStale ? styles.staleDot : styles.unavailableDot]} />
            <Text style={styles.dataStateText}>
              {dataStateText}
            </Text>
          </View>
        </View>

        {(workspace === "agent" ? loading && !stats : managerLoading && !managerStats) ? (
          <View style={styles.loader}><ActivityIndicator color={fieldTheme.color.primary} /></View>
        ) : (
          <View
            style={[
              styles.grid,
              {
                paddingHorizontal: horizontalPadding,
                gap,
              },
            ]}
          >
            {selectedWidgets.map((widget) => {
              const copy = workspace === "manager" ? managerWidgetCopy(widget.id, i18n.language) : null
              return (
                <DashboardWidget
                  key={widget.id}
                  definition={widget}
                  label={copy?.[0]}
                  caption={copy?.[1]}
                  metric={workspace === "manager" ? managerMetric(widget.id, managerStats) : actualMetric(widget.id, stats)}
                  preview={false}
                  width={cardWidth}
                  height={cardHeight}
                  onPress={() => workspace === "manager" ? openManagerWidget(widget.id) : setFocusedWidget(widget.id)}
                />
              )
            })}
          </View>
        )}

        {error && workspace === "agent" && (
          <Text style={[styles.message, { marginHorizontal: horizontalPadding }]}>{error}</Text>
        )}
        {managerError && workspace === "manager" && (
          <Text style={[styles.message, { marginHorizontal: horizontalPadding }]}>{managerError}</Text>
        )}
      </ScrollView>
      <ConfirmSheet
        visible={endDayConfirmVisible}
        icon="■"
        iconColor={fieldTheme.color.amber}
        title={t("todayV2.endDayConfirmTitle")}
        message={t("todayV2.endDayConfirmBody")}
        cancelText={t("todayV2.endDayConfirmCancel")}
        confirmText={t("todayV2.endDayConfirmAction")}
        confirmColor={fieldTheme.color.amber}
        onCancel={() => setEndDayConfirmVisible(false)}
        onConfirm={confirmEndDay}
      />
    </View>
  )
}

function DashboardWidget({
  definition,
  label,
  caption,
  metric,
  preview,
  width,
  height,
  focused = false,
  onPress,
}: {
  definition: DashboardWidgetDefinition
  label?: string
  caption?: string
  metric: { value: string; supporting: string; progress?: number } | null
  preview: boolean
  width: number
  height: number
  focused?: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t(definition.labelKey)
  const resolvedCaption = caption ?? t(definition.captionKey)
  const value = metric?.value ?? "—"
  const supporting = metric?.supporting ?? t("dashboardV2.unavailable")
  const accessibilityText = [
    value,
    supporting,
    preview ? t("dashboardV2.preview") : null,
  ].filter(Boolean).join(". ")

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${resolvedLabel}. ${resolvedCaption}`}
      accessibilityValue={{ text: accessibilityText }}
      accessibilityHint={focused ? undefined : t("dashboardV2.expandHint")}
      accessibilityState={{ disabled: focused }}
      onPress={onPress}
      disabled={focused}
      style={({ pressed }) => [
        styles.widget,
        { width, minHeight: height },
        focused && styles.widgetFocused,
        pressed && !focused && styles.widgetPressed,
      ]}
    >
      <View style={styles.widgetTop}>
        <View style={[styles.widgetIcon, { backgroundColor: definition.tint }]}>
          <Icon name={definition.icon} size={22} color={definition.color} />
        </View>
        {!focused && (
          <View style={[styles.expandIcon, { backgroundColor: definition.tint }]}>
            <Icon name="expand-outline" size={17} color={definition.color} />
          </View>
        )}
      </View>

      <View style={styles.widgetCopy}>
        <Text style={styles.widgetTitle}>{resolvedLabel}</Text>
        <Text style={styles.widgetCaption}>{resolvedCaption}</Text>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, { color: definition.color }]}>{value}</Text>
        {preview && <Text style={[styles.previewLabel, { color: definition.color }]}>{t("dashboardV2.preview")}</Text>}
      </View>
      <Text style={styles.supporting}>{supporting}</Text>

      {typeof metric?.progress === "number" && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: definition.color,
                width: `${Math.max(0, Math.min(metric.progress, 1)) * 100}%`,
              },
            ]}
          />
        </View>
      )}

      {!focused && (
        <View style={styles.widgetFooter}>
          <Text style={[styles.openText, { color: definition.color }]}>{t("dashboardV2.open")}</Text>
          <Icon name="arrow-forward" size={17} color={definition.color} />
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.xl,
  },
  headerTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: fieldTheme.space.md },
  identity: { flex: 1, minWidth: 180, gap: 3 },
  eyebrow: {
    color: "#A8D9C8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  greeting: { color: fieldTheme.color.onColor, fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
  date: { color: "#C8E0D7", fontSize: 13, textTransform: "capitalize" },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: fieldTheme.space.sm,
  },
  workdayButton: {
    minHeight: 44,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.coral,
  },
  workdayButtonActive: { backgroundColor: fieldTheme.color.amber },
  workdayText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "800" },
  customizeButton: {
    minHeight: 44,
    paddingHorizontal: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.onColor,
  },
  customizeText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  expandedTouchHeight: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet },
  expandedTouchSquare: {
    width: LAYOUT_TOUCH_TARGETS.expandedTablet,
    height: LAYOUT_TOUCH_TARGETS.expandedTablet,
  },
  customizer: {
    marginTop: fieldTheme.space.lg,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
    gap: fieldTheme.space.lg,
  },
  customizerHeading: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  customizerCopy: { flex: 1, gap: fieldTheme.space.xs },
  customizerTitle: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "800" },
  customizerBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, maxWidth: 660 },
  counter: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "800" },
  widgetPicker: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  pickerItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.pill,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.canvas,
  },
  pickerText: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  orderTitle: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800" },
  orderList: { gap: fieldTheme.space.sm },
  orderItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.canvas,
  },
  orderNumber: {
    width: 28,
    height: 28,
    borderRadius: fieldTheme.radius.pill,
    textAlign: "center",
    textAlignVertical: "center",
    color: fieldTheme.color.onColor,
    backgroundColor: fieldTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  orderLabel: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, fontWeight: "700" },
  orderButton: {
    width: 44,
    height: 44,
    borderRadius: fieldTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surface,
  },
  disabled: { opacity: 0.25 },
  message: {
    color: fieldTheme.color.danger,
    backgroundColor: fieldTheme.color.dangerSoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    fontSize: 12,
    fontWeight: "700",
  },
  resetButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, alignSelf: "flex-start" },
  resetText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "800" },
  sectionHeading: {
    marginTop: fieldTheme.space.xl,
    marginBottom: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: fieldTheme.space.md,
  },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "800" },
  dataState: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  dataDot: { width: 7, height: 7, borderRadius: 4 },
  liveDot: { backgroundColor: fieldTheme.color.success },
  staleDot: { backgroundColor: fieldTheme.color.amber },
  unavailableDot: { backgroundColor: fieldTheme.color.inkMuted },
  dataStateText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  widget: {
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  widgetFocused: { flex: 1 },
  widgetPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  widgetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  widgetIcon: { width: 44, height: 44, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center" },
  expandIcon: { width: 34, height: 34, borderRadius: fieldTheme.radius.pill, alignItems: "center", justifyContent: "center" },
  widgetCopy: { marginTop: fieldTheme.space.lg, gap: 3 },
  widgetTitle: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "800" },
  widgetCaption: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  metricRow: { marginTop: "auto", paddingTop: fieldTheme.space.md, flexDirection: "row", alignItems: "flex-end", gap: fieldTheme.space.sm },
  metricValue: { fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  previewLabel: { marginBottom: 5, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  supporting: { color: fieldTheme.color.inkMuted, fontSize: 11, marginTop: 2 },
  progressTrack: { height: 6, marginTop: fieldTheme.space.md, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: fieldTheme.radius.pill },
  widgetFooter: { marginTop: fieldTheme.space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  openText: { fontSize: 12, fontWeight: "800" },
  loader: { minHeight: 240, alignItems: "center", justifyContent: "center" },
  focusHeader: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md },
  backButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, alignSelf: "flex-start" },
  backText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  focusBody: { flex: 1, padding: fieldTheme.space.lg },
})
