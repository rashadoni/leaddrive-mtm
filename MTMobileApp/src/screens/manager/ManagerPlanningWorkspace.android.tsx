import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { useBootstrapStore } from "../../store/bootstrap"
import { useAuthStore } from "../../store/auth"
import { useHintsStore } from "../../store/hints"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { api } from "../../services/api"
import {
  DEFAULT_MOBILE_ROUTE_TARGET_TYPES,
  mobileRouteTargetLabel,
  type MobileRouteTargetType,
} from "../../services/bootstrap"
import {
  assignPlanningTarget,
  buildPlanningRouteWrites,
  editablePlanningTargets,
  invalidPlanningAssignmentDates,
  lockedPlanningDates,
  lockedPlanningTargetCells,
  movePlanningTarget,
  nextPlanningTime,
  planningDateKeys,
  planningDraftConflictDates,
  planningPublishConflictDates,
  planningTargetForDate,
  planningLocalTimeToIso,
  planningTimeLabel,
  planningTodayKey,
  planningWriteConflictDates,
  publishablePlanningDrafts,
  removePlanningTarget,
  shiftPlanningDateKey,
  toPlanningAgent,
  toPlanningContactTarget,
  toPlanningDetailedRoute,
  toPlanningOrganizationTarget,
  updatePlanningTargetTime,
  type PlanningAgent,
  type PlanningAssignedTarget,
  type PlanningDetailedRoute,
  type PlanningHorizon,
  type PlanningTarget,
} from "../../services/manager-planning"

type PlanningStep = 1 | 2 | 3
type SaveMode = "draft" | "publish"
type PlannerMode = "manager" | "self"

const SELF_PLANNER_COPY = {
  ru: {
    eyebrow: "Мой план",
    title: "Создайте свой маршрут",
    daySubtitle: "Выберите одну дату, добавьте клиентов и сохраните маршрут.",
    weekSubtitle: "Выберите начало недели, добавьте клиентов и распределите визиты по семи дням.",
    agentLabel: "Ваш маршрут",
    agentHelp: "Вы планируете встречи только для себя.",
  },
  az: {
    eyebrow: "Mənim planım",
    title: "Öz marşrutunuzu yaradın",
    daySubtitle: "Bir tarix seçin, müştəriləri əlavə edin və marşrutu yadda saxlayın.",
    weekSubtitle: "Həftənin başlanğıcını seçin, müştəriləri əlavə edin və ziyarətləri yeddi gün üzrə bölüşdürün.",
    agentLabel: "Sizin marşrutunuz",
    agentHelp: "Görüşləri yalnız özünüz üçün planlaşdırırsınız.",
  },
  en: {
    eyebrow: "My plan",
    title: "Create your route",
    daySubtitle: "Choose one date, add customers, and save the route.",
    weekSubtitle: "Choose the start of the week, add customers, and distribute visits across seven days.",
    agentLabel: "Your route",
    agentHelp: "You are planning meetings only for yourself.",
  },
} as const

