import React, { useCallback, useEffect, useMemo, useState } from "react"
import { upperInitial } from "../../lib/upper"
import {
  ActivityIndicator,
  FlatList,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { lastKnownPosition } from "../../services/location"
import { api } from "../../services/api"
import { enqueueMediaUpload } from "../../services/media-outbox"
import {
  queueVisitCheckIn,
  queueVisitCheckOut,
  readOptimisticVisit,
  reconcileOptimisticVisit,
  type OptimisticVisit,
} from "../../services/visit-outbox"
import { useWorkdayStore, workdayKey } from "../../store/workday"
import { runMobileSync } from "../../services/sync-engine"
import { allOutboxOperations, retryOutboxConflict } from "../../services/outbox"
import { checkInOutcomeFromOperation, formatCheckInDistance, type CheckInOutcome } from "./check-in-outcome"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import NotesModal from "../../components/NotesModal"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"
import FeedbackToast from "../../components/FeedbackToast"
import ConfirmSheet from "../../components/ConfirmSheet"
import HintCard from "../../components/HintCard"
import { fieldTheme } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import {
  filterVisitCustomers,
  visitScreenLanguage,
  visitScreenLayout,
} from "./visit-screen-model"
import {
  describeCustomerDistance,
  formatDistanceMeters,
  hasUsableCoordinates,
  resolveCheckInPrecondition,
  type CustomerCoordinateState,
  type PositionFailure,
} from "./visit-checkin-model"

interface Visit {
  id: string
  status: string
  checkInAt: string
  checkOutAt?: string
  duration?: number
  customer: { id: string; name: string; address?: string }
  notes?: string
  pendingCheckOut?: boolean
}

interface Customer {
  id: string
  name: string
  address?: string
  category?: string
  latitude?: number
  longitude?: number
  distanceMeters?: number
  coordinateState?: CustomerCoordinateState
}

type LoadState = "loading" | "ready" | "offline" | "error"

/** Why the last "Start unplanned visit" attempt did not open a visit. Stays on screen until the next attempt. */
type CheckInIssue =
  | { kind: "workday-paused" }
  | { kind: "no-coordinates" }
  | { kind: "implausible-distance"; distanceMeters: number }
  | { kind: "no-position"; reason: PositionFailure }
  | { kind: "too-far"; distanceMeters: number; name: string }
  | { kind: "server" }

const VISIT_COPY = {
  ru: {
    eyebrow: "Работа в поле",
    title: "Визиты",
    subtitle: "Плановые визиты начинайте из Маршрута. Здесь — внеплановый визит и история.",
    helpFlow: "Как провести визит:\n1. Плановый — откройте «Маршрут» и выберите точку.\n2. Внеплановый — найдите клиента ниже.\n3. Начните визит, добавьте нужные фото и нажмите «Завершить».",
    back: "Назад",
    plannedTitle: "Визит уже есть в плане?",
    plannedBody: "Откройте «Маршрут»: там сохранены порядок точек, навигация и плановый чек-ин.",
    openRoute: "Открыть маршрут",
    manualEyebrow: "Внеплановый визит",
    manualTitle: "Выберите клиента",
    manualBody: "Используйте этот шаг, только если клиента нет в сегодняшнем маршруте.",
    search: "Имя клиента",
    searchPlaceholder: "Например, Центральная клиника",
    clearSearch: "Очистить поиск",
    nearest: "Доступные клиенты",
    searchResults: "Результаты поиска",
    resultsCount: "Показано: {{count}}",
    selected: "Выбран",
    choose: "Выбрать клиента",
    start: "Начать внеплановый визит",
    starting: "Проверяем GPS…",
    chooseFirst: "Сначала выберите клиента из списка.",
    noClientsTitle: "Нет доступных клиентов",
    noClientsBody: "Обновите экран. Если список всё равно пуст, попросите менеджера проверить назначения.",
    noSearchTitle: "Клиент не найден",
    noSearchBody: "Проверьте написание или очистите поиск.",
    activeEyebrow: "Визит идёт сейчас",
    activeBody: "Сначала добавьте нужное фото, затем завершите визит и оставьте результат.",
    elapsed: "Идёт {{count}} мин",
    photos: "Фото: {{count}}",
    addPhoto: "Добавить фото",
    finish: "Завершить визит",
    finishing: "Сохраняем…",
    waitingSync: "Завершение сохранено на устройстве и ждёт синхронизации.",
    historyEyebrow: "Последние записи",
    historyTitle: "История визитов",
    historyCount: "{{count}} записей",
    loadingTitle: "Загружаем визиты и клиентов",
    loadingBody: "Сверяем последние данные с сервером.",
    offlineTitle: "Сейчас нет связи",
    offlineBody: "Показываем уже загруженные данные. Новые действия сохранятся на устройстве и синхронизируются позже.",
    errorTitle: "Не удалось загрузить визиты",
    errorBody: "Проверьте интернет и попробуйте снова.",
    retry: "Попробовать снова",
    refresh: "Обновить",
    emptyHistoryTitle: "Истории пока нет",
    emptyHistoryBody: "Плановый визит начните в «Маршруте». Для внепланового визита выберите клиента в соответствующем блоке.",
    activeStatus: "Активен",
    completeStatus: "Завершён",
    pendingStatus: "Ждёт синхронизации",
    noAddress: "Адрес не указан",
    coordinatesMissing: "Координаты не заданы",
    coordinatesSuspicious: "Координаты требуют проверки",
    issuePausedTitle: "Идёт перерыв",
    issuePausedBody: "Во время перерыва отметки не принимаются. Продолжите рабочий день на вкладке «Сегодня», а потом отметьтесь.",
    issueNoCoordinatesTitle: "У точки нет координат",
    issueNoCoordinatesBody: "Чек-ин здесь невозможен. Попросите руководителя добавить координаты в карточку клиента.",
    issueSuspiciousTitle: "Координаты точки выглядят ошибочными",
    issueSuspiciousBody: "По данным карточки до клиента {{distance}}. Сообщите руководителю, чтобы он проверил координаты.",
    issuePositionTitle: "Не удалось определить ваше местоположение",
    issuePermissionBody: "Разрешите приложению доступ к геолокации и попробуйте снова.",
    issueGpsBody: "Выйдите на открытое место, дождитесь сигнала GPS и попробуйте снова.",
    issueTooFarTitle: "Вы слишком далеко от клиента",
    issueTooFarBody: "До {{name}} {{distance}}, а чек-ин возможен в пределах {{max}} м.",
    issueServerTitle: "Визит не сохранился",
    issueServerBody: "Проверьте связь и нажмите «Начать внеплановый визит» ещё раз.",
    noTime: "Время не указано",
    duration: "{{count}} мин",
    cancel: "Отмена",
  },
  az: {
    eyebrow: "Sahə işi",
    title: "Ziyarətlər",
    subtitle: "Planlı ziyarətləri Marşrutdan başladın. Burada plansız ziyarət və tarixçə var.",
    helpFlow: "Ziyarəti necə aparmalı:\n1. Planlıdırsa «Marşrut»u açıb nöqtəni seçin.\n2. Plansızdırsa müştərini aşağıda tapın.\n3. Ziyarətə başlayın, lazım olan fotoları əlavə edib «Bitir» düyməsinə toxunun.",
    back: "Geri",
    plannedTitle: "Ziyarət artıq plandadır?",
    plannedBody: "«Marşrut»u açın: nöqtələrin sırası, naviqasiya və planlı giriş oradadır.",
    openRoute: "Marşrutu aç",
    manualEyebrow: "Plansız ziyarət",
    manualTitle: "Müştəri seçin",
    manualBody: "Bu addımı yalnız müştəri bugünkü marşrutda olmadıqda istifadə edin.",
    search: "Müştərinin adı",
    searchPlaceholder: "Məsələn, Mərkəzi Klinika",
    clearSearch: "Axtarışı təmizlə",
    nearest: "Əlçatan müştərilər",
    searchResults: "Axtarış nəticələri",
    resultsCount: "Göstərilir: {{count}}",
    selected: "Seçilib",
    choose: "Müştəri seç",
    start: "Plansız ziyarətə başla",
    starting: "GPS yoxlanılır…",
    chooseFirst: "Əvvəlcə siyahıdan müştəri seçin.",
    noClientsTitle: "Əlçatan müştəri yoxdur",
    noClientsBody: "Ekranı yeniləyin. Siyahı yenə boşdursa, təyinatları menecerlə yoxlayın.",
    noSearchTitle: "Müştəri tapılmadı",
    noSearchBody: "Yazılışı yoxlayın və ya axtarışı təmizləyin.",
    activeEyebrow: "Ziyarət indi davam edir",
    activeBody: "Lazım olan fotonu əlavə edin, sonra ziyarəti bitirib nəticəni yazın.",
    elapsed: "{{count}} dəq davam edir",
    photos: "Foto: {{count}}",
    addPhoto: "Foto əlavə et",
    finish: "Ziyarəti bitir",
    finishing: "Yadda saxlanılır…",
    waitingSync: "Bitirmə cihazda saxlanılıb və sinxronizasiyanı gözləyir.",
    historyEyebrow: "Son qeydlər",
    historyTitle: "Ziyarət tarixçəsi",
    historyCount: "{{count}} qeyd",
    loadingTitle: "Ziyarətlər və müştərilər yüklənir",
    loadingBody: "Son məlumatlar serverlə yoxlanılır.",
    offlineTitle: "Hazırda bağlantı yoxdur",
    offlineBody: "Əvvəl yüklənmiş məlumatlar göstərilir. Yeni əməliyyatlar cihazda saxlanıb sonra sinxronlaşacaq.",
    errorTitle: "Ziyarətləri yükləmək alınmadı",
    errorBody: "İnterneti yoxlayın və yenidən cəhd edin.",
    retry: "Yenidən cəhd et",
    refresh: "Yenilə",
    emptyHistoryTitle: "Tarixçə hələ boşdur",
    emptyHistoryBody: "Planlı ziyarəti «Marşrut»dan başladın. Plansız ziyarət bölməsində müştəri seçin.",
    activeStatus: "Aktiv",
    completeStatus: "Tamamlanıb",
    pendingStatus: "Sinxronizasiya gözlənilir",
    noAddress: "Ünvan göstərilməyib",
    coordinatesMissing: "Koordinatlar göstərilməyib",
    coordinatesSuspicious: "Koordinatlar yoxlanmalıdır",
    issuePausedTitle: "Fasilə davam edir",
    issuePausedBody: "Fasilə zamanı qeydiyyat qəbul edilmir. «Bu gün» bölməsində iş gününü davam etdirin, sonra qeydiyyatdan keçin.",
    issueNoCoordinatesTitle: "Nöqtənin koordinatları yoxdur",
    issueNoCoordinatesBody: "Burada giriş qeyd etmək mümkün deyil. Rəhbərdən müştəri kartına koordinat əlavə etməsini xahiş edin.",
    issueSuspiciousTitle: "Nöqtənin koordinatları səhv görünür",
    issueSuspiciousBody: "Karta görə müştəriyə qədər {{distance}}. Rəhbərə bildirin ki, koordinatları yoxlasın.",
    issuePositionTitle: "Mövqeyinizi müəyyən etmək mümkün olmadı",
    issuePermissionBody: "Tətbiqə məkan icazəsi verin və yenidən cəhd edin.",
    issueGpsBody: "Açıq yerə çıxın, GPS siqnalını gözləyin və yenidən cəhd edin.",
    issueTooFarTitle: "Müştəridən çox uzaqdasınız",
    issueTooFarBody: "{{name}}-ə qədər {{distance}}, giriş isə {{max}} m daxilində mümkündür.",
    issueServerTitle: "Ziyarət saxlanmadı",
    issueServerBody: "Əlaqəni yoxlayın və «Plansız ziyarətə başla» düyməsini yenidən basın.",
    noTime: "Vaxt göstərilməyib",
    duration: "{{count}} dəq",
    cancel: "Ləğv et",
  },
  en: {
    eyebrow: "Field work",
    title: "Visits",
    subtitle: "Start planned visits from Route. This screen is for an unplanned visit and history.",
    helpFlow: "How to complete a visit:\n1. For a planned visit, open Route and choose the stop.\n2. For an unplanned visit, find the client below.\n3. Start the visit, add required photos, then tap Finish.",
    back: "Back",
    plannedTitle: "Already in today's plan?",
    plannedBody: "Open Route for the stop order, navigation and the planned check-in.",
    openRoute: "Open route",
    manualEyebrow: "Unplanned visit",
    manualTitle: "Choose a client",
    manualBody: "Use this step only when the client is not on today's route.",
    search: "Client name",
    searchPlaceholder: "For example, Central Clinic",
    clearSearch: "Clear search",
    nearest: "Available clients",
    searchResults: "Search results",
    resultsCount: "Showing {{count}}",
    selected: "Selected",
    choose: "Choose client",
    start: "Start unplanned visit",
    starting: "Checking GPS…",
    chooseFirst: "Choose a client from the list first.",
    noClientsTitle: "No clients are available",
    noClientsBody: "Refresh this screen. If it stays empty, ask your manager to check assignments.",
    noSearchTitle: "Client not found",
    noSearchBody: "Check the spelling or clear the search.",
    activeEyebrow: "Visit in progress",
    activeBody: "Add any required photo, then finish the visit and record the result.",
    elapsed: "In progress for {{count}} min",
    photos: "Photos: {{count}}",
    addPhoto: "Add photo",
    finish: "Finish visit",
    finishing: "Saving…",
    waitingSync: "Completion is saved on this device and is waiting to sync.",
    historyEyebrow: "Recent records",
    historyTitle: "Visit history",
    historyCount: "{{count}} records",
    loadingTitle: "Loading visits and clients",
    loadingBody: "Checking the latest server data.",
    offlineTitle: "You're offline",
    offlineBody: "Showing previously loaded data. New actions will stay on this device and sync later.",
    errorTitle: "We couldn't load visits",
    errorBody: "Check your connection and try again.",
    retry: "Try again",
    refresh: "Refresh",
    emptyHistoryTitle: "No visit history yet",
    emptyHistoryBody: "Start a planned visit in Route. Choose a client in the Unplanned visit section when needed.",
    activeStatus: "Active",
    completeStatus: "Completed",
    pendingStatus: "Waiting to sync",
    noAddress: "No address provided",
    coordinatesMissing: "No coordinates",
    coordinatesSuspicious: "Coordinates need checking",
    issuePausedTitle: "You are on a break",
    issuePausedBody: "Check-ins are not accepted during a break. Resume the workday on the Today tab, then check in.",
    issueNoCoordinatesTitle: "This client has no coordinates",
    issueNoCoordinatesBody: "Check-in is not possible here. Ask your manager to add coordinates to the client card.",
    issueSuspiciousTitle: "The client's coordinates look wrong",
    issueSuspiciousBody: "The card puts the client {{distance}} away. Tell your manager so they can check the coordinates.",
    issuePositionTitle: "We could not find your position",
    issuePermissionBody: "Allow location access for the app and try again.",
    issueGpsBody: "Move to an open area, wait for a GPS fix and try again.",
    issueTooFarTitle: "You are too far from the client",
    issueTooFarBody: "{{name}} is {{distance}} away; check-in works within {{max}} m.",
    issueServerTitle: "The visit was not saved",
    issueServerBody: "Check your connection and press “Start unplanned visit” again.",
    noTime: "Time not provided",
    duration: "{{count}} min",
    cancel: "Cancel",
  },
} as const

const GEOFENCE_DEFAULT = 100
const MAX_CACHED_LOCATION_AGE_MS = 120_000

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function distanceTone(meters: number): { color: string; background: string } {
  if (meters < GEOFENCE_DEFAULT) {
    return { color: fieldTheme.color.success, background: fieldTheme.color.successSoft }
  }
  if (meters < 500) {
    return { color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft }
  }
  return { color: fieldTheme.color.danger, background: fieldTheme.color.dangerSoft }
}

function categoryTone(category?: string): { color: string; background: string } {
  switch (category) {
    case "A":
      return { color: fieldTheme.color.primaryStrong, background: fieldTheme.color.primarySoft }
    case "B":
      return { color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft }
    case "C":
      return { color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft }
    default:
      return { color: fieldTheme.color.inkMuted, background: fieldTheme.color.surfaceStrong }
  }
}

function visitDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatVisitStart(value: string | undefined, language: string): string {
  const date = visitDate(value)
  return date?.toLocaleString(language, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) ?? ""
}

function formatVisitClock(value: string | undefined, language: string): string {
  const date = visitDate(value)
  return date?.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) ?? ""
}

