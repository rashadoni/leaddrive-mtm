import React, { useCallback, useEffect, useMemo, useState } from "react"
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
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { managerApi } from "../../services/manager-api"
import {
  calendarDateKeys,
  managerCalendarRouteTone,
  managerCalendarWindow,
  shiftManagerCalendarAnchor,
  toManagerCalendarData,
  type ManagerCalendarAgent,
  type ManagerCalendarData,
  type ManagerCalendarMode,
  type ManagerCalendarRoute,
} from "../../services/manager-calendar"
import { planningTodayKey } from "../../services/manager-planning"
import { useBootstrapStore } from "../../store/bootstrap"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { upper } from "../../lib/upper"

type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    eyebrow: "План команды",
    title: "Календарь маршрутов",
    subtitle: "Сразу видно, кто, в какой день и на сколько встреч запланирован.",
    create: "Создать маршрут",
    month: "Месяц",
    week: "Неделя",
    today: "Сегодня",
    previous: "Предыдущий период",
    next: "Следующий период",
    guide: "Выберите вид → нажмите день → проверьте встречи или создайте маршрут.",
    routes: "Маршруты",
    agents: "Сотрудники",
    stops: "Встречи",
    loading: "Загружаем календарь команды…",
    loadErrorTitle: "Календарь не загрузился",
    loadErrorBody: "Проверьте интернет. Последние загруженные данные останутся на экране.",
    retry: "Повторить",
    emptyTitle: "В этом периоде маршрутов нет",
    emptyBody: "Это не ошибка: на выбранные даты ещё ничего не опубликовано и не сохранено.",
    dayTitle: "План на {{date}}",
    noDayRoutes: "На этот день встреч нет",
    noDayRoutesBody: "Нажмите «Создать маршрут», выберите сотрудника и добавьте клиентов.",
    draft: "Черновик",
    planned: "Опубликован",
    active: "В пути",
    done: "Завершён",
    cancelled: "Отменён",
    progress: "{{visited}} из {{total}} выполнено",
    more: "+ ещё {{count}}",
    noAgents: "В вашей зоне управления нет активных полевых агентов.",
    currentMonth: "Текущий месяц",
    currentWeek: "Текущая неделя",
  },
  az: {
    eyebrow: "Komanda planı",
    title: "Marşrut təqvimi",
    subtitle: "Kimin hansı gün neçə görüşə planlandığını dərhal görün.",
    create: "Marşrut yarat",
    month: "Ay",
    week: "Həftə",
    today: "Bu gün",
    previous: "Əvvəlki dövr",
    next: "Növbəti dövr",
    guide: "Görünüşü seçin → günə toxunun → görüşlərə baxın və ya marşrut yaradın.",
    routes: "Marşrut",
    agents: "Əməkdaş",
    stops: "Görüş",
    loading: "Komanda təqvimi yüklənir…",
    loadErrorTitle: "Təqvim yüklənmədi",
    loadErrorBody: "İnterneti yoxlayın. Son yüklənmiş məlumat ekranda qalacaq.",
    retry: "Yenidən cəhd et",
    emptyTitle: "Bu dövrdə marşrut yoxdur",
    emptyBody: "Bu, xəta deyil: seçilən tarixlər üçün hələ plan saxlanmayıb və ya dərc edilməyib.",
    dayTitle: "{{date}} üçün plan",
    noDayRoutes: "Bu gün üçün görüş yoxdur",
    noDayRoutesBody: "«Marşrut yarat» düyməsinə toxunun, əməkdaşı və müştəriləri seçin.",
    draft: "Qaralama",
    planned: "Dərc edilib",
    active: "Yoldadır",
    done: "Tamamlanıb",
    cancelled: "Ləğv edilib",
    progress: "{{total}} görüşdən {{visited}} tamamlanıb",
    more: "+ daha {{count}}",
    noAgents: "İdarəetmə dairənizdə aktiv sahə agenti yoxdur.",
    currentMonth: "Cari ay",
    currentWeek: "Cari həftə",
  },
  en: {
    eyebrow: "Team plan",
    title: "Route calendar",
    subtitle: "See who is scheduled, on which day, and for how many meetings.",
    create: "Create route",
    month: "Month",
    week: "Week",
    today: "Today",
    previous: "Previous period",
    next: "Next period",
    guide: "Choose a view → tap a day → review meetings or create a route.",
    routes: "Routes",
    agents: "Employees",
    stops: "Meetings",
    loading: "Loading the team calendar…",
    loadErrorTitle: "The calendar did not load",
    loadErrorBody: "Check your connection. The last loaded information stays visible.",
    retry: "Try again",
    emptyTitle: "There are no routes in this period",
    emptyBody: "This is not an error: nothing has been saved or published for these dates yet.",
    dayTitle: "Plan for {{date}}",
    noDayRoutes: "There are no meetings on this day",
    noDayRoutesBody: "Tap Create route, choose an employee, and add clients.",
    draft: "Draft",
    planned: "Published",
    active: "In progress",
    done: "Completed",
    cancelled: "Cancelled",
    progress: "{{visited}} of {{total}} completed",
    more: "+ {{count}} more",
    noAgents: "There are no active field agents in your management scope.",
    currentMonth: "Current month",
    currentWeek: "Current week",
  },
} as const

