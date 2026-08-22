import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  type LayoutChangeEvent,
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
import { api } from "../../services/api"
import {
  toWeekData,
  shiftDateKey,
  type WeekData,
  type WeekDay,
  type WeekTaskItem,
} from "../../services/week"
import {
  teamMeetingsByDate,
  toTeamScheduleData,
  type TeamMeeting,
  type TeamScheduleData,
} from "../../services/team-schedule"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS, isExpandedTabletWidth } from "../../theme/layoutBreakpoints"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { normalizeGpsTimeZone } from "../../services/gps-history"

type CalendarLanguage = "ru" | "az" | "en"
const TEAM_SCHEDULE_REFRESH_MS = 120_000

const CALENDAR_COPY = {
  ru: {
    title: "Календарь",
    subtitle: "Маршруты, визиты и задачи по дням",
    loadingTitle: "Собираем план на неделю",
    loadingBody: "Это займёт несколько секунд.",
    errorTitle: "Не удалось открыть календарь",
    errorBody: "Проверьте интернет и попробуйте ещё раз.",
    staleTitle: "Сейчас нет связи",
    staleBody: "Показываем последнюю загруженную неделю. Потяните экран вниз, когда связь появится.",
    retry: "Попробовать снова",
    summary: "Итоги недели",
    dayPlan: "План на день",
    chooseDay: "Выберите день слева, чтобы увидеть подробности.",
    emptyWeekTitle: "На эту неделю ничего не запланировано",
    emptyWeekBody: "Выберите другую неделю или вернитесь к сегодняшней дате.",
    noVisits: "Визитов на этот день нет",
    noVisitsBody: "Маршрут и задачи всё равно показаны выше.",
    visitsDone: "Выполнено визитов",
    tasksDone: "Выполнено задач",
    routeStops: "Точек маршрута",
    openVisit: "Открыть визит",
    completed: "Выполнен",
    planned: "Запланирован",
    todayMarker: "Сегодня",
    previousWeek: "Предыдущая неделя",
    nextWeek: "Следующая неделя",
    visitsShort: "Визиты",
    tasksShort: "Задачи",
    noAgenda: "На этот день планов нет",
    noAgendaBody: "Новые визиты или задачи появятся здесь автоматически.",
    noTasks: "Задач на этот день нет",
    noTasksBody: "Если руководитель назначит задачу, она появится здесь.",
    openTask: "Открыть задачу",
    untitledTask: "Задача без названия",
    taskPending: "К выполнению",
    taskInProgress: "В работе",
    taskCompleted: "Готово",
    taskOverdue: "Просрочено",
    taskCancelled: "Отменено",
    taskStatus: "Задача",
    priorityLow: "Обычная",
    priorityMedium: "Важная",
    priorityHigh: "Высокая",
    priorityUrgent: "Срочная",
    priorityLabel: "Приоритет",
    client: "Клиент",
    planOwnRoute: "Составить мой маршрут",
    planOwnRouteHint: "Выберите день и клиентов — редактировать этот план сможете только вы.",
    teamMeetings: "Встречи команды",
    teamMeetingsHint: "Кто из коллег, с кем, когда и где встречается",
    teamLoading: "Обновляем встречи команды…",
    teamDisabled: "Расписание коллег скрыто настройками компании.",
    teamEmptyWeek: "На этой неделе у команды нет открытых встреч.",
    teamError: "Встречи команды не обновились. Ваш личный план доступен.",
    teamTruncated: "Встреч очень много: показана только первая часть. Уточните неделю или день.",
    timeTbd: "Время уточняется",
    placeTbd: "Место не указано",
    contact: "Контакт",
    showMoreMeetings: "Показать ещё",
    collapseMeetings: "Свернуть",
    teamPlanned: "Запланирована",
    teamHeld: "Состоялась",
    teamNotHeld: "Не состоялась",
    teamShort: "Команда",
  },
  az: {
    title: "Təqvim",
    subtitle: "Marşrutlar, ziyarətlər və tapşırıqlar günlər üzrə",
    loadingTitle: "Həftəlik plan hazırlanır",
    loadingBody: "Bu, bir neçə saniyə çəkəcək.",
    errorTitle: "Təqvimi açmaq alınmadı",
    errorBody: "İnterneti yoxlayın və yenidən cəhd edin.",
    staleTitle: "Hazırda bağlantı yoxdur",
    staleBody: "Son yüklənmiş həftəni göstəririk. Bağlantı bərpa olunanda ekranı aşağı çəkin.",
    retry: "Yenidən cəhd et",
    summary: "Həftənin yekunu",
    dayPlan: "Günün planı",
    chooseDay: "Ətraflı baxmaq üçün soldan günü seçin.",
    emptyWeekTitle: "Bu həftə üçün plan yoxdur",
    emptyWeekBody: "Başqa həftəni seçin və ya bugünkü tarixə qayıdın.",
    noVisits: "Bu gün üçün ziyarət yoxdur",
    noVisitsBody: "Marşrut və tapşırıqlar yuxarıda göstərilir.",
    visitsDone: "Tamamlanan ziyarətlər",
    tasksDone: "Tamamlanan tapşırıqlar",
    routeStops: "Marşrut nöqtələri",
    openVisit: "Ziyarəti aç",
    completed: "Tamamlanıb",
    planned: "Planlaşdırılıb",
    todayMarker: "Bu gün",
    previousWeek: "Əvvəlki həftə",
    nextWeek: "Növbəti həftə",
    visitsShort: "Ziyarət",
    tasksShort: "Tapşırıq",
    noAgenda: "Bu gün üçün plan yoxdur",
    noAgendaBody: "Yeni ziyarət və ya tapşırıq burada avtomatik görünəcək.",
    noTasks: "Bu gün üçün tapşırıq yoxdur",
    noTasksBody: "Rəhbər tapşırıq verəndə burada görünəcək.",
    openTask: "Tapşırığı aç",
    untitledTask: "Adsız tapşırıq",
    taskPending: "Görüləcək",
    taskInProgress: "İcrada",
    taskCompleted: "Tamam",
    taskOverdue: "Gecikib",
    taskCancelled: "Ləğv edilib",
    taskStatus: "Tapşırıq",
    priorityLow: "Adi",
    priorityMedium: "Vacib",
    priorityHigh: "Yüksək",
    priorityUrgent: "Təcili",
    priorityLabel: "Prioritet",
    client: "Müştəri",
    planOwnRoute: "Öz marşrutumu qur",
    planOwnRouteHint: "Günü və müştəriləri seçin — bu planı yalnız siz redaktə edə bilərsiniz.",
    teamMeetings: "Komanda görüşləri",
    teamMeetingsHint: "Hansı əməkdaşın kimlə, nə vaxt və harada görüşdüyü",
    teamLoading: "Komanda görüşləri yenilənir…",
    teamDisabled: "Əməkdaşların cədvəli şirkət ayarlarında gizlədilib.",
    teamEmptyWeek: "Bu həftə komandanın açıq görüşü yoxdur.",
    teamError: "Komanda görüşləri yenilənmədi. Şəxsi planınız əlçatandır.",
    teamTruncated: "Görüşlərin sayı çoxdur: yalnız ilk hissə göstərilir. Həftəni və ya günü dəqiqləşdirin.",
    timeTbd: "Vaxt dəqiqləşdirilir",
    placeTbd: "Məkan göstərilməyib",
    contact: "Əlaqə",
    showMoreMeetings: "Daha çox göstər",
    collapseMeetings: "Yığ",
    teamPlanned: "Planlaşdırılıb",
    teamHeld: "Baş tutub",
    teamNotHeld: "Baş tutmayıb",
    teamShort: "Komanda",
  },
  en: {
    title: "Calendar",
    subtitle: "Routes, visits and tasks, day by day",
    loadingTitle: "Building your weekly plan",
    loadingBody: "This should only take a few seconds.",
    errorTitle: "We couldn't open the calendar",
    errorBody: "Check your connection and try again.",
    staleTitle: "You're offline",
    staleBody: "Showing the last loaded week. Pull down when your connection returns.",
    retry: "Try again",
    summary: "Week summary",
    dayPlan: "Plan for the day",
    chooseDay: "Choose a day on the left to see its details.",
    emptyWeekTitle: "Nothing is planned for this week",
    emptyWeekBody: "Choose another week or return to today's date.",
    noVisits: "No visits planned for this day",
    noVisitsBody: "The route and tasks are still shown above.",
    visitsDone: "Visits completed",
    tasksDone: "Tasks completed",
    routeStops: "Route stops",
    openVisit: "Open visit",
    completed: "Completed",
    planned: "Planned",
    todayMarker: "Today",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    visitsShort: "Visits",
    tasksShort: "Tasks",
    noAgenda: "Nothing is planned for this day",
    noAgendaBody: "New visits or tasks will appear here automatically.",
    noTasks: "No tasks planned for this day",
    noTasksBody: "A task will appear here when your manager assigns it.",
    openTask: "Open task",
    untitledTask: "Untitled task",
    taskPending: "To do",
    taskInProgress: "In progress",
    taskCompleted: "Done",
    taskOverdue: "Overdue",
    taskCancelled: "Cancelled",
    taskStatus: "Task",
    priorityLow: "Routine",
    priorityMedium: "Important",
    priorityHigh: "High",
    priorityUrgent: "Urgent",
    priorityLabel: "Priority",
    client: "Client",
    planOwnRoute: "Build my route",
    planOwnRouteHint: "Choose a day and customers — only you can edit this plan.",
    teamMeetings: "Team meetings",
    teamMeetingsHint: "Who is meeting which client, when and where",
    teamLoading: "Refreshing team meetings…",
    teamDisabled: "Colleague schedules are hidden by company settings.",
    teamEmptyWeek: "The team has no shared meetings this week.",
    teamError: "Team meetings did not refresh. Your personal plan is still available.",
    teamTruncated: "There are many meetings, so only the first part is shown. Narrow the week or day.",
    timeTbd: "Time to be confirmed",
    placeTbd: "Location not provided",
    contact: "Contact",
    showMoreMeetings: "Show more",
    collapseMeetings: "Show less",
    teamPlanned: "Planned",
    teamHeld: "Held",
    teamNotHeld: "Not held",
    teamShort: "Team",
  },
} as const