export default function VisitScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const tablet = visitScreenLayout(width) === "tablet"
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const copy = VISIT_COPY[visitScreenLanguage(i18n.language)]
  const [visits, setVisits] = useState<Visit[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [refreshing, setRefreshing] = useState(false)
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null)
  const [mutating, setMutating] = useState(false)
  const [notesVisible, setNotesVisible] = useState(false)
  const [cameraVisible, setCameraVisible] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)
  const [elapsedMin, setElapsedMin] = useState(0)
  const [agentCoords, setAgentCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [pendingGeofenceResolve, setPendingGeofenceResolve] = useState<((value: boolean) => void) | null>(null)
  const [checkInIssue, setCheckInIssue] = useState<CheckInIssue | null>(null)
  // T4: route execution already refused to run during a break; the ad-hoc
  // check-in on this screen did not, so the one path that bypassed the route
  // also bypassed the pause. The server would take the visit but refuse the
  // GPS around it, leaving a visit nobody can prove.
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const workdayPaused = activeWorkday?.key === currentWorkdayKey
    && activeWorkday.syncState === "CONFIRMED"
    && activeWorkday.paused === true
  const [toast, setToast] = useState<{
    visible: boolean
    type: "success" | "error" | "warning" | "info"
    title: string
    message?: string
  }>({ visible: false, type: "success", title: "" })
  const [confirm, setConfirm] = useState<{
    visible: boolean
    title: string
    message: string
    confirmText?: string
    confirmColor?: string
    destructive?: boolean
    hideCancel?: boolean
    onConfirm: () => void
  }>({ visible: false, title: "", message: "", onConfirm: () => {} })

  const showToast = (
    type: "success" | "error" | "warning" | "info",
    title: string,
    message?: string,
  ) => setToast({ visible: true, type, title, message })

  useEffect(() => {
    Geolocation.getCurrentPosition(
      (position) => setAgentCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const [visitsResponse, customersResponse] = await Promise.all([
        api.getVisits({ limit: 20 }),
        api.getCustomers(),
      ])
      const visitsLoaded = visitsResponse.success === true
      const customersLoaded = customersResponse.success === true
      if (!visitsLoaded && !customersLoaded) {
        throw new Error("VISITS_LOAD_FAILED")
      }

      if (visitsLoaded) {
        const list: Visit[] = visitsResponse.data?.visits || []
        const serverActive = list.find((visit) => visit.status === "CHECKED_IN") || null
        const reconciled = await reconcileOptimisticVisit(
          serverActive
            ? { ...serverActive, status: "CHECKED_IN", pendingCheckOut: false } as OptimisticVisit
            : null,
        )
        setVisits(reconciled && !list.some((visit) => visit.id === reconciled.id)
          ? [reconciled, ...list]
          : list)
        setActiveVisit(reconciled)
      }
      if (customersLoaded) {
        setCustomers(customersResponse.data?.customers || [])
      }
      setLoadState(visitsLoaded && customersLoaded ? "ready" : "offline")
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        console.warn("Failed to fetch visits:", error.message)
      }
      let optimistic: OptimisticVisit | null = null
      try {
        optimistic = await readOptimisticVisit()
        if (optimistic) {
          setActiveVisit(optimistic)
          setVisits((current) => current.some((visit) => visit.id === optimistic?.id)
            ? current
            : [optimistic as OptimisticVisit, ...current])
        }
      } catch {}
      setLoadState((current) => optimistic || current !== "loading" ? "offline" : "error")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useAutoRefresh(fetchData)

  useEffect(() => {
    if (!activeVisit) {
      setElapsedMin(0)
      return
    }
    const calculate = () => {
      const difference = Date.now() - new Date(activeVisit.checkInAt).getTime()
      setElapsedMin(Math.max(0, Math.floor(difference / 60000)))
    }
    calculate()
    const interval = setInterval(calculate, 30000)
    return () => clearInterval(interval)
  }, [activeVisit])

  const customersWithDistance = useMemo<Customer[]>(() => {
    return [...customers]
      .map((customer) => {
        // Missing or 0,0 coordinates never produce a distance (field audit: "6745.7 km").
        const described = describeCustomerDistance(customer, agentCoords)
        return {
          ...customer,
          coordinateState: described.state,
          distanceMeters: described.distanceMeters ?? undefined,
        }
      })
      .sort((first, second) => {
        const firstKnown = hasUsableCoordinates(first)
        const secondKnown = hasUsableCoordinates(second)
        if (firstKnown !== secondKnown) return firstKnown ? -1 : 1
        if (first.distanceMeters == null && second.distanceMeters == null) return 0
        if (first.distanceMeters == null) return 1
        if (second.distanceMeters == null) return -1
        return first.distanceMeters - second.distanceMeters
      })
  }, [agentCoords, customers])

  const visibleCustomers = useMemo(
    () => filterVisitCustomers(customersWithDistance, searchQuery, tablet ? 20 : 12),
    [customersWithDistance, searchQuery, tablet],
  )
  const selectedCustomer = useMemo(
    () => customersWithDistance.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customersWithDistance, selectedCustomerId],
  )

  useEffect(() => {
    if (selectedCustomerId && !customersWithDistance.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(null)
    }
  }, [customersWithDistance, selectedCustomerId])

  useEffect(() => {
    setCheckInIssue(null)
  }, [selectedCustomerId])

  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true
    try {
      const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      if (fine) return true
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: t("permission.locationRequiredTitle"),
        message: t("permission.locationRequiredBody"),
        buttonPositive: t("permission.allow"),
        buttonNegative: t("permission.deny"),
      })
      if (result === PermissionsAndroid.RESULTS.GRANTED) return true
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setConfirm({
          visible: true,
          title: t("permission.locationDeniedTitle"),
          message: t("permission.locationDeniedBody"),
          confirmText: t("permission.openSettings"),
          confirmColor: fieldTheme.color.danger,
          onConfirm: () => {
            setConfirm((current) => ({ ...current, visible: false }))
            Linking.openSettings()
          },
        })
      }
      return false
    } catch {
      return false
    }
  }

  const getCoords = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const hasPermission = await requestLocationPermission()
    if (!hasPermission) return null
    try {
      return await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        )
      })
    } catch {
      showToast("error", t("common.error"), t("visit.gpsSignalLost"))
      return null
    }
  }

  /** Like getCoords, but says why no position came back so the screen can explain it. */
  const locateForCheckIn = async (): Promise<{
    coords: { latitude: number; longitude: number } | null
    failure: PositionFailure | null
  }> => {
    const hasPermission = await requestLocationPermission()
    if (!hasPermission) return { coords: null, failure: "permission" }
    try {
      const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
        )
      })
      return { coords, failure: null }
    } catch {
      return { coords: null, failure: "gps" }
    }
  }

  const handleCheckIn = (customer: Customer) => {
    if (mutating || activeVisit) return
    setConfirm({
      visible: true,
      title: t("visit.checkInPromptTitle", { name: customer.name }),
      message: customer.address || t("visit.noAddress"),
      confirmText: t("visit.checkInButton"),
      confirmColor: fieldTheme.color.primary,
      onConfirm: () => {
        setConfirm((current) => ({ ...current, visible: false }))
        performCheckIn(customer)
      },
    })
  }

  const showOutcomeSheet = (
    title: string,
    message: string,
    options: { confirmText?: string; confirmColor?: string; onConfirm?: () => void } = {},
  ) => {
    setConfirm({
      visible: true,
      title,
      message,
      confirmText: options.confirmText ?? t("common.ok"),
      confirmColor: options.confirmColor,
      hideCancel: !options.onConfirm,
      onConfirm: () => {
        setConfirm((current) => ({ ...current, visible: false }))
        options.onConfirm?.()
      },
    })
  }

  // Owner decision 2 (audit 2026-09-05): a stop without coordinates cannot be
  // visited. The agent reports it; the manager fixes the organization card.
  const reportMissingCoordinates = (customer: Customer) => {
    Share.share({
      message: t("visit.reportToManagerMessage", {
        name: customer.name,
        address: customer.address || t("visit.noAddress"),
      }),
    }).catch(() => {})
  }

  const showNoCoordinates = (customer: Customer) => {
    showOutcomeSheet(t("visit.noCoordinatesTitle"), t("visit.noCoordinatesBody", { name: customer.name }), {
      confirmText: t("visit.reportToManager"),
      onConfirm: () => reportMissingCoordinates(customer),
    })
  }

  // Every outcome is said out loud (audit M-01): the old flow showed a
  // spinner, queued the visit and fell silent on the server's answer.
  const explainCheckInOutcome = (customer: Customer, outcome: CheckInOutcome, retry: () => void) => {
    switch (outcome.kind) {
      case "accepted":
        showToast("success", t("visit.checkInAcceptedTitle"), t("visit.checkInAcceptedBody", { name: customer.name }))
        return
      case "queued":
        showToast("success", t("visit.checkInQueuedTitle"), t("visit.checkInQueuedBody", { name: customer.name }))
        return
      case "offline":
        showOutcomeSheet(t("visit.checkInOfflineTitle"), t("visit.checkInOfflineBody", { name: customer.name }), {
          confirmText: t("common.retry"),
          onConfirm: retry,
        })
        return
      case "too_far":
        showOutcomeSheet(t("visit.tooFarTitle"), t("visit.checkInRejectedTooFar", {
          name: customer.name,
          distance: formatCheckInDistance(outcome.distanceMeters),
          max: outcome.maxMeters ?? GEOFENCE_DEFAULT,
        }))
        return
      case "no_coordinates":
        showNoCoordinates(customer)
        return
      case "active_visit":
        showOutcomeSheet(t("visit.checkInRejectedTitle"), t("visit.checkInRejectedActiveVisit"))
        return
      case "route_mismatch":
        showOutcomeSheet(t("visit.checkInRejectedTitle"), t("visit.checkInRejectedRouteMismatch"))
        return
      case "customer_missing":
        showOutcomeSheet(t("visit.checkInRejectedTitle"), t("visit.checkInRejectedCustomerMissing", { name: customer.name }))
        return
      case "server_error":
        showOutcomeSheet(t("visit.checkInRejectedTitle"), t("visit.checkInRejectedServer", { message: outcome.message ?? "" }), {
          confirmText: t("common.retry"),
          onConfirm: retry,
        })
        return
    }
  }

  const settleCheckIn = async (customer: Customer, operationId: string) => {
    let syncSucceeded = false
    let conflicted = 0
    try {
      const result = await runMobileSync()
      syncSucceeded = result.success
      conflicted = result.conflicted
    } catch {
      syncSucceeded = false
    }
    const operation = (await allOutboxOperations()).find((item) => item.operationId === operationId)
    const outcome = checkInOutcomeFromOperation(operation, syncSucceeded)
    await fetchData()
    // "Повторить" after a server rejection has to requeue the operation first.
    // A rejected row sits in `conflict`, and flushOutbox only sends `pending`,
    // so re-running the sync sent nothing and the same dialog came back — the
    // agent pressed the button and the visit stayed unsent (audit B1, T1).
    // retryOutboxConflict mints a NEW operationId (the server pins the old one
    // for ever), so the wait must follow that id, not the dead one. The push
    // itself is settleCheckIn's first act: it calls runMobileSync before
    // reading the outcome, so the requeued row goes out on this tap and not
    // on some later background sync.
    const retry = () => {
      void (async () => {
        const nextOperationId = await retryOutboxConflict(operationId).catch(() => null)
        if (!nextOperationId) {
          // Nothing was requeued. Either the row is gone — the server accepted
          // it in the meantime, and settling reports exactly that — or it is
          // still sitting in conflict and the retry genuinely did not take.
          // The second case must not settle silently: that would tell the
          // agent the visit is dealt with while it is still unsent.
          const stillRejected = (await allOutboxOperations().catch(() => []))
            .some((item) => item.operationId === operationId && item.status === "conflict")
          if (stillRejected) {
            showOutcomeSheet(t("visit.checkInRejectedTitle"), t("visit.checkInRetryFailed"), {
              confirmText: t("common.retry"),
              onConfirm: retry,
            })
            return
          }
        }
        await settleCheckIn(customer, nextOperationId ?? operationId)
      })().catch(() => {})
    }
    explainCheckInOutcome(customer, outcome, retry)
    if (outcome.kind === "accepted" && conflicted > 0) {
      showToast("warning", t("visit.syncConflictTitle"), t("visit.syncConflictBody"))
    }
  }

  const performCheckIn = async (customer: Customer) => {
    if (mutating) return
    setMutating(true)
    setCheckInIssue(null)
    try {
      // Before anything about coordinates: on a break nothing else matters,
      // and naming the real reason keeps the agent from hunting a GPS problem
      // that is not there.
      if (workdayPaused) {
        setCheckInIssue({ kind: "workday-paused" })
        showToast("warning", copy.issuePausedTitle, copy.issuePausedBody)
        return
      }
      // Owner decision: no coordinates on the client card means no check-in, with an explanation.
      if (!hasUsableCoordinates(customer)) {
        setCheckInIssue({ kind: "no-coordinates" })
        // The same sheet the server's NO_COORDINATES answer opens. It carries
        // the "tell the manager" action, which a toast cannot: the owner's
        // decision was that a point without coordinates is refused AND the
        // agent is offered a way to report it. This is the branch that fires
        // first, so without it the action was unreachable in practice.
        showNoCoordinates(customer)
        return
      }
      const located = await locateForCheckIn()
      let coords = located.coords
      const cachedPositionIsFresh = lastKnownPosition
        ? Date.now() - lastKnownPosition.timestamp <= MAX_CACHED_LOCATION_AGE_MS
        : false
      if (!coords && lastKnownPosition && cachedPositionIsFresh) {
        coords = {
          latitude: lastKnownPosition.latitude,
          longitude: lastKnownPosition.longitude,
        }
        showToast(
          "warning",
          t("visit.usingLastPosition"),
          t("visit.lastPositionAccuracy", {
            accuracy: lastKnownPosition.accuracy?.toFixed(0) || "?",
          }),
        )
      }
      if (!coords) {
        setCheckInIssue({ kind: "no-position", reason: located.failure ?? "gps" })
        showToast("error", t("visit.gpsUnavailable"), t("visit.gpsCantDetermine"))
        return
      }

      const precondition = resolveCheckInPrecondition({
        customer,
        position: coords,
        positionFailure: located.failure,
        workdayPaused,
      })
      if (precondition.kind === "implausible-distance") {
        setCheckInIssue(precondition)
        showToast("error", copy.issueSuspiciousTitle, checkInIssueText(precondition, copy).body)
        return
      }

      let forceCheckIn = false
      if (precondition.kind === "ready") {
        const distance = precondition.distanceMeters
        if (distance > GEOFENCE_DEFAULT) {
          if (!api.canForceCheckIn) {
            setCheckInIssue({ kind: "too-far", distanceMeters: distance, name: customer.name })
            showToast(
              "error",
              t("visit.tooFarTitle"),
              t("visit.tooFarAskSupervisor", {
                distance: formatDistance(distance),
                name: customer.name,
                max: GEOFENCE_DEFAULT,
              }),
            )
            return
          }
          const proceed = await new Promise<boolean>((resolve) => {
            setPendingGeofenceResolve(() => (value: boolean) => resolve(value))
            setConfirm({
              visible: true,
              title: t("visit.tooFarTitle"),
              message: t("visit.tooFarBody", {
                distance: formatDistance(distance),
                name: customer.name,
                max: GEOFENCE_DEFAULT,
              }),
              confirmText: t("visit.checkInAnyway"),
              confirmColor: fieldTheme.color.danger,
              onConfirm: () => {
                setConfirm((current) => ({ ...current, visible: false }))
                setPendingGeofenceResolve(null)
                resolve(true)
              },
            })
          })
          if (!proceed) {
            setCheckInIssue({ kind: "too-far", distanceMeters: distance, name: customer.name })
            return
          }
          forceCheckIn = true
        }
      }

      const { visit, operation } = await queueVisitCheckIn({
        customer: { id: customer.id, name: customer.name, address: customer.address },
        latitude: coords.latitude,
        longitude: coords.longitude,
        force: forceCheckIn,
      })
      setActiveVisit(visit)
      setVisits((current) => [visit, ...current.filter((entry) => entry.id !== visit.id)])
      setSelectedCustomerId(null)
      await settleCheckIn(customer, operation.operationId)
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        console.warn("[VisitScreen] check-in error:", error?.message ?? error)
        setCheckInIssue({ kind: "server" })
        showToast("error", t("common.error"), t("visit.checkInFailed"))
      }
    } finally {
      setMutating(false)
    }
  }

  const handleCheckOut = () => {
    if (!activeVisit || mutating) return
    setNotesVisible(true)
  }

  const performCheckOut = async (notes?: string) => {
    if (!activeVisit || mutating) return
    setMutating(true)
    try {
      const coords = await getCoords()
      const currentVisit: OptimisticVisit = {
        id: activeVisit.id,
        status: "CHECKED_IN",
        checkInAt: activeVisit.checkInAt,
        customer: activeVisit.customer,
        pendingCheckOut: activeVisit.pendingCheckOut === true,
      }
      const { visit } = await queueVisitCheckOut(currentVisit, {
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        notes: notes || undefined,
      })
      setActiveVisit(visit)
      showToast("success", t("visit.checkOutQueuedTitle"), t("visit.checkOutQueuedBody"))
      runMobileSync().then(async (result) => {
        await fetchData()
        if (result.conflicted > 0) {
          showToast("warning", t("visit.syncConflictTitle"), t("visit.syncConflictBody"))
        }
      }).catch(() => {})
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        console.warn("[VisitScreen] check-out error:", error?.message ?? error)
        if (error?.code === "PHOTO_REQUIRED") {
          showToast("error", t("visit.photoRequiredTitle"), t("visit.photoRequiredBody"))
        } else {
          showToast("error", t("common.error"), t("visit.checkOutFailed"))
        }
      }
    } finally {
      setMutating(false)
    }
  }

  const handlePhotoTaken = async (path: string) => {
    if (!activeVisit) return
    let uploadCoords: { latitude: number; longitude: number } | undefined
    try {
      try {
        uploadCoords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) => resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
          )
        })
      } catch {
        uploadCoords = undefined
      }
      await api.uploadPhoto({
        filePath: path,
        visitId: activeVisit.id,
        category: "VISIT",
        latitude: uploadCoords?.latitude,
        longitude: uploadCoords?.longitude,
      })
      setPhotoCount((count) => count + 1)
      showToast("success", t("visit.photoSavedTitle"), t("visit.photoSavedBody"))
    } catch (error: any) {
      console.warn("[VisitScreen] photo upload error:", error?.message ?? error)
      if (error?.message !== "SESSION_EXPIRED") {
        if (error?.code === "MAX_PHOTOS_REACHED") {
          showToast("error", t("visit.photoLimitTitle"), t("visit.photoLimitBody"))
        } else {
          await enqueueMediaUpload({
            filePath: path,
            visitId: activeVisit.id,
            category: "VISIT",
            latitude: uploadCoords?.latitude,
            longitude: uploadCoords?.longitude,
          })
          showToast("success", t("visit.photoQueuedTitle"), t("visit.photoQueuedBody"))
        }
      }
    }
  }

  const refresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const retry = () => {
    setLoadState((current) => current === "error" ? "loading" : current)
    fetchData()
  }

  const openRoute = () => navigation.navigate("Main", { screen: "Route" })

  const commonPanelProps = {
    copy,
    activeVisit,
    elapsedMin,
    photoCount,
    mutating,
    customers: visibleCustomers,
    totalCustomers: customersWithDistance.length,
    selectedCustomer,
    searchQuery,
    loadState,
    tablet,
    touchTarget,
    onOpenRoute: openRoute,
    onSearch: setSearchQuery,
    onClearSearch: () => setSearchQuery(""),
    onSelectCustomer: (customer: Customer) => setSelectedCustomerId(customer.id),
    onCheckIn: () => selectedCustomer && handleCheckIn(selectedCustomer),
    onPhoto: () => setCameraVisible(true),
    onCheckOut: handleCheckOut,
    onRetry: retry,
    checkInIssue,
  }

  const history = (
    <HistoryPanel
      copy={copy}
      visits={visits}
      loadState={loadState}
      language={i18n.language}
      tablet={tablet}
      refreshing={refreshing}
      bottomPadding={Math.max(insets.bottom, fieldTheme.space.lg)}
      onRefresh={refresh}
      onRetry={retry}
    />
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.headerRow}>
            {navigation.canGoBack() && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.back}
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [
                  styles.backButton,
                  { width: touchTarget, height: touchTarget },
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
              </Pressable>
            )}
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
              <Text style={styles.headerTitle}>{copy.title}</Text>
              <Text style={styles.headerSubtitle}>{copy.subtitle}</Text>
            </View>
          </View>
        </View>
      </View>

      {tablet ? (
        <View style={styles.tabletBody}>
          <ScrollView
            style={styles.tabletActionPane}
            contentContainerStyle={[styles.actionContent, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xl) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <VisitActionPanel {...commonPanelProps} />
          </ScrollView>
          <View style={styles.tabletHistoryPane}>{history}</View>
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(visit) => visit.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.phoneContent, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xl) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={fieldTheme.color.primary}
              colors={[fieldTheme.color.primary]}
            />
          }
          ListHeaderComponent={
            <>
              <VisitActionPanel {...commonPanelProps} />
              <HistoryHeading copy={copy} count={visits.length} />
            </>
          }
          ListEmptyComponent={
            loadState === "loading"
              ? null
              : loadState === "error"
                ? null
                : <EmptyHistory copy={copy} />
          }
          renderItem={({ item }) => <VisitRow visit={item} copy={copy} language={i18n.language} />}
        />
      )}

      <NotesModal
        visible={notesVisible}
        title={t("visit.checkOutButton")}
        message={t("visit.checkOutNotes")}
        onCancel={() => setNotesVisible(false)}
        onSubmit={(text) => {
          setNotesVisible(false)
          performCheckOut(text)
        }}
      />
      <PhotoCaptureModal
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        onPhotoTaken={handlePhotoTaken}
        watermark={
          api.currentAgent && activeVisit
            ? {
                agent: {
                  id: api.currentAgent.id,
                  name: api.currentAgent.name,
                  code: api.currentAgent.code,
                },
                visit: { id: activeVisit.id },
                customer: {
                  id: activeVisit.customer.id,
                  name: activeVisit.customer.name,
                },
                getLocation: getCoords,
                getLastKnownLocation: () => lastKnownPosition
                  ? {
                      latitude: lastKnownPosition.latitude,
                      longitude: lastKnownPosition.longitude,
                      capturedAt: new Date(lastKnownPosition.timestamp),
                    }
                  : null,
              }
            : undefined
        }
      />
      <ConfirmSheet
        visible={confirm.visible}
        title={confirm.title}
        message={confirm.message}
        cancelText={copy.cancel}
        confirmText={confirm.confirmText}
        confirmColor={confirm.confirmColor}
        destructive={confirm.destructive}
        hideCancel={confirm.hideCancel}
        onCancel={() => {
          setConfirm((current) => ({ ...current, visible: false }))
          if (pendingGeofenceResolve) {
            pendingGeofenceResolve(false)
            setPendingGeofenceResolve(null)
          }
        }}
        onConfirm={confirm.onConfirm}
      />
      <FeedbackToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onDismiss={() => setToast((current) => ({ ...current, visible: false }))}
      />
    </View>
  )
}

