import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useBootstrapStore } from "../../store/bootstrap"
import { useHintsStore } from "../../store/hints"
import { fieldTheme } from "../../theme/fieldTheme"
import { fieldEligibilityReasonKey, type FieldEligibilityReason } from "../../lib/field-eligibility-reason"
import { fieldContactsEnabled, plannableTargetTypes } from "../../lib/field-contacts-policy"
import { isExpandedTabletWidth, isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { upperFirst } from "../../lib/upper"
import { api } from "../../services/api"
import { ask, notify } from "../../services/app-feedback"
import { useSyncStatusStore } from "../../store/sync-status"
import {
  DEFAULT_MOBILE_ROUTE_TARGET_TYPES,
  mobileRouteTargetLabel,
  type MobileRouteTargetType,
} from "../../services/bootstrap"
import {
  assignPlanningTarget,
  buildPlanningRouteWrites,
  copyPlanningDay,
  editablePlanningTargets,
  invalidPlanningAssignmentDates,
  lockedPlanningDates,
  lockedPlanningTargetCells,
  movePlanningTarget,
  planningCopyTargetDates,
  planningDateKeys,
  planningDraftConflictDates,
  planningPublishConflictDates,
  planningTargetForDate,
  planningTodayKey,
  planningWriteConflictDates,
  publishablePlanningDrafts,
  removePlanningTarget,
  toPlanningDetailedRoute,
  type PlanningAgent,
  type PlanningAssignedTarget,
  type PlanningDetailedRoute,
  type PlanningHorizon,
  type PlanningTarget,
} from "../../services/manager-planning"
import { planningMonthGrid, shiftPlanningMonth, nextPlanningWorkday, type PlanningMonthDay } from "../../services/planning-month"
import {
  buildUpdatePublishedPoints,
  isPublishedStopLocked,
  publishedRouteEditAvailability,
  publishedRouteEditChanged,
  publishedRouteEditErrorOutcome,
  publishedRouteEditProblemKey,
  publishedRouteEditStops,
  publishedRouteForDay,
  publishedStopKeysForPointIds,
  validatePublishedRouteEdit,
  type PublishedRoutePoint,
} from "../../services/published-route-edit"

// One-screen plan (owner decision 2026-09-14): the review step repeated the
// fill step — same day list, same day editor — and only added the save choice.
type PlanningStep = 1 | 2
type SaveMode = "draft" | "publish"

/**
 * The planner core deliberately receives its agent source instead of reading
 * manager/team state itself. Route Field passes one authenticated AGENT; the
 * legacy manager shell supplies its separately-authorized team loader.
 */
export type PlanningWorkspaceAgentSource =
  | { kind: "self"; agent: PlanningAgent | null }
  | { kind: "team"; loadAgents: () => Promise<PlanningAgent[]> }

/**
 * The core accepts a page source instead of deciding which catalog contract is
 * safe. Route Field supplies its date-bound v2, opaque-cursor lookup; the
 * inactive manager shell keeps its legacy adapter outside the Android graph.
 */
export type PlanningWorkspaceTargetQuery = {
  kind: "organization" | "contact"
  date: string
  search?: string
  objectType?: string
  organizationKind?: string
  continuation?: string | null
}

export type PlanningWorkspaceTargetPage = {
  targets: PlanningTarget[]
  total?: number | null
  nextPage?: string | null
  /**
   * Why the page is empty, when the server could say. Absent means it could
   * not — a search that matched nothing is not "no assignments", and the
   * shared vocabulary has no word for it (audit A2, B8).
   */
  eligibility?: FieldEligibilityReason | null
}

export type PlanningWorkspaceTargetSource = {
  loadTargets: (
    query: PlanningWorkspaceTargetQuery,
    signal?: AbortSignal,
  ) => Promise<PlanningWorkspaceTargetPage>
}

/**
 * The core deliberately receives its write transport. Route Field injects
 * the durable self-command journal; legacy manager code remains in its own
 * unreachable adapter instead of leaking direct writes into the APK graph.
 */
export type PlanningWorkspaceWriteSource = {
  saveDraft: (input: {
    agentId: string
    date: string
    routeId?: string
    expectedVersion?: number
    points: Array<{ customerId: string; contactId?: string | null; plannedTime?: string | null }>
  }) => Promise<{ routeId: string; version: number }>
  publishDraft: (input: { routeId: string; expectedVersion: number }) => Promise<void>
}

/**
 * «Planı dəyiş» for a published day. Only Route Field's self planner supplies
 * it; the legacy team planner has no such source, so its published days stay
 * read-only exactly as before.
 */
export type PlanningWorkspacePublishedEditSource = {
  role: string | null | undefined
  canPlanOwnRoutes: boolean
  updatePublished: (input: {
    routeId: string
    expectedVersion: number
    points: PublishedRoutePoint[]
  }) => Promise<{ version: number }>
}

type PublishedEditSession = {
  routeId: string
  date: string
  version: number
  /** The day as published, to tell a change from none and locked stops from new ones. */
  original: PlanningAssignedTarget[]
}

type PlanningTargetContinuation = {
  cursor: string
  queryKey: string
}

export type PlanningWorkspaceCoreProps = {
  onClose?: () => void
  agentSource: PlanningWorkspaceAgentSource
  targetSource: PlanningWorkspaceTargetSource
  writeSource: PlanningWorkspaceWriteSource
  initialDate?: string
  initialHorizon?: PlanningHorizon
  publishedEditSource?: PlanningWorkspacePublishedEditSource
  /** Open the published route of initialDate straight in the editor (Route tab). */
  initialEditPublished?: boolean
}

const SELF_PLANNER_COPY = {
  ru: {
    eyebrow: "Мой план",
    title: "Маршрут на день",
    daySubtitle: "Выберите дату и клиентов.",
    weekSubtitle: "Выберите начало недели, добавьте клиентов и распределите визиты по семи дням.",
    routeDate: "Дата маршрута",
    chooseTargets: "Кого посетить?",
    saveRoute: "Сохранить маршрут",
    savingRoute: "Сохраняем маршрут…",
    savedRoute: "Маршрут сохранён",
    searchPlaceholder: "Имя, организация, специальность или адрес…",
    scopeNote: "Показываются только точки, подтверждённые для вас на выбранную дату. При сохранении сервер проверит их ещё раз.",
  },
  az: {
    eyebrow: "Mənim planım",
    title: "Günlük marşrut",
    daySubtitle: "Tarixi və müştəriləri seçin.",
    weekSubtitle: "Həftənin başlanğıcını seçin, müştəriləri əlavə edin və ziyarətləri yeddi gün üzrə bölüşdürün.",
    routeDate: "Marşrut tarixi",
    chooseTargets: "Kimə baş çəkəcəksiniz?",
    saveRoute: "Marşrutu yadda saxla",
    savingRoute: "Marşrut saxlanılır…",
    savedRoute: "Marşrut yadda saxlanıldı",
    searchPlaceholder: "Ad, təşkilat, ixtisas və ya ünvan…",
    scopeNote: "Yalnız seçilmiş tarix üçün sizə təsdiqlənmiş nöqtələr göstərilir. Saxlayarkən server onları yenidən yoxlayacaq.",
  },
  en: {
    eyebrow: "My plan",
    title: "Daily route",
    daySubtitle: "Choose a date and customers.",
    weekSubtitle: "Choose the start of the week, add customers, and distribute visits across seven days.",
    routeDate: "Route date",
    chooseTargets: "Who will you visit?",
    saveRoute: "Save route",
    savingRoute: "Saving route…",
    savedRoute: "Route saved",
    searchPlaceholder: "Name, organization, specialty, or address…",
    scopeNote: "Only stops confirmed for you on the selected date are shown. The server validates them again when you save.",
  },
} as const

function selfPlannerLanguage(language: string): keyof typeof SELF_PLANNER_COPY {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function formatPlanDate(value: string, language: string, compact = false): string {
  return upperFirst(formatLocalizedDate(value, language, compact
    ? { day: "numeric", month: "long", timeZone: "UTC" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), language)
}

/** "B.e." / "Пн" / "Mon": a day tile's label, in the reader's language. */
function weekdayShort(date: string, language: string): string {
  return upperFirst(formatLocalizedDate(date, language, { weekday: "short", timeZone: "UTC" }), language)
}

function uniqueTargets(assignments: PlanningTarget[], routes: PlanningDetailedRoute[]): PlanningTarget[] {
  const byKey = new Map<string, PlanningTarget>()
  routes
    .filter((route) => route.status !== "DRAFT")
    .forEach((route) => route.points.forEach((target) => byKey.set(target.key, target)))
  assignments.forEach((target) => byKey.set(target.key, target))
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function targetsForPlanningDay(
  date: string,
  assignments: PlanningAssignedTarget[],
  routes: PlanningDetailedRoute[],
): PlanningAssignedTarget[] {
  const byKey = new Map<string, PlanningAssignedTarget>()
  routes
    .filter((route) => route.date === date && route.status !== "DRAFT")
    .forEach((route) => route.points.forEach((target) => byKey.set(target.key, { ...target, date })))
  assignments
    .filter((target) => target.date === date)
    .forEach((target) => byKey.set(target.key, target))
  return [...byKey.values()]
}

function targetTypeIcon(target: MobileRouteTargetType): string {
  if (target.direction === "DOCTOR") return "person-outline"
  if (target.direction === "PHARMACY") return "medkit-outline"
  if (target.objectType === "CLINIC") return "medical-outline"
  return "business-outline"
}

function detailedRoutesFromResponses(responses: any[]): PlanningDetailedRoute[] {
  return responses.flatMap((response: any) => {
    const rows: unknown[] = Array.isArray(response?.data?.routes) ? response.data.routes : []
    return rows.map(toPlanningDetailedRoute).filter((route): route is PlanningDetailedRoute => route !== null)
  })
}

function planningError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

export default function PlanningWorkspaceCore({
  onClose,
  agentSource,
  targetSource,
  writeSource,
  initialDate,
  initialHorizon,
  publishedEditSource,
  initialEditPublished,
}: PlanningWorkspaceCoreProps) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const safeAreaInsets = useSafeAreaInsets()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const tenantTimezone = useBootstrapStore((state) => state.data?.timezone)
  const configuredTargetTypes = useBootstrapStore((state) => state.data?.routeTargetTypes)
  const contactsEnabled = useBootstrapStore((state) => fieldContactsEnabled(state.data?.policies))
  const selfPlanning = agentSource.kind === "self"
  const selfCopy = SELF_PLANNER_COPY[selfPlannerLanguage(i18n.language)]
  const [clock, setClock] = useState(() => new Date())
  const today = useMemo(() => planningTodayKey(clock, tenantTimezone), [clock, tenantTimezone])
  const [step, setStep] = useState<PlanningStep>(() => selfPlanning ? 2 : 1)
  const [forcedHelpStep, setForcedHelpStep] = useState<PlanningStep | null>(null)
  const [anchor, setAnchor] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(initialDate ?? "") ? initialDate as string : today)
  const [horizon, setHorizon] = useState<PlanningHorizon>(() => selfPlanning ? 1 : initialHorizon ?? 7)
  const dates = useMemo(() => planningDateKeys(anchor, horizon), [anchor, horizon])
  const singleDay = horizon === 1
  const routeTargetTypes = useMemo(
    () => plannableTargetTypes(
      configuredTargetTypes?.filter((target) => target.enabled) ?? DEFAULT_MOBILE_ROUTE_TARGET_TYPES,
      DEFAULT_MOBILE_ROUTE_TARGET_TYPES,
      contactsEnabled,
    ),
    [configuredTargetTypes, contactsEnabled],
  )
  const [agents, setAgents] = useState<PlanningAgent[]>([])
  const [agentId, setAgentId] = useState("")
  const [routes, setRoutes] = useState<PlanningDetailedRoute[]>([])
  const [assignments, setAssignments] = useState<PlanningAssignedTarget[]>([])
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(() => new Set())
  const [activeDate, setActiveDate] = useState(anchor)
  const [targetTypeId, setTargetTypeId] = useState("")
  const [targetSearch, setTargetSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [targetResults, setTargetResults] = useState<PlanningTarget[]>([])
  const [targetTotal, setTargetTotal] = useState<number | null>(null)
  const [targetNextPage, setTargetNextPage] = useState<PlanningTargetContinuation | null>(null)
  const [targetEligibility, setTargetEligibility] = useState<FieldEligibilityReason | null>(null)
  const [targetReload, setTargetReload] = useState(0)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [loadingMoreTargets, setLoadingMoreTargets] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [agentError, setAgentError] = useState(false)
  const [planError, setPlanError] = useState(false)
  const [targetError, setTargetError] = useState(false)
  const [targetMoreError, setTargetMoreError] = useState(false)
  const [canPublish, setCanPublish] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>("draft")
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null)
  // The result is shown at the top of the scroll, and the save button is at
  // the bottom. On the phone the manager saw only the dock's «Saxlanacaq
  // qaralama yoxdur.» — which reads as a failure — while «1 qaralama
  // saxlanıldı.» sat above the fold (2026-09-13). Bring the result into view.
  const workspaceScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null)
  useEffect(() => {
    if (saveMessage) workspaceScrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [saveMessage])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const hintsEnabled = useHintsStore((state) => state.enabled)
  const dismissedHints = useHintsStore((state) => state.dismissed)
  const hintsHydrated = useHintsStore((state) => state.hydrated)
  const dismissHint = useHintsStore((state) => state.dismiss)
  const planRequest = useRef(0)
  const saveRequest = useRef(0)
  const targetRequest = useRef(0)
  const targetMoreInFlight = useRef(false)
  const targetMoreController = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  const contextVersion = useRef(0)
  const previousToday = useRef(today)
  const online = useSyncStatusStore((state) => state.online)
  const [editSession, setEditSession] = useState<PublishedEditSession | null>(null)
  const [editStops, setEditStops] = useState<PlanningAssignedTarget[]>([])
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(() => new Set())
  const autoEditPending = useRef(Boolean(initialEditPublished))
  const editing = editSession !== null

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId) ?? null, [agentId, agents])
  const activeTargetType = useMemo(
    () => routeTargetTypes.find((target) => target.id === targetTypeId) ?? routeTargetTypes[0],
    [routeTargetTypes, targetTypeId],
  )
  const targetKind = activeTargetType?.direction === "DOCTOR" ? "contact" : "organization"
  const targetQuery = useMemo<PlanningWorkspaceTargetQuery>(() => ({
    kind: targetKind,
    date: activeDate,
    search: debouncedSearch || undefined,
    ...(targetKind === "organization" ? {
      objectType: activeTargetType?.objectType ?? undefined,
      organizationKind: activeTargetType?.organizationKind ?? undefined,
    } : {}),
  }), [activeDate, activeTargetType?.objectType, activeTargetType?.organizationKind, debouncedSearch, targetKind])
  // A server cursor is opaque and scoped to every one of these fields. Keep a
  // local provenance key as well, so a render immediately after a date/filter
  // change cannot offer a stale continuation before the fetching effect resets
  // its state.
  const targetQueryKey = useMemo(() => JSON.stringify([
    targetQuery.kind,
    targetQuery.date,
    targetQuery.search ?? "",
    targetQuery.objectType ?? "",
    targetQuery.organizationKind ?? "",
  ]), [targetQuery])
  const hasMoreTargets = targetNextPage?.queryKey === targetQueryKey
  const showTargetMoreError = targetMoreError && hasMoreTargets
  const lockedDates = useMemo(() => new Set(lockedPlanningDates(routes)), [routes])
  const lockedCells = useMemo(() => new Set(lockedPlanningTargetCells(routes)), [routes])
  const multipleDraftDates = useMemo(() => planningDraftConflictDates(routes, agentId), [agentId, routes])
  const invalidAssignmentDates = useMemo(() => invalidPlanningAssignmentDates(assignments), [assignments])
  const matrixTargets = useMemo(() => uniqueTargets(assignments, routes), [assignments, routes])
  const mutableTargetCount = useMemo(() => new Set(assignments.map((target) => target.key)).size, [assignments])
  const editingActiveDate = editSession !== null && editSession.date === activeDate
  const activeDayTargets = useMemo(
    () => editingActiveDate ? editStops : targetsForPlanningDay(activeDate, assignments, routes),
    [activeDate, assignments, editStops, editingActiveDate, routes],
  )
  const activeDateEditable = editingActiveDate || (
    !editing && activeDate >= today && !lockedDates.has(activeDate) && !multipleDraftDates.includes(activeDate)
  )
  // The published route of the day on screen, when this planner may change it.
  const activePublishedRoute = useMemo(
    () => publishedEditSource && agentId && activeDate >= today ? publishedRouteForDay(routes, activeDate, agentId) : null,
    [activeDate, agentId, publishedEditSource, routes, today],
  )
  const activeEditAvailability = activePublishedRoute && publishedEditSource
    ? publishedRouteEditAvailability({
        role: publishedEditSource.role,
        canPlanOwnRoutes: publishedEditSource.canPlanOwnRoutes,
        agentId,
        routeAgentId: activePublishedRoute.agentId,
        status: activePublishedRoute.status,
        version: activePublishedRoute.version,
        online,
      })
    : "unavailable"
  const editLockedCells = useMemo(
    () => editSession
      ? new Set(editStops.filter(isPublishedStopLocked).map((stop) => `${editSession.date}|${stop.key}`))
      : null,
    [editSession, editStops],
  )
  const editChanged = editSession ? publishedRouteEditChanged(editSession.original, editStops) : false
  const editProblem = editSession ? validatePublishedRouteEdit(editSession.original, editStops) : null
  const planningHintId = `planning.${singleDay ? "day" : "week"}.step.${step}`
  const planningHelpKey = step === 1
    ? (singleDay ? "managerShell.planHelpDayStep1" : "managerShell.planHelpWeekStep1")
    : (singleDay ? "managerShell.planHelpDayStep2" : "managerShell.planHelpWeekStep2")
  // The plan screen explained itself three times over (coach, section intro,
  // card subtitle). It opens clean; the "?" in the header still brings the
  // hint back.
  const plannerHelpVisible = !selfPlanning && (forcedHelpStep === step || (
    step === 1 && hintsHydrated && hintsEnabled && !dismissedHints.includes(planningHintId)
  ))

  useEffect(() => {
    const refreshClock = () => setClock(new Date())
    const timer = setInterval(refreshClock, 60_000)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshClock()
    })
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (saving) return
    const previous = previousToday.current
    previousToday.current = today
    if (today !== previous) setAnchor((current) => current === previous ? today : current)
  }, [saving, today])

  useEffect(() => () => {
    planRequest.current += 1
    saveRequest.current += 1
    targetRequest.current += 1
    targetMoreController.current?.abort()
    contextVersion.current += 1
  }, [])

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true)
    setAgentError(false)
    if (agentSource.kind === "self") {
      if (!agentSource.agent) {
        setAgents([])
        setAgentId("")
        setAgentError(true)
      } else {
        const self = agentSource.agent
        setAgents([self])
        setAgentId(self.id)
      }
      setLoadingAgents(false)
      return
    }
    try {
      setAgents(await agentSource.loadAgents())
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setAgentError(true)
    } finally {
      setLoadingAgents(false)
    }
  }, [agentSource])

  const loadPlan = useCallback(async (selectedAgentId: string, selectedDates: string[], preserve = false): Promise<PlanningDetailedRoute[] | null> => {
    if (!selectedAgentId) return null
    const requestId = ++planRequest.current
    setLoadingPlan(true)
    setPlanError(false)
    if (!preserve) {
      setRoutes([])
      setAssignments([])
    }
    try {
      const responses = await Promise.all(selectedDates.map((date) => api.getRoutesForAgent(date, selectedAgentId)))
      if (requestId !== planRequest.current) return null
      const nextRoutes = detailedRoutesFromResponses(responses)
      setRoutes(nextRoutes)
      setAssignments(editablePlanningTargets(nextRoutes, selectedAgentId))
      setDirtyDates(new Set())
      setCanPublish(responses.some((response: any) => response?.data?.capabilities?.canPublish === true))
      setUpdatedAt(Date.now())
      return nextRoutes
    } catch (error: any) {
      if (requestId !== planRequest.current || error?.message === "SESSION_EXPIRED") return null
      setPlanError(true)
      return null
    } finally {
      if (requestId === planRequest.current) setLoadingPlan(false)
    }
  }, [])

  useEffect(() => { void loadAgents() }, [loadAgents])

  useEffect(() => {
    if (!agentId) return
    void loadPlan(agentId, dates)
  }, [agentId, dates, loadPlan])

  useEffect(() => {
    if (!dates.includes(activeDate)) setActiveDate(dates[0])
  }, [activeDate, dates])

  useEffect(() => {
    if (!activeTargetType && routeTargetTypes[0]) setTargetTypeId(routeTargetTypes[0].id)
    else if (activeTargetType && targetTypeId !== activeTargetType.id) setTargetTypeId(activeTargetType.id)
  }, [activeTargetType, routeTargetTypes, targetTypeId])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(targetSearch.trim()), 350)
    return () => clearTimeout(timer)
  }, [targetSearch])

  useEffect(() => {
    if (step !== 2) {
      targetRequest.current += 1
      targetMoreController.current?.abort()
      targetMoreController.current = null
      return
    }
    targetMoreController.current?.abort()
    targetMoreController.current = null
    const controller = new AbortController()
    const requestId = ++targetRequest.current
    setLoadingTargets(true)
    setLoadingMoreTargets(false)
    setTargetError(false)
    setTargetMoreError(false)
    setTargetResults([])
    setTargetTotal(null)
    setTargetNextPage(null)
    setTargetEligibility(null)
    targetSource.loadTargets(targetQuery, controller.signal).then((page) => {
      if (controller.signal.aborted || requestId !== targetRequest.current) return
      setTargetResults(page.targets)
      setTargetTotal(typeof page.total === "number" && Number.isFinite(page.total) ? page.total : null)
      const nextPage = typeof page.nextPage === "string" && page.nextPage ? page.nextPage : null
      setTargetNextPage(nextPage ? { cursor: nextPage, queryKey: targetQueryKey } : null)
      setTargetEligibility(page.eligibility ?? null)
    }).catch((error: any) => {
      if (!controller.signal.aborted && requestId === targetRequest.current && error?.message !== "SESSION_EXPIRED") setTargetError(true)
    }).finally(() => {
      if (!controller.signal.aborted && requestId === targetRequest.current) setLoadingTargets(false)
    })
    return () => {
      controller.abort()
      if (targetRequest.current === requestId) targetRequest.current += 1
    }
  }, [step, targetQuery, targetQueryKey, targetReload, targetSource])

  const loadMoreTargets = useCallback(async () => {
    const continuation = targetNextPage
    if (
      !continuation ||
      continuation.queryKey !== targetQueryKey ||
      loadingTargets ||
      targetMoreInFlight.current
    ) return
    const requestId = targetRequest.current
    const controller = new AbortController()
    targetMoreController.current?.abort()
    targetMoreController.current = controller
    targetMoreInFlight.current = true
    setLoadingMoreTargets(true)
    setTargetMoreError(false)
    try {
      const page = await targetSource.loadTargets({ ...targetQuery, continuation: continuation.cursor }, controller.signal)
      if (controller.signal.aborted || requestId !== targetRequest.current) return
      setTargetResults((current) => {
        const existing = new Set(current.map((target) => target.key))
        const additions = page.targets.filter((target) => !existing.has(target.key))
        return additions.length > 0
          ? [...current, ...additions].sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
          : current
      })
      if (typeof page.total === "number" && Number.isFinite(page.total)) setTargetTotal(page.total)
      const nextPage = typeof page.nextPage === "string" && page.nextPage ? page.nextPage : null
      setTargetNextPage(nextPage ? { cursor: nextPage, queryKey: targetQueryKey } : null)
    } catch (error: any) {
      if (!controller.signal.aborted && requestId === targetRequest.current && error?.message !== "SESSION_EXPIRED") {
        setTargetMoreError(true)
      }
    } finally {
      targetMoreInFlight.current = false
      if (targetMoreController.current === controller) targetMoreController.current = null
      if (!controller.signal.aborted && requestId === targetRequest.current) setLoadingMoreTargets(false)
    }
  }, [loadingTargets, targetNextPage, targetQuery, targetQueryKey, targetSource])

  /** Which month the grid is showing; the chosen date stays in `anchor`. */
  const [monthAnchor, setMonthAnchor] = useState(anchor)
  useEffect(() => { setMonthAnchor(anchor) }, [anchor])
  const monthCells = useMemo(() => planningMonthGrid(monthAnchor, today), [monthAnchor, today])
  /**
   * Monday-first weekday initials in the reader's language.
   *
   * 2026-06-01 is a Monday, so seven days from it give the week in order
   * without hardcoding a list per locale — and `toLocaleDateString` is safe
   * here because these are labels, not values compared against the server.
   */
  const monthWeekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    // Hermes has no narrow Azerbaijani weekdays and printed 1–7 over the grid
    // (tablet, 2026-09-14); the shared formatter carries its own AZ names.
    const day = new Date(Date.UTC(2026, 5, 1 + index))
    return upperFirst(formatLocalizedDate(day, i18n.language, { weekday: "short", timeZone: "UTC" }), i18n.language)
  }), [i18n.language])

  const changeWindow = (nextAnchor: string, nextHorizon = horizon) => {
    if (saving || editing) return
    planRequest.current += 1
    saveRequest.current += 1
    contextVersion.current += 1
    setAnchor(nextAnchor)
    setHorizon(nextHorizon)
    setActiveDate(nextAnchor)
    setStep(selfPlanning ? 2 : 1)
    setRoutes([])
    setAssignments([])
    setDirtyDates(new Set())
    setSaveMessage(null)
  }

  const selectAgent = (id: string) => {
    if (saving || editing || id === agentId) return
    planRequest.current += 1
    saveRequest.current += 1
    contextVersion.current += 1
    setAgentId(id)
    setStep(selfPlanning ? 2 : 1)
    setRoutes([])
    setAssignments([])
    setDirtyDates(new Set())
    setSaveMessage(null)
  }

  const markDirty = (changedDates: string[]) => {
    setDirtyDates((current) => {
      const next = new Set(current)
      changedDates.forEach((date) => next.add(date))
      return next
    })
  }

  const toggleTarget = (target: PlanningTarget) => {
    if (saving || copying || !activeDateEditable) return
    if (editingActiveDate) {
      const existing = editStops.find((stop) => stop.key === target.key)
      if (existing) {
        if (isPublishedStopLocked(existing)) return
        setEditStops((current) => current.filter((stop) => stop.key !== target.key))
      } else {
        const resolved = planningTargetForDate(target, activeDate)
        if (!resolved) return
        // A route is a dated ordered list, not an appointment calendar.
        // Legacy server times stay on existing stops for audit compatibility,
        // but every newly added stop is deliberately untimed.
        setEditStops((current) => [...current, {
          ...resolved,
          pointId: undefined,
          pointStatus: undefined,
          plannedTime: null,
          date: activeDate,
        }])
      }
      setHighlightKeys(new Set())
      return
    }
    const selected = assignments.some((assignment) => assignment.key === target.key && assignment.date === activeDate)
    if (selected) {
      setAssignments((current) => removePlanningTarget(current, target.key, activeDate))
    } else {
      const resolved = planningTargetForDate(target, activeDate)
      if (!resolved) return
      setAssignments((current) => assignPlanningTarget(current, { ...resolved, plannedTime: null }, activeDate))
    }
    markDirty([activeDate])
    setSaveMessage(null)
  }

  /** The stop may be changed in the published-route editor right now. */
  const editableEditStop = (target: PlanningTarget, date: string): boolean => {
    if (saving || !editSession || date !== editSession.date) return false
    const stop = editStops.find((item) => item.key === target.key)
    return Boolean(stop) && !isPublishedStopLocked(stop as PlanningAssignedTarget)
  }

  const removeDayTarget = (target: PlanningTarget, date: string) => {
    if (editing) {
      if (!editableEditStop(target, date)) return
      setEditStops((current) => current.filter((stop) => stop.key !== target.key))
      setHighlightKeys(new Set())
      return
    }
    if (saving || date < today || lockedDates.has(date) || multipleDraftDates.includes(date)) return
    setAssignments((current) => removePlanningTarget(current, target.key, date))
    markDirty([date])
    setSaveMessage(null)
  }

  const moveDayTarget = (target: PlanningTarget, date: string, direction: -1 | 1) => {
    if (editing) {
      // Only a pending stop moves. Stepping past a visited one keeps the
      // visited stops in their order, which is all the server requires.
      if (!editableEditStop(target, date)) return
      setEditStops((current) => {
        // Legacy times belong to historical stops and stay untouched. Only
        // the order changes; new stops are always untimed.
        return movePlanningTarget(current, target.key, date, direction, false)
      })
      setHighlightKeys(new Set())
      return
    }
    if (saving || date < today || lockedDates.has(date) || multipleDraftDates.includes(date)) return
    setAssignments((current) => movePlanningTarget(current, target.key, date, direction))
    markDirty([date])
    setSaveMessage(null)
  }

  const refresh = async () => {
    if (saving) return
    setRefreshing(true)
    if (!agentId) await loadAgents()
    else await loadPlan(agentId, dates, true)
    setRefreshing(false)
  }

  const writes = useMemo(
    () => buildPlanningRouteWrites(dates, assignments, routes, agentId, dirtyDates),
    [agentId, assignments, dates, dirtyDates, routes],
  )
  const publishDrafts = useMemo(
    () => publishablePlanningDrafts(dates, routes, agentId, new Set(writes.map((write) => write.date))),
    [agentId, dates, routes, writes],
  )
  const publishBlockedDates = useMemo(
    () => [...new Set(assignments.filter((target) => lockedDates.has(target.date)).map((target) => target.date))],
    [assignments, lockedDates],
  )
  // Agents see one action. Tenants that allow self-publishing get a published
  // route immediately; otherwise the same action saves it for manager review.
  // The transport may use a draft internally, but the agent never chooses a
  // technical persistence mode.
  const effectiveSaveMode: SaveMode = selfPlanning ? (canPublish ? "publish" : "draft") : saveMode
  const canSave = Boolean(agentId) && multipleDraftDates.length === 0 && invalidAssignmentDates.length === 0 && !saving && !planError && (
    (effectiveSaveMode === "draft" && writes.length > 0) ||
    (effectiveSaveMode === "publish" && canPublish && publishBlockedDates.length === 0 && (
      writes.some((write) => write.points.length > 0) || publishDrafts.length > 0
    ))
  )

  const save = async () => {
    if (!canSave || !selectedAgent || savingRef.current) return
    savingRef.current = true
    const operationId = ++saveRequest.current
    const operationContext = contextVersion.current
    const operationAgentId = selectedAgent.id
    const operationDates = [...dates]
    const operationWrites = writes.map((write) => ({ ...write, points: write.points.map((point) => ({ ...point })) }))
    const operationAssignments = assignments.map((target) => ({ ...target }))
    const operationMode = effectiveSaveMode
    const operationPublishDrafts = operationMode === "publish" ? publishDrafts.map((draft) => ({ ...draft })) : []
    const retryDates = new Set(operationWrites.map((write) => write.date))
    const isCurrent = () => operationId === saveRequest.current && operationContext === contextVersion.current
    setSaving(true)
    setSaveMessage(null)
    try {
      // Fresh reads close the common stale-create/stale-update window. The
      // server's expectedVersion/dedupe checks remain authoritative for the
      // unavoidable race between this preflight and each write.
      const preflightResponses = await Promise.all(
        [...new Set([
          ...operationWrites.map((write) => write.date),
          ...operationPublishDrafts.map((draft) => draft.date),
        ])]
          .map((date) => api.getRoutesForAgent(date, operationAgentId)),
      )
      if (!isCurrent()) return
      const preflightRoutes = detailedRoutesFromResponses(preflightResponses)
      if (
        planningWriteConflictDates(operationWrites, preflightRoutes, operationAgentId).length > 0 ||
        planningPublishConflictDates(operationPublishDrafts, preflightRoutes, operationAgentId).length > 0
      ) {
        throw planningError("ROUTE_VERSION_CONFLICT")
      }
      retryDates.clear()

      const savedWrites: Array<{ routeId: string; version: number; write: typeof operationWrites[number] }> = []
      const draftFailures: Array<{ error: any; write: typeof operationWrites[number] }> = []

      // Phase 1: attempt every draft write. No publish request can interrupt
      // the remaining draft saves.
      for (const write of operationWrites) {
        if (!isCurrent()) return
        try {
          if (write.existingRouteId && (!Number.isInteger(write.expectedVersion) || Number(write.expectedVersion) < 1)) {
            throw planningError("ROUTE_VERSION_MISSING")
          }
          const saved = await writeSource.saveDraft({
            agentId: operationAgentId,
            date: write.date,
            ...(write.existingRouteId ? { routeId: write.existingRouteId, expectedVersion: write.expectedVersion! } : {}),
            points: write.points,
          })
          if (!saved.routeId || !Number.isInteger(saved.version) || saved.version < 1) throw planningError("ROUTE_VERSION_MISSING")
          savedWrites.push({ routeId: saved.routeId, version: saved.version, write })
        } catch (error: any) {
          draftFailures.push({ error, write })
          retryDates.add(write.date)
        }
      }

      const publishFailures: any[] = []
      let published = 0
      // Phase 2 starts only after every draft saved. If one draft failed, keep
      // all successful writes mutable instead of publishing a mixed week.
      if (draftFailures.length === 0 && operationMode === "publish") {
        const publishQueue = [
          ...savedWrites
            .filter((item) => item.write.points.length > 0)
            .map((item) => ({ routeId: item.routeId, expectedVersion: item.version })),
          ...operationPublishDrafts,
        ]
        for (const saved of publishQueue) {
          if (!isCurrent()) return
          try {
            await writeSource.publishDraft(saved)
            published += 1
          } catch (error: any) {
            publishFailures.push(error)
          }
        }
      }

      if (!isCurrent()) return
      const savedCount = savedWrites.length
      const conflictCodes = new Set(["ROUTE_CONFLICT", "ROUTE_VERSION_CONFLICT", "ROUTE_DUPLICATE"])
      if (draftFailures.length > 0) {
        const conflict = draftFailures.some(({ error }) => conflictCodes.has(error?.code))
        setSaveMessage({
          tone: savedCount > 0 || conflict ? "warning" : "danger",
          text: conflict
            ? t("managerShell.planConflict")
            : savedCount > 0
              ? t("managerShell.planPartialSave", { saved: savedCount, total: operationWrites.length })
              : t("managerShell.planOfflineTitle"),
        })
      } else if (operationMode === "publish" && publishFailures.length > 0) {
        const conflict = publishFailures.some((error) => conflictCodes.has(error?.code))
        const draftSummary = savedCount > 0 ? `${t("managerShell.planDraftSaved", { count: savedCount })} ` : ""
        setSaveMessage({
          tone: "warning",
          text: conflict
            ? `${draftSummary}${t("managerShell.planConflict")} ${t("managerShell.planPublished", { count: published })}`
            : `${draftSummary}${t("managerShell.planPublished", { count: published })}`,
        })
      } else {
        setSaveMessage({
          tone: "success",
          text: selfPlanning
            ? selfCopy.savedRoute
            : t(operationMode === "publish" ? "managerShell.planPublished" : "managerShell.planDraftSaved", {
                count: operationMode === "publish" ? published : savedCount,
              }),
        })
      }
    } catch (error: any) {
      if (!isCurrent()) return
      const conflict = error?.code === "ROUTE_CONFLICT" || error?.code === "ROUTE_VERSION_CONFLICT" || error?.code === "ROUTE_DUPLICATE"
      setSaveMessage({
        tone: conflict ? "warning" : "danger",
        text: conflict ? t("managerShell.planConflict") : t("managerShell.planOfflineTitle"),
      })
    } finally {
      if (isCurrent()) {
        await loadPlan(operationAgentId, operationDates, true)
        if (isCurrent() && retryDates.size > 0) {
          // A failed day remains exactly as the manager composed it. Fresh
          // server routes underneath provide the next expectedVersion while
          // the unsaved cells remain visible and retryable.
          setAssignments((current) => [
            ...current.filter((target) => !retryDates.has(target.date)),
            ...operationAssignments.filter((target) => retryDates.has(target.date)),
          ])
          setDirtyDates(new Set(retryDates))
        }
        if (isCurrent()) setSaving(false)
      }
      savingRef.current = false
    }
  }

  const confirmAndSave = async () => {
    const clearingWrites = writes.filter((write) => write.clearsExistingDraft)
    if (clearingWrites.length === 0) {
      void save()
      return
    }
    const clearedPoints = clearingWrites.reduce((sum, write) => sum + write.previousPointCount, 0)
    const clearedDates = clearingWrites.map((write) => write.date).sort()
    const dateLabel = clearedDates.length === 1
      ? formatPlanDate(clearedDates[0], i18n.language, true)
      : t("managerShell.planDateRange", {
          start: formatPlanDate(clearedDates[0], i18n.language, true),
          end: formatPlanDate(clearedDates[clearedDates.length - 1], i18n.language, true),
        })
    // The app's own sheet, not the system dialog (2026-09-14). Only «Clear»
    // saves; «Cancel», the back button and a tap outside keep the drafts.
    const clear = await ask({
      title: `${t("common.clear")}: ${dateLabel}`,
      message: `${t("managerShell.planRemove")} ${clearedPoints} ${t("managerShell.planStopsShort")}?`,
      tone: "warning",
      buttons: [
        { text: t("common.cancel"), value: false, style: "cancel" },
        { text: t("common.clear"), value: true, style: "destructive" },
      ],
      dismissValue: false,
    })
    if (clear) void save()
  }

  const [copying, setCopying] = useState(false)
  const [copyMessage, setCopyMessage] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null)
  useEffect(() => { setCopyMessage(null) }, [activeDate])
  const activeMutableTargets = useMemo(() => assignments.filter((target) => target.date === activeDate), [activeDate, assignments])
  const copyTargetDates = useMemo(() => singleDay ? [] : planningCopyTargetDates({
    dates,
    fromDate: activeDate,
    today,
    blockedDates: new Set([...lockedDates, ...multipleDraftDates]),
    plannedDates: new Set(dates.filter((date) => targetsForPlanningDay(date, assignments, routes).length > 0)),
  }), [activeDate, assignments, dates, lockedDates, multipleDraftDates, routes, singleDay, today])

  // "Copy to other days": the server is asked about every stop on every target
  // day — a customer valid on Monday is not assumed valid on Tuesday.
  const copyDayToOtherDays = async () => {
    if (saving || copying || activeMutableTargets.length === 0 || copyTargetDates.length === 0) return
    const version = contextVersion.current
    const sources = activeMutableTargets
    setCopying(true)
    setCopyMessage(null)
    try {
      const lookups: Array<{ date: string; resolved: PlanningTarget[] }> = []
      for (const date of copyTargetDates) {
        const resolved: PlanningTarget[] = []
        for (const source of sources) {
          const page = await targetSource.loadTargets({ kind: source.kind === "contact" ? "contact" : "organization", date, search: source.name || undefined })
          const match = page.targets.find((item) => item.key === source.key)
          if (match) resolved.push(match)
        }
        lookups.push({ date, resolved })
      }
      if (version !== contextVersion.current) return
      let updated = assignments
      const copied: string[] = []
      for (const { date, resolved } of lookups) {
        const before = updated.length
        updated = copyPlanningDay(updated, sources, date, resolved)
        if (updated.length > before) copied.push(date)
      }
      setAssignments(updated)
      if (copied.length > 0) markDirty(copied)
      setSaveMessage(null)
      setCopyMessage(copied.length > 0
        ? { tone: "success", text: t("managerShell.planCopied", { count: copied.length, days: copied.map((date) => weekdayShort(date, i18n.language)).join(", ") }) }
        : { tone: "warning", text: t("managerShell.planCopyNone") })
    } catch {
      if (version === contextVersion.current) setCopyMessage({ tone: "danger", text: t("managerShell.planCopyFailed") })
    } finally {
      setCopying(false)
    }
  }

  const exitPublishedEdit = () => {
    setEditSession(null)
    setEditStops([])
    setHighlightKeys(new Set())
  }

  const startPublishedEdit = (route: PlanningDetailedRoute, highlightPointIds: string[] = []) => {
    if (!publishedEditSource) return
    const availability = publishedRouteEditAvailability({
      role: publishedEditSource.role,
      canPlanOwnRoutes: publishedEditSource.canPlanOwnRoutes,
      agentId,
      routeAgentId: route.agentId,
      status: route.status,
      version: route.version,
      online: useSyncStatusStore.getState().online,
    })
    if (availability === "offline") {
      notify({ tone: "warning", title: t("managerShell.planEditProblemTitle"), message: t("managerShell.planEditOffline") })
      return
    }
    if (availability !== "available") return
    // A reload after the change replaces the drafts on screen with server
    // truth; unsaved draft work on other days must not vanish silently.
    if (dirtyDates.size > 0) {
      notify({ tone: "warning", title: t("managerShell.planEditProblemTitle"), message: t("managerShell.planEditSaveDraftsFirst") })
      return
    }
    const stops = publishedRouteEditStops(route)
    setEditSession({ routeId: route.id, date: route.date, version: route.version, original: stops })
    setEditStops(stops)
    setHighlightKeys(new Set(publishedStopKeysForPointIds(stops, highlightPointIds)))
    setActiveDate(route.date)
    setSaveMessage(null)
    setStep(2)
  }

  // Route tab «Planı dəyiş»: open today's published route in the editor once
  // the plan has loaded. One attempt only — if it is not editable, the day is
  // simply shown.
  useEffect(() => {
    if (!autoEditPending.current || loadingPlan || !agentId || updatedAt === null) return
    autoEditPending.current = false
    const route = publishedRouteForDay(routes, activeDate, agentId)
    if (route) startPublishedEdit(route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, agentId, loadingPlan, routes, updatedAt])

  const cancelPublishedEdit = async () => {
    if (saving || !editSession) return
    if (publishedRouteEditChanged(editSession.original, editStops)) {
      const discard = await ask({
        title: t("managerShell.planEditDiscardTitle"),
        message: t("managerShell.planEditDiscardBody"),
        tone: "warning",
        buttons: [
          { text: t("managerShell.planEditKeepEditing"), value: false, style: "cancel" },
          { text: t("managerShell.planCancelEdit"), value: true, style: "destructive" },
        ],
        dismissValue: false,
      })
      if (!discard) return
    }
    exitPublishedEdit()
  }

  const publishPublishedEdit = async () => {
    const session = editSession
    if (!session || !publishedEditSource || savingRef.current) return
    const problem = validatePublishedRouteEdit(session.original, editStops)
    if (problem) {
      setHighlightKeys(new Set(problem.keys))
      notify({ tone: "warning", title: t("managerShell.planEditProblemTitle"), message: t(publishedRouteEditProblemKey(problem.code)) })
      return
    }
    // Online only (see publishedRouteEditAvailability): a change parked for
    // later would race the agent's own check-ins at the stops it moves.
    if (useSyncStatusStore.getState().online === false) {
      notify({ tone: "warning", title: t("managerShell.planEditProblemTitle"), message: t("managerShell.planEditOffline") })
      return
    }
    const operationAgentId = agentId
    const operationDates = [...dates]
    const stops = editStops
    savingRef.current = true
    setSaving(true)
    try {
      await publishedEditSource.updatePublished({
        routeId: session.routeId,
        expectedVersion: session.version,
        points: buildUpdatePublishedPoints(stops),
      })
      exitPublishedEdit()
      notify({ tone: "success", title: t("managerShell.planEditUpdated"), message: t("managerShell.planEditUpdatedBody") })
      await loadPlan(operationAgentId, operationDates, true)
    } catch (error: unknown) {
      const outcome = publishedRouteEditErrorOutcome(error)
      if (outcome.code === "SESSION_EXPIRED") return
      console.warn("[planner] UPDATE_PUBLISHED not applied:", outcome.code)
      const rawPointIds = (error as { pointIds?: unknown } | null)?.pointIds
      const pointIds = Array.isArray(rawPointIds) ? rawPointIds.filter((id): id is string => typeof id === "string") : []
      const message = t(outcome.messageKey)
      if (outcome.action === "keep-edit") {
        setHighlightKeys(new Set(publishedStopKeysForPointIds(stops, pointIds)))
        notify({ tone: outcome.tone, title: t("managerShell.planEditProblemTitle"), message })
      } else if (outcome.action === "exit-edit") {
        exitPublishedEdit()
        notify({ tone: outcome.tone, title: t("managerShell.planEditProblemTitle"), message })
        await loadPlan(operationAgentId, operationDates, true)
      } else {
        exitPublishedEdit()
        const fresh = await loadPlan(operationAgentId, operationDates, true)
        const freshRoute = fresh ? publishedRouteForDay(fresh, session.date, operationAgentId) : null
        if (outcome.action === "restart-edit") {
          notify({ tone: outcome.tone, title: t("managerShell.planEditProblemTitle"), message })
          if (freshRoute) startPublishedEdit(freshRoute, pointIds)
        } else {
          const restart = await ask({
            title: t("managerShell.planEditProblemTitle"),
            message,
            tone: "warning",
            buttons: [
              { text: t("managerShell.planCancelEdit"), value: false, style: "cancel" },
              { text: t("managerShell.planEditRestart"), value: true },
            ],
            dismissValue: false,
          })
          if (restart && freshRoute) startPublishedEdit(freshRoute)
        }
      }
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  // While a published day is open, the dock publishes that change instead.
  const editAction = {
    icon: "send",
    label: saving ? t("managerShell.planPublishingEdit") : t("managerShell.planPublishEdit"),
    hint: saving
      ? undefined
      : !editChanged
        ? t("managerShell.planEditNoChanges")
        : editProblem
          ? t(publishedRouteEditProblemKey(editProblem.code))
          : undefined,
    disabled: saving || !editChanged || editProblem !== null,
    onPress: () => { void publishPublishedEdit() },
  }

  const footerAction = selfPlanning
    ? {
        icon: "checkmark",
        label: saving ? selfCopy.savingRoute : selfCopy.saveRoute,
        hint: !canSave && !saving && !saveMessage
          ? t(matrixTargets.length === 0 && dirtyDates.size === 0 ? "managerShell.planSelectAtLeastOne" : writes.length === 0 ? "managerShell.planNoDraftChanges" : "managerShell.planResolveWarnings")
          : undefined,
        disabled: !canSave,
        onPress: confirmAndSave,
      }
    : step === 1
    ? {
        icon: "arrow-forward",
        label: t("managerShell.planChooseStops"),
        hint: !agentId ? t("managerShell.planChooseAgentHint") : loadingPlan ? t("managerShell.planLoadingSchedule") : undefined,
        disabled: saving || !agentId || loadingPlan || planError || multipleDraftDates.length > 0,
        onPress: () => setStep(2),
      }
    : {
          icon: saveMode === "publish" ? "send" : "save",
          label: saving ? t("managerShell.planSaving") : t(saveMode === "publish" ? "managerShell.planSaveAndPublish" : writes.length > 1 ? "managerShell.planSaveDraftAction" : "managerShell.planSaveDraftActionOne"),
          // Right after a save there is nothing left to save, and saying so
          // under the button contradicts the success message above.
          hint: !canSave && !saving && !saveMessage ? t(matrixTargets.length === 0 && dirtyDates.size === 0 ? "managerShell.planSelectAtLeastOne" : writes.length === 0 ? "managerShell.planNoDraftChanges" : "managerShell.planResolveWarnings") : undefined,
          disabled: !canSave,
          onPress: confirmAndSave,
        }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, tablet && styles.headerInnerTablet]}>
          {onClose ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("contactTransfer.back")} onPress={onClose} style={({ pressed }) => [styles.headerBack, pressed && styles.pressed]}>
              <Icon name="arrow-back" size={24} color={fieldTheme.color.onColor} />
            </Pressable>
          ) : null}
          {/* Decorative; on the phone it cost the title two lines of wrapping. */}
          {tablet ? <View style={styles.headerIcon}><Icon name="calendar" size={26} color={fieldTheme.color.onColor} /></View> : null}
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{selfPlanning ? selfCopy.eyebrow : t("managerShell.planEyebrow")}</Text>
            <Text style={styles.title}>{selfPlanning ? selfCopy.title : t(singleDay ? "managerShell.planDayTitle" : "managerShell.planWeekTitle")}</Text>
            <Text numberOfLines={tablet ? 2 : 1} style={styles.subtitle}>{selfPlanning ? (singleDay ? selfCopy.daySubtitle : selfCopy.weekSubtitle) : t(singleDay ? "managerShell.planDayBody" : "managerShell.planWeekBody")}</Text>
          </View>
          {selfPlanning ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("managerShell.planHelpAction")}
              style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
              onPress={() => setForcedHelpStep(step)}
            >
              <Icon name="help-circle-outline" size={22} color={fieldTheme.color.primaryStrong} />
            </Pressable>
          )}
          {updatedAt ? (
            <View style={styles.updatedPill}>
              <Icon name={planError ? "cloud-offline-outline" : "checkmark-circle"} size={16} color={planError ? fieldTheme.color.amber : fieldTheme.color.primaryStrong} />
              {tablet ? <Text style={styles.updatedText}>{planError ? t("managerShell.planLastLoaded") : t("managerShell.planUpdated")}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={workspaceScrollRef}
        style={styles.workspaceScroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl enabled={!saving} refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
        contentContainerStyle={[styles.content, tablet && styles.contentTablet]}
      >
        {selfPlanning ? null : <StepRail step={step} hasAgent={Boolean(agentId)} disabled={saving || editing} onStep={setStep} t={t} />}

        {plannerHelpVisible ? (
          <PlannerCoach
            title={t("managerShell.planHelpTitle")}
            body={t(planningHelpKey)}
            dismissLabel={t("managerShell.planHelpDismiss")}
            tablet={tablet}
            onDismiss={() => {
              dismissHint(planningHintId)
              setForcedHelpStep(null)
            }}
          />
        ) : null}

        {planError ? (
          <Notice
            tone="warning"
            icon="cloud-offline-outline"
            title={t("managerShell.planOfflineTitle")}
            body={routes.length > 0 ? t("managerShell.planOfflinePreserved") : t("managerShell.planOfflineBody")}
            action={!saving ? t("common.retry") : undefined}
            onAction={!saving ? () => { if (agentId) void loadPlan(agentId, dates, true) } : undefined}
          />
        ) : null}
        {saveMessage ? <Notice tone={saveMessage.tone} icon={saveMessage.tone === "success" ? "checkmark-circle" : "alert-circle"} title={saveMessage.text} /> : null}

        {step === 1 ? (
          <View style={styles.stepBody}>
            <SectionIntro
              number="1"
              title={selfPlanning
                ? t("managerShell.planSelfStepSetup")
                : t(singleDay ? "managerShell.planStepSetupDay" : "managerShell.planStepSetupWeek")}
              body={selfPlanning
                ? null
                : t(singleDay ? "managerShell.planStepSetupDayBody" : "managerShell.planStepSetupWeekBody")}
            />
            <View style={[styles.setupGrid, expandedTablet && styles.setupGridTablet]}>
              <View style={styles.setupPanel}>
                <Text style={styles.fieldLabel}>{t("managerShell.planType")}</Text>
                <Text style={styles.fieldHelp}>{t("managerShell.planTypeHelp")}</Text>
                <View style={styles.segment}>
                  {([1, 7] as PlanningHorizon[]).map((value) => (
                    <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: horizon === value, disabled: saving }} disabled={saving} style={[styles.segmentButton, horizon === value && styles.segmentButtonActive, saving && styles.disabled]} onPress={() => changeWindow(anchor, value)}>
                      <Icon name={value === 1 ? "today-outline" : "calendar-outline"} size={18} color={horizon === value ? fieldTheme.color.primaryStrong : fieldTheme.color.inkMuted} />
                      <Text style={[styles.segmentText, horizon === value && styles.segmentTextActive]}>{t(value === 1 ? "managerShell.planOneDay" : "managerShell.planSevenDays")}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.fieldHeadingCopy}>
                  <Text style={styles.fieldLabel}>{t(singleDay ? "managerShell.planRouteDate" : "managerShell.planWeekStart")}</Text>
                  <Text style={styles.fieldHelp}>{t(singleDay ? "managerShell.planRouteDateHelp" : "managerShell.planWeekStartHelp")}</Text>
                </View>
                {/*
                  Audit B8: the date moved one day per press, so two weeks
                  ahead was fourteen presses and weekends looked like any other
                  day. The month steps by month, the grid marks the weekend,
                  and the past is not offered at all — a route cannot be
                  planned into it.
                */}
                <CompactPlanDatePicker
                  anchor={anchor}
                  dates={dates}
                  singleDay={singleDay}
                  monthCells={monthCells}
                  weekdayLabels={monthWeekdayLabels}
                  language={i18n.language}
                  disabled={saving}
                  onPreviousMonth={() => setMonthAnchor(shiftPlanningMonth(monthAnchor, -1))}
                  onNextMonth={() => setMonthAnchor(shiftPlanningMonth(monthAnchor, 1))}
                  onToday={() => { const next = nextPlanningWorkday(today); setMonthAnchor(next); changeWindow(next) }}
                  onSelect={(date) => changeWindow(date)}
                  t={t}
                />
              </View>

              {selfPlanning ? null : (
              <View style={[styles.setupPanel, styles.agentPanel]}>
                <View style={styles.fieldHeading}>
                  <View style={styles.fieldHeadingCopy}>
                    <Text style={styles.fieldLabel}>{t("managerShell.planMainAgent")}</Text>
                    <Text style={styles.fieldHelp}>{t("managerShell.planMainAgentHelp")}</Text>
                  </View>
                  {loadingAgents ? <ActivityIndicator color={fieldTheme.color.primary} /> : null}
                </View>
                {agentError ? (
                  <InlineEmpty icon="cloud-offline-outline" text={t("managerShell.planAgentsError")} action={!saving ? t("common.retry") : undefined} onAction={!saving ? () => { void loadAgents() } : undefined} />
                ) : selfPlanning && selectedAgent ? (
                  <View style={styles.agentList}>
                    <View accessibilityRole="summary" style={[styles.agentOption, styles.agentOptionSelected]}>
                      <View style={[styles.agentAvatar, styles.agentAvatarSelected]}><Icon name="person" size={20} color={fieldTheme.color.onColor} /></View>
                      <Text style={[styles.agentName, styles.agentNameSelected]}>{selectedAgent.name}</Text>
                      <Icon name="lock-closed" size={18} color={fieldTheme.color.primary} />
                    </View>
                  </View>
                ) : agents.length > 0 ? (
                  <ScrollView nestedScrollEnabled style={styles.agentListScroller} contentContainerStyle={styles.agentList} showsVerticalScrollIndicator={agents.length > 4}>
                    {agents.map((agent) => {
                      const selected = agent.id === agentId
                      return (
                        <Pressable key={agent.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: saving }} disabled={saving} onPress={() => selectAgent(agent.id)} style={({ pressed }) => [styles.agentOption, selected && styles.agentOptionSelected, saving && styles.disabled, pressed && styles.pressed]}>
                          <View style={[styles.agentAvatar, selected && styles.agentAvatarSelected]}><Icon name="person" size={20} color={selected ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong} /></View>
                          <Text style={[styles.agentName, selected && styles.agentNameSelected]}>{agent.name}</Text>
                          <Icon name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? fieldTheme.color.primary : fieldTheme.color.inkMuted} />
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                ) : !loadingAgents ? <InlineEmpty icon="people-outline" text={t("managerShell.planNoAgents")} /> : null}
                </View>
              )}
            </View>

            {agentId ? (
              <WeekSnapshot dates={dates} routes={routes} loading={loadingPlan} language={i18n.language} t={t} />
            ) : (
              <Notice tone="neutral" icon="person-add-outline" title={t("managerShell.planChooseAgentTitle")} body={t("managerShell.planChooseAgentBody")} />
            )}
            {multipleDraftDates.length > 0 ? <Notice tone="warning" icon="git-compare-outline" title={t("managerShell.planMultipleDraftsTitle")} body={t("managerShell.planMultipleDraftsBody")} /> : null}
          </View>
        ) : (
          <View style={styles.stepBody}>
            {selfPlanning ? (
              <View style={styles.selfPlanDate}>
                <Text style={styles.fieldLabel}>{selfCopy.routeDate}</Text>
                <CompactPlanDatePicker
                  anchor={anchor}
                  dates={dates}
                  singleDay
                  monthCells={monthCells}
                  weekdayLabels={monthWeekdayLabels}
                  language={i18n.language}
                  disabled={saving || editing}
                  onPreviousMonth={() => setMonthAnchor(shiftPlanningMonth(monthAnchor, -1))}
                  onNextMonth={() => setMonthAnchor(shiftPlanningMonth(monthAnchor, 1))}
                  onToday={() => { const next = nextPlanningWorkday(today); setMonthAnchor(next); changeWindow(next) }}
                  onSelect={(date) => changeWindow(date, 1)}
                  t={t}
                />
              </View>
            ) : (
              <>
                <SectionIntro number="2" title={t("managerShell.planStepTargets")} />
                <View style={styles.selectionSummary}>
                  <Icon name="calendar-outline" size={20} color={fieldTheme.color.blue} />
                  {/* One day counts the stops on screen: a published day has no
                      draft assignments, and «0 müştəri seçilib» sat above its two
                      stops right after «Planı dəyiş» (Galaxy S23, 2026-09-15). */}
                  <Text style={styles.selectionSummaryText}>{t(singleDay ? "managerShell.planSelectionSummaryDay" : "managerShell.planSelectionSummaryWeek", editing
                    ? { people: editStops.length, visits: editStops.length }
                    : singleDay
                      ? { people: new Set(activeDayTargets.map((target) => target.key)).size, visits: activeDayTargets.length }
                      : { people: mutableTargetCount, visits: assignments.length })}</Text>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || editing }} disabled={saving || editing} style={[styles.textButton, (saving || editing) && styles.disabled]} onPress={() => setStep(1)}><Text style={styles.textButtonText}>{t("managerShell.planChangeSetup")}</Text></Pressable>
                </View>
              </>
            )}

            {!singleDay ? (
              <WeekDayChooser
                dates={dates}
                activeDate={activeDate}
                assignments={assignments}
                routes={routes}
                lockedDates={lockedDates}
                multipleDraftDates={multipleDraftDates}
                today={today}
                language={i18n.language}
                tablet={tablet}
                disabled={saving || editing}
                onSelect={setActiveDate}
                t={t}
              />
            ) : null}

            {editingActiveDate ? (
              <Notice tone="neutral" icon="create-outline" title={t("managerShell.planEditingTitle")} body={t("managerShell.planEditingBody")} />
            ) : null}
            {!selfPlanning || editing ? (
              <DayPlanEditor
                date={activeDate}
                rows={activeDayTargets}
                lockedCells={editingActiveDate && editLockedCells ? editLockedCells : lockedCells}
                editable={activeDateEditable}
                editingPublished={editingActiveDate}
                highlightKeys={editingActiveDate ? highlightKeys : undefined}
                changePlan={!editing && activePublishedRoute && activeEditAvailability !== "unavailable"
                  ? { label: t("managerShell.planChangePublished"), onPress: () => startPublishedEdit(activePublishedRoute) }
                  : undefined}
                saving={saving}
                language={i18n.language}
                onMove={moveDayTarget}
                onRemove={removeDayTarget}
                t={t}
              />
            ) : null}
            {!singleDay && !editing && activeDateEditable && activeMutableTargets.length > 0 && copyTargetDates.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || copying }}
                disabled={saving || copying}
                onPress={() => { void copyDayToOtherDays() }}
                style={({ pressed }) => [styles.copyDayButton, (saving || copying) && styles.disabled, pressed && styles.pressed]}
              >
                {copying ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} /> : <Icon name="copy-outline" size={19} color={fieldTheme.color.primaryStrong} />}
                <View style={styles.copyDayCopy}>
                  <Text style={styles.copyDayTitle}>{t(copying ? "managerShell.planCopying" : "managerShell.planCopyDay")}</Text>
                  <Text style={styles.copyDayHint}>{t("managerShell.planCopyDayHint", { days: copyTargetDates.map((date) => weekdayShort(date, i18n.language)).join(", ") })}</Text>
                </View>
              </Pressable>
            ) : null}
            {copyMessage ? <Notice tone={copyMessage.tone} icon={copyMessage.tone === "success" ? "checkmark-circle" : "alert-circle"} title={copyMessage.text} /> : null}

            <View style={styles.targetBrowser}>
              <View style={styles.targetBrowserHeading}>
                <View style={styles.targetBrowserHeadingCopy}>
                  <Text style={styles.fieldLabel}>{selfPlanning ? selfCopy.chooseTargets : t("managerShell.planChooseTargetType")}</Text>
                  {selfPlanning ? null : <Text style={styles.fieldHelp}>{t("managerShell.planChooseTargetTypeHelp")}</Text>}
                </View>
                {singleDay ? null : (
                  <View style={styles.activeDayPill}>
                    <Icon name="calendar-outline" size={16} color={fieldTheme.color.primaryStrong} />
                    <Text style={styles.activeDayPillText}>{formatPlanDate(activeDate, i18n.language, true)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.targetTypeTabs} accessibilityRole="tablist">
                {routeTargetTypes.map((type) => {
                  const selected = activeTargetType?.id === type.id
                  return (
                    <Pressable
                      key={type.id}
                      accessibilityRole="tab"
                      accessibilityState={{ selected, disabled: saving || !activeDateEditable }}
                      disabled={saving || !activeDateEditable}
                      style={({ pressed }) => [styles.targetTypeButton, selected && styles.targetTypeButtonActive, (saving || !activeDateEditable) && styles.disabled, pressed && styles.pressed]}
                      onPress={() => { setTargetTypeId(type.id); setTargetSearch("") }}
                    >
                      <Icon name={targetTypeIcon(type)} size={19} color={selected ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong} />
                      <Text style={[styles.targetTypeText, selected && styles.targetTypeTextActive]}>{mobileRouteTargetLabel(type, i18n.language)}</Text>
                    </Pressable>
                  )
                })}
              </View>
            <View style={styles.searchBox}>
              <Icon name="search" size={20} color={fieldTheme.color.inkMuted} />
              <TextInput
                value={targetSearch}
                onChangeText={setTargetSearch}
                placeholder={selfPlanning ? selfCopy.searchPlaceholder : t("managerShell.planSearchTarget")}
                placeholderTextColor={fieldTheme.color.inkMuted}
                accessibilityLabel={t("managerShell.planSearch")}
                style={styles.searchInput}
                returnKeyType="search"
                editable={!saving && activeDateEditable}
              />
              {targetSearch ? <Pressable accessibilityRole="button" accessibilityLabel={t("common.clear")} accessibilityState={{ disabled: saving }} disabled={saving} style={[styles.clearButton, saving && styles.disabled]} onPress={() => setTargetSearch("")}><Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} /></Pressable> : null}
            </View>
            {selfPlanning ? null : <Text style={styles.scopeNote}>{t("managerShell.planScopeNote")}</Text>}

            {targetError ? (
              <InlineEmpty icon="cloud-offline-outline" text={t("managerShell.planTargetsError")} action={!saving ? t("common.retry") : undefined} onAction={!saving ? () => setTargetReload((value) => value + 1) : undefined} />
            ) : loadingTargets ? (
              <View style={styles.loadingBlock}><ActivityIndicator color={fieldTheme.color.primary} /><Text style={styles.loadingText}>{t("managerShell.planLoadingTargets")}</Text></View>
            ) : targetResults.length > 0 ? (
              <>
                {selfPlanning ? null : <Text style={styles.resultCount}>{targetTotal === null
                  ? t("managerShell.planResultsLoaded", { loaded: targetResults.length })
                  : t("managerShell.planResults", { loaded: targetResults.length, total: targetTotal })}
                </Text>}
                {/* No box with its own scroll (owner, 2026-09-14): the page scrolls. */}
                <View style={[styles.targetList, tablet && styles.targetListTablet]}>
                  {targetResults.map((target) => {
                    const selectedTarget = activeDayTargets.find((assignment) => assignment.key === target.key)
                    const mutableSelection = editingActiveDate
                      ? Boolean(selectedTarget) && !isPublishedStopLocked(selectedTarget as PlanningAssignedTarget)
                      : assignments.some((assignment) => assignment.key === target.key && assignment.date === activeDate)
                    const selected = Boolean(selectedTarget)
                    const resolved = planningTargetForDate(target, activeDate)
                    const displayTarget = selectedTarget ?? resolved ?? target
                    const unavailable = !selected && !resolved
                    const disabled = saving || !activeDateEditable || (selected && !mutableSelection) || (!selected && !resolved)
                    const otherDays = singleDay ? "" : dates
                      .filter((date) => date !== activeDate && targetsForPlanningDay(date, assignments, routes).some((row) => row.key === target.key))
                      .map((date) => weekdayShort(date, i18n.language))
                      .join(", ")
                    return (
                      <TargetOption key={target.key} target={displayTarget} selected={selected} unavailable={unavailable} disabled={disabled || copying} otherDays={otherDays} onPress={() => toggleTarget(target)} t={t} tablet={tablet} />
                    )
                  })}
                </View>
                {showTargetMoreError ? (
                  <InlineEmpty
                    icon="cloud-offline-outline"
                    text={t("managerShell.planMoreTargetsError")}
                    action={!saving ? t("common.retry") : undefined}
                    onAction={!saving ? () => { void loadMoreTargets() } : undefined}
                  />
                ) : hasMoreTargets ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving || loadingMoreTargets }}
                    disabled={saving || loadingMoreTargets}
                    style={({ pressed }) => [styles.loadMoreTargets, (saving || loadingMoreTargets) && styles.disabled, pressed && styles.pressed]}
                    onPress={() => { void loadMoreTargets() }}
                  >
                    {loadingMoreTargets ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} /> : <Icon name="add-circle-outline" size={19} color={fieldTheme.color.primaryStrong} />}
                    <Text style={styles.loadMoreTargetsText}>{t(loadingMoreTargets ? "managerShell.planLoadingMoreTargets" : "managerShell.planLoadMoreTargets")}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : hasMoreTargets ? (
              <InlineEmpty
                icon="search-outline"
                text={t("managerShell.planMoreTargetsHint")}
                action={!saving ? t("managerShell.planLoadMoreTargets") : undefined}
                onAction={!saving ? () => { void loadMoreTargets() } : undefined}
              />
            ) : debouncedSearch ? (
              <InlineEmpty icon="search-outline" text={t("managerShell.planNoSearchResults")} />
            ) : (
              <Notice
                tone="neutral"
                icon="people-circle-outline"
                title={t("managerShell.planNoTargets")}
                body={targetEligibility
                  ? t(fieldEligibilityReasonKey(targetEligibility))
                  : t("managerShell.planNoTargetsBody")}
                action={t("managerShell.planRefreshTargets")}
                onAction={() => setTargetReload((value) => value + 1)}
              />
            )}
            </View>
            {/*
              A published day used to say only "view-only, choose another
              period" (owner, 2026-09-15: "I can't change it"). Its own agent
              now gets the way in, named on the button it points to.
            */}
            {!activeDateEditable && activePublishedRoute && activeEditAvailability !== "unavailable" ? (
              <Notice
                tone="neutral"
                icon="lock-closed-outline"
                title={t("managerShell.planPublishedReadOnlyTitle")}
                body={t("managerShell.planPublishedReadOnlyBody")}
                action={!saving ? t("managerShell.planChangePublished") : undefined}
                onAction={!saving ? () => startPublishedEdit(activePublishedRoute) : undefined}
              />
            ) : !activeDateEditable ? <Notice tone="warning" icon="lock-closed-outline" title={t("managerShell.planNoEditableDateTitle")} body={t("managerShell.planNoEditableDateBody")} /> : null}
            {!selfPlanning && !editing && matrixTargets.length === 0 && dirtyDates.size > 0 ? <Notice tone="warning" icon="trash-outline" title={t("managerShell.planEmptyDraftTitle")} body={t("managerShell.planEmptyDraftBody")} /> : null}
            {editing || selfPlanning ? null : (
            <View style={styles.savePanel}>
              <Text style={styles.fieldLabel}>{t("managerShell.planFinishMode")}</Text>
              <Text style={styles.fieldHelp}>{t("managerShell.planFinishModeHelp")}</Text>
              <View style={styles.segment}>
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: saveMode === "draft", disabled: saving }} disabled={saving} style={[styles.segmentButton, saveMode === "draft" && styles.segmentButtonActive, saving && styles.disabled]} onPress={() => setSaveMode("draft")}>
                  <Icon name="save-outline" size={18} color={saveMode === "draft" ? fieldTheme.color.primaryStrong : fieldTheme.color.inkMuted} />
                  <Text style={[styles.segmentText, saveMode === "draft" && styles.segmentTextActive]}>{t("managerShell.planSaveDraft")}</Text>
                </Pressable>
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: saveMode === "publish", disabled: saving || !canPublish }} disabled={saving || !canPublish} style={[styles.segmentButton, saveMode === "publish" && styles.segmentButtonActive, (saving || !canPublish) && styles.disabled]} onPress={() => setSaveMode("publish")}>
                  <Icon name="send-outline" size={18} color={saveMode === "publish" ? fieldTheme.color.primaryStrong : fieldTheme.color.inkMuted} />
                  <Text style={[styles.segmentText, saveMode === "publish" && styles.segmentTextActive]}>{t("managerShell.planPublish")}</Text>
                </Pressable>
              </View>
              {!canPublish ? <Text style={styles.permissionNote}>{t("managerShell.planPublishUnavailable")}</Text> : null}
              {publishBlockedDates.length > 0 && saveMode === "publish" ? <Notice tone="warning" icon="lock-closed-outline" title={t("managerShell.planPublishedDateLocked")} body={t("managerShell.planPublishedDateLockedBody")} /> : null}
              {multipleDraftDates.length > 0 ? <Notice tone="warning" icon="git-compare-outline" title={t("managerShell.planMultipleDraftsTitle")} body={t("managerShell.planMultipleDraftsBody")} /> : null}
              {invalidAssignmentDates.length > 0 ? <Notice tone="warning" icon="business-outline" title={t("managerShell.planNoActiveWorkplace")} body={t("managerShell.planResolveWarnings")} /> : null}
            </View>
            )}
          </View>
        )}
      </ScrollView>
      <PlannerActionDock
        action={editing ? editAction : footerAction}
        backLabel={editing ? t("managerShell.planCancelEdit") : t("contactTransfer.back")}
        backIcon={editing ? "close" : "arrow-back"}
        showBack={editing || (!selfPlanning && step > 1)}
        disabled={saving}
        bottomInset={Math.max(safeAreaInsets.bottom, fieldTheme.space.sm)}
        onBack={editing ? () => { void cancelPublishedEdit() } : () => setStep(1)}
      />
    </View>
  )
}