type Copy = typeof CALENDAR_COPY[CalendarLanguage]

export function calendarLanguage(language: string): CalendarLanguage {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

export function calendarLayout(width: number): "phone" | "tablet" {
  // The app's persistent navigation rail also consumes horizontal space. A
  // split master/detail calendar is only comfortable at the expanded tablet
  // breakpoint; narrower tablets get the clear single-column layout.
  return isExpandedTabletWidth(width) ? "tablet" : "phone"
}

type AgendaTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

function normalizedTaskPriority(priority?: string | null): AgendaTaskPriority {
  const value = String(priority || "MEDIUM").toUpperCase()
  return value === "LOW" || value === "HIGH" || value === "URGENT" ? value : "MEDIUM"
}

function taskStatusPresentation(task: WeekTaskItem, copy: Copy) {
  const status = String(task.status || "PENDING").toUpperCase()
  if (status === "COMPLETED") {
    return {
      label: copy.taskCompleted,
      icon: "checkmark-circle" as const,
      ink: fieldTheme.color.success,
      fill: fieldTheme.color.successSoft,
    }
  }
  const dueAt = task.dueDate ? new Date(task.dueDate).getTime() : Number.NaN
  if (status === "OVERDUE" || (
    status !== "COMPLETED"
    && status !== "CANCELLED"
    && Number.isFinite(dueAt)
    && dueAt < Date.now()
  )) {
    return {
      label: copy.taskOverdue,
      icon: "alert-circle" as const,
      ink: fieldTheme.color.danger,
      fill: fieldTheme.color.dangerSoft,
    }
  }
  if (status === "IN_PROGRESS") {
    return {
      label: copy.taskInProgress,
      icon: "play-circle" as const,
      ink: fieldTheme.color.blue,
      fill: fieldTheme.color.blueSoft,
    }
  }
  if (status === "CANCELLED") {
    return {
      label: copy.taskCancelled,
      icon: "close-circle" as const,
      ink: fieldTheme.color.inkMuted,
      fill: fieldTheme.color.surfaceStrong,
    }
  }
  if (status === "PENDING") {
    return {
      label: copy.taskPending,
      icon: "time" as const,
      ink: fieldTheme.color.amber,
      fill: fieldTheme.color.amberSoft,
    }
  }
  return {
    label: copy.taskStatus,
    icon: "ellipse" as const,
    ink: fieldTheme.color.inkMuted,
    fill: fieldTheme.color.surfaceStrong,
  }
}

function taskPriorityPresentation(priority: string | null | undefined, copy: Copy) {
  switch (normalizedTaskPriority(priority)) {
    case "URGENT":
      return { label: copy.priorityUrgent, ink: fieldTheme.color.danger, fill: fieldTheme.color.dangerSoft }
    case "HIGH":
      return { label: copy.priorityHigh, ink: fieldTheme.color.coral, fill: fieldTheme.color.coralSoft }
    case "LOW":
      return { label: copy.priorityLow, ink: fieldTheme.color.success, fill: fieldTheme.color.successSoft }
    default:
      return { label: copy.priorityMedium, ink: fieldTheme.color.amber, fill: fieldTheme.color.amberSoft }
  }
}

function teamMeetingStatusPresentation(meeting: TeamMeeting, copy: Copy) {
  const pointStatus = meeting.pointStatus.toUpperCase()
  const routeStatus = meeting.routeStatus.toUpperCase()
  if (pointStatus === "VISITED") {
    return {
      label: copy.teamHeld,
      icon: "checkmark-circle" as const,
      ink: fieldTheme.color.success,
      fill: fieldTheme.color.successSoft,
    }
  }
  if (pointStatus === "SKIPPED" || routeStatus === "COMPLETED") {
    return {
      label: copy.teamNotHeld,
      icon: "close-circle" as const,
      ink: fieldTheme.color.inkMuted,
      fill: fieldTheme.color.surfaceStrong,
    }
  }
  return {
    label: copy.teamPlanned,
    icon: "calendar-outline" as const,
    ink: fieldTheme.color.violet,
    fill: fieldTheme.color.violetSoft,
  }
}

function dateFromKey(dateKey: string): Date | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDayNumber(dateKey: string): string {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(dateKey)
  return match ? String(Number(match[1])) : ""
}

function weekdayShort(dateKey: string, lang: string): string {
  const date = dateFromKey(dateKey)
  return date?.toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" }) ?? ""
}

function formatFullDate(dateKey: string, lang: string): string {
  const date = dateFromKey(dateKey)
  return date?.toLocaleDateString(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }) ?? ""
}