type Copy = (typeof COPY)[Language]

function calendarLanguage(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function formatPeriod(anchor: string, mode: ManagerCalendarMode, language: string, from: string, to: string): string {
  if (mode === "month") {
    return formatLocalizedDate(anchor, language, { month: "long", year: "numeric", timeZone: "UTC" })
  }
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" }
  const first = formatLocalizedDate(from, language, options)
  const last = formatLocalizedDate(to, language, { ...options, year: "numeric" })
  return `${first} — ${last}`
}

function formatDate(value: string, language: string): string {
  return formatLocalizedDate(value, language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
}

function dayNumber(value: string): string {
  return String(Number(value.slice(-2)))
}

function sameMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7)
}

function statusLabel(route: ManagerCalendarRoute, copy: Copy): string {
  return copy[managerCalendarRouteTone(route.status)]
}

function routeColors(route: ManagerCalendarRoute) {
  switch (managerCalendarRouteTone(route.status)) {
    case "draft": return { fill: fieldTheme.color.surfaceStrong, ink: fieldTheme.color.inkMuted, border: fieldTheme.color.border }
    case "active": return { fill: fieldTheme.color.blueSoft, ink: fieldTheme.color.blue, border: fieldTheme.color.blue }
    case "done": return { fill: fieldTheme.color.successSoft, ink: fieldTheme.color.success, border: fieldTheme.color.success }
    case "cancelled": return { fill: fieldTheme.color.dangerSoft, ink: fieldTheme.color.danger, border: fieldTheme.color.danger }
    default: return { fill: fieldTheme.color.primarySoft, ink: fieldTheme.color.primaryStrong, border: fieldTheme.color.primary }
  }
}

export default function ManagerPlanningCalendarScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()
  const timezone = useBootstrapStore((state) => state.data?.timezone)
  const today = useMemo(() => planningTodayKey(new Date(), timezone), [timezone])
  const [anchor, setAnchor] = useState(today)
  const [mode, setMode] = useState<ManagerCalendarMode>("month")
  const [selectedDate, setSelectedDate] = useState(today)
  const [data, setData] = useState<ManagerCalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const window = useMemo(() => managerCalendarWindow(anchor, mode), [anchor, mode])
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const copy = COPY[calendarLanguage(i18n.language)]

  const load = useCallback(async (refresh = false) => {
    const controller = new AbortController()
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setLoadError(false)
    try {
      const response = await managerApi.getPlanningRange(window.from, window.to, controller.signal)
      setData(toManagerCalendarData(response, window))
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setLoadError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
    return () => controller.abort()
  }, [window])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setLoadError(false)
    managerApi.getPlanningRange(window.from, window.to, controller.signal)
      .then((response: any) => {
        if (active) setData(toManagerCalendarData(response, window))
      })
      .catch((error: any) => {
        if (active && error?.message !== "SESSION_EXPIRED") setLoadError(true)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      controller.abort()
    }
  }, [window])

  useEffect(() => {
    if (selectedDate < window.from || selectedDate > window.to) {
      setSelectedDate(today >= window.from && today <= window.to ? today : mode === "month" ? anchor : window.from)
    }
  }, [anchor, mode, selectedDate, today, window])

  const dates = useMemo(() => calendarDateKeys(window.from, window.to), [window])
  const routes = useMemo(() => data?.routes ?? [], [data?.routes])
  const agents = data?.agents ?? []
  const routesByDate = useMemo(() => {
    const grouped = new Map<string, ManagerCalendarRoute[]>()
    routes.forEach((route) => grouped.set(route.date, [...(grouped.get(route.date) ?? []), route]))
    return grouped
  }, [routes])
  const selectedRoutes = routesByDate.get(selectedDate) ?? []
  const stopCount = routes.reduce((sum, route) => sum + route.total, 0)
  const activeAgents = new Set(routes.map((route) => route.agentId)).size

  const changeMode = (next: ManagerCalendarMode) => {
    setMode(next)
    setAnchor(selectedDate)
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, tablet && styles.headerInnerTablet]}>
          <View style={styles.headerIcon}><Icon name="calendar" size={27} color={fieldTheme.color.onColor} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text numberOfLines={tablet ? 2 : 1} style={styles.subtitle}>{copy.subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("PlanningBuilder", { initialDate: selectedDate, initialHorizon: 1 })}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
          >
            <Icon name="add-circle" size={21} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.createButtonText}>{copy.create}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true) }} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
        contentContainerStyle={[styles.content, tablet && styles.contentTablet, { paddingBottom: tabBarPadding + fieldTheme.space.xl }]}
      >
        <View style={styles.guide}>
          <Icon name="sparkles-outline" size={20} color={fieldTheme.color.blue} />
          <Text style={styles.guideText}>{copy.guide}</Text>
        </View>

        <View style={[styles.controls, tablet && styles.controlsTablet]}>
          <View style={styles.segment} accessibilityRole="tablist">
            {(["month", "week"] as ManagerCalendarMode[]).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
                onPress={() => changeMode(value)}
                style={[styles.segmentButton, mode === value && styles.segmentButtonActive]}
              >
                <Icon name={value === "month" ? "calendar-outline" : "grid-outline"} size={19} color={mode === value ? fieldTheme.color.primaryStrong : fieldTheme.color.inkMuted} />
                <Text style={[styles.segmentText, mode === value && styles.segmentTextActive]}>{value === "month" ? copy.month : copy.week}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.periodNavigator}>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.previous} onPress={() => setAnchor(shiftManagerCalendarAnchor(anchor, mode, -1))} style={styles.squareButton}>
              <Icon name="chevron-back" size={24} color={fieldTheme.color.primaryStrong} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === "month" ? copy.currentMonth : copy.currentWeek} onPress={() => { setAnchor(today); setSelectedDate(today) }} style={styles.periodCopy}>
              <Text style={styles.periodTitle}>{formatPeriod(anchor, mode, i18n.language, window.from, window.to)}</Text>
              <Text style={styles.todayLink}>{copy.today}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.next} onPress={() => setAnchor(shiftManagerCalendarAnchor(anchor, mode, 1))} style={styles.squareButton}>
              <Icon name="chevron-forward" size={24} color={fieldTheme.color.primaryStrong} />
            </Pressable>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard icon="map-outline" value={routes.length} label={copy.routes} />
          <SummaryCard icon="people-outline" value={activeAgents} label={copy.agents} />
          <SummaryCard icon="location-outline" value={stopCount} label={copy.stops} />
        </View>

        {loadError ? (
          <View style={styles.notice} accessibilityLiveRegion="polite">
            <Icon name="cloud-offline-outline" size={24} color={fieldTheme.color.amber} />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>{copy.loadErrorTitle}</Text>
              <Text style={styles.noticeBody}>{copy.loadErrorBody}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => { void load() }} style={styles.retryButton}><Text style={styles.retryText}>{copy.retry}</Text></Pressable>
          </View>
        ) : null}

        {loading && !data ? (
          <View style={styles.loadingBlock}><ActivityIndicator size="large" color={fieldTheme.color.primary} /><Text style={styles.loadingText}>{copy.loading}</Text></View>
        ) : (
          <View style={styles.calendarCard}>
            {mode === "month" ? (
              <MonthGrid
                dates={dates}
                anchor={anchor}
                today={today}
                selectedDate={selectedDate}
                routesByDate={routesByDate}
                language={i18n.language}
                tablet={tablet}
                copy={copy}
                onSelect={setSelectedDate}
              />
            ) : expandedTablet ? (
              <WeekMatrix dates={dates} agents={agents} routes={routes} selectedDate={selectedDate} language={i18n.language} copy={copy} onSelect={setSelectedDate} />
            ) : (
              <WeekStrip dates={dates} routesByDate={routesByDate} selectedDate={selectedDate} today={today} language={i18n.language} onSelect={setSelectedDate} />
            )}
          </View>
        )}

        {!loading && routes.length === 0 && !loadError ? (
          <View style={styles.emptyPeriod}>
            <View style={styles.emptyIcon}><Icon name="calendar-clear-outline" size={30} color={fieldTheme.color.amber} /></View>
            <View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{agents.length === 0 ? copy.noAgents : copy.emptyTitle}</Text><Text style={styles.emptyBody}>{copy.emptyBody}</Text></View>
          </View>
        ) : null}

        <DayAgenda
          date={selectedDate}
          routes={selectedRoutes}
          language={i18n.language}
          copy={copy}
          onCreate={() => navigation.navigate("PlanningBuilder", { initialDate: selectedDate, initialHorizon: 1 })}
        />
      </ScrollView>
    </View>
  )
}