function StepRail({ step, hasAgent, disabled, onStep, t }: { step: PlanningStep; hasAgent: boolean; disabled: boolean; onStep: (step: PlanningStep) => void; t: any }) {
  const steps: Array<{ value: PlanningStep; label: string; enabled: boolean }> = [
    { value: 1, label: t("managerShell.planRailSetup"), enabled: true },
    { value: 2, label: t("managerShell.planRailTargets"), enabled: hasAgent },
  ]
  return (
    <View style={styles.stepRail} accessibilityRole="tablist">
      {steps.map((item, index) => {
        const active = step === item.value
        const done = step > item.value
        return (
          <React.Fragment key={item.value}>
            {index > 0 ? <View style={[styles.stepConnector, (active || done) && styles.stepConnectorActive]} /> : null}
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: active, disabled: disabled || !item.enabled }} disabled={disabled || !item.enabled} onPress={() => onStep(item.value)} style={[styles.stepTab, disabled && styles.disabled]}>
              <View style={[styles.stepNumber, (active || done) && styles.stepNumberActive]}>
                <Text style={[styles.stepNumberText, (active || done) && styles.stepNumberTextActive]}>{done ? "✓" : item.value}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.stepLabel, active && styles.stepLabelActive, !item.enabled && styles.disabledText]}>{item.label}</Text>
            </Pressable>
          </React.Fragment>
        )
      })}
    </View>
  )
}