function formatRange(start: string, endExclusive: string, lang: string): string {
  const last = shiftDateKey(endExclusive, -1)
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" }
  const firstDate = dateFromKey(start)
  const lastDate = dateFromKey(last)
  if (!firstDate || !lastDate) return ""
  return `${firstDate.toLocaleDateString(lang, options)} – ${lastDate.toLocaleDateString(lang, options)}`
}

function formatMeetingTime(
  value: string | undefined,
  lang: string,
  fallback: string,
  timezone?: string,
): string {
  if (!value) return fallback
  const clock = /(?:T|^)(\d{2}:\d{2})(?::\d{2})?/.exec(value)
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString(lang, {
      hour: "2-digit",
      minute: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    })
  }
  return clock?.[1] ?? fallback
}

function meetingPlace(meeting: TeamMeeting, fallback: string): string {
  const pieces = [meeting.address, meeting.city].filter((value, index, all) => (
    Boolean(value) && all.indexOf(value) === index
  ))
  return pieces.join(", ") || fallback
}

export default function WeekScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const myAgentId = useAuthStore((state) => state.agent?.id)
  const myAgentRole = useAuthStore((state) => state.agent?.role)
  const ownRoutePlanningPolicy = useBootstrapStore((state) => state.data?.policies.canPlanOwnRoutes === true)
  const canPlanOwnRoutes = String(myAgentRole).toUpperCase() === "AGENT"
    && ownRoutePlanningPolicy
  const [anchor, setAnchor] = useState<string | null>(null)
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [teamSchedule, setTeamSchedule] = useState<TeamScheduleData | null>(null)
  const [teamScheduleLoading, setTeamScheduleLoading] = useState(false)
  const [teamScheduleError, setTeamScheduleError] = useState(false)
  const [calendarFocused, setCalendarFocused] = useState(navigation.isFocused())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const phoneListY = useRef(0)
  const phoneDayY = useRef<Record<string, number>>({})
  const teamRequestId = useRef(0)
  const teamRequestController = useRef<AbortController | null>(null)
  const appState = useRef(AppState.currentState)

  const fetchTeamSchedule = useCallback(async (week: WeekData) => {
    teamRequestController.current?.abort()
    const controller = new AbortController()
    teamRequestController.current = controller
    const requestId = ++teamRequestId.current
    setTeamSchedule(null)
    setTeamScheduleError(false)
    setTeamScheduleLoading(true)
    try {
      const response = await api.getTeamSchedule(
        week.weekStart,
        shiftDateKey(week.weekEndExclusive, -1),
        controller.signal,
      )
      if (requestId !== teamRequestId.current) return
      if (response.success && response.data) {
        setTeamSchedule(toTeamScheduleData(response.data))
      } else {
        setTeamScheduleError(true)
      }
    } catch (error: any) {
      if (requestId !== teamRequestId.current) return
      // Authentication expiry is handled globally by ApiClient. Every other
      // failure remains isolated from the agent's own calendar.
      if (error.name !== "AbortError" && error.message !== "SESSION_EXPIRED") {
        setTeamScheduleError(true)
      }
    } finally {
      if (requestId === teamRequestId.current) {
        setTeamScheduleLoading(false)
        if (teamRequestController.current === controller) teamRequestController.current = null
      }
    }
  }, [])

  const fetchWeek = useCallback(async (start: string | null) => {
    teamRequestController.current?.abort()
    teamRequestController.current = null
    teamRequestId.current += 1
    setTeamSchedule(null)
    setTeamScheduleError(false)
    setTeamScheduleLoading(false)
    try {
      const response = await api.getWeek(start ?? undefined)
      if (response.success && response.data) {
        const nextWeek = toWeekData(response.data)
        setData(nextWeek)
        setOffline(false)
        void fetchTeamSchedule(nextWeek)
      } else {
        setTeamSchedule(null)
        setOffline(true)
      }
    } catch (error: any) {
      // SESSION_EXPIRED is handled by the API interceptor. There is no week
      // cache yet, so every other failure must be visible instead of looking
      // like a genuinely empty calendar.
      if (error.message !== "SESSION_EXPIRED") setOffline(true)
      setTeamSchedule(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchTeamSchedule])

  useEffect(() => {
    fetchWeek(anchor)
  }, [anchor, fetchWeek])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returningToForeground = appState.current !== "active" && nextState === "active"
      appState.current = nextState
      if (returningToForeground && data) void fetchTeamSchedule(data)
    })
    return () => subscription.remove()
  }, [data, fetchTeamSchedule])

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener("focus", () => {
      setCalendarFocused(true)
      if (data) void fetchTeamSchedule(data)
    })
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setCalendarFocused(false)
      teamRequestController.current?.abort()
      teamRequestController.current = null
      teamRequestId.current += 1
      setTeamSchedule(null)
      setTeamScheduleError(false)
      setTeamScheduleLoading(false)
    })
    return () => {
      unsubscribeFocus()
      unsubscribeBlur()
    }
  }, [data, fetchTeamSchedule, navigation])

  useEffect(() => {
    if (!calendarFocused || !data) return undefined
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void fetchTeamSchedule(data)
    }, TEAM_SCHEDULE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [calendarFocused, data, fetchTeamSchedule])

  useEffect(() => {
    teamRequestController.current?.abort()
    teamRequestController.current = null
    teamRequestId.current += 1
    setTeamSchedule(null)
    setTeamScheduleError(false)
    setTeamScheduleLoading(false)
  }, [myAgentId])

  useEffect(() => () => {
    teamRequestController.current?.abort()
    teamRequestController.current = null
    teamRequestId.current += 1
  }, [])

  useEffect(() => {
    if (!data?.days.length) {
      setSelectedDate(null)
      return
    }
    const selectedStillExists = data.days.some((day) => day.date === selectedDate)
    if (selectedStillExists) return
    const today = data.days.find((day) => day.isToday)
    setSelectedDate((today ?? data.days[0]).date)
  }, [data, selectedDate])

  const language = calendarLanguage(i18n.language)
  const copy = CALENDAR_COPY[language]
  const layout = calendarLayout(width)
  const tablet = layout === "tablet"
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const selectedDay = useMemo(
    () => data?.days.find((day) => day.date === selectedDate) ?? null,
    [data, selectedDate],
  )
  const meetingsByDate = useMemo(
    () => teamMeetingsByDate(teamSchedule?.meetings ?? []),
    [teamSchedule],
  )
  const currentWeek = Boolean(
    data && data.today >= data.weekStart && data.today < data.weekEndExclusive,
  )

  const changeWeek = (offset: number) => {
    if (!data || loading) return
    setLoading(true)
    setAnchor(shiftDateKey(data.weekStart, offset))
  }

  const returnToToday = () => {
    if (data && currentWeek) {
      setSelectedDate(data.today)
      if (!tablet) {
        requestAnimationFrame(() => {
          const dayY = phoneDayY.current[data.today]
          if (typeof dayY === "number") {
            scrollRef.current?.scrollTo({
              y: Math.max(0, phoneListY.current + dayY - fieldTheme.space.md),
              animated: true,
            })
          }
        })
      }
      return
    }
    setLoading(true)
    if (anchor === null) fetchWeek(null)
    else setAnchor(null)
  }

  const retry = () => {
    setLoading(true)
    fetchWeek(anchor)
  }

  const openVisit = (id: string, name: string) => {
    navigation.navigate("VisitWorkspace", { visitId: id, name })
  }

  const openTask = (task: WeekTaskItem) => {
    navigation.navigate("TaskDetail", {
      task: { ...task, agentId: task.agentId ?? myAgentId ?? null },
    })
  }

  const openOwnRoutePlanner = () => {
    navigation.navigate("PlanningBuilder", { mode: "self" })
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        fetchWeek(anchor)
      }}
      tintColor={fieldTheme.color.primary}
      colors={[fieldTheme.color.primary]}
    />
  )

  return (
    <View style={styles.container}>
      <CalendarHeader
        title={copy.title}
        subtitle={copy.subtitle}
        range={data ? formatRange(data.weekStart, data.weekEndExclusive, i18n.language) : ""}
        todayLabel={t("week.today")}
        previousWeekLabel={copy.previousWeek}
        nextWeekLabel={copy.nextWeek}
        loading={loading}
        currentWeek={currentWeek}
        touchTarget={touchTarget}
        headerTop={headerTop}
        onPrevious={() => changeWeek(-7)}
        onNext={() => changeWeek(7)}
        onToday={returnToToday}
      />

      {loading ? (
        <LoadingState title={copy.loadingTitle} body={copy.loadingBody} />
      ) : !data && offline ? (
        <StatePanel
          icon="cloud-offline-outline"
          title={copy.errorTitle}
          body={copy.errorBody}
          action={copy.retry}
          onAction={retry}
          touchTarget={touchTarget}
        />
      ) : !data || data.days.length === 0 ? (
        <StatePanel
          icon="calendar-clear-outline"
          title={copy.emptyWeekTitle}
          body={copy.emptyWeekBody}
          action={copy.retry}
          onAction={retry}
          touchTarget={touchTarget}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            tablet && styles.scrollTablet,
            { paddingBottom: tabBarPadding },
          ]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {offline && <OfflineNotice title={copy.staleTitle} body={copy.staleBody} />}

          <WeekSummary data={data} title={copy.summary} t={t} tablet={tablet} />
          {canPlanOwnRoutes ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.planOwnRoute}
              accessibilityHint={copy.planOwnRouteHint}
              onPress={openOwnRoutePlanner}
              style={({ pressed }) => [styles.ownRoutePlanner, pressed && styles.pressed]}
            >
              <View style={styles.ownRoutePlannerIcon}>
                <Icon name="add-circle-outline" size={24} color={fieldTheme.color.primary} />
              </View>
              <View style={styles.ownRoutePlannerCopy}>
                <Text style={styles.ownRoutePlannerTitle}>{copy.planOwnRoute}</Text>
                <Text style={styles.ownRoutePlannerBody}>{copy.planOwnRouteHint}</Text>
              </View>
              <Icon name="chevron-forward" size={22} color={fieldTheme.color.primary} />
            </Pressable>
          ) : null}
          <TeamScheduleStatus
            data={teamSchedule}
            loading={teamScheduleLoading}
            error={teamScheduleError}
            copy={copy}
          />

          {tablet ? (
            <View style={styles.tabletWorkspace}>
              <View style={styles.dayMaster}>
                {data.days.map((day) => (
                  <DaySelector
                    key={day.date}
                    day={day}
                    lang={i18n.language}
                    selected={day.date === selectedDate}
                    touchTarget={touchTarget}
                    todayLabel={copy.todayMarker}
                    visitsLabel={copy.visitsShort}
                    tasksLabel={copy.tasksShort}
                    teamLabel={copy.teamShort}
                    teamCount={meetingsByDate[day.date]?.length ?? 0}
                    onPress={() => setSelectedDate(day.date)}
                  />
                ))}
              </View>
              <View style={styles.dayDetail}>
                {selectedDay ? (
                  <DayDetail
                    day={selectedDay}
                    lang={i18n.language}
                    copy={copy}
                    t={t}
                    touchTarget={touchTarget}
                    onVisitPress={openVisit}
                    onTaskPress={openTask}
                    teamMeetings={meetingsByDate[selectedDay.date] ?? []}
                  />
                ) : (
                  <Text style={styles.chooseDay}>{copy.chooseDay}</Text>
                )}
              </View>
            </View>
          ) : (
            <View
              style={styles.phoneDays}
              onLayout={(event) => { phoneListY.current = event.nativeEvent.layout.y }}
            >
              {data.days.map((day) => (
                <PhoneDay
                  key={day.date}
                  day={day}
                  lang={i18n.language}
                  copy={copy}
                  t={t}
                  touchTarget={touchTarget}
                  onVisitPress={openVisit}
                  onTaskPress={openTask}
                  teamMeetings={meetingsByDate[day.date] ?? []}
                  onLayout={(event) => { phoneDayY.current[day.date] = event.nativeEvent.layout.y }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function CalendarHeader({
  title,
  subtitle,
  range,
  todayLabel,
  previousWeekLabel,
  nextWeekLabel,
  loading,
  currentWeek,
  touchTarget,
  headerTop,
  onPrevious,
  onNext,
  onToday,
}: {
  title: string
  subtitle: string
  range: string
  todayLabel: string
  previousWeekLabel: string
  nextWeekLabel: string
  loading: boolean
  currentWeek: boolean
  touchTarget: number
  headerTop: number
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={todayLabel}
          onPress={onToday}
          style={({ pressed }) => [
            styles.todayButton,
            currentWeek && styles.todayButtonCurrent,
            { minHeight: touchTarget },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="locate-outline" size={18} color={currentWeek ? fieldTheme.color.primary : fieldTheme.color.onColor} />
          <Text style={[styles.todayButtonText, currentWeek && styles.todayButtonTextCurrent]}>{todayLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.weekNavigation}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previousWeekLabel}
          disabled={loading || !range}
          onPress={onPrevious}
          style={({ pressed }) => [
            styles.navButton,
            { width: touchTarget, height: touchTarget },
            (loading || !range) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="chevron-back" size={22} color={fieldTheme.color.ink} />
        </Pressable>
        <View style={styles.rangeBlock}>
          <Text style={styles.rangeLabel}>{range || "—"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextWeekLabel}
          disabled={loading || !range}
          onPress={onNext}
          style={({ pressed }) => [
            styles.navButton,
            { width: touchTarget, height: touchTarget },
            (loading || !range) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="chevron-forward" size={22} color={fieldTheme.color.ink} />
        </Pressable>
      </View>
    </View>
  )
}

function LoadingState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <View style={styles.stateIconSoft}>
        <ActivityIndicator size="large" color={fieldTheme.color.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
    </View>
  )
}

function StatePanel({ icon, title, body, action, onAction, touchTarget }: {
  icon: string
  title: string
  body: string
  action: string
  onAction: () => void
  touchTarget: number
}) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <View style={styles.stateIconSoft}>
        <Icon name={icon} size={30} color={fieldTheme.color.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [styles.primaryButton, { minHeight: touchTarget }, pressed && styles.pressed]}
      >
        <Icon name="refresh" size={19} color={fieldTheme.color.onColor} />
        <Text style={styles.primaryButtonText}>{action}</Text>
      </Pressable>
    </View>
  )
}

function OfflineNotice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.offlineNotice} accessibilityLiveRegion="polite">
      <View style={styles.offlineIcon}>
        <Icon name="cloud-offline-outline" size={20} color={fieldTheme.color.amber} />
      </View>
      <View style={styles.noticeCopy}>
        <Text style={styles.offlineTitle}>{title}</Text>
        <Text style={styles.offlineBody}>{body}</Text>
      </View>
    </View>
  )
}

function WeekSummary({ data, title, t, tablet }: {
  data: WeekData
  title: string
  t: (key: string, options?: any) => string
  tablet: boolean
}) {
  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionEyebrow}>{title}</Text>
      <View style={[styles.summaryStrip, tablet && styles.summaryStripTablet]}>
        <SummaryMetric
          icon="checkmark-circle-outline"
          value={`${data.summary.visitsCompleted}/${data.summary.visits}`}
          label={t("week.statVisits")}
          color={fieldTheme.color.success}
          softColor={fieldTheme.color.successSoft}
        />
        <SummaryMetric
          icon="checkbox-outline"
          value={`${data.summary.tasksCompleted}/${data.summary.tasks}`}
          label={t("week.statTasks")}
          color={fieldTheme.color.blue}
          softColor={fieldTheme.color.blueSoft}
        />
        <SummaryMetric
          icon="analytics-outline"
          value={`${Math.round(data.summary.coveragePct)}%`}
          label={t("week.statCoverage")}
          color={fieldTheme.color.violet}
          softColor={fieldTheme.color.violetSoft}
        />
      </View>
    </View>
  )
}

function TeamScheduleStatus({ data, loading, error, copy }: {
  data: TeamScheduleData | null
  loading: boolean
  error: boolean
  copy: Copy
}) {
  let icon = "people-outline"
  let message: string | null = null
  let warning = false

  if (loading) {
    icon = "refresh-outline"
    message = copy.teamLoading
  } else if (error) {
    icon = "cloud-offline-outline"
    message = copy.teamError
    warning = true
  } else if (data && !data.enabled) {
    icon = "eye-off-outline"
    message = copy.teamDisabled
  } else if (data?.enabled && data.truncated) {
    icon = "warning-outline"
    message = copy.teamTruncated
    warning = true
  } else if (data?.enabled && data.meetings.length === 0) {
    icon = "people-outline"
    message = copy.teamEmptyWeek
  }

  if (!message) return null
  return (
    <View
      style={[styles.teamScheduleNotice, warning && styles.teamScheduleNoticeWarning]}
      accessibilityLiveRegion="polite"
    >
      {loading ? (
        <ActivityIndicator size="small" color={fieldTheme.color.primary} />
      ) : (
        <Icon
          name={icon}
          size={20}
          color={warning ? fieldTheme.color.amber : fieldTheme.color.primary}
        />
      )}
      <Text style={styles.teamScheduleNoticeText}>{message}</Text>
    </View>
  )
}

function SummaryMetric({ icon, value, label, color, softColor }: {
  icon: string
  value: string
  label: string
  color: string
  softColor: string
}) {
  return (
    <View style={styles.summaryMetric}>
      <View style={[styles.metricIcon, { backgroundColor: softColor }]}>
        <Icon name={icon} size={19} color={color} />
      </View>
      <View style={styles.metricCopy}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  )
}

function DaySelector({ day, lang, selected, touchTarget, todayLabel, visitsLabel, tasksLabel, teamLabel, teamCount, onPress }: {
  day: WeekDay
  lang: string
  selected: boolean
  touchTarget: number
  todayLabel: string
  visitsLabel: string
  tasksLabel: string
  teamLabel: string
  teamCount: number
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.daySelector,
        selected && styles.daySelectorSelected,
        { minHeight: touchTarget },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.dateTile, day.isToday && styles.dateTileToday]}>
        <Text style={[styles.dateWeekday, day.isToday && styles.dateTextToday]}>
          {weekdayShort(day.date, lang)}
        </Text>
        <Text style={[styles.dateNumber, day.isToday && styles.dateTextToday]}>
          {formatDayNumber(day.date)}
        </Text>
      </View>
      <View style={styles.daySelectorCopy}>
        <View style={styles.daySelectorTitleRow}>
          <Text style={styles.daySelectorTitle} numberOfLines={1}>
            {formatFullDate(day.date, lang)}
          </Text>
          {day.isToday && <Text style={styles.todayTag}>{todayLabel}</Text>}
        </View>
        <Text style={styles.daySelectorMeta}>
          {day.isWorkingDay || day.visitsTotal > 0 || day.tasksTotal > 0 || teamCount > 0
            ? `${visitsLabel} ${day.visitsCompleted}/${day.visitsTotal} · ${tasksLabel} ${day.tasksCompleted}/${day.tasksTotal}${teamCount > 0 ? ` · ${teamLabel} ${teamCount}` : ""}`
            : day.nonWorkingReason || "—"}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={selected ? fieldTheme.color.primary : fieldTheme.color.inkMuted} />
    </Pressable>
  )
}

function DayDetail({ day, lang, copy, t, touchTarget, onVisitPress, onTaskPress, teamMeetings }: {
  day: WeekDay
  lang: string
  copy: Copy
  t: (key: string, options?: any) => string
  touchTarget: number
  onVisitPress: (id: string, name: string) => void
  onTaskPress: (task: WeekTaskItem) => void
  teamMeetings: TeamMeeting[]
}) {
  const hasAgenda = day.visits.length > 0 || day.tasks.length > 0 || teamMeetings.length > 0
  return (
    <View>
      <Text style={styles.sectionEyebrow}>{copy.dayPlan}</Text>
      <View style={styles.detailHeadingRow}>
        <View style={[styles.largeDateTile, day.isToday && styles.dateTileToday]}>
          <Text style={[styles.largeDateNumber, day.isToday && styles.dateTextToday]}>{formatDayNumber(day.date)}</Text>
          <Text style={[styles.dateWeekday, day.isToday && styles.dateTextToday]}>{weekdayShort(day.date, lang)}</Text>
        </View>
        <View style={styles.detailHeadingCopy}>
          <Text style={styles.detailTitle}>{formatFullDate(day.date, lang)}</Text>
          <Text style={styles.detailSubtitle}>
            {day.isWorkingDay ? t("week.stopsTemplate", { n: day.plannedStops }) : day.nonWorkingReason || t("week.dayOff")}
          </Text>
        </View>
      </View>

      {day.isWorkingDay ? (
        <View style={styles.dayMetrics}>
          <DayMetric icon="navigate-outline" value={String(day.plannedStops)} label={copy.routeStops} />
          <DayMetric icon="checkmark-circle-outline" value={`${day.visitsCompleted}/${day.visitsTotal}`} label={copy.visitsDone} />
          <DayMetric icon="checkbox-outline" value={`${day.tasksCompleted}/${day.tasksTotal}`} label={copy.tasksDone} />
        </View>
      ) : hasAgenda ? (
        <DayOffNotice reason={day.nonWorkingReason || t("week.dayOff")} />
      ) : (
        <DayOffState reason={day.nonWorkingReason || t("week.dayOff")} />
      )}

      {(day.isWorkingDay || hasAgenda) && (
        <DayAgenda
          day={day}
          lang={lang}
          copy={copy}
          touchTarget={touchTarget}
          onVisitPress={onVisitPress}
          onTaskPress={onTaskPress}
          teamMeetings={teamMeetings}
        />
      )}
    </View>
  )
}

function PhoneDay({ day, lang, copy, t, touchTarget, onVisitPress, onTaskPress, teamMeetings, onLayout }: {
  day: WeekDay
  lang: string
  copy: Copy
  t: (key: string, options?: any) => string
  touchTarget: number
  onVisitPress: (id: string, name: string) => void
  onTaskPress: (task: WeekTaskItem) => void
  teamMeetings: TeamMeeting[]
  onLayout: (event: LayoutChangeEvent) => void
}) {
  const hasAgenda = day.visits.length > 0 || day.tasks.length > 0 || teamMeetings.length > 0
  return (
    <View style={[styles.phoneDay, day.isToday && styles.phoneDayToday]} onLayout={onLayout}>
      <View style={styles.phoneDayHeading}>
        <View style={[styles.dateTile, day.isToday && styles.dateTileToday]}>
          <Text style={[styles.dateWeekday, day.isToday && styles.dateTextToday]}>{weekdayShort(day.date, lang)}</Text>
          <Text style={[styles.dateNumber, day.isToday && styles.dateTextToday]}>{formatDayNumber(day.date)}</Text>
        </View>
        <View style={styles.phoneDayTitleBlock}>
          <View style={styles.daySelectorTitleRow}>
            <Text style={styles.phoneDayTitle}>{formatFullDate(day.date, lang)}</Text>
            {day.isToday && <Text style={styles.todayTag}>{copy.todayMarker}</Text>}
          </View>
          <Text style={styles.phoneDaySubtitle}>
            {day.isWorkingDay ? t("week.stopsTemplate", { n: day.plannedStops }) : day.nonWorkingReason || t("week.dayOff")}
          </Text>
        </View>
      </View>

      {day.isWorkingDay ? (
        <View style={styles.phoneMetrics}>
          <CompactMetric icon="navigate-outline" value={String(day.plannedStops)} label={copy.routeStops} />
          <CompactMetric icon="checkmark-circle-outline" value={`${day.visitsCompleted}/${day.visitsTotal}`} label={copy.visitsDone} />
          <CompactMetric icon="checkbox-outline" value={`${day.tasksCompleted}/${day.tasksTotal}`} label={copy.tasksDone} />
        </View>
      ) : hasAgenda ? (
        <DayOffNotice reason={day.nonWorkingReason || t("week.dayOff")} compact />
      ) : (
        <Text style={styles.dayOffText}>{day.nonWorkingReason || t("week.dayOff")}</Text>
      )}

      {(day.isWorkingDay || hasAgenda) && (
        <DayAgenda
          day={day}
          lang={lang}
          copy={copy}
          touchTarget={touchTarget}
          onVisitPress={onVisitPress}
          onTaskPress={onTaskPress}
          teamMeetings={teamMeetings}
          compact
        />
      )}
    </View>
  )
}

function DayMetric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.dayMetric}>
      <Icon name={icon} size={20} color={fieldTheme.color.primary} />
      <Text style={styles.dayMetricValue}>{value}</Text>
      <Text style={styles.dayMetricLabel}>{label}</Text>
    </View>
  )
}