function SummaryCard({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}><Icon name={icon} size={19} color={fieldTheme.color.primaryStrong} /></View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function MonthGrid({ dates, anchor, today, selectedDate, routesByDate, language, tablet, copy, onSelect }: {
  dates: string[]
  anchor: string
  today: string
  selectedDate: string
  routesByDate: Map<string, ManagerCalendarRoute[]>
  language: string
  tablet: boolean
  copy: Copy
  onSelect: (date: string) => void
}) {
  const weekdayKeys = calendarDateKeys("2026-08-17", "2026-08-23")
  return (
    <View>
      <View style={styles.weekdayRow}>
        {weekdayKeys.map((date) => <Text key={date} style={styles.weekdayLabel}>{formatLocalizedDate(date, language, { weekday: "short", timeZone: "UTC" })}</Text>)}
      </View>
      <View style={styles.monthGrid}>
        {dates.map((date) => {
          const dayRoutes = routesByDate.get(date) ?? []
          const selected = date === selectedDate
          const current = sameMonth(date, anchor)
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${formatDate(date, language)}, ${dayRoutes.length} ${copy.routes}`}
              onPress={() => onSelect(date)}
              style={({ pressed }) => [styles.monthCell, tablet && styles.monthCellTablet, !current && styles.monthCellOutside, selected && styles.monthCellSelected, pressed && styles.pressed]}
            >
              <View style={styles.monthCellTop}>
                <Text style={[styles.dayNumber, selected && styles.dayNumberSelected, date === today && styles.todayNumber]}>{dayNumber(date)}</Text>
                {dayRoutes.length > 0 ? <View style={styles.countBadge}><Text style={styles.countBadgeText}>{dayRoutes.length}</Text></View> : null}
              </View>
              {tablet ? dayRoutes.slice(0, 2).map((route) => <RouteChip key={route.id} route={route} compact />) : (
                <View style={styles.dots}>{dayRoutes.slice(0, 3).map((route) => <View key={route.id} style={[styles.dot, { backgroundColor: routeColors(route).ink }]} />)}</View>
              )}
              {tablet && dayRoutes.length > 2 ? <Text style={styles.moreText}>{copy.more.replace("{{count}}", String(dayRoutes.length - 2))}</Text> : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function WeekStrip({ dates, routesByDate, selectedDate, today, language, onSelect }: {
  dates: string[]
  routesByDate: Map<string, ManagerCalendarRoute[]>
  selectedDate: string
  today: string
  language: string
  onSelect: (date: string) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
      {dates.map((date) => {
        const selected = date === selectedDate
        const routes = routesByDate.get(date) ?? []
        return (
          <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onSelect(date)} style={[styles.weekDay, selected && styles.weekDaySelected]}>
            <Text style={[styles.weekDayName, selected && styles.weekDayTextSelected]}>{formatLocalizedDate(date, language, { weekday: "short", timeZone: "UTC" })}</Text>
            <Text style={[styles.weekDayNumber, selected && styles.weekDayTextSelected]}>{dayNumber(date)}</Text>
            <Text style={[styles.weekDayCount, selected && styles.weekDayTextSelected]}>{routes.reduce((sum, route) => sum + route.total, 0)}</Text>
            {date === today ? <View style={styles.todayDot} /> : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function WeekMatrix({ dates, agents, routes, selectedDate, language, copy, onSelect }: {
  dates: string[]
  agents: ManagerCalendarAgent[]
  routes: ManagerCalendarRoute[]
  selectedDate: string
  language: string
  copy: Copy
  onSelect: (date: string) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.matrixScroll}>
      <View>
        <View style={styles.matrixRow}>
          <View style={[styles.matrixAgentCell, styles.matrixHeaderCell]}><Text style={styles.matrixHeaderText}>{copy.agents}</Text></View>
          {dates.map((date) => (
            <Pressable key={date} onPress={() => onSelect(date)} style={[styles.matrixDateCell, styles.matrixHeaderCell, date === selectedDate && styles.matrixDateSelected]}>
              <Text style={styles.matrixHeaderText}>{formatLocalizedDate(date, language, { weekday: "short", timeZone: "UTC" })}</Text>
              <Text style={styles.matrixHeaderDate}>{dayNumber(date)}</Text>
            </Pressable>
          ))}
        </View>
        {agents.map((agent) => (
          <View key={agent.id} style={styles.matrixRow}>
            <View style={styles.matrixAgentCell}><View style={styles.miniAvatar}><Text style={styles.miniAvatarText}>{upper(agent.name.slice(0, 2))}</Text></View><Text style={styles.matrixAgentName} numberOfLines={2}>{agent.name}</Text></View>
            {dates.map((date) => {
              const cellRoutes = routes.filter((route) => route.agentId === agent.id && route.date === date)
              return (
                <Pressable key={date} onPress={() => onSelect(date)} style={[styles.matrixDateCell, date === selectedDate && styles.matrixDateSelected]}>
                  {cellRoutes.length > 0 ? cellRoutes.slice(0, 2).map((route) => <RouteChip key={route.id} route={route} compact hideName />) : <Text style={styles.matrixEmpty}>—</Text>}
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function RouteChip({ route, compact = false, hideName = false }: { route: ManagerCalendarRoute; compact?: boolean; hideName?: boolean }) {
  const colors = routeColors(route)
  return (
    <View style={[styles.routeChip, { backgroundColor: colors.fill, borderColor: colors.border }, compact && styles.routeChipCompact]}>
      <Text numberOfLines={1} style={[styles.routeChipText, { color: colors.ink }]}>{hideName ? `${route.total}` : `${route.agentName} · ${route.total}`}</Text>
    </View>
  )
}

function DayAgenda({ date, routes, language, copy, onCreate }: {
  date: string
  routes: ManagerCalendarRoute[]
  language: string
  copy: Copy
  onCreate: () => void
}) {
  return (
    <View style={styles.agenda}>
      <View style={styles.agendaHeading}>
        <View><Text style={styles.agendaEyebrow}>{copy.routes}</Text><Text style={styles.agendaTitle}>{copy.dayTitle.replace("{{date}}", formatDate(date, language))}</Text></View>
        <View style={styles.agendaCount}><Text style={styles.agendaCountText}>{routes.length}</Text></View>
      </View>
      {routes.length > 0 ? (
        <ScrollView nestedScrollEnabled style={styles.agendaListScroller} contentContainerStyle={styles.agendaList} showsVerticalScrollIndicator={routes.length > 4}>
          {routes.map((route) => {
            const colors = routeColors(route)
            const ratio = route.total > 0 ? Math.min(1, route.visited / route.total) : 0
            return (
              <View key={route.id} style={styles.agendaCard}>
                <View style={[styles.agentAvatar, { backgroundColor: colors.fill }]}><Text style={[styles.agentAvatarText, { color: colors.ink }]}>{upper(route.agentName.slice(0, 2))}</Text></View>
                <View style={styles.agendaCardCopy}>
                  <Text style={styles.agentName}>{route.agentName}</Text>
                  {route.name ? <Text style={styles.routeName} numberOfLines={1}>{route.name}</Text> : null}
                  <Text style={styles.progressLabel}>{copy.progress.replace("{{visited}}", String(route.visited)).replace("{{total}}", String(route.total))}</Text>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: colors.ink }]} /></View>
                </View>
                <View style={[styles.statusPill, { backgroundColor: colors.fill }]}><Text style={[styles.statusText, { color: colors.ink }]}>{statusLabel(route, copy)}</Text></View>
              </View>
            )
          })}
        </ScrollView>
      ) : (
        <View style={styles.dayEmpty}>
          <View style={styles.emptyIcon}><Icon name="location-outline" size={28} color={fieldTheme.color.inkMuted} /></View>
          <Text style={styles.emptyTitle}>{copy.noDayRoutes}</Text>
          <Text style={styles.emptyBody}>{copy.noDayRoutesBody}</Text>
          <Pressable accessibilityRole="button" onPress={onCreate} style={styles.emptyCreate}><Icon name="add-circle" size={20} color={fieldTheme.color.onColor} /><Text style={styles.emptyCreateText}>{copy.create}</Text></Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.md, paddingBottom: fieldTheme.space.sm },
  headerInner: { width: "100%", maxWidth: 1180, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  headerInnerTablet: { paddingVertical: fieldTheme.space.xs },
  headerIcon: { width: 40, height: 40, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  headerCopy: { flex: 1, minWidth: 220, gap: 2 },
  eyebrow: { color: "#BBD6CB", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  title: { color: fieldTheme.color.onColor, fontSize: 21, lineHeight: 25, fontWeight: "900" },
  subtitle: { color: "#D7E9E1", fontSize: 11, lineHeight: 15, maxWidth: 680 },
  createButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 11, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  createButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: 10, gap: 10 },
  contentTablet: { padding: fieldTheme.space.md, gap: fieldTheme.space.md },
  guide: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: 10, paddingVertical: 6, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft, borderWidth: 1, borderColor: "#BED4F0" },
  guideText: { flex: 1, color: fieldTheme.color.ink, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  controls: { gap: 8 },
  controlsTablet: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  segment: { minHeight: 46, flexDirection: "row", padding: 2, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong, borderWidth: 1, borderColor: fieldTheme.color.border },
  segmentButton: { flex: 1, minWidth: 96, minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10 },
  segmentButtonActive: { backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.primary, shadowColor: fieldTheme.color.ink, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  segmentText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: fieldTheme.color.primaryStrong },
  periodNavigator: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm },
  squareButton: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  periodCopy: { minHeight: LAYOUT_TOUCH_TARGETS.compact, minWidth: 160, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.sm },
  periodTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900", textTransform: "capitalize", textAlign: "center" },
  todayLink: { color: fieldTheme.color.primary, fontSize: 10, fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 6 },
  summaryCard: { flex: 1, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  summaryIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: fieldTheme.color.primarySoft },
  summaryValue: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  summaryLabel: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  notice: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft, borderWidth: 1, borderColor: fieldTheme.color.amber },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { color: fieldTheme.color.amber, fontSize: 14, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  retryButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: fieldTheme.space.md },
  retryText: { color: fieldTheme.color.amber, fontSize: 13, fontWeight: "900" },
  loadingBlock: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "700" },
  calendarCard: { overflow: "hidden", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekdayRow: { flexDirection: "row", backgroundColor: fieldTheme.color.surfaceStrong, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  weekdayLabel: { width: "14.2857%", paddingVertical: 6, color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "900", textAlign: "center" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthCell: { width: "14.2857%", minHeight: 60, padding: 4, gap: 2, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  monthCellTablet: { minHeight: 88, padding: 6 },
  monthCellOutside: { backgroundColor: "#F3F6F4", opacity: 0.58 },
  monthCellSelected: { backgroundColor: fieldTheme.color.primarySoft, borderWidth: 2, borderColor: fieldTheme.color.primary },
  monthCellTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayNumber: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800" },
  dayNumberSelected: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  todayNumber: { color: fieldTheme.color.coral },
  countBadge: { minWidth: 19, height: 19, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primary },
  countBadgeText: { color: fieldTheme.color.onColor, fontSize: 9, fontWeight: "900" },
  dots: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  routeChip: { minHeight: 24, justifyContent: "center", paddingHorizontal: 6, borderRadius: 7, borderWidth: 1 },
  routeChipCompact: { minHeight: 22, paddingHorizontal: 5 },
  routeChipText: { fontSize: 9, fontWeight: "800" },
  moreText: { color: fieldTheme.color.inkMuted, fontSize: 9, fontWeight: "700" },
  weekStrip: { padding: 6, gap: 6 },
  weekDay: { width: 66, minHeight: 76, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekDaySelected: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  weekDayName: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  weekDayNumber: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  weekDayCount: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "900" },
  weekDayTextSelected: { color: fieldTheme.color.onColor },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: fieldTheme.color.coral },
  matrixScroll: { minWidth: 1100 },
  matrixRow: { flexDirection: "row" },
  matrixAgentCell: { width: 190, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 6, padding: 7, borderRightWidth: 1, borderBottomWidth: 1, borderColor: fieldTheme.color.border },
  matrixDateCell: { width: 118, minHeight: 64, justifyContent: "center", gap: 3, padding: 5, borderRightWidth: 1, borderBottomWidth: 1, borderColor: fieldTheme.color.border },
  matrixHeaderCell: { minHeight: 48, backgroundColor: fieldTheme.color.surfaceStrong, alignItems: "center", justifyContent: "center" },
  matrixDateSelected: { backgroundColor: fieldTheme.color.primarySoft },
  matrixHeaderText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "900" },
  matrixHeaderDate: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  miniAvatar: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: fieldTheme.color.primarySoft },
  miniAvatarText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  matrixAgentName: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 17, fontWeight: "800" },
  matrixEmpty: { color: fieldTheme.color.border, textAlign: "center", fontSize: 18 },
  emptyPeriod: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft, borderWidth: 1, borderColor: "#E7CD88" },
  emptyIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900", textAlign: "center" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, textAlign: "center" },
  agenda: { gap: 8, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  agendaHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  agendaEyebrow: { color: fieldTheme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  agendaTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 19, fontWeight: "900", textTransform: "capitalize" },
  agendaCount: { minWidth: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  agendaCountText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  agendaListScroller: { maxHeight: 292 },
  agendaList: { gap: 6, paddingRight: 2 },
  agendaCard: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  agentAvatar: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  agentAvatarText: { fontSize: 13, fontWeight: "900" },
  agendaCardCopy: { flex: 1, gap: 3 },
  agentName: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900" },
  routeName: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "600" },
  progressLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  progressTrack: { height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: fieldTheme.color.border },
  progressFill: { height: 5, borderRadius: 3 },
  statusPill: { minHeight: 28, justifyContent: "center", paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill },
  statusText: { fontSize: 10, fontWeight: "900" },
  dayEmpty: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 6, padding: 10 },
  emptyCreate: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primary },
  emptyCreateText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
})