function selfPlannerLanguage(language: string): keyof typeof SELF_PLANNER_COPY {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function routeStatusKey(status: string): string {
  switch (status) {
    case "DRAFT": return "managerShell.planStatusDraft"
    case "PLANNED": return "managerShell.planStatusPublished"
    case "IN_PROGRESS": return "managerShell.planStatusActive"
    case "COMPLETED": return "managerShell.planStatusCompleted"
    case "CANCELLED": return "managerShell.planStatusCancelled"
    default: return "managerShell.planStatusUnknown"
  }
}

function formatPlanDate(value: string, language: string, compact = false): string {
  return formatLocalizedDate(value, language, compact
    ? { day: "numeric", month: "long", timeZone: "UTC" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
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

export default function ManagerPlanningWorkspace({
  onClose,
  mode = "manager",
  initialDate,
  initialHorizon,
}: {
  onClose?: () => void
  mode?: PlannerMode
  initialDate?: string
  initialHorizon?: PlanningHorizon
} = {}) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const tenantTimezone = useBootstrapStore((state) => state.data?.timezone)
  const configuredTargetTypes = useBootstrapStore((state) => state.data?.routeTargetTypes)
  const mayPlanOwnRoutes = useBootstrapStore((state) => state.data?.policies.canPlanOwnRoutes === true)
  const currentAgent = useAuthStore((state) => state.agent)
  const selfPlanning = mode === "self"
  const selfCopy = SELF_PLANNER_COPY[selfPlannerLanguage(i18n.language)]
  const [clock, setClock] = useState(() => new Date())
  const today = useMemo(() => planningTodayKey(clock, tenantTimezone), [clock, tenantTimezone])
  const [step, setStep] = useState<PlanningStep>(1)
  const [forcedHelpStep, setForcedHelpStep] = useState<PlanningStep | null>(null)
  const [anchor, setAnchor] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(initialDate ?? "") ? initialDate as string : today)
  const [horizon, setHorizon] = useState<PlanningHorizon>(() => initialHorizon ?? (selfPlanning ? 1 : 7))
  const dates = useMemo(() => planningDateKeys(anchor, horizon), [anchor, horizon])
  const singleDay = horizon === 1
  const routeTargetTypes = useMemo(
    () => configuredTargetTypes?.filter((target) => target.enabled) ?? DEFAULT_MOBILE_ROUTE_TARGET_TYPES,
    [configuredTargetTypes],
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
  const [targetTotal, setTargetTotal] = useState(0)
  const [targetReload, setTargetReload] = useState(0)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [agentError, setAgentError] = useState(false)
  const [planError, setPlanError] = useState(false)
  const [targetError, setTargetError] = useState(false)
  const [canPublish, setCanPublish] = useState(false)
  const [saveMode, setSaveMode] = useState<SaveMode>("draft")
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const hintsEnabled = useHintsStore((state) => state.enabled)
  const dismissedHints = useHintsStore((state) => state.dismissed)
  const hintsHydrated = useHintsStore((state) => state.hydrated)
  const dismissHint = useHintsStore((state) => state.dismiss)
  const planRequest = useRef(0)
  const saveRequest = useRef(0)
  const savingRef = useRef(false)
  const contextVersion = useRef(0)
  const previousToday = useRef(today)

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId) ?? null, [agentId, agents])
  const activeTargetType = useMemo(
    () => routeTargetTypes.find((target) => target.id === targetTypeId) ?? routeTargetTypes[0],
    [routeTargetTypes, targetTypeId],
  )
  const targetKind = activeTargetType?.direction === "DOCTOR" ? "contact" : "organization"
  const lockedDates = useMemo(() => new Set(lockedPlanningDates(routes)), [routes])
  const lockedCells = useMemo(() => new Set(lockedPlanningTargetCells(routes)), [routes])
  const multipleDraftDates = useMemo(() => planningDraftConflictDates(routes, agentId), [agentId, routes])
  const invalidAssignmentDates = useMemo(() => invalidPlanningAssignmentDates(assignments), [assignments])
  const matrixTargets = useMemo(() => uniqueTargets(assignments, routes), [assignments, routes])
  const mutableTargetCount = useMemo(() => new Set(assignments.map((target) => target.key)).size, [assignments])
  const activeDayTargets = useMemo(() => targetsForPlanningDay(activeDate, assignments, routes), [activeDate, assignments, routes])
  const activeDateEditable = activeDate >= today && !lockedDates.has(activeDate) && !multipleDraftDates.includes(activeDate)
  const planningHintId = `planning.${singleDay ? "day" : "week"}.step.${step}`
  const planningHelpKey = step === 1
    ? (singleDay ? "managerShell.planHelpDayStep1" : "managerShell.planHelpWeekStep1")
    : step === 2
      ? (singleDay ? "managerShell.planHelpDayStep2" : "managerShell.planHelpWeekStep2")
      : (singleDay ? "managerShell.planHelpDayStep3" : "managerShell.planHelpWeekStep3")
  const plannerHelpVisible = forcedHelpStep === step || (
    hintsHydrated && hintsEnabled && !dismissedHints.includes(planningHintId)
  )

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
    contextVersion.current += 1
  }, [])

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true)
    setAgentError(false)
    if (selfPlanning) {
      if (!mayPlanOwnRoutes || !currentAgent?.id || String(currentAgent.role).toUpperCase() !== "AGENT") {
        setAgents([])
        setAgentId("")
        setAgentError(true)
      } else {
        const self: PlanningAgent = { id: currentAgent.id, name: currentAgent.name || "—", role: "AGENT" }
        setAgents([self])
        setAgentId(self.id)
      }
      setLoadingAgents(false)
      return
    }
    try {
      const response = await api.getManagerTeam()
      const rawAgents: unknown[] = Array.isArray(response?.data?.agents) ? response.data.agents : []
      const next = rawAgents
        .map(toPlanningAgent)
        .filter((agent): agent is PlanningAgent => agent !== null)
      setAgents(next)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setAgentError(true)
    } finally {
      setLoadingAgents(false)
    }
  }, [currentAgent?.id, currentAgent?.name, currentAgent?.role, mayPlanOwnRoutes, selfPlanning])

  const loadPlan = useCallback(async (selectedAgentId: string, selectedDates: string[], preserve = false) => {
    if (!selectedAgentId) return
    const requestId = ++planRequest.current
    setLoadingPlan(true)
    setPlanError(false)
    if (!preserve) {
      setRoutes([])
      setAssignments([])
    }
    try {
      const responses = await Promise.all(selectedDates.map((date) => api.getRoutesForAgent(date, selectedAgentId)))
      if (requestId !== planRequest.current) return
      const nextRoutes = detailedRoutesFromResponses(responses)
      setRoutes(nextRoutes)
      setAssignments(editablePlanningTargets(nextRoutes, selectedAgentId))
      setDirtyDates(new Set())
      setCanPublish(responses.some((response: any) => response?.data?.capabilities?.canPublish === true))
      setUpdatedAt(Date.now())
    } catch (error: any) {
      if (requestId !== planRequest.current || error?.message === "SESSION_EXPIRED") return
      setPlanError(true)
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
    if (step !== 2) return
    const controller = new AbortController()
    setLoadingTargets(true)
    setTargetError(false)
    setTargetResults([])
    const request = targetKind === "organization"
      ? api.getOrganizations({
          search: debouncedSearch || undefined,
          page: 1,
          limit: 50,
          objectType: activeTargetType?.objectType ?? undefined,
          organizationKind: activeTargetType?.organizationKind ?? undefined,
        }, controller.signal)
      : api.getContacts({ search: debouncedSearch || undefined, page: 1, limit: 50 }, controller.signal)
    request.then((response: any) => {
      if (controller.signal.aborted) return
      const rawRows: unknown[] = targetKind === "organization"
        ? (Array.isArray(response?.data?.organizations) ? response.data.organizations : [])
        : (Array.isArray(response?.data?.contacts) ? response.data.contacts : [])
      const mapper = targetKind === "organization" ? toPlanningOrganizationTarget : toPlanningContactTarget
      setTargetResults(rawRows.map(mapper).filter((target): target is PlanningTarget => target !== null))
      setTargetTotal(Number(response?.data?.total ?? rawRows.length))
    }).catch((error: any) => {
      if (!controller.signal.aborted && error?.message !== "SESSION_EXPIRED") setTargetError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingTargets(false)
    })
    return () => controller.abort()
  }, [activeTargetType?.objectType, activeTargetType?.organizationKind, debouncedSearch, step, targetKind, targetReload])

  const changeWindow = (nextAnchor: string, nextHorizon = horizon) => {
    if (saving) return
    planRequest.current += 1
    saveRequest.current += 1
    contextVersion.current += 1
    setAnchor(nextAnchor)
    setHorizon(nextHorizon)
    setActiveDate(nextAnchor)
    setStep(1)
    setRoutes([])
    setAssignments([])
    setDirtyDates(new Set())
    setSaveMessage(null)
  }

  const selectAgent = (id: string) => {
    if (saving || id === agentId) return
    planRequest.current += 1
    saveRequest.current += 1
    contextVersion.current += 1
    setAgentId(id)
    setStep(1)
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
    if (saving || !activeDateEditable) return
    const selected = assignments.some((assignment) => assignment.key === target.key && assignment.date === activeDate)
    if (selected) {
      setAssignments((current) => removePlanningTarget(current, target.key, activeDate))
    } else {
      const resolved = planningTargetForDate(target, activeDate)
      if (!resolved) return
      setAssignments((current) => {
        const time = nextPlanningTime(current, activeDate, tenantTimezone)
        const plannedTime = planningLocalTimeToIso(activeDate, time, tenantTimezone)
        return assignPlanningTarget(current, { ...resolved, plannedTime }, activeDate)
      })
    }
    markDirty([activeDate])
    setSaveMessage(null)
  }

  const removeDayTarget = (target: PlanningTarget, date: string) => {
    if (saving || date < today || lockedDates.has(date) || multipleDraftDates.includes(date)) return
    setAssignments((current) => removePlanningTarget(current, target.key, date))
    markDirty([date])
    setSaveMessage(null)
  }

  const changeDayTargetTime = (target: PlanningTarget, date: string, time: string): boolean => {
    if (saving || date < today || lockedDates.has(date) || multipleDraftDates.includes(date)) return false
    const plannedTime = planningLocalTimeToIso(date, time, tenantTimezone)
    if (!plannedTime) return false
    setAssignments((current) => updatePlanningTargetTime(current, target.key, date, plannedTime))
    markDirty([date])
    setSaveMessage(null)
    return true
  }

  const moveDayTarget = (target: PlanningTarget, date: string, direction: -1 | 1) => {
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
  const canSave = Boolean(agentId) && multipleDraftDates.length === 0 && invalidAssignmentDates.length === 0 && !saving && !planError && (
    (saveMode === "draft" && writes.length > 0) ||
    (saveMode === "publish" && canPublish && publishBlockedDates.length === 0 && (
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
    const operationMode = saveMode
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
          const saved = write.existingRouteId
            ? await api.updateRouteDraft(write.existingRouteId, {
                expectedVersion: write.expectedVersion!,
                points: write.points,
              })
            : await api.createRouteDraft({
                agentId: operationAgentId,
                date: write.date,
                points: write.points,
              })
          const routeId = String(saved?.data?.id ?? write.existingRouteId ?? "")
          const version = Number(saved?.data?.version)
          if (!routeId || !Number.isInteger(version) || version < 1) throw planningError("ROUTE_VERSION_MISSING")
          savedWrites.push({ routeId, version, write })
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
            await api.publishRoute(saved.routeId, saved.expectedVersion)
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
          text: t(operationMode === "publish" ? "managerShell.planPublished" : "managerShell.planDraftSaved", {
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

  const confirmAndSave = () => {
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
    Alert.alert(
      `${t("common.clear")}: ${dateLabel}`,
      `${t("managerShell.planRemove")} ${clearedPoints} ${t("managerShell.planStopsShort")}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.clear"), style: "destructive", onPress: () => { void save() } },
      ],
    )
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
          <View style={styles.headerIcon}><Icon name="calendar" size={26} color={fieldTheme.color.onColor} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{selfPlanning ? selfCopy.eyebrow : t("managerShell.planEyebrow")}</Text>
            <Text style={styles.title}>{selfPlanning ? selfCopy.title : t(singleDay ? "managerShell.planDayTitle" : "managerShell.planWeekTitle")}</Text>
            <Text style={styles.subtitle}>{selfPlanning ? (singleDay ? selfCopy.daySubtitle : selfCopy.weekSubtitle) : t(singleDay ? "managerShell.planDayBody" : "managerShell.planWeekBody")}</Text>
          </View>
          {updatedAt ? (
            <View style={styles.updatedPill}>
              <Icon name={planError ? "cloud-offline-outline" : "checkmark-circle"} size={16} color={planError ? fieldTheme.color.amber : fieldTheme.color.primaryStrong} />
              <Text style={styles.updatedText}>{planError ? t("managerShell.planLastLoaded") : t("managerShell.planUpdated")}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl enabled={!saving} refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
        contentContainerStyle={[styles.content, tablet && styles.contentTablet, { paddingBottom: tabBarPadding + fieldTheme.space.xl }]}
      >
        <StepRail step={step} hasAgent={Boolean(agentId)} hasReview={matrixTargets.length > 0 || dirtyDates.size > 0} singleDay={singleDay} disabled={saving} onStep={setStep} t={t} />

        <View style={styles.helpRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("managerShell.planHelpAction")}
            style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
            onPress={() => setForcedHelpStep(step)}
          >
            <Icon name="help-circle-outline" size={20} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.helpButtonText}>{t("managerShell.planHelpAction")}</Text>
          </Pressable>
        </View>
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
            <SectionIntro number="1" title={t(singleDay ? "managerShell.planStepSetupDay" : "managerShell.planStepSetupWeek")} body={t(singleDay ? "managerShell.planStepSetupDayBody" : "managerShell.planStepSetupWeekBody")} />
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
                <View style={styles.dateNavigator}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planPreviousPeriod")} accessibilityState={{ disabled: saving }} disabled={saving} style={({ pressed }) => [styles.squareButton, saving && styles.disabled, pressed && styles.pressed]} onPress={() => changeWindow(shiftPlanningDateKey(anchor, -horizon))}>
                    <Icon name="chevron-back" size={23} color={fieldTheme.color.primaryStrong} />
                  </Pressable>
                  <View style={styles.dateCopy}>
                    <Text style={styles.dateTitle}>{formatPlanDate(anchor, i18n.language)}</Text>
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} style={[styles.todayButton, saving && styles.disabled]} onPress={() => changeWindow(today)}>
                      <Text style={styles.todayButtonText}>{t("managerShell.planToday")}</Text>
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("managerShell.planNextPeriod")} accessibilityState={{ disabled: saving }} disabled={saving} style={({ pressed }) => [styles.squareButton, saving && styles.disabled, pressed && styles.pressed]} onPress={() => changeWindow(shiftPlanningDateKey(anchor, horizon))}>
                    <Icon name="chevron-forward" size={23} color={fieldTheme.color.primaryStrong} />
                  </Pressable>
                </View>
              </View>

              <View style={[styles.setupPanel, styles.agentPanel]}>
                <View style={styles.fieldHeading}>
                  <View style={styles.fieldHeadingCopy}>
                    <Text style={styles.fieldLabel}>{selfPlanning ? selfCopy.agentLabel : t("managerShell.planMainAgent")}</Text>
                    <Text style={styles.fieldHelp}>{selfPlanning ? selfCopy.agentHelp : t("managerShell.planMainAgentHelp")}</Text>
                  </View>
                  {loadingAgents ? <ActivityIndicator color={fieldTheme.color.primary} /> : null}
                </View>
                {agentError ? (
                  <InlineEmpty icon="cloud-offline-outline" text={selfPlanning ? selfCopy.agentHelp : t("managerShell.planAgentsError")} action={!saving ? t("common.retry") : undefined} onAction={!saving ? () => { void loadAgents() } : undefined} />
                ) : selfPlanning && selectedAgent ? (
                  <View style={styles.agentList}>
                    <View accessibilityRole="summary" style={[styles.agentOption, styles.agentOptionSelected]}>
                      <View style={[styles.agentAvatar, styles.agentAvatarSelected]}><Icon name="person" size={20} color={fieldTheme.color.onColor} /></View>
                      <Text style={[styles.agentName, styles.agentNameSelected]}>{selectedAgent.name}</Text>
                      <Icon name="lock-closed" size={18} color={fieldTheme.color.primary} />
                    </View>
                  </View>
                ) : agents.length > 0 ? (
                  <View style={styles.agentList}>
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
                  </View>
                ) : !loadingAgents ? <InlineEmpty icon="people-outline" text={t("managerShell.planNoAgents")} /> : null}
              </View>
            </View>

            {agentId ? (
              <WeekSnapshot dates={dates} routes={routes} loading={loadingPlan} language={i18n.language} t={t} />
            ) : (
              <Notice tone="neutral" icon="person-add-outline" title={t("managerShell.planChooseAgentTitle")} body={t("managerShell.planChooseAgentBody")} />
            )}
            {multipleDraftDates.length > 0 ? <Notice tone="warning" icon="git-compare-outline" title={t("managerShell.planMultipleDraftsTitle")} body={t("managerShell.planMultipleDraftsBody")} /> : null}
            <PrimaryAction
              icon="arrow-forward"
              label={t("managerShell.planChooseStops")}
              hint={!agentId ? t("managerShell.planChooseAgentHint") : loadingPlan ? t("managerShell.planLoadingSchedule") : undefined}
              disabled={saving || !agentId || loadingPlan || planError || multipleDraftDates.length > 0}
              onPress={() => setStep(2)}
            />
          </View>
        ) : step === 2 ? (
          <View style={styles.stepBody}>
            <SectionIntro number="2" title={t("managerShell.planStepTargets")} body={t(singleDay ? "managerShell.planStepTargetsDayBody" : "managerShell.planStepTargetsWeekBody")} />
            <View style={styles.selectionSummary}>
              <Icon name="calendar-outline" size={20} color={fieldTheme.color.blue} />
              <Text style={styles.selectionSummaryText}>{t(singleDay ? "managerShell.planSelectionSummaryDay" : "managerShell.planSelectionSummaryWeek", { people: mutableTargetCount, visits: assignments.length })}</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} style={[styles.textButton, saving && styles.disabled]} onPress={() => setStep(1)}><Text style={styles.textButtonText}>{t("managerShell.planChangeSetup")}</Text></Pressable>
            </View>

            {!singleDay ? (
              <WeekDayChooser
                dates={dates}
                activeDate={activeDate}
                assignments={assignments}
                routes={routes}
                lockedDates={lockedDates}
                multipleDraftDates={multipleDraftDates}
                today={today}
                timezone={tenantTimezone}
                language={i18n.language}
                disabled={saving}
                onSelect={setActiveDate}
                t={t}
              />
            ) : null}

            <DayPlanEditor
              date={activeDate}
              rows={activeDayTargets}
              lockedCells={lockedCells}
              editable={activeDateEditable}
              saving={saving}
              timezone={tenantTimezone}
              language={i18n.language}
              onTime={changeDayTargetTime}
              onMove={moveDayTarget}
              onRemove={removeDayTarget}
              t={t}
            />

            <View style={styles.targetBrowser}>
              <View style={styles.targetBrowserHeading}>
                <View style={styles.targetBrowserHeadingCopy}>
                  <Text style={styles.fieldLabel}>{t("managerShell.planChooseTargetType")}</Text>
                  <Text style={styles.fieldHelp}>{t("managerShell.planChooseTargetTypeHelp")}</Text>
                </View>
                <View style={styles.activeDayPill}>
                  <Icon name="calendar-outline" size={16} color={fieldTheme.color.primaryStrong} />
                  <Text style={styles.activeDayPillText}>{formatPlanDate(activeDate, i18n.language, true)}</Text>
                </View>
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
                placeholder={t("managerShell.planSearchTarget")}
                placeholderTextColor={fieldTheme.color.inkMuted}
                accessibilityLabel={t("managerShell.planSearch")}
                style={styles.searchInput}
                returnKeyType="search"
                editable={!saving && activeDateEditable}
              />
              {targetSearch ? <Pressable accessibilityRole="button" accessibilityLabel={t("common.clear")} accessibilityState={{ disabled: saving }} disabled={saving} style={[styles.clearButton, saving && styles.disabled]} onPress={() => setTargetSearch("")}><Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} /></Pressable> : null}
            </View>
            <Text style={styles.scopeNote}>{t("managerShell.planScopeNote")}</Text>

            {targetError ? (
              <InlineEmpty icon="cloud-offline-outline" text={t("managerShell.planTargetsError")} action={!saving ? t("common.retry") : undefined} onAction={!saving ? () => setTargetReload((value) => value + 1) : undefined} />
            ) : loadingTargets ? (
              <View style={styles.loadingBlock}><ActivityIndicator color={fieldTheme.color.primary} /><Text style={styles.loadingText}>{t("managerShell.planLoadingTargets")}</Text></View>
            ) : targetResults.length > 0 ? (
              <>
                <Text style={styles.resultCount}>{t("managerShell.planResults", { loaded: targetResults.length, total: targetTotal })}</Text>
                <View style={[styles.targetList, tablet && styles.targetListTablet]}>
                  {targetResults.map((target) => {
                    const selectedTarget = activeDayTargets.find((assignment) => assignment.key === target.key)
                    const mutableSelection = assignments.some((assignment) => assignment.key === target.key && assignment.date === activeDate)
                    const selected = Boolean(selectedTarget)
                    const resolved = planningTargetForDate(target, activeDate)
                    const displayTarget = selectedTarget ?? resolved ?? target
                    const unavailable = !selected && !resolved
                    const disabled = saving || !activeDateEditable || (selected && !mutableSelection) || (!selected && !resolved)
                    return (
                      <TargetOption key={target.key} target={displayTarget} selected={selected} unavailable={unavailable} disabled={disabled} onPress={() => toggleTarget(target)} t={t} tablet={tablet} />
                    )
                  })}
                </View>
              </>
            ) : debouncedSearch ? (
              <InlineEmpty icon="search-outline" text={t("managerShell.planNoSearchResults")} />
            ) : (
              <Notice
                tone="neutral"
                icon="people-circle-outline"
                title={t("managerShell.planNoTargets")}
                body={t("managerShell.planNoTargetsBody")}
                action={t("managerShell.planRefreshTargets")}
                onAction={() => setTargetReload((value) => value + 1)}
              />
            )}
            </View>
            {!activeDateEditable ? <Notice tone="warning" icon="lock-closed-outline" title={t("managerShell.planNoEditableDateTitle")} body={t("managerShell.planNoEditableDateBody")} /> : null}
            <PrimaryAction
              icon="checkmark-done-outline"
              label={t(singleDay ? "managerShell.planReviewDay" : "managerShell.planReviewWeek")}
              hint={matrixTargets.length === 0 && dirtyDates.size === 0 ? t("managerShell.planSelectAtLeastOne") : undefined}
              disabled={saving || (matrixTargets.length === 0 && dirtyDates.size === 0)}
              onPress={() => setStep(3)}
            />
          </View>
        ) : (
          <View style={styles.stepBody}>
            <SectionIntro number="3" title={t(singleDay ? "managerShell.planStepReviewDay" : "managerShell.planStepReviewWeek")} body={t(singleDay ? "managerShell.planStepReviewDayBody" : "managerShell.planStepReviewWeekBody")} />
            <View style={styles.selectionSummary}>
              <Icon name="person-circle-outline" size={21} color={fieldTheme.color.primary} />
              <Text style={styles.selectionSummaryText}>{selectedAgent?.name} · {horizon === 1 ? formatPlanDate(anchor, i18n.language, true) : t("managerShell.planDateRange", { start: formatPlanDate(dates[0], i18n.language, true), end: formatPlanDate(dates[dates.length - 1], i18n.language, true) })}</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} style={[styles.textButton, saving && styles.disabled]} onPress={() => setStep(2)}><Text style={styles.textButtonText}>{t("managerShell.planEditTargets")}</Text></Pressable>
            </View>

            <View style={styles.matrixHelp}>
              <Icon name="create-outline" size={19} color={fieldTheme.color.blue} />
              <Text style={styles.matrixHelpText}>{t(singleDay ? "managerShell.planDayReviewHelp" : "managerShell.planWeekReviewHelp")}</Text>
            </View>
            <View style={styles.dayReviewList}>
              {dates.map((date) => (
                <DayPlanEditor
                  key={date}
                  date={date}
                  rows={targetsForPlanningDay(date, assignments, routes)}
                  lockedCells={lockedCells}
                  editable={date >= today && !lockedDates.has(date) && !multipleDraftDates.includes(date)}
                  saving={saving}
                  timezone={tenantTimezone}
                  language={i18n.language}
                  onTime={changeDayTargetTime}
                  onMove={moveDayTarget}
                  onRemove={removeDayTarget}
                  t={t}
                />
              ))}
            </View>
            {matrixTargets.length === 0 && dirtyDates.size > 0 ? <Notice tone="warning" icon="trash-outline" title={t("managerShell.planEmptyDraftTitle")} body={t("managerShell.planEmptyDraftBody")} /> : null}

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
            <PrimaryAction
              icon={saveMode === "publish" ? "send" : "save"}
              label={saving ? t("managerShell.planSaving") : t(saveMode === "publish" ? "managerShell.planSaveAndPublish" : "managerShell.planSaveDraftAction")}
              hint={!canSave && !saving ? t(writes.length === 0 ? "managerShell.planNoDraftChanges" : "managerShell.planResolveWarnings") : undefined}
              disabled={!canSave}
              onPress={confirmAndSave}
            />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function StepRail({ step, hasAgent, hasReview, singleDay, disabled, onStep, t }: { step: PlanningStep; hasAgent: boolean; hasReview: boolean; singleDay: boolean; disabled: boolean; onStep: (step: PlanningStep) => void; t: any }) {
  const steps: Array<{ value: PlanningStep; label: string; enabled: boolean }> = [
    { value: 1, label: t("managerShell.planRailSetup"), enabled: true },
    { value: 2, label: t("managerShell.planRailTargets"), enabled: hasAgent },
    { value: 3, label: t(singleDay ? "managerShell.planRailDayReview" : "managerShell.planRailWeekAssign"), enabled: hasAgent && hasReview },
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

function SectionIntro({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.sectionIntro}>
      <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>{number}</Text></View>
      <View style={styles.sectionIntroCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionBody}>{body}</Text></View>
    </View>
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
  return (
    <View style={styles.weekSnapshot}>
      <View style={styles.snapshotHeading}>
        <View><Text style={styles.snapshotTitle}>{t("managerShell.planExistingWeek")}</Text><Text style={styles.snapshotBody}>{t("managerShell.planExistingWeekBody")}</Text></View>
        {loading ? <ActivityIndicator color={fieldTheme.color.primary} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRail}>
        {dates.map((date) => {
          const dayRoutes = routes.filter((route) => route.date === date)
          const points = dayRoutes.reduce((sum, route) => sum + route.total, 0)
          return (
            <View key={date} style={styles.daySnapshot}>
              <Text style={styles.daySnapshotDate}>{formatPlanDate(date, language, true)}</Text>
              <Text style={styles.daySnapshotValue}>{points}</Text>
              <Text style={styles.daySnapshotLabel}>{t("managerShell.planStopsShort")}</Text>
              <View style={styles.dayStatuses}>
                {dayRoutes.length > 0 ? dayRoutes.slice(0, 2).map((route) => <StatusPill key={route.id} status={route.status} t={t} compact />) : <Text style={styles.dayEmpty}>{t("managerShell.planDayEmpty")}</Text>}
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

function StatusPill({ status, t, compact = false }: { status: string; t: any; compact?: boolean }) {
  const tone = status === "DRAFT" ? styles.statusDraft : status === "COMPLETED" ? styles.statusDone : status === "CANCELLED" ? styles.statusCancelled : styles.statusPublished
  return <View style={[styles.statusPill, tone, compact && styles.statusPillCompact]}><Text style={styles.statusPillText}>{t(routeStatusKey(status))}</Text></View>
}

function TargetOption({ target, selected, unavailable, disabled, onPress, t, tablet }: { target: PlanningTarget; selected: boolean; unavailable: boolean; disabled: boolean; onPress: () => void; t: any; tablet: boolean }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.targetOption, tablet && styles.targetOptionTablet, selected && styles.targetOptionSelected, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={[styles.targetMark, selected && styles.targetMarkSelected]}><Icon name={selected ? "checkmark" : target.kind === "contact" ? "medkit-outline" : "business-outline"} size={20} color={selected ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong} /></View>
      <View style={styles.targetCopy}>
        <Text style={styles.targetName}>{target.name || t("managerShell.planUnnamedTarget")}</Text>
        <Text style={styles.targetMeta}>{target.kind === "contact" ? target.organizationName || t("managerShell.planNoWorkplace") : target.address || t("managerShell.planAddressMissing")}</Text>
        {unavailable || !target.eligible ? <Text style={styles.targetProblem}>{t("managerShell.planNoActiveWorkplace")}</Text> : null}
      </View>
      <Text style={[styles.targetAction, selected && styles.targetActionSelected]}>{t(selected ? "managerShell.planRemove" : "managerShell.planAdd")}</Text>
    </Pressable>
  )
}

function WeekDayChooser({ dates, activeDate, assignments, routes, lockedDates, multipleDraftDates, today, timezone, language, disabled, onSelect, t }: {
  dates: string[]
  activeDate: string
  assignments: PlanningAssignedTarget[]
  routes: PlanningDetailedRoute[]
  lockedDates: Set<string>
  multipleDraftDates: string[]
  today: string
  timezone?: string | null
  language: string
  disabled: boolean
  onSelect: (date: string) => void
  t: any
}) {
  return (
    <View style={styles.weekDayChooser} testID="mtm-mobile-week-day-list">
      <View style={styles.weekDayHeading}>
        <View style={styles.weekDayHeadingIcon}><Icon name="calendar-outline" size={21} color={fieldTheme.color.blue} /></View>
        <View style={styles.weekDayHeadingCopy}>
          <Text style={styles.fieldLabel}>{t("managerShell.planWeekDayTitle")}</Text>
          <Text style={styles.fieldHelp}>{t("managerShell.planWeekDayBody")}</Text>
        </View>
      </View>
      <View style={styles.weekDayRows}>
        {dates.map((date) => {
          const rows = targetsForPlanningDay(date, assignments, routes)
          const times = rows.map((row) => planningTimeLabel(row.plannedTime, timezone)).filter(Boolean).sort()
          const locked = date < today || lockedDates.has(date) || multipleDraftDates.includes(date)
          const selected = date === activeDate
          return (
            <Pressable
              key={date}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onSelect(date)}
              style={({ pressed }) => [styles.weekDayRow, selected && styles.weekDayRowActive, locked && styles.weekDayRowLocked, pressed && styles.pressed]}
            >
              <View style={[styles.weekDayNumber, selected && styles.weekDayNumberActive]}><Text style={[styles.weekDayNumberText, selected && styles.weekDayNumberTextActive]}>{dates.indexOf(date) + 1}</Text></View>
              <View style={styles.weekDayCopy}>
                <Text style={[styles.weekDayDate, selected && styles.weekDayDateActive]}>{formatPlanDate(date, language)}</Text>
                <Text style={styles.weekDaySummary}>
                  {rows.length > 0
                    ? t("managerShell.planDayVisits", { count: rows.length })
                    : t("managerShell.planDayEmpty")}
                  {times.length > 0 ? ` · ${times[0]}${times.length > 1 ? `–${times[times.length - 1]}` : ""}` : ""}
                </Text>
              </View>
              {locked ? <Icon name="lock-closed" size={18} color={fieldTheme.color.amber} /> : <Icon name="chevron-forward" size={20} color={selected ? fieldTheme.color.primary : fieldTheme.color.inkMuted} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function normalizeClockInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

function RouteTimeInput({ value, disabled, label, onCommit }: { value: string; disabled: boolean; label: string; onCommit: (time: string) => boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft) || !onCommit(draft)) setDraft(value)
  }
  return (
    <View style={[styles.routeTimeField, disabled && styles.routeTimeFieldDisabled]}>
      <Icon name="time-outline" size={18} color={disabled ? fieldTheme.color.inkMuted : fieldTheme.color.primaryStrong} />
      <TextInput
        value={draft}
        onChangeText={(next) => setDraft(normalizeClockInput(next))}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder="09:00"
        placeholderTextColor={fieldTheme.color.inkMuted}
        keyboardType="number-pad"
        maxLength={5}
        editable={!disabled}
        accessibilityLabel={label}
        style={styles.routeTimeInput}
      />
    </View>
  )
}

function DayPlanEditor({ date, rows, lockedCells, editable, saving, timezone, language, onTime, onMove, onRemove, t }: {
  date: string
  rows: PlanningAssignedTarget[]
  lockedCells: Set<string>
  editable: boolean
  saving: boolean
  timezone?: string | null
  language: string
  onTime: (target: PlanningTarget, date: string, time: string) => boolean
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
        {!editable ? <View style={styles.dayPlanLockedPill}><Icon name="lock-closed" size={14} color={fieldTheme.color.amber} /><Text style={styles.dayPlanLockedText}>{t("managerShell.planLockedShort")}</Text></View> : null}
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
            return (
              <View key={`${date}|${target.key}`} style={[styles.dayStopRow, locked && styles.dayStopRowLocked]}>
                <View style={styles.dayStopOrder}><Text style={styles.dayStopOrderText}>{index + 1}</Text></View>
                <View style={styles.dayStopCopy}>
                  <Text style={styles.dayStopName}>{target.name}</Text>
                  <Text style={styles.dayStopMeta}>{target.organizationName || target.address || t("managerShell.planAddressMissing")}</Text>
                </View>
                <RouteTimeInput
                  value={planningTimeLabel(target.plannedTime, timezone)}
                  disabled={controlsDisabled}
                  label={`${t("managerShell.planVisitTime")}: ${target.name}`}
                  onCommit={(time) => onTime(target, date, time)}
                />
                {locked ? (
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

function PrimaryAction({ icon, label, hint, disabled, onPress }: { icon: string; label: string; hint?: string; disabled?: boolean; onPress: () => void }) {
  return (
    <View style={styles.primaryActionWrap}>
      {hint ? <Text style={styles.primaryActionHint}>{hint}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryAction, disabled && styles.primaryActionDisabled, pressed && styles.pressed]}>
        <Text style={styles.primaryActionText}>{label}</Text>
        <Icon name={icon} size={22} color={fieldTheme.color.onColor} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg },
  headerInner: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, width: "100%", maxWidth: 1180, alignSelf: "center" },
  headerInnerTablet: { paddingVertical: fieldTheme.space.sm },
  headerBack: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: "rgba(255,255,255,0.12)" },
  headerIcon: { width: 48, height: 48, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: "#BBD6CB", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  title: { color: fieldTheme.color.onColor, fontSize: 25, lineHeight: 30, fontWeight: "900" },
  subtitle: { color: "#D7E9E1", fontSize: 13, lineHeight: 18, maxWidth: 720 },
  updatedPill: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  updatedText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: fieldTheme.space.md, gap: fieldTheme.space.md },
  contentTablet: { padding: fieldTheme.space.xl, gap: fieldTheme.space.lg },
  stepRail: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: fieldTheme.space.sm, paddingVertical: fieldTheme.space.sm },
  stepTab: { width: 76, alignItems: "center", gap: 5 },
  stepConnector: { flex: 1, height: 2, marginTop: 17, backgroundColor: fieldTheme.color.border },
  stepConnectorActive: { backgroundColor: fieldTheme.color.primary },
  stepNumber: { width: 36, height: 36, borderRadius: fieldTheme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong, borderWidth: 1, borderColor: fieldTheme.color.border },
  stepNumberActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  stepNumberText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "900" },
  stepNumberTextActive: { color: fieldTheme.color.onColor },
  stepLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700", textAlign: "center" },
  stepLabelActive: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  helpRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: -fieldTheme.space.sm },
  helpButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  helpButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  plannerCoach: { gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.blueSoft, borderWidth: 1, borderColor: fieldTheme.color.blue },
  plannerCoachTablet: { flexDirection: "row", alignItems: "center" },
  plannerCoachLead: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  plannerCoachIcon: { width: 42, height: 42, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  plannerCoachCopy: { flex: 1, gap: 3 },
  plannerCoachTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  plannerCoachBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 18 },
  plannerCoachDismiss: { minHeight: LAYOUT_TOUCH_TARGETS.compact, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  plannerCoachDismissTablet: { alignSelf: "auto" },
  plannerCoachDismissText: { color: fieldTheme.color.blue, fontSize: 12, fontWeight: "900" },
  stepBody: { gap: fieldTheme.space.lg },
  sectionIntro: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  sectionNumber: { width: 42, height: 42, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.blue },
  sectionNumberText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  sectionIntroCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  sectionBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, maxWidth: 760 },
  setupGrid: { gap: fieldTheme.space.md },
  setupGridTablet: { flexDirection: "row", alignItems: "stretch" },
  setupPanel: { flex: 1, gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  agentPanel: { minHeight: 210 },
  fieldLabel: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  fieldHelp: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  fieldHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  fieldHeadingCopy: { flex: 1 },
  dateNavigator: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft },
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
  agentList: { gap: fieldTheme.space.sm },
  agentOption: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  agentOptionSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  agentAvatar: { width: 38, height: 38, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  agentAvatarSelected: { backgroundColor: fieldTheme.color.primary },
  agentName: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  agentNameSelected: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  weekSnapshot: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  snapshotHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  snapshotTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  snapshotBody: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 2 },
  dayRail: { gap: fieldTheme.space.sm },
  daySnapshot: { width: 142, minHeight: 128, gap: 4, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  daySnapshotDate: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "900", textTransform: "capitalize" },
  daySnapshotValue: { color: fieldTheme.color.blue, fontSize: 25, lineHeight: 30, fontWeight: "900" },
  daySnapshotLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  dayStatuses: { gap: 4, marginTop: 3 },
  dayEmpty: { color: fieldTheme.color.inkMuted, fontSize: 10 },
  statusPill: { alignSelf: "flex-start", minHeight: 26, justifyContent: "center", paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill },
  statusPillCompact: { minHeight: 22 },
  statusDraft: { backgroundColor: fieldTheme.color.amberSoft },
  statusDone: { backgroundColor: fieldTheme.color.successSoft },
  statusCancelled: { backgroundColor: fieldTheme.color.dangerSoft },
  statusPublished: { backgroundColor: fieldTheme.color.blueSoft },
  statusPillText: { color: fieldTheme.color.ink, fontSize: 9, fontWeight: "900" },
  notice: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1 },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  noticeAction: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 10 },
  noticeActionText: { fontSize: 12, fontWeight: "900" },
  selectionSummary: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  selectionSummaryText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  textButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 8 },
  textButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  weekDayChooser: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekDayHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  weekDayHeadingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft },
  weekDayHeadingCopy: { flex: 1 },
  weekDayRows: { gap: fieldTheme.space.sm },
  weekDayRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  weekDayRowActive: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  weekDayRowLocked: { backgroundColor: fieldTheme.color.amberSoft },
  weekDayNumber: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong },
  weekDayNumberActive: { backgroundColor: fieldTheme.color.primary },
  weekDayNumberText: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "900" },
  weekDayNumberTextActive: { color: fieldTheme.color.onColor },
  weekDayCopy: { flex: 1, gap: 3 },
  weekDayDate: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900", textTransform: "capitalize" },
  weekDayDateActive: { color: fieldTheme.color.primaryStrong },
  weekDaySummary: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15 },
  dayPlanEditor: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  dayPlanHeader: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  dayPlanHeaderIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  dayPlanHeaderCopy: { flex: 1, gap: 2 },
  dayPlanDate: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 21, fontWeight: "900", textTransform: "capitalize" },
  dayPlanCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  dayPlanLockedPill: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.amberSoft },
  dayPlanLockedText: { color: fieldTheme.color.amber, fontSize: 10, fontWeight: "900" },
  dayPlanEmpty: { minHeight: 84, alignItems: "center", justifyContent: "center", gap: 5, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderStyle: "dashed", borderColor: fieldTheme.color.border },
  dayPlanEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  dayStopList: { gap: fieldTheme.space.sm },
  dayStopRow: { minHeight: 78, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  dayStopRowLocked: { backgroundColor: fieldTheme.color.amberSoft, borderColor: fieldTheme.color.amber },
  dayStopOrder: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primarySoft },
  dayStopOrderText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  dayStopCopy: { flex: 1, minWidth: 150, gap: 2 },
  dayStopName: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  dayStopMeta: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 14 },
  routeTimeField: { width: 98, minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.primary },
  routeTimeFieldDisabled: { borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surfaceStrong },
  routeTimeInput: { flex: 1, minHeight: LAYOUT_TOUCH_TARGETS.compact, paddingVertical: 0, color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900" },
  dayStopActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  dayStopAction: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  dayStopRemove: { backgroundColor: fieldTheme.color.dangerSoft },
  targetBrowser: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetBrowserHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  targetBrowserHeadingCopy: { flex: 1 },
  activeDayPill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  activeDayPillText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900", textTransform: "capitalize" },
  targetTypeTabs: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  targetTypeButton: { minWidth: 132, minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet, flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetTypeButtonActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  targetTypeText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900", textAlign: "center" },
  targetTypeTextActive: { color: fieldTheme.color.onColor },
  searchBox: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  searchInput: { flex: 1, minHeight: 52, paddingVertical: 0, color: fieldTheme.color.ink, fontSize: 15 },
  clearButton: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  scopeNote: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  loadingBlock: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 13 },
  resultCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  targetList: { gap: fieldTheme.space.sm },
  targetListTablet: { flexDirection: "row", flexWrap: "wrap" },
  targetOption: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  targetOptionTablet: { width: "49%" },
  targetOptionSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  targetMark: { width: 42, height: 42, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  targetMarkSelected: { backgroundColor: fieldTheme.color.primary },
  targetCopy: { flex: 1, gap: 2 },
  targetName: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  targetMeta: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  targetProblem: { color: fieldTheme.color.danger, fontSize: 11, fontWeight: "800" },
  targetAction: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  targetActionSelected: { color: fieldTheme.color.danger },
  inlineEmpty: { minHeight: 132, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  inlineEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  inlineEmptyAction: { minHeight: LAYOUT_TOUCH_TARGETS.compact, justifyContent: "center", paddingHorizontal: 16, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  inlineEmptyActionText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  matrixHelp: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.blueSoft },
  matrixHelpText: { flex: 1, color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
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
  matrixCellDay: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  matrixCellDaySelected: { color: fieldTheme.color.ink, fontWeight: "900" },
  savePanel: { gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  permissionNote: { color: fieldTheme.color.amber, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  primaryActionWrap: { gap: fieldTheme.space.sm, alignItems: "stretch", marginTop: fieldTheme.space.sm },
  primaryActionHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  primaryAction: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  primaryActionDisabled: { backgroundColor: fieldTheme.color.inkMuted, opacity: 0.48 },
  primaryActionText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
  disabledText: { opacity: 0.5 },
})