function CompactMetric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.compactMetric}>
      <View style={styles.compactMetricTop}>
        <Icon name={icon} size={17} color={fieldTheme.color.primary} />
        <Text style={styles.compactMetricValue}>{value}</Text>
      </View>
      <Text style={styles.compactMetricLabel}>{label}</Text>
    </View>
  )
}

function DayAgenda({ day, lang, copy, touchTarget, onVisitPress, onTaskPress, teamMeetings, compact = false }: {
  day: WeekDay
  lang: string
  copy: Copy
  touchTarget: number
  onVisitPress: (id: string, name: string) => void
  onTaskPress: (task: WeekTaskItem) => void
  teamMeetings: TeamMeeting[]
  compact?: boolean
}) {
  const agendaEmpty = day.visitsTotal === 0
    && day.tasksTotal === 0
    && day.visits.length === 0
    && day.tasks.length === 0
    && teamMeetings.length === 0
  if (agendaEmpty) {
    return (
      <View style={[styles.agendaEmpty, compact && styles.agendaEmptyCompact]}>
        <Icon name="calendar-clear-outline" size={22} color={fieldTheme.color.inkMuted} />
        <View style={styles.noticeCopy}>
          <Text style={styles.visitEmptyTitle}>{copy.noAgenda}</Text>
          <Text style={styles.visitEmptyBody}>{copy.noAgendaBody}</Text>
        </View>
      </View>
    )
  }
  return (
    <>
      <AgendaSection
        icon="checkmark-circle-outline"
        label={copy.visitsShort}
        count={day.visitsTotal}
        compact={compact}
      >
        <VisitList
          day={day}
          copy={copy}
          touchTarget={touchTarget}
          onVisitPress={onVisitPress}
          compact={compact}
        />
      </AgendaSection>
      <AgendaSection
        icon="checkbox-outline"
        label={copy.tasksShort}
        count={day.tasksTotal}
        compact={compact}
      >
        <TaskList
          tasks={day.tasks}
          copy={copy}
          touchTarget={touchTarget}
          onTaskPress={onTaskPress}
          compact={compact}
        />
      </AgendaSection>
      {teamMeetings.length > 0 && (
        <AgendaSection
          icon="people-outline"
          label={copy.teamMeetings}
          count={teamMeetings.length}
          compact={compact}
        >
          <TeamMeetingList
            meetings={teamMeetings}
            copy={copy}
            lang={lang}
          />
        </AgendaSection>
      )}
    </>
  )
}