type Copy = { [Key in keyof typeof VISIT_COPY.ru]: string }

function checkInIssueText(issue: CheckInIssue, copy: Copy): { title: string; body: string } {
  switch (issue.kind) {
    case "workday-paused":
      return { title: copy.issuePausedTitle, body: copy.issuePausedBody }
    case "no-coordinates":
      return { title: copy.issueNoCoordinatesTitle, body: copy.issueNoCoordinatesBody }
    case "implausible-distance":
      return {
        title: copy.issueSuspiciousTitle,
        body: copy.issueSuspiciousBody.replace("{{distance}}", formatDistanceMeters(issue.distanceMeters)),
      }
    case "no-position":
      return {
        title: copy.issuePositionTitle,
        body: issue.reason === "permission" ? copy.issuePermissionBody : copy.issueGpsBody,
      }
    case "too-far":
      return {
        title: copy.issueTooFarTitle,
        body: copy.issueTooFarBody
          .replace("{{name}}", issue.name)
          .replace("{{distance}}", formatDistanceMeters(issue.distanceMeters))
          .replace("{{max}}", String(GEOFENCE_DEFAULT)),
      }
    case "server":
      return { title: copy.issueServerTitle, body: copy.issueServerBody }
  }
}

function VisitActionPanel({
  copy,
  activeVisit,
  elapsedMin,
  photoCount,
  mutating,
  customers,
  totalCustomers,
  selectedCustomer,
  searchQuery,
  loadState,
  tablet,
  touchTarget,
  onOpenRoute,
  onSearch,
  onClearSearch,
  onSelectCustomer,
  onCheckIn,
  onPhoto,
  onCheckOut,
  onRetry,
  checkInIssue,
}: {
  copy: Copy
  checkInIssue: CheckInIssue | null
  activeVisit: Visit | null
  elapsedMin: number
  photoCount: number
  mutating: boolean
  customers: Customer[]
  totalCustomers: number
  selectedCustomer: Customer | null
  searchQuery: string
  loadState: LoadState
  tablet: boolean
  touchTarget: number
  onOpenRoute: () => void
  onSearch: (value: string) => void
  onClearSearch: () => void
  onSelectCustomer: (customer: Customer) => void
  onCheckIn: () => void
  onPhoto: () => void
  onCheckOut: () => void
  onRetry: () => void
}) {
  if (activeVisit) {
    return (
      <View style={styles.actionStack}>
        <HintCard id="visits.flow.v2" text={copy.helpFlow} style={styles.visitHint} />
        {loadState === "offline" && <StateNotice kind="offline" copy={copy} onRetry={onRetry} />}
        <View style={[styles.activeCard, tablet && styles.cardTablet]}>
          <View style={styles.sectionIconRow}>
            <View style={[styles.sectionIcon, { backgroundColor: fieldTheme.color.successSoft }]}>
              <Icon name="location" size={23} color={fieldTheme.color.success} />
            </View>
            <View style={styles.sectionTitleCopy}>
              <Text style={[styles.sectionEyebrow, { color: fieldTheme.color.success }]}>{copy.activeEyebrow}</Text>
              <Text style={styles.sectionTitle}>{activeVisit.customer?.name || "—"}</Text>
            </View>
          </View>
          <Text style={styles.sectionBody}>{copy.activeBody}</Text>

          <View style={styles.activeMeta}>
            <MetaPill icon="time-outline" text={copy.elapsed.replace("{{count}}", String(elapsedMin))} />
            <MetaPill icon="camera-outline" text={copy.photos.replace("{{count}}", String(photoCount))} />
          </View>

          {activeVisit.customer?.address && (
            <View style={styles.addressRow}>
              <Icon name="pin-outline" size={18} color={fieldTheme.color.inkMuted} />
              <Text style={styles.addressText}>{activeVisit.customer.address}</Text>
            </View>
          )}

          {activeVisit.pendingCheckOut && (
            <View style={styles.pendingNotice} accessibilityLiveRegion="polite">
              <Icon name="cloud-upload-outline" size={20} color={fieldTheme.color.amber} />
              <Text style={styles.pendingText}>{copy.waitingSync}</Text>
            </View>
          )}

          <View style={styles.secondaryActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.addPhoto}
              disabled={mutating}
              onPress={onPhoto}
              style={({ pressed }) => [
                styles.secondaryButton,
                { minHeight: touchTarget },
                mutating && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="camera-outline" size={21} color={fieldTheme.color.primary} />
              <Text style={styles.secondaryButtonText}>{copy.addPhoto}</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.finish}
            accessibilityState={{ disabled: mutating || activeVisit.pendingCheckOut }}
            disabled={mutating || activeVisit.pendingCheckOut}
            onPress={onCheckOut}
            style={({ pressed }) => [
              styles.primaryButton,
              styles.finishButton,
              { minHeight: touchTarget },
              (mutating || activeVisit.pendingCheckOut) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {mutating
              ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
              : <Icon name="checkmark-circle-outline" size={22} color={fieldTheme.color.onColor} />}
            <Text style={styles.primaryButtonText}>{mutating ? copy.finishing : copy.finish}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.actionStack}>
      <HintCard id="visits.flow.v2" text={copy.helpFlow} style={styles.visitHint} />
      <View style={styles.routeGuide}>
        <View style={styles.routeGuideIcon}>
          <Icon name="navigate-outline" size={23} color={fieldTheme.color.blue} />
        </View>
        <View style={styles.routeGuideCopy}>
          <Text style={styles.routeGuideTitle}>{copy.plannedTitle}</Text>
          <Text style={styles.routeGuideBody}>{copy.plannedBody}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.openRoute}
          onPress={onOpenRoute}
          style={({ pressed }) => [styles.routeButton, { minHeight: touchTarget }, pressed && styles.pressed]}
        >
          <Text style={styles.routeButtonText}>{copy.openRoute}</Text>
          <Icon name="arrow-forward" size={18} color={fieldTheme.color.blue} />
        </Pressable>
      </View>

      {loadState === "offline" && <StateNotice kind="offline" copy={copy} onRetry={onRetry} />}

      <View style={[styles.manualCard, tablet && styles.cardTablet]}>
        <View style={styles.sectionIconRow}>
          <View style={styles.sectionIcon}>
            <Icon name="person-add-outline" size={23} color={fieldTheme.color.primary} />
          </View>
          <View style={styles.sectionTitleCopy}>
            <Text style={styles.sectionEyebrow}>{copy.manualEyebrow}</Text>
            <Text style={styles.sectionTitle}>{copy.manualTitle}</Text>
          </View>
        </View>
        <Text style={styles.sectionBody}>{copy.manualBody}</Text>

        <Text style={styles.fieldLabel}>{copy.search}</Text>
        <View style={[styles.searchBox, { minHeight: touchTarget }]}>
          <Icon name="search-outline" size={21} color={fieldTheme.color.inkMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearch}
            placeholder={copy.searchPlaceholder}
            placeholderTextColor={fieldTheme.color.inkMuted}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.clearSearch}
              onPress={onClearSearch}
              style={[styles.clearButton, { width: touchTarget, height: touchTarget }]}
            >
              <Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.customerListHeader}>
          <Text style={styles.customerListTitle}>{searchQuery.trim() ? copy.searchResults : copy.nearest}</Text>
          <Text style={styles.customerListCount}>{copy.resultsCount.replace("{{count}}", String(customers.length))}</Text>
        </View>

        {loadState === "loading" ? (
          <LoadingState copy={copy} compact />
        ) : loadState === "error" && totalCustomers === 0 ? (
          <StateNotice kind="error" copy={copy} onRetry={onRetry} />
        ) : customers.length === 0 ? (
          <View style={styles.customerEmpty}>
            <Icon
              name={searchQuery.trim() ? "search-outline" : "people-outline"}
              size={30}
              color={fieldTheme.color.primary}
            />
            <Text style={styles.customerEmptyTitle}>{searchQuery.trim() ? copy.noSearchTitle : copy.noClientsTitle}</Text>
            <Text style={styles.customerEmptyBody}>{searchQuery.trim() ? copy.noSearchBody : copy.noClientsBody}</Text>
          </View>
        ) : (
          <View style={styles.customerList}>
            {customers.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                selected={customer.id === selectedCustomer?.id}
                copy={copy}
                touchTarget={touchTarget}
                onPress={() => onSelectCustomer(customer)}
              />
            ))}
          </View>
        )}

        {selectedCustomer ? (
          <View style={styles.selectionSummary} accessibilityLiveRegion="polite">
            <Icon name="checkmark-circle" size={22} color={fieldTheme.color.success} />
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionLabel}>{copy.selected}</Text>
              <Text style={styles.selectionName}>{selectedCustomer.name}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.prerequisite}>
            <Icon name="information-circle-outline" size={19} color={fieldTheme.color.inkMuted} />
            <Text style={styles.prerequisiteText}>{copy.chooseFirst}</Text>
          </View>
        )}

        {checkInIssue && (
          <View style={styles.issueBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={20} color={fieldTheme.color.danger} />
            <View style={styles.issueCopy}>
              <Text style={styles.issueTitle}>{checkInIssueText(checkInIssue, copy).title}</Text>
              <Text style={styles.issueBody}>{checkInIssueText(checkInIssue, copy).body}</Text>
            </View>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.start}
          accessibilityState={{ disabled: !selectedCustomer || mutating }}
          disabled={!selectedCustomer || mutating}
          onPress={onCheckIn}
          style={({ pressed }) => [
            styles.primaryButton,
            { minHeight: touchTarget },
            (!selectedCustomer || mutating) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {mutating
            ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
            : <Icon name="log-in-outline" size={22} color={fieldTheme.color.onColor} />}
          <Text style={styles.primaryButtonText}>{mutating ? copy.starting : copy.start}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function CustomerRow({ customer, selected, copy, touchTarget, onPress }: {
  customer: Customer
  selected: boolean
  copy: Copy
  touchTarget: number
  onPress: () => void
}) {
  const { t } = useTranslation()
  const category = categoryTone(customer.category)
  const distance = customer.distanceMeters == null ? null : distanceTone(customer.distanceMeters)
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${copy.choose}: ${customer.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.customerRow,
        { minHeight: touchTarget + 18 },
        selected && styles.customerRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.customerAvatar, { backgroundColor: category.background }]}>
        <Text style={[styles.customerInitial, { color: category.color }]}>
          {upperInitial(customer.name)}
        </Text>
      </View>
      <View style={styles.customerCopy}>
        <Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text>
        <Text style={styles.customerAddress} numberOfLines={1}>{customer.address || copy.noAddress}</Text>
      </View>
      <View style={styles.customerMeta}>
        {customer.category && (
          <View style={[styles.smallPill, { backgroundColor: category.background }]}>
            <Text style={[styles.smallPillText, { color: category.color }]}>{customer.category}</Text>
          </View>
        )}
        {customer.coordinateState === "missing" && (
          <View style={[styles.smallPill, { backgroundColor: fieldTheme.color.surfaceStrong }]}>
            <Text style={[styles.smallPillText, { color: fieldTheme.color.inkMuted }]}>{copy.coordinatesMissing}</Text>
          </View>
        )}
        {customer.coordinateState === "suspicious" && (
          <View style={[styles.smallPill, { backgroundColor: fieldTheme.color.amberSoft }]}>
            <Text style={[styles.smallPillText, { color: fieldTheme.color.amber }]}>{copy.coordinatesSuspicious}</Text>
          </View>
        )}
        {distance && customer.distanceMeters != null && (
          <View style={[styles.smallPill, { backgroundColor: distance.background }]}>
            <Text style={[styles.smallPillText, { color: distance.color }]}>
              {formatDistance(customer.distanceMeters)}
            </Text>
          </View>
        )}
      </View>
      <Icon
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={selected ? fieldTheme.color.success : fieldTheme.color.border}
      />
    </Pressable>
  )
}

function HistoryPanel({
  copy,
  visits,
  loadState,
  language,
  tablet,
  refreshing,
  bottomPadding,
  onRefresh,
  onRetry,
}: {
  copy: Copy
  visits: Visit[]
  loadState: LoadState
  language: string
  tablet: boolean
  refreshing: boolean
  bottomPadding: number
  onRefresh: () => void
  onRetry: () => void
}) {
  return (
    <FlatList
      data={visits}
      keyExtractor={(visit) => visit.id}
      contentContainerStyle={[styles.historyContent, { paddingBottom: bottomPadding }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={fieldTheme.color.primary}
          colors={[fieldTheme.color.primary]}
        />
      }
      ListHeaderComponent={
        <HistoryHeading copy={copy} count={visits.length} />
      }
      ListEmptyComponent={
        loadState === "loading"
          ? <LoadingState copy={copy} />
          : loadState === "error"
            ? <StateNotice kind="error" copy={copy} onRetry={onRetry} />
            : <EmptyHistory copy={copy} tablet={tablet} />
      }
      renderItem={({ item }) => <VisitRow visit={item} copy={copy} language={language} />}
    />
  )
}

function HistoryHeading({ copy, count }: { copy: Copy; count: number }) {
  return (
    <View style={styles.historyHeading}>
      <View>
        <Text style={styles.sectionEyebrow}>{copy.historyEyebrow}</Text>
        <Text style={styles.historyTitle}>{copy.historyTitle}</Text>
      </View>
      <View style={styles.historyCountPill}>
        <Text style={styles.historyCount}>{copy.historyCount.replace("{{count}}", String(count))}</Text>
      </View>
    </View>
  )
}

function VisitRow({ visit, copy, language }: { visit: Visit; copy: Copy; language: string }) {
  const active = visit.status === "CHECKED_IN"
  const pending = visit.pendingCheckOut === true
  const startTime = formatVisitStart(visit.checkInAt, language)
  const endTime = formatVisitClock(visit.checkOutAt, language)
  const tone = pending
    ? { color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft, icon: "cloud-upload-outline" }
    : active
      ? { color: fieldTheme.color.success, background: fieldTheme.color.successSoft, icon: "radio-outline" }
      : { color: fieldTheme.color.primary, background: fieldTheme.color.primarySoft, icon: "checkmark-outline" }
  const status = pending ? copy.pendingStatus : active ? copy.activeStatus : copy.completeStatus
  return (
    <View style={[styles.visitRow, active && styles.visitRowActive]}>
      <View style={[styles.visitStatusIcon, { backgroundColor: tone.background }]}>
        <Icon name={tone.icon} size={21} color={tone.color} />
      </View>
      <View style={styles.visitCopy}>
        <Text style={styles.visitName} numberOfLines={1}>{visit.customer?.name || "—"}</Text>
        <Text style={styles.visitAddress} numberOfLines={1}>{visit.customer?.address || copy.noAddress}</Text>
        <View style={styles.visitMetaRow}>
          <Text style={styles.visitTime}>{startTime || copy.noTime}{endTime ? ` – ${endTime}` : ""}</Text>
          {visit.duration != null && (
            <Text style={styles.visitDuration}>{copy.duration.replace("{{count}}", String(visit.duration))}</Text>
          )}
        </View>
      </View>
      <View style={[styles.statusPill, { backgroundColor: tone.background }]}>
        <Text style={[styles.statusText, { color: tone.color }]}>{status}</Text>
      </View>
    </View>
  )
}

function StateNotice({ kind, copy, onRetry }: {
  kind: "offline" | "error"
  copy: Copy
  onRetry: () => void
}) {
  const offline = kind === "offline"
  const color = offline ? fieldTheme.color.amber : fieldTheme.color.danger
  const background = offline ? fieldTheme.color.amberSoft : fieldTheme.color.dangerSoft
  return (
    <View style={[styles.stateNotice, { backgroundColor: background }]} accessibilityLiveRegion="polite">
      <Icon name={offline ? "cloud-offline-outline" : "alert-circle-outline"} size={23} color={color} />
      <View style={styles.stateNoticeCopy}>
        <Text style={[styles.stateNoticeTitle, { color }]}>{offline ? copy.offlineTitle : copy.errorTitle}</Text>
        <Text style={styles.stateNoticeBody}>{offline ? copy.offlineBody : copy.errorBody}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
        <Icon name="refresh" size={18} color={color} />
        <Text style={[styles.retryText, { color }]}>{offline ? copy.refresh : copy.retry}</Text>
      </Pressable>
    </View>
  )
}

function LoadingState({ copy, compact = false }: { copy: Copy; compact?: boolean }) {
  return (
    <View style={[styles.loadingState, compact && styles.loadingStateCompact]} accessibilityLiveRegion="polite">
      <ActivityIndicator size={compact ? "small" : "large"} color={fieldTheme.color.primary} />
      <View style={styles.loadingCopy}>
        <Text style={styles.loadingTitle}>{copy.loadingTitle}</Text>
        {!compact && <Text style={styles.loadingBody}>{copy.loadingBody}</Text>}
      </View>
    </View>
  )
}

function EmptyHistory({ copy, tablet = false }: { copy: Copy; tablet?: boolean }) {
  return (
    <View style={[styles.emptyHistory, tablet && styles.emptyHistoryTablet]} accessibilityLiveRegion="polite">
      <View style={styles.emptyIconWrap}>
        <Icon name="time-outline" size={32} color={fieldTheme.color.primary} />
      </View>
      <Text style={styles.emptyTitle}>{copy.emptyHistoryTitle}</Text>
      <Text style={styles.emptyBody}>{copy.emptyHistoryBody}</Text>
    </View>
  )
}

function MetaPill({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.metaPill}>
      <Icon name={icon} size={16} color={fieldTheme.color.inkMuted} />
      <Text style={styles.metaPillText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.lg,
  },
  headerInner: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: "#BBD6CB",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  headerTitle: {
    color: fieldTheme.color.onColor,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    marginTop: 2,
  },
  headerSubtitle: {
    color: "#D7E9E1",
    fontSize: 14,
    lineHeight: 20,
    marginTop: fieldTheme.space.xs,
    maxWidth: 760,
  },
  phoneContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: fieldTheme.space.lg,
  },
  tabletBody: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    flexDirection: "row",
    gap: fieldTheme.space.lg,
    paddingHorizontal: fieldTheme.space.lg,
  },
  tabletActionPane: { flex: 0.92 },
  tabletHistoryPane: { flex: 1.08 },
  actionContent: { paddingVertical: fieldTheme.space.lg },
  actionStack: { gap: fieldTheme.space.md },
  visitHint: { marginHorizontal: 0, marginTop: 0, alignItems: "flex-start" },
  routeGuide: {
    backgroundColor: fieldTheme.color.blueSoft,
    borderWidth: 1,
    borderColor: "#B8D0F0",
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  routeGuideIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: fieldTheme.color.surface,
  },
  routeGuideCopy: { flex: 1, minWidth: 190 },
  routeGuideTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  routeGuideBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  routeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.xs,
    paddingHorizontal: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.surface,
  },
  routeButtonText: { color: fieldTheme.color.blue, fontSize: 13, fontWeight: "900" },
  manualCard: {
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    borderRadius: fieldTheme.radius.lg,
    padding: fieldTheme.space.lg,
  },
  activeCard: {
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: "#A9D8C1",
    borderRadius: fieldTheme.radius.lg,
    padding: fieldTheme.space.lg,
  },
  cardTablet: { padding: fieldTheme.space.xl },
  sectionIconRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  sectionIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  sectionTitleCopy: { flex: 1 },
  sectionEyebrow: {
    color: fieldTheme.color.primary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 25, fontWeight: "900", marginTop: 2 },
  sectionBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.md },
  fieldLabel: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800", marginTop: fieldTheme.space.lg, marginBottom: fieldTheme.space.sm },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.canvas,
    paddingHorizontal: fieldTheme.space.md,
  },
  searchInput: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, paddingVertical: 0 },
  clearButton: { alignItems: "center", justifyContent: "center" },
  customerListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.lg,
    marginBottom: fieldTheme.space.sm,
  },
  customerListTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  customerListCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  customerList: { gap: fieldTheme.space.sm },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
    paddingVertical: fieldTheme.space.sm,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.canvas,
  },
  customerRowSelected: { borderColor: fieldTheme.color.success, backgroundColor: fieldTheme.color.successSoft },
  customerAvatar: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  customerInitial: { fontSize: 17, fontWeight: "900" },
  customerCopy: { flex: 1, minWidth: 0 },
  customerName: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  customerAddress: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  customerMeta: { alignItems: "flex-end", gap: 3 },
  smallPill: { minHeight: 22, justifyContent: "center", borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm },
  smallPillText: { fontSize: 10, fontWeight: "900" },
  customerEmpty: { alignItems: "center", paddingHorizontal: fieldTheme.space.lg, paddingVertical: fieldTheme.space.xl },
  customerEmptyTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.sm },
  customerEmptyBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: fieldTheme.space.xs },
  selectionSummary: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.lg,
    paddingHorizontal: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.successSoft,
  },
  selectionCopy: { flex: 1 },
  selectionLabel: { color: fieldTheme.color.success, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  selectionName: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900", marginTop: 1 },
  prerequisite: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  prerequisiteText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  issueBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.danger,
    backgroundColor: fieldTheme.color.dangerSoft,
  },
  issueCopy: { flex: 1, gap: 2 },
  issueTitle: { color: fieldTheme.color.danger, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  issueBody: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    backgroundColor: fieldTheme.color.primary,
    borderRadius: fieldTheme.radius.md,
    marginTop: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.lg,
  },
  finishButton: { backgroundColor: fieldTheme.color.coral },
  primaryButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  activeMeta: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  metaPill: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, paddingHorizontal: fieldTheme.space.md },
  metaPillText: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  addressText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  pendingNotice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.amberSoft, paddingHorizontal: fieldTheme.space.md, marginTop: fieldTheme.space.md },
  pendingText: { flex: 1, color: fieldTheme.color.amber, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  secondaryActionRow: { flexDirection: "row", marginTop: fieldTheme.space.lg },
  secondaryButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md },
  secondaryButtonText: { color: fieldTheme.color.primary, fontSize: 14, fontWeight: "900" },
  historyContent: { flexGrow: 1, paddingVertical: fieldTheme.space.lg },
  historyHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: fieldTheme.space.sm, marginBottom: fieldTheme.space.md },
  historyTitle: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 27, fontWeight: "900", marginTop: 2 },
  historyCountPill: { minHeight: 32, justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, paddingHorizontal: fieldTheme.space.md },
  historyCount: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  visitRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, marginBottom: fieldTheme.space.sm },
  visitRowActive: { borderColor: "#A9D8C1" },
  visitStatusIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  visitCopy: { flex: 1, minWidth: 0 },
  visitName: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  visitAddress: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  visitMetaRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.xs },
  visitTime: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  visitDuration: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "900" },
  statusPill: { minHeight: 30, maxWidth: 120, justifyContent: "center", borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm },
  statusText: { fontSize: 10, lineHeight: 13, fontWeight: "900", textAlign: "center" },
  stateNotice: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, marginBottom: fieldTheme.space.md },
  stateNoticeCopy: { flex: 1, minWidth: 190 },
  stateNoticeTitle: { fontSize: 14, lineHeight: 19, fontWeight: "900" },
  stateNoticeBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  retryButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs, paddingHorizontal: fieldTheme.space.sm },
  retryText: { fontSize: 12, fontWeight: "900" },
  loadingState: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.xl },
  loadingStateCompact: { minHeight: 110, flexDirection: "row", padding: fieldTheme.space.md },
  loadingCopy: { alignItems: "center" },
  loadingTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900", textAlign: "center" },
  loadingBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: fieldTheme.space.xs },
  emptyHistory: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  emptyHistoryTablet: { minHeight: 360 },
  emptyIconWrap: { width: 66, height: 66, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: fieldTheme.color.primarySoft },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.lg },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 430, marginTop: fieldTheme.space.sm },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 },
})