function SectionIntro({ number, title, body }: { number: string; title: string; body?: string | null }) {
  return (
    <View style={styles.sectionIntro}>
      <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>{number}</Text></View>
      <View style={styles.sectionIntroCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {body ? <Text style={styles.sectionBody}>{body}</Text> : null}
      </View>
    </View>
  )
}

function CompactPlanDatePicker({
  anchor,
  dates,
  singleDay,
  monthCells,
  weekdayLabels,
  language,
  disabled,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onSelect,
  t,
}: {
  anchor: string
  dates: string[]
  singleDay: boolean
  monthCells: PlanningMonthDay[]
  weekdayLabels: string[]
  language: string
  disabled: boolean
  onPreviousMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelect: (date: string) => void
  t: any
}) {
  const [open, setOpen] = useState(false)
  const visibleMonthKey = monthCells.find((cell) => cell.date)?.date ?? anchor
  const visibleMonth = new Date(`${visibleMonthKey}T00:00:00.000Z`)
  const monthLabel = upperFirst(formatLocalizedDate(visibleMonth, language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }), language)

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("managerShell.planOpenDatePicker")}: ${formatPlanDate(anchor, language)}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.compactDateButton, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <View style={styles.compactDateIcon}><Icon name="calendar-outline" size={22} color={fieldTheme.color.primaryStrong} /></View>
        <View style={styles.compactDateCopy}>
          <Text style={styles.compactDateValue}>{formatPlanDate(anchor, language)}</Text>
          <Text style={styles.compactDateHint}>{t(singleDay ? "managerShell.planDateOnlyHint" : "managerShell.planWeekDateOnlyHint")}</Text>
        </View>
        <Icon name="chevron-down" size={20} color={fieldTheme.color.primaryStrong} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dateSheetBackdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t("managerShell.planCancelEdit")}>
          <Pressable style={styles.dateSheet} onPress={() => undefined}>
            <View style={styles.dateSheetHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planPreviousMonth")} disabled={disabled} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]} onPress={onPreviousMonth}>
                <Icon name="chevron-back" size={23} color={fieldTheme.color.primaryStrong} />
              </Pressable>
              <View style={styles.dateCopy}>
                <Text style={styles.dateTitle}>{monthLabel}</Text>
                <Pressable accessibilityRole="button" disabled={disabled} style={styles.todayButton} onPress={() => { onToday(); setOpen(false) }}>
                  <Text style={styles.todayButtonText}>{t("managerShell.planToday")}</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planNextMonth")} disabled={disabled} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]} onPress={onNextMonth}>
                <Icon name="chevron-forward" size={23} color={fieldTheme.color.primaryStrong} />
              </Pressable>
            </View>
            <View style={styles.monthWeekdays} accessibilityRole="none">
              {weekdayLabels.map((label, index) => <Text key={`${label}-${index}`} style={styles.monthWeekday}>{label}</Text>)}
            </View>
            <View style={styles.monthGrid} testID="planning-month-grid">
              {monthCells.map((cell, index) => {
                if (!cell.date) return <View key={`blank-${index}`} style={styles.monthCell} />
                const selected = cell.date === anchor
                const inWindow = !singleDay && !selected && dates.includes(cell.date)
                const cellDisabled = disabled || cell.past
                return (
                  <Pressable
                    key={cell.date}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: cellDisabled }}
                    accessibilityLabel={formatPlanDate(cell.date, language)}
                    disabled={cellDisabled}
                    onPress={() => { onSelect(cell.date as string); setOpen(false) }}
                    style={({ pressed }) => [
                      styles.monthCell,
                      styles.monthDay,
                      cell.weekend && styles.monthDayWeekend,
                      cell.today && styles.monthDayToday,
                      inWindow && styles.monthDayInWindow,
                      selected && styles.monthDaySelected,
                      cellDisabled && styles.monthDayDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.monthDayText, selected && styles.monthDayTextSelected, cellDisabled && styles.monthDayTextDisabled]}>{cell.day}</Text>
                  </Pressable>
                )
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function PlannerCoach({ title, body, dismissLabel, tablet, onDismiss }: { title: string; body: string; dismissLabel: string; tablet: boolean; onDismiss: () => void }) {
  return (
    <View style={[styles.plannerCoach, tablet && styles.plannerCoachTablet]} accessibilityLiveRegion="polite">
      <View style={styles.plannerCoachLead}>
        <View style={styles.plannerCoachIcon}>
          <Icon name="bulb-outline" size={23} color={fieldTheme.color.blue} />
        </View>
        <View style={styles.plannerCoachCopy}>
          <Text style={styles.plannerCoachTitle}>{title}</Text>
          <Text style={styles.plannerCoachBody}>{body}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={({ pressed }) => [styles.plannerCoachDismiss, tablet && styles.plannerCoachDismissTablet, pressed && styles.pressed]}
      >
        <Text style={styles.plannerCoachDismissText}>{dismissLabel}</Text>
        <Icon name="checkmark" size={18} color={fieldTheme.color.blue} />
      </Pressable>
    </View>
  )
}

function WeekSnapshot({ dates, routes, loading, language, t }: { dates: string[]; routes: PlanningDetailedRoute[]; loading: boolean; language: string; t: any }) {
  // Seven equal tiles in one row: it used to be a strip of 116 dp cards that
  // scrolled sideways inside the page (tablet, 2026-09-14).
  return (
    <View style={styles.weekSnapshot}>
      <View style={styles.snapshotHeading}>
        <Text style={styles.snapshotTitle}>{t("managerShell.planExistingWeek")}</Text>
        {loading ? <ActivityIndicator color={fieldTheme.color.primary} /> : null}
      </View>
      <View style={styles.weekTiles}>
        {dates.map((date) => {
          const dayRoutes = routes.filter((route) => route.date === date)
          const points = dayRoutes.reduce((sum, route) => sum + route.total, 0)
          return (
            <View key={date} style={styles.weekTile} accessibilityLabel={`${formatPlanDate(date, language)}: ${points}`}>
              <Text style={styles.weekTileWeekday}>{weekdayShort(date, language)}</Text>
              <Text style={styles.weekTileDay}>{Number(date.slice(8))}</Text>
              <Text style={[styles.weekTileCount, points === 0 && styles.weekTileCountEmpty]}>{points > 0 ? points : "–"}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function TargetOption({ target, selected, unavailable, disabled, otherDays, onPress, t, tablet }: { target: PlanningTarget; selected: boolean; unavailable: boolean; disabled: boolean; otherDays?: string; onPress: () => void; t: any; tablet: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.targetOption, tablet && styles.targetOptionTablet, selected && styles.targetOptionSelected, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={[styles.targetMark, selected && styles.targetMarkSelected]}><Icon name={selected ? "checkmark" : target.kind === "contact" ? "medkit-outline" : "business-outline"} size={20} color={selected ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong} /></View>
      <View style={styles.targetCopy}>
        <Text style={styles.targetName}>{target.name || t("managerShell.planUnnamedTarget")}</Text>
        <Text style={styles.targetMeta}>{target.kind === "contact" ? target.organizationName || t("managerShell.planNoWorkplace") : target.address || t("managerShell.planAddressMissing")}</Text>
        {otherDays ? <Text style={styles.targetAlsoOn}>{t("managerShell.planAlsoOn", { days: otherDays })}</Text> : null}
        {unavailable || !target.eligible ? <Text style={styles.targetProblem}>{t("managerShell.planNoActiveWorkplace")}</Text> : null}
      </View>
      <Text style={[styles.targetAction, selected && styles.targetActionSelected]}>{t(selected ? "managerShell.planRemove" : "managerShell.planAdd")}</Text>
    </Pressable>
  )
}

function WeekDayChooser({ dates, activeDate, assignments, routes, lockedDates, multipleDraftDates, today, language, tablet, disabled, onSelect, t }: {
  dates: string[]
  activeDate: string
  assignments: PlanningAssignedTarget[]
  routes: PlanningDetailedRoute[]
  lockedDates: Set<string>
  multipleDraftDates: string[]
  today: string
  language: string
  tablet: boolean
  disabled: boolean
  onSelect: (date: string) => void
  t: any
}) {
  // All seven days at once. The old list scrolled sideways with a full date on
  // every card, so four of seven fit and the fourth was cut in half.
  return (
    <View style={styles.weekDayChooser} testID="mtm-mobile-week-day-list" accessibilityRole="tablist">
      {dates.map((date) => {
        const rows = targetsForPlanningDay(date, assignments, routes)
        const locked = date < today || lockedDates.has(date) || multipleDraftDates.includes(date)
        const selected = date === activeDate
        const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
        const weekend = weekday === 0 || weekday === 6
        return (
          <Pressable
            key={date}
            accessibilityRole="tab"
            accessibilityLabel={`${formatPlanDate(date, language)}, ${rows.length > 0 ? t("managerShell.planDayVisits", { count: rows.length }) : t("managerShell.planDayEmpty")}`}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onSelect(date)}
            style={({ pressed }) => [
              styles.weekDayTile,
              tablet && styles.weekDayTileTablet,
              weekend && styles.weekDayTileWeekend,
              date === today && styles.weekDayTileToday,
              selected && styles.weekDayTileActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.weekDayTileWeekday, selected && styles.weekDayTileTextActive]}>{weekdayShort(date, language)}</Text>
            <Text style={[styles.weekDayTileDay, selected && styles.weekDayTileTextActive]}>{Number(date.slice(8))}</Text>
            {locked ? (
              <Icon name="lock-closed" size={14} color={selected ? fieldTheme.color.onColor : fieldTheme.color.amber} />
            ) : (
              <View style={[styles.weekDayTileBadge, rows.length === 0 && styles.weekDayTileBadgeEmpty, selected && rows.length > 0 && styles.weekDayTileBadgeActive]}>
                <Text style={[styles.weekDayTileBadgeText, selected && styles.weekDayTileBadgeTextActive]}>{rows.length > 0 ? rows.length : " "}</Text>
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

function DayPlanEditor({ date, rows, lockedCells, editable, editingPublished = false, highlightKeys, changePlan, saving, language, onMove, onRemove, t }: {
  date: string
  rows: PlanningAssignedTarget[]
  lockedCells: Set<string>
  editable: boolean
  /** Editing a published day: a locked row is a visited stop and says so. */
  editingPublished?: boolean
  /** Rows the server or the client check named as the problem. */
  highlightKeys?: Set<string>
  changePlan?: { label: string; onPress: () => void }
  saving: boolean
  language: string
  onMove: (target: PlanningTarget, date: string, direction: -1 | 1) => void
  onRemove: (target: PlanningTarget, date: string) => void
  t: any
}) {
  return (
    <View style={styles.dayPlanEditor} testID={`mtm-mobile-day-plan-${date}`}>
      <View style={styles.dayPlanHeader}>
        <View style={styles.dayPlanHeaderIcon}><Icon name="calendar" size={20} color={fieldTheme.color.onColor} /></View>
        <View style={styles.dayPlanHeaderCopy}>
          <Text style={styles.dayPlanDate}>{formatPlanDate(date, language)}</Text>
          <Text style={styles.dayPlanCount}>{rows.length > 0 ? t("managerShell.planDayVisits", { count: rows.length }) : t("managerShell.planDayEmpty")}</Text>
        </View>
        {!editable && changePlan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={changePlan.onPress}
            testID={`mtm-mobile-change-plan-${date}`}
            style={({ pressed }) => [styles.dayPlanChangeButton, saving && styles.disabled, pressed && styles.pressed]}
          >
            <Icon name="create-outline" size={16} color={fieldTheme.color.onColor} />
            <Text style={styles.dayPlanChangeText}>{changePlan.label}</Text>
          </Pressable>
        ) : !editable ? <View style={styles.dayPlanLockedPill}><Icon name="lock-closed" size={14} color={fieldTheme.color.amber} /><Text style={styles.dayPlanLockedText}>{t("managerShell.planLockedShort")}</Text></View> : null}
      </View>
      {rows.length === 0 ? (
        <View style={styles.dayPlanEmpty}>
          <Icon name="location-outline" size={24} color={fieldTheme.color.inkMuted} />
          <Text style={styles.dayPlanEmptyText}>{t("managerShell.planDayAddHint")}</Text>
        </View>
      ) : (
        <View style={styles.dayStopList}>
          {rows.map((target, index) => {
            const locked = lockedCells.has(`${date}|${target.key}`)
            const controlsDisabled = saving || !editable || locked
            const highlighted = highlightKeys?.has(target.key) === true
            return (
              <View key={`${date}|${target.key}`} style={[styles.dayStopRow, locked && styles.dayStopRowLocked, highlighted && styles.dayStopRowHighlighted]}>
                <View style={styles.dayStopOrder}><Text style={styles.dayStopOrderText}>{index + 1}</Text></View>
                <View style={styles.dayStopCopy}>
                  <Text style={styles.dayStopName}>{target.name}</Text>
                  <Text style={styles.dayStopMeta}>{target.organizationName || target.address || t("managerShell.planAddressMissing")}</Text>
                </View>
                {locked && editingPublished ? (
                  <View style={styles.dayStopVisited} accessibilityLabel={t("managerShell.planVisitedStop")}>
                    <Icon name="lock-closed" size={14} color={fieldTheme.color.amber} />
                    <Text numberOfLines={1} style={styles.dayStopVisitedText}>{t("managerShell.planVisitedStop")}</Text>
                  </View>
                ) : locked ? (
                  <Icon name="lock-closed" size={19} color={fieldTheme.color.amber} />
                ) : (
                  <View style={styles.dayStopActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planMoveUp")} accessibilityState={{ disabled: controlsDisabled || index === 0 }} disabled={controlsDisabled || index === 0} onPress={() => onMove(target, date, -1)} style={({ pressed }) => [styles.dayStopAction, (controlsDisabled || index === 0) && styles.disabled, pressed && styles.pressed]}><Icon name="arrow-up" size={19} color={fieldTheme.color.primaryStrong} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planMoveDown")} accessibilityState={{ disabled: controlsDisabled || index === rows.length - 1 }} disabled={controlsDisabled || index === rows.length - 1} onPress={() => onMove(target, date, 1)} style={({ pressed }) => [styles.dayStopAction, (controlsDisabled || index === rows.length - 1) && styles.disabled, pressed && styles.pressed]}><Icon name="arrow-down" size={19} color={fieldTheme.color.primaryStrong} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${t("managerShell.planRemove")}: ${target.name}`} accessibilityState={{ disabled: controlsDisabled }} disabled={controlsDisabled} onPress={() => onRemove(target, date)} style={({ pressed }) => [styles.dayStopAction, styles.dayStopRemove, controlsDisabled && styles.disabled, pressed && styles.pressed]}><Icon name="trash-outline" size={19} color={fieldTheme.color.danger} /></Pressable>
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function Notice({ tone, icon, title, body, action, onAction }: { tone: "neutral" | "success" | "warning" | "danger"; icon: string; title: string; body?: string; action?: string; onAction?: () => void }) {
  const colors = tone === "success"
    ? { bg: fieldTheme.color.successSoft, border: fieldTheme.color.success, ink: fieldTheme.color.success }
    : tone === "warning"
      ? { bg: fieldTheme.color.amberSoft, border: fieldTheme.color.amber, ink: fieldTheme.color.amber }
      : tone === "danger"
        ? { bg: fieldTheme.color.dangerSoft, border: fieldTheme.color.danger, ink: fieldTheme.color.danger }
        : { bg: fieldTheme.color.blueSoft, border: fieldTheme.color.blue, ink: fieldTheme.color.blue }
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg, borderColor: colors.border }]} accessibilityLiveRegion="polite">
      <Icon name={icon} size={22} color={colors.ink} />
      <View style={styles.noticeCopy}><Text style={[styles.noticeTitle, { color: colors.ink }]}>{title}</Text>{body ? <Text style={styles.noticeBody}>{body}</Text> : null}</View>
      {action && onAction ? <Pressable accessibilityRole="button" style={styles.noticeAction} onPress={onAction}><Text style={[styles.noticeActionText, { color: colors.ink }]}>{action}</Text></Pressable> : null}
    </View>
  )
}

function InlineEmpty({ icon, text, action, onAction }: { icon: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.inlineEmpty}>
      <Icon name={icon} size={24} color={fieldTheme.color.inkMuted} />
      <Text style={styles.inlineEmptyText}>{text}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" style={styles.inlineEmptyAction} onPress={onAction}><Text style={styles.inlineEmptyActionText}>{action}</Text></Pressable> : null}
    </View>
  )
}

function PlannerActionDock({ action, backLabel, backIcon = "arrow-back", showBack, disabled, bottomInset, onBack }: {
  action: { icon: string; label: string; hint?: string; disabled: boolean; onPress: () => void }
  backLabel: string
  backIcon?: string
  showBack: boolean
  disabled: boolean
  bottomInset: number
  onBack: () => void
}) {
  return (
    <View style={[styles.actionDock, { paddingBottom: bottomInset }]}>
      {action.hint ? <Text numberOfLines={1} style={styles.actionDockHint}>{action.hint}</Text> : null}
      <View style={styles.actionDockRow}>
        {showBack ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onBack} style={({ pressed }) => [styles.backAction, disabled && styles.disabled, pressed && styles.pressed]}>
            <Icon name={backIcon} size={20} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.backActionText}>{backLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: action.disabled }} disabled={action.disabled} onPress={action.onPress} style={({ pressed }) => [styles.primaryAction, action.disabled && styles.primaryActionDisabled, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={styles.primaryActionText}>{action.label}</Text>
          <Icon name={action.icon} size={21} color={fieldTheme.color.onColor} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  workspaceScroll: { flex: 1 },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.md, paddingBottom: fieldTheme.space.sm },
  headerInner: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, width: "100%", maxWidth: 1180, alignSelf: "center" },
  headerInnerTablet: { paddingVertical: fieldTheme.space.xs },
  headerBack: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: "rgba(255,255,255,0.12)" },
  headerIcon: { width: 40, height: 40, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: "#BBD6CB", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  title: { color: fieldTheme.color.onColor, fontSize: 21, lineHeight: 25, fontWeight: "900" },
  subtitle: { color: "#D7E9E1", fontSize: 11, lineHeight: 15, maxWidth: 720 },
  updatedPill: { minWidth: 34, minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  updatedText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: 10, paddingBottom: fieldTheme.space.md, gap: 10 },
  contentTablet: { padding: fieldTheme.space.md, gap: fieldTheme.space.md },
  stepRail: { minHeight: 52, flexDirection: "row", alignItems: "flex-start", paddingHorizontal: fieldTheme.space.sm, paddingVertical: 6, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  stepTab: { width: 70, alignItems: "center", gap: 3 },
  stepConnector: { flex: 1, height: 2, marginTop: 14, backgroundColor: fieldTheme.color.border },
  stepConnectorActive: { backgroundColor: fieldTheme.color.primary },
  stepNumber: { width: 30, height: 30, borderRadius: fieldTheme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong, borderWidth: 1, borderColor: fieldTheme.color.border },
  stepNumberActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  stepNumberText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "900" },
  stepNumberTextActive: { color: fieldTheme.color.onColor },
  stepLabel: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  stepLabelActive: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  helpButton: { width: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  plannerCoach: { gap: fieldTheme.space.sm, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft, borderWidth: 1, borderColor: fieldTheme.color.blue },
  plannerCoachTablet: { flexDirection: "row", alignItems: "center" },
  plannerCoachLead: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm },
  plannerCoachIcon: { width: 34, height: 34, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface },
  plannerCoachCopy: { flex: 1, gap: 3 },
  plannerCoachTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  plannerCoachBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 18 },
  plannerCoachDismiss: { minHeight: LAYOUT_TOUCH_TARGETS.compact, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  plannerCoachDismissTablet: { alignSelf: "auto" },
  plannerCoachDismissText: { color: fieldTheme.color.blue, fontSize: 12, fontWeight: "900" },
  stepBody: { gap: 10 },
  sectionIntro: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm },
  sectionNumber: { width: 34, height: 34, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.blue },
  sectionNumberText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  sectionIntroCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  sectionBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, maxWidth: 760 },
  setupGrid: { gap: fieldTheme.space.md },
  setupGridTablet: { flexDirection: "row", alignItems: "stretch" },
  setupPanel: { flex: 1, gap: 10, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  agentPanel: { minHeight: 170 },
  fieldLabel: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  fieldHelp: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 1 },
  fieldHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  fieldHeadingCopy: { flex: 1 },
  monthWeekdays: { flexDirection: "row", marginTop: fieldTheme.space.sm },
  monthWeekday: { flex: 1, textAlign: "center", color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  monthCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  monthDay: { borderRadius: fieldTheme.radius.sm },
  monthDayWeekend: { backgroundColor: fieldTheme.color.surfaceStrong },
  monthDayToday: { borderWidth: 1, borderColor: fieldTheme.color.primary },
  monthDayInWindow: { backgroundColor: fieldTheme.color.primarySoft },
  monthDaySelected: { backgroundColor: fieldTheme.color.primary },
  monthDayDisabled: { opacity: 0.35 },
  monthDayText: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "700" },
  monthDayTextSelected: { color: fieldTheme.color.onColor },
  monthDayTextDisabled: { color: fieldTheme.color.inkMuted },
  compactDateButton: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, paddingVertical: fieldTheme.space.xs, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft, borderWidth: 1, borderColor: fieldTheme.color.blue },
  compactDateIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface },
  compactDateCopy: { flex: 1, gap: 2 },
  compactDateValue: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  compactDateHint: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  dateSheetBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.lg, backgroundColor: "rgba(19,35,31,0.45)" },
  dateSheet: { width: "100%", maxWidth: 520, gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface },
  dateSheetHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  squareButton: { width: LAYOUT_TOUCH_TARGETS.expandedTablet, height: LAYOUT_TOUCH_TARGETS.expandedTablet, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.blue },
  dateCopy: { flex: 1, alignItems: "center", gap: 5 },
  dateTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900", textAlign: "center" },
  todayButton: { minHeight: 28, justifyContent: "center", paddingHorizontal: 10, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  todayButtonText: { color: fieldTheme.color.blue, fontSize: 11, fontWeight: "900" },
  segment: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet, flexDirection: "row", gap: fieldTheme.space.xs, padding: fieldTheme.space.xs, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  segmentButton: { flex: 1, minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm },
  segmentButtonActive: { backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.primary },
  segmentText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "800", textAlign: "center" },
  segmentTextActive: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  agentListScroller: { maxHeight: 190 },
  agentList: { gap: 6, paddingRight: 2 },
  agentOption: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  agentOptionSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  agentAvatar: { width: 34, height: 34, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  agentAvatarSelected: { backgroundColor: fieldTheme.color.primary },
  agentName: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  agentNameSelected: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  weekSnapshot: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  snapshotHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  snapshotTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  notice: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1 },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  noticeAction: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 10 },
  noticeActionText: { fontSize: 12, fontWeight: "900" },
  selfPlanDate: { gap: 6, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  selectionSummary: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, paddingVertical: 4, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  selectionSummaryText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  textButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 8 },
  textButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  weekDayChooser: { flexDirection: "row", gap: 6 },
  dayPlanEditor: { gap: 8, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  dayPlanHeader: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  dayPlanHeaderIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary },
  dayPlanHeaderCopy: { flex: 1, gap: 2 },
  dayPlanDate: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  dayPlanCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  dayPlanLockedPill: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.amberSoft },
  dayPlanLockedText: { color: fieldTheme.color.amber, fontSize: 10, fontWeight: "900" },
  dayPlanChangeButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primary },
  dayPlanChangeText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  dayPlanEmpty: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderStyle: "dashed", borderColor: fieldTheme.color.border },
  dayPlanEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  dayStopList: { gap: 6 },
  dayStopRow: { minHeight: 66, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, padding: 7, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  dayStopRowLocked: { backgroundColor: fieldTheme.color.amberSoft, borderColor: fieldTheme.color.amber },
  dayStopRowHighlighted: { borderColor: fieldTheme.color.danger, borderWidth: 2, backgroundColor: fieldTheme.color.dangerSoft },
  dayStopVisited: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  dayStopVisitedText: { color: fieldTheme.color.amber, fontSize: 11, fontWeight: "900" },
  dayStopOrder: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primarySoft },
  dayStopOrderText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  dayStopCopy: { flex: 1, minWidth: 150, gap: 2 },
  dayStopName: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  dayStopMeta: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 14 },
  dayStopActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  dayStopAction: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  dayStopRemove: { backgroundColor: fieldTheme.color.dangerSoft },
  targetBrowser: { gap: 8, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetBrowserHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  targetBrowserHeadingCopy: { flex: 1 },
  activeDayPill: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  activeDayPillText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  targetTypeTabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  targetTypeButton: { minWidth: 104, minHeight: LAYOUT_TOUCH_TARGETS.compact, flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 9, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetTypeButtonActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  targetTypeText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900", textAlign: "center" },
  targetTypeTextActive: { color: fieldTheme.color.onColor },
  searchBox: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  searchInput: { flex: 1, minHeight: 46, paddingVertical: 0, color: fieldTheme.color.ink, fontSize: 14 },
  clearButton: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  scopeNote: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  loadingBlock: { minHeight: 96, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 13 },
  resultCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  loadMoreTargets: { alignSelf: "center", minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  loadMoreTargetsText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  targetList: { gap: 6, paddingRight: 2 },
  targetListTablet: { flexDirection: "row", flexWrap: "wrap" },
  targetOption: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: 9, paddingVertical: 7, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetOptionTablet: { width: "49%" },
  targetOptionSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  targetMark: { width: 36, height: 36, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  targetMarkSelected: { backgroundColor: fieldTheme.color.primary },
  targetCopy: { flex: 1, gap: 2 },
  targetName: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  targetMeta: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  targetProblem: { color: fieldTheme.color.danger, fontSize: 11, fontWeight: "800" },
  targetAction: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  targetActionSelected: { color: fieldTheme.color.danger },
  inlineEmpty: { minHeight: 92, alignItems: "center", justifyContent: "center", gap: 6, padding: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  inlineEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  inlineEmptyAction: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 16, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  inlineEmptyActionText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  matrixList: { gap: fieldTheme.space.sm },
  dayReviewList: { gap: fieldTheme.space.md },
  dailyReviewRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  dailyReviewIconLocked: { backgroundColor: fieldTheme.color.amberSoft },
  dailyRemoveButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.dangerSoft },
  dailyRemoveText: { color: fieldTheme.color.danger, fontSize: 11, fontWeight: "900" },
  dailyLockedText: { color: fieldTheme.color.amber, fontSize: 11, fontWeight: "900" },
  matrixRow: { gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  matrixRowTablet: { flexDirection: "row", alignItems: "center" },
  matrixTarget: { minWidth: 240, flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  matrixIcon: { width: 40, height: 40, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  matrixTargetCopy: { flex: 1, gap: 2 },
  matrixTargetName: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  matrixTargetMeta: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15 },
  matrixCells: { gap: fieldTheme.space.sm },
  matrixCell: { minWidth: 92, minHeight: 62, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  matrixCellSelected: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary },
  matrixCellLocked: { backgroundColor: fieldTheme.color.amberSoft, borderColor: fieldTheme.color.amber },
  matrixCellDisabled: { opacity: 0.48 },
  matrixCellDay: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800" },
  matrixCellDaySelected: { color: fieldTheme.color.ink, fontWeight: "900" },
  copyDayButton: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, paddingVertical: 8, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  copyDayCopy: { flex: 1 },
  copyDayTitle: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  copyDayHint: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 1 },
  targetAlsoOn: { color: fieldTheme.color.primaryStrong, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  weekTiles: { flexDirection: "row", gap: 6 },
  weekTile: { flex: 1, minWidth: 0, alignItems: "center", gap: 1, paddingVertical: 6, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekTileWeekday: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  weekTileDay: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  weekTileCount: { color: fieldTheme.color.blue, fontSize: 13, fontWeight: "900" },
  weekTileCountEmpty: { color: fieldTheme.color.inkMuted },
  weekDayTile: { flex: 1, minWidth: 0, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekDayTileTablet: { minHeight: 84 },
  weekDayTileWeekend: { backgroundColor: fieldTheme.color.surfaceStrong },
  weekDayTileToday: { borderColor: fieldTheme.color.primary },
  weekDayTileActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  weekDayTileWeekday: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  weekDayTileDay: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  weekDayTileTextActive: { color: fieldTheme.color.onColor },
  weekDayTileBadge: { minWidth: 20, height: 18, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: fieldTheme.color.primarySoft },
  weekDayTileBadgeEmpty: { backgroundColor: "transparent" },
  weekDayTileBadgeActive: { backgroundColor: fieldTheme.color.onColor },
  weekDayTileBadgeText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  weekDayTileBadgeTextActive: { color: fieldTheme.color.primaryStrong },
  savePanel: { gap: 8, padding: 10, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  permissionNote: { color: fieldTheme.color.amber, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  actionDock: { gap: 4, paddingTop: 7, paddingHorizontal: 10, backgroundColor: fieldTheme.color.surface, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, shadowColor: fieldTheme.color.ink, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -3 }, elevation: 9 },
  actionDockHint: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 13, fontWeight: "700", textAlign: "center" },
  actionDockRow: { width: "100%", maxWidth: 1180, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8 },
  backAction: { minWidth: 100, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 12, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: fieldTheme.color.primary },
  backActionText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  primaryAction: { minHeight: 50, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  primaryActionDisabled: { backgroundColor: fieldTheme.color.inkMuted, opacity: 0.48 },
  primaryActionText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
  disabledText: { opacity: 0.5 },
})