function AgendaSection({ icon, label, count, compact, children }: {
  icon: string
  label: string
  count: number
  compact: boolean
  children: React.ReactNode
}) {
  return (
    <View style={[styles.agendaSection, compact && styles.agendaSectionCompact]}>
      <View style={styles.agendaHeading}>
        <Icon name={icon} size={18} color={fieldTheme.color.primary} />
        <Text style={styles.agendaHeadingText}>{label}</Text>
        <View style={styles.agendaCount}>
          <Text style={styles.agendaCountText}>{count}</Text>
        </View>
      </View>
      {children}
    </View>
  )
}

function TeamMeetingList({ meetings, copy, lang }: {
  meetings: TeamMeeting[]
  copy: Copy
  lang: string
}) {
  const timezone = useBootstrapStore((state) => state.data?.timezone)
  const safeTimezone = useMemo(() => normalizeGpsTimeZone(timezone), [timezone])
  const [visibleCount, setVisibleCount] = useState(3)
  useEffect(() => setVisibleCount(3), [meetings])
  const visibleMeetings = meetings.slice(0, visibleCount)
  const remaining = Math.max(0, meetings.length - visibleMeetings.length)

  return (
    <View style={styles.visitList}>
      {visibleMeetings.map((meeting) => {
        const status = teamMeetingStatusPresentation(meeting, copy)
        return (
          <View key={meeting.id} style={styles.teamMeetingRow}>
          <View style={styles.teamMeetingAvatar}>
            <Icon name="person-outline" size={19} color={fieldTheme.color.violet} />
          </View>
          <View style={styles.visitCopy}>
            <View style={styles.teamMeetingTopLine}>
              <Text style={styles.teamMeetingAgent} numberOfLines={1}>{meeting.agent.name}</Text>
              <View style={styles.teamMeetingTimeBadge}>
                <Icon name="time-outline" size={13} color={fieldTheme.color.violet} />
                <Text style={styles.teamMeetingTime}>
                  {formatMeetingTime(meeting.plannedTime, lang, copy.timeTbd, safeTimezone)}
                </Text>
              </View>
            </View>
            <Text style={styles.teamMeetingCustomer} numberOfLines={2}>{meeting.customerName}</Text>
            <View style={[styles.teamMeetingStatus, { backgroundColor: status.fill }]}>
              <Icon name={status.icon} size={13} color={status.ink} />
              <Text style={[styles.teamMeetingStatusText, { color: status.ink }]}>{status.label}</Text>
            </View>
            {meeting.contactName ? (
              <Text style={styles.teamMeetingMeta}>
                {copy.contact}: {meeting.contactName}
              </Text>
            ) : null}
            <View style={styles.teamMeetingLocation}>
              <Icon name="location-outline" size={14} color={fieldTheme.color.inkMuted} />
              <Text style={[styles.teamMeetingMeta, styles.teamMeetingLocationText]}>
                {meetingPlace(meeting, copy.placeTbd)}
              </Text>
            </View>
          </View>
          </View>
        )
      })}
      {remaining > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.showMoreMeetings}: ${remaining}`}
          onPress={() => setVisibleCount((current) => Math.min(meetings.length, current + 25))}
          style={({ pressed }) => [styles.teamMeetingMoreButton, pressed && styles.pressed]}
        >
          <Icon name="chevron-down" size={17} color={fieldTheme.color.primary} />
          <Text style={styles.teamMeetingMoreText}>{copy.showMoreMeetings} ({remaining})</Text>
        </Pressable>
      ) : visibleCount > 3 && meetings.length > 3 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.collapseMeetings}
          onPress={() => setVisibleCount(3)}
          style={({ pressed }) => [styles.teamMeetingMoreButton, pressed && styles.pressed]}
        >
          <Icon name="chevron-up" size={17} color={fieldTheme.color.primary} />
          <Text style={styles.teamMeetingMoreText}>{copy.collapseMeetings}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.teamMeetingHint}>{copy.teamMeetingsHint}</Text>
    </View>
  )
}

function TaskList({ tasks, copy, touchTarget, onTaskPress, compact = false }: {
  tasks: WeekTaskItem[]
  copy: Copy
  touchTarget: number
  onTaskPress: (task: WeekTaskItem) => void
  compact?: boolean
}) {
  if (tasks.length === 0) {
    return (
      <View style={[styles.visitEmpty, compact && styles.visitEmptyCompact]}>
        <Icon name="checkbox-outline" size={22} color={fieldTheme.color.inkMuted} />
        <View style={styles.noticeCopy}>
          <Text style={styles.visitEmptyTitle}>{copy.noTasks}</Text>
          {!compact && <Text style={styles.visitEmptyBody}>{copy.noTasksBody}</Text>}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.visitList}>
      {tasks.map((task) => {
        const status = taskStatusPresentation(task, copy)
        const priority = taskPriorityPresentation(task.priority, copy)
        const title = task.title || copy.untitledTask
        const customerName = task.customer?.name || null
        return (
          <Pressable
            key={task.id}
            accessibilityRole="button"
            accessibilityLabel={[
              copy.openTask,
              title,
              status.label,
              priority.label,
              customerName,
            ].filter(Boolean).join(", ")}
            onPress={() => onTaskPress(task)}
            style={({ pressed }) => [
              styles.taskRow,
              { minHeight: touchTarget },
              pressed && styles.visitRowPressed,
            ]}
          >
            <View style={[styles.taskStatusIcon, { backgroundColor: status.fill }]}>
              <Icon name={status.icon} size={21} color={status.ink} />
            </View>
            <View style={styles.visitCopy}>
              <Text style={styles.taskTitle} numberOfLines={2}>{title}</Text>
              {task.description ? (
                <Text style={styles.taskDescription} numberOfLines={compact ? 1 : 2}>{task.description}</Text>
              ) : null}
              <View style={styles.taskSignals}>
                <View style={[styles.taskSignal, { backgroundColor: status.fill }]}>
                  <Text style={[styles.taskSignalText, { color: status.ink }]}>{status.label}</Text>
                </View>
                <View style={[styles.taskSignal, { backgroundColor: priority.fill }]}>
                  <Icon name="flag-outline" size={13} color={priority.ink} />
                  <Text style={[styles.taskSignalText, { color: priority.ink }]}>{copy.priorityLabel}: {priority.label}</Text>
                </View>
              </View>
              {customerName ? (
                <View style={styles.taskCustomer}>
                  <Icon name="business-outline" size={14} color={fieldTheme.color.inkMuted} />
                  <Text style={styles.taskCustomerText} numberOfLines={1}>{copy.client}: {customerName}</Text>
                </View>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
          </Pressable>
        )
      })}
    </View>
  )
}

function VisitList({ day, copy, touchTarget, onVisitPress, compact = false }: {
  day: WeekDay
  copy: Copy
  touchTarget: number
  onVisitPress: (id: string, name: string) => void
  compact?: boolean
}) {
  if (day.visits.length === 0) {
    return (
      <View style={[styles.visitEmpty, compact && styles.visitEmptyCompact]}>
        <Icon name="calendar-clear-outline" size={22} color={fieldTheme.color.inkMuted} />
        <View style={styles.noticeCopy}>
          <Text style={styles.visitEmptyTitle}>{copy.noVisits}</Text>
          {!compact && <Text style={styles.visitEmptyBody}>{copy.noVisitsBody}</Text>}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.visitList}>
      {day.visits.map((visit) => {
        const completed = visit.status === "CHECKED_OUT"
        return (
          <Pressable
            key={visit.id}
            accessibilityRole="button"
            accessibilityLabel={`${copy.openVisit}: ${visit.name}`}
            onPress={() => onVisitPress(visit.id, visit.name)}
            style={({ pressed }) => [
              styles.visitRow,
              compact && styles.visitRowCompact,
              { minHeight: touchTarget },
              pressed && styles.visitRowPressed,
            ]}
          >
            <Icon
              name={completed ? "checkmark-circle" : "time-outline"}
              size={21}
              color={completed ? fieldTheme.color.success : fieldTheme.color.blue}
            />
            <View style={styles.visitCopy}>
              <Text style={styles.visitName} numberOfLines={2}>{visit.name || copy.openVisit}</Text>
              <Text style={[styles.visitStatus, completed && styles.visitStatusDone]}>
                {completed ? copy.completed : copy.planned}
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
          </Pressable>
        )
      })}
    </View>
  )
}

function DayOffNotice({ reason, compact = false }: { reason: string; compact?: boolean }) {
  return (
    <View style={[styles.dayOffNotice, compact && styles.dayOffNoticeCompact]}>
      <Icon name="moon-outline" size={20} color={fieldTheme.color.inkMuted} />
      <Text style={styles.dayOffNoticeText}>{reason}</Text>
    </View>
  )
}

function DayOffState({ reason }: { reason: string }) {
  return (
    <View style={styles.dayOffState}>
      <Icon name="moon-outline" size={24} color={fieldTheme.color.inkMuted} />
      <Text style={styles.dayOffStateText}>{reason}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.surface,
    paddingBottom: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: fieldTheme.color.border,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  titleBlock: { flex: 1, paddingTop: 2 },
  headerTitle: { color: fieldTheme.color.ink, fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  headerSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  todayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.primary,
  },
  todayButtonCurrent: { backgroundColor: fieldTheme.color.primarySoft },
  todayButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  todayButtonTextCurrent: { color: fieldTheme.color.primary },
  weekNavigation: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  navButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surfaceStrong,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  rangeBlock: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  rangeLabel: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 22, fontWeight: "800", textTransform: "capitalize" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.4 },
  scroll: { padding: fieldTheme.space.lg },
  scrollTablet: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: fieldTheme.space.xl },
  center: { flex: 1, minHeight: 300, justifyContent: "center", alignItems: "center", padding: fieldTheme.space.xl },
  stateIconSoft: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primarySoft,
  },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 26, fontWeight: "800", textAlign: "center", marginTop: fieldTheme.space.lg },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 430, marginTop: fieldTheme.space.sm },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.xl,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
    marginTop: fieldTheme.space.xl,
  },
  primaryButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "800" },
  offlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.amberSoft,
    borderWidth: 1,
    borderColor: "#E8D69D",
    marginBottom: fieldTheme.space.lg,
  },
  offlineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surface,
  },
  noticeCopy: { flex: 1 },
  offlineTitle: { color: fieldTheme.color.amber, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  offlineBody: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, marginTop: 2 },
  ownRoutePlanner: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
    marginBottom: fieldTheme.space.lg,
  },
  ownRoutePlannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surface,
  },
  ownRoutePlannerCopy: { flex: 1, minWidth: 0 },
  ownRoutePlannerTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  ownRoutePlannerBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  summarySection: { marginBottom: fieldTheme.space.xl },
  teamScheduleNotice: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    marginBottom: fieldTheme.space.xl,
  },
  teamScheduleNoticeWarning: { backgroundColor: fieldTheme.color.amberSoft },
  teamScheduleNoticeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  sectionEyebrow: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: fieldTheme.space.sm },
  summaryStrip: {
    flexDirection: "column",
    gap: fieldTheme.space.sm,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  summaryStripTablet: { flexDirection: "row" },
  summaryMetric: { flex: 1, minHeight: 62, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.sm },
  metricIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  metricCopy: { flex: 1 },
  metricValue: { fontSize: 20, lineHeight: 24, fontWeight: "900" },
  metricLabel: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 1 },
  tabletWorkspace: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.lg },
  dayMaster: { width: "38%", gap: fieldTheme.space.sm },
  dayDetail: {
    flex: 1,
    minHeight: 460,
    padding: fieldTheme.space.xl,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  chooseDay: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 120 },
  daySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  daySelectorSelected: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary },
  dateTile: { width: 52, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surfaceStrong },
  dateTileToday: { backgroundColor: fieldTheme.color.primary },
  dateWeekday: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 13, fontWeight: "800", textTransform: "uppercase" },
  dateNumber: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 25, fontWeight: "900" },
  dateTextToday: { color: fieldTheme.color.onColor },
  daySelectorCopy: { flex: 1, minWidth: 0 },
  daySelectorTitleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  daySelectorTitle: { flex: 1, minWidth: 0, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800", textTransform: "capitalize" },
  daySelectorMeta: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  todayTag: { color: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, lineHeight: 13, fontWeight: "800" },
  detailHeadingRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.lg },
  largeDateTile: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  largeDateNumber: { color: fieldTheme.color.ink, fontSize: 30, lineHeight: 34, fontWeight: "900" },
  detailHeadingCopy: { flex: 1 },
  detailTitle: { color: fieldTheme.color.ink, fontSize: 22, lineHeight: 28, fontWeight: "900", textTransform: "capitalize" },
  detailSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  dayMetrics: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.xl },
  dayMetric: { flex: 1, minHeight: 106, justifyContent: "center", padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  dayMetricValue: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 24, fontWeight: "900", marginTop: fieldTheme.space.sm },
  dayMetricLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 2 },
  phoneDays: { gap: fieldTheme.space.md },
  phoneDay: { padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  phoneDayToday: { borderColor: fieldTheme.color.primary },
  phoneDayHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  phoneDayTitleBlock: { flex: 1, minWidth: 0 },
  phoneDayTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 16, lineHeight: 21, fontWeight: "900", textTransform: "capitalize" },
  phoneDaySubtitle: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  phoneMetrics: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  compactMetric: { flex: 1, minHeight: 68, justifyContent: "center", paddingHorizontal: fieldTheme.space.sm, paddingVertical: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surfaceStrong },
  compactMetricTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  compactMetricValue: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  compactMetricLabel: { color: fieldTheme.color.inkMuted, fontSize: 9, lineHeight: 12, fontWeight: "600", marginTop: 3 },
  agendaSection: { marginTop: fieldTheme.space.xl, gap: fieldTheme.space.sm },
  agendaSectionCompact: { marginTop: fieldTheme.space.lg },
  agendaEmpty: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong, marginTop: fieldTheme.space.xl },
  agendaEmptyCompact: { marginTop: fieldTheme.space.lg },
  agendaHeading: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  agendaHeadingText: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  agendaCount: { minWidth: 28, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  agendaCountText: { color: fieldTheme.color.primary, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  visitList: { gap: fieldTheme.space.sm },
  teamMeetingRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.violetSoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  teamMeetingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surface,
  },
  teamMeetingTopLine: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  teamMeetingAgent: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  teamMeetingTimeBadge: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.surface,
  },
  teamMeetingTime: { color: fieldTheme.color.violet, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  teamMeetingCustomer: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900", marginTop: 4 },
  teamMeetingStatus: {
    alignSelf: "flex-start",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: fieldTheme.radius.pill,
    marginTop: 6,
  },
  teamMeetingStatusText: { fontSize: 10, lineHeight: 14, fontWeight: "900" },
  teamMeetingLocation: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 4 },
  teamMeetingMeta: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 2 },
  teamMeetingLocationText: { flex: 1 },
  teamMeetingMoreButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  teamMeetingMoreText: { color: fieldTheme.color.primary, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  teamMeetingHint: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "600", paddingHorizontal: 2 },
  visitRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  visitRowCompact: { marginTop: 0 },
  visitRowPressed: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary },
  visitCopy: { flex: 1, minWidth: 0 },
  visitName: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  visitStatus: { color: fieldTheme.color.blue, fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  visitStatusDone: { color: fieldTheme.color.success },
  visitEmpty: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  visitEmptyCompact: { minHeight: 56 },
  visitEmptyTitle: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  visitEmptyBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  taskStatusIcon: { width: 40, height: 40, flexShrink: 0, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  taskTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  taskDescription: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  taskSignals: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: fieldTheme.space.sm },
  taskSignal: { minHeight: 26, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill },
  taskSignalText: { fontSize: 10, lineHeight: 14, fontWeight: "800" },
  taskCustomer: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: fieldTheme.space.sm },
  taskCustomerText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  dayOffText: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: fieldTheme.space.md },
  dayOffNotice: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong, marginTop: fieldTheme.space.xl },
  dayOffNoticeCompact: { marginTop: fieldTheme.space.md },
  dayOffNoticeText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  dayOffState: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, marginTop: fieldTheme.space.xl, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  dayOffStateText: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, fontWeight: "700" },
})
