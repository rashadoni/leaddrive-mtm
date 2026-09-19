import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { useNavigation } from "@react-navigation/native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import i18next from "i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { ask, notify } from "../../services/app-feedback"
import { lastKnownPosition } from "../../services/location"
import { readOfflineRoute } from "../../services/offline-reads"
import { enqueueMediaUpload } from "../../services/media-outbox"
import {
  queueVisitCheckIn,
  queueVisitCheckOut,
  readOptimisticVisit,
  reconcileOptimisticVisit,
  type OptimisticVisit,
} from "../../services/visit-outbox"
import { runMobileSync } from "../../services/sync-engine"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { checkInRadiusMeters, FALLBACK_CHECK_IN_RADIUS_METERS } from "../../lib/check-in-radius"
import { useHintsStore } from "../../store/hints"
import { useWorkdayStore, workdayKey } from "../../store/workday"
import { useSyncStatusStore } from "../../store/sync-status"
import { refreshRouteFieldSession } from "../../services/field-session"
import { submitRouteCommand } from "../../services/route-command-journal"
import { publishedRouteEditAvailability } from "../../services/published-route-edit"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { AppNoticeLayer } from "../../components/AppFeedbackHost"
import NotesModal from "../../components/NotesModal"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"
import SignaturePadModal from "../../components/SignaturePadModal"
import { useActiveVisitProgress } from "../../hooks/useActiveVisitProgress"
import type { SignatureCapture } from "../../services/visit-signature-path"
import StatusBarBand from "../../components/StatusBarBand"
import { fieldTheme } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS, isTwoPaneTabWidth } from "../../theme/layoutBreakpoints"
import {
  routeActionPanelState,
  routeScreenPresentation,
  type RouteBannerMode,
  type RouteDataOrigin,
  type RouteLoadIssue,
} from "./route-screen-state"
import { hasUsableCoordinates, IMPLAUSIBLE_DISTANCE_METERS } from "../visit/visit-checkin-model"

interface RoutePoint {
  id: string
  orderIndex: number
  status: string
  plannedTime?: string
  visitedAt?: string
  distanceMeters?: number | null
  /** The server's check-in zone for this stop (customer radius, else the organization's). */
  geofenceRadiusMeters?: number | null
  customer: { id: string; name: string; address?: string; latitude?: number; longitude?: number }
}

interface Route {
  id: string
  name?: string
  date: string
  status: string
  version?: number | null
  agentId?: string | null
  totalPoints: number
  visitedPoints: number
  points: RoutePoint[]
}

type RouteLanguage = "ru" | "az" | "en"

const ROUTE_COPY = {
  ru: {
    title: "Маршрут на сегодня",
    subtitle: "Идите по точкам по порядку — приложение подскажет следующий шаг.",
    plannedRoute: "Плановый маршрут",
    plannedRouteBody: "Точки, которые менеджер включил в план на сегодня.",
    nextStop: "Следующая точка",
    selectedStop: "Выбранная точка",
    activeVisit: "Сейчас идёт визит",
    routeComplete: "Маршрут выполнен",
    routeCompleteBody: "Все плановые точки на сегодня посещены.",
    progress: "{{done}} из {{total}} точек готово",
    remaining: "Осталось: {{count}}",
    openMaps: "Построить путь",
    alreadyHere: "Я уже на месте",
    arrivedCheckIn: "Я приехал — начать визит",
    takePhoto: "Сделать фото",
    takeAnotherPhoto: "Добавить ещё фото",
    takeSignature: "Подпись клиента",
    takeSignatureRequired: "Подпись клиента — обязательно",
    signatureTaken: "Подпись получена",
    finishVisit: "Завершить визит",
    finishingVisit: "Завершение…",
    waitingForSync: "Ожидает отправки",
    photos: "Фото: {{count}}",
    visitTimer: "Визит идёт {{minutes}} мин",
    openWorkspace: "Задачи и презентации",
    visitWarning: "До 30 минут осталось не более 5 минут.",
    visitOvertime: "Прошло 30 минут. Завершите визит, если работа закончена.",
    recommended: "Рекомендуем идти по порядку. Следующая: {{name}}.",
    visited: "Посещено",
    skipped: "Пропущено",
    planned: "В плане",
    stopNumber: "Точка {{number}}",
    distanceAway: "До точки {{distance}}",
    noAddress: "Адрес не указан. Можно начать визит, когда вы на месте.",
    chooseStop: "Выберите точку слева, чтобы увидеть следующий шаг.",
    openVisits: "Открыть внеплановый визит",
    planOwnRouteTitle: "Хотите составить свой маршрут?",
    planOwnRouteBody: "Выберите день, добавьте своих клиентов и сохраните план. Редактировать его можете только вы.",
    planOwnRoute: "Составить мой маршрут",
    refresh: "Обновить маршрут",
    loading: "Получаем маршрут и ваши визиты…",
    offlineTitle: "Нет связи — работаем офлайн",
    offlineBody: "Показываем сохранённый маршрут. Действия отправятся, когда интернет вернётся.",
    retainedTitle: "Связь потеряна",
    retainedBody: "Показываем маршрут, открытый ранее. Новые действия отправятся, когда интернет вернётся.",
    offlineUnavailableTitle: "Маршрут не загрузился",
    offlineUnavailableBody: "Нет связи, а сохранённого маршрута на сегодня нет. Проверьте интернет и попробуйте снова.",
    slowTitle: "Сервер отвечает медленно",
    slowBody: "Маршрут не исчез. Попробуйте обновить ещё раз.",
    slowUnavailableBody: "Не удалось загрузить маршрут, и сохранённой копии на сегодня нет. Попробуйте снова.",
    retry: "Попробовать снова",
    hint: "Потяните список вниз для обновления. Зелёная карточка всегда показывает одно главное действие.",
    dismissHint: "Скрыть подсказку",
    close: "Закрыть",
    step1: "Точка",
    step2: "Путь",
    step3: "Приезд",
    step4: "Визит",
    step5: "Готово",
    currentStep: "Шаг {{step}} из 5: {{label}}",
    workdayRequiredTitle: "Сначала начните рабочий день",
    workdayRequiredBody: "Маршрут остаётся в плане, пока начало рабочего дня не подтверждено сервером. После этого можно будет запустить маршрут.",
    startWorkday: "Начать рабочий день",
    workdayStarting: "Начинаем рабочий день…",
    workdaySyncing: "Синхронизируем рабочий день…",
    workdayStartFailed: "Не удалось начать рабочий день. Проверьте подключение и повторите.",
    workdayPausedTitle: "Рабочий день приостановлен",
    workdayPausedBody: "Маршрут и рабочий GPS заблокированы. Возобновите рабочий день в HRM, прежде чем начинать маршрут.",
    routeStartRequiredTitle: "Маршрут ждёт запуска",
    routeStartRequiredBody: "Рабочий день уже начат. Нажмите «Начать маршрут», прежде чем строить путь или начинать визит.",
    routeFinishedTitle: "Маршрут завершён",
    routeFinishedBody: "Посещено точек: {{visited}} из {{total}}. Завершите рабочий день на экране «Сегодня», когда закончите.",
    startRoute: "Начать маршрут",
    routeStarting: "Запускаем маршрут…",
    routeStartQueuedTitle: "Начало маршрута сохранено",
    routeStartQueuedBody: "Нет связи. Запрос на запуск будет отправлен автоматически, когда интернет вернётся.",
    routeStartFailed: "Не удалось начать маршрут. Обновите план и повторите.",
    routeStartDeferredTitle: "Маршрут ещё не начат",
    routeStartDeferredBody: "Сервер не принял запрос на запуск. Приложение повторит его автоматически; если не получится, сообщите руководителю.",
  },
  az: {
    title: "Bugünkü marşrut",
    subtitle: "Nöqtələri ardıcıllıqla keçin — tətbiq növbəti addımı göstərəcək.",
    plannedRoute: "Planlı marşrut",
    plannedRouteBody: "Menecerin bu gün üçün plana əlavə etdiyi nöqtələr.",
    nextStop: "Növbəti nöqtə",
    selectedStop: "Seçilmiş nöqtə",
    activeVisit: "Ziyarət davam edir",
    routeComplete: "Marşrut tamamlandı",
    routeCompleteBody: "Bu günün bütün planlı nöqtələri ziyarət edilib.",
    progress: "{{total}} nöqtədən {{done}} hazırdır",
    remaining: "Qalıb: {{count}}",
    openMaps: "Yolu aç",
    alreadyHere: "Artıq buradayam",
    arrivedCheckIn: "Gəldim — ziyarətə başla",
    takePhoto: "Foto çək",
    takeAnotherPhoto: "Daha bir foto əlavə et",
    takeSignature: "Müştəri imzası",
    takeSignatureRequired: "Müştəri imzası — mütləqdir",
    signatureTaken: "İmza alındı",
    finishVisit: "Ziyarəti bitir",
    finishingVisit: "Ziyarət bitirilir…",
    waitingForSync: "Göndərilmə gözlənilir",
    photos: "Foto: {{count}}",
    visitTimer: "Ziyarət {{minutes}} dəqiqədir davam edir",
    openWorkspace: "Tapşırıqlar və təqdimatlar",
    visitWarning: "30 dəqiqəyə 5 dəqiqədən az qalıb.",
    visitOvertime: "30 dəqiqə keçib. İş bitibsə, ziyarəti tamamlayın.",
    recommended: "Ardıcıllıqla getmək məsləhətdir. Növbəti: {{name}}.",
    visited: "Ziyarət edilib",
    skipped: "Buraxılıb",
    planned: "Plandadır",
    stopNumber: "Nöqtə {{number}}",
    distanceAway: "Nöqtəyə {{distance}}",
    noAddress: "Ünvan göstərilməyib. Məkanda olduqda ziyarətə başlaya bilərsiniz.",
    chooseStop: "Növbəti addımı görmək üçün soldan nöqtə seçin.",
    openVisits: "Plandan kənar ziyarəti aç",
    planOwnRouteTitle: "Öz marşrutunuzu qurmaq istəyirsiniz?",
    planOwnRouteBody: "Günü seçin, öz müştərilərinizi əlavə edin və planı yadda saxlayın. Onu yalnız siz redaktə edə bilərsiniz.",
    planOwnRoute: "Mənim marşrutumu qur",
    refresh: "Marşrutu yenilə",
    loading: "Marşrut və ziyarətlər yüklənir…",
    offlineTitle: "Bağlantı yoxdur — oflayn işləyirik",
    offlineBody: "Yadda saxlanmış marşrut göstərilir. Əməliyyatlar internet qayıdanda göndəriləcək.",
    retainedTitle: "Bağlantı kəsildi",
    retainedBody: "Əvvəl açılmış marşrut göstərilir. Yeni əməliyyatlar bağlantı bərpa olunanda göndəriləcək.",
    offlineUnavailableTitle: "Marşrut yüklənmədi",
    offlineUnavailableBody: "Bağlantı yoxdur və bu gün üçün yadda saxlanmış marşrut tapılmadı. İnterneti yoxlayın və yenidən cəhd edin.",
    slowTitle: "Server gec cavab verir",
    slowBody: "Marşrut itməyib. Yenidən yeniləməyə çalışın.",
    slowUnavailableBody: "Marşrutu yükləmək mümkün olmadı və bu gün üçün yadda saxlanmış nüsxə yoxdur. Yenidən cəhd edin.",
    retry: "Yenidən cəhd et",
    hint: "Yeniləmək üçün siyahını aşağı çəkin. Yaşıl kart həmişə bir əsas əməliyyat göstərir.",
    dismissHint: "Məsləhəti gizlət",
    close: "Bağla",
    step1: "Nöqtə",
    step2: "Yol",
    step3: "Gəliş",
    step4: "Ziyarət",
    step5: "Hazır",
    currentStep: "5 addımdan {{step}}: {{label}}",
    workdayRequiredTitle: "Əvvəl iş gününü başladın",
    workdayRequiredBody: "İş gününün başlanması server tərəfindən təsdiqlənənədək marşrut plan olaraq qalır. Bundan sonra marşrutu başlada bilərsiniz.",
    startWorkday: "İş gününə başla",
    workdayStarting: "İş günü başladılır…",
    workdaySyncing: "İş günü sinxronlaşdırılır…",
    workdayStartFailed: "İş gününü başlatmaq alınmadı. Bağlantını yoxlayıb yenidən cəhd edin.",
    workdayPausedTitle: "İş günü dayandırılıb",
    workdayPausedBody: "Marşrut və iş GPS-i bloklanıb. Marşruta başlamazdan əvvəl HRM-də iş gününü davam etdirin.",
    routeStartRequiredTitle: "Marşrutun başlanması gözlənilir",
    routeStartRequiredBody: "İş günü artıq başlayıb. Yolu açmazdan və ya ziyarətə başlamazdan əvvəl «Marşruta başla» düyməsinə toxunun.",
    routeFinishedTitle: "Marşrut tamamlandı",
    routeFinishedBody: "Ziyarət edilən nöqtələr: {{visited}} / {{total}}. İşi bitirəndə «Bu gün» ekranında iş gününü bitirin.",
    startRoute: "Marşruta başla",
    routeStarting: "Marşrut başladılır…",
    routeStartQueuedTitle: "Marşrutun başlanması yadda saxlanıldı",
    routeStartQueuedBody: "Bağlantı yoxdur. Başlama sorğusu internet qayıdanda avtomatik göndəriləcək.",
    routeStartFailed: "Marşrutu başlatmaq alınmadı. Planı yeniləyib yenidən cəhd edin.",
    routeStartDeferredTitle: "Marşrut hələ başlamayıb",
    routeStartDeferredBody: "Server başlama sorğusunu qəbul etmədi. Tətbiq onu avtomatik təkrar göndərəcək; alınmasa, rəhbərinizə bildirin.",
  },
  en: {
    title: "Today's route",
    subtitle: "Follow the stops in order — the app will show the next step.",
    plannedRoute: "Planned route",
    plannedRouteBody: "Stops your manager included in today's plan.",
    nextStop: "Next stop",
    selectedStop: "Selected stop",
    activeVisit: "Visit in progress",
    routeComplete: "Route complete",
    routeCompleteBody: "Every planned stop for today has been visited.",
    progress: "{{done}} of {{total}} stops complete",
    remaining: "Left: {{count}}",
    openMaps: "Get directions",
    alreadyHere: "I'm already here",
    arrivedCheckIn: "I've arrived — start visit",
    takePhoto: "Take a photo",
    takeAnotherPhoto: "Add another photo",
    takeSignature: "Customer signature",
    takeSignatureRequired: "Customer signature — required",
    signatureTaken: "Signature taken",
    finishVisit: "Finish visit",
    finishingVisit: "Finishing…",
    waitingForSync: "Waiting to send",
    photos: "Photos: {{count}}",
    visitTimer: "Visit active for {{minutes}} min",
    openWorkspace: "Tasks & presentations",
    visitWarning: "The 30-minute mark is less than 5 minutes away.",
    visitOvertime: "30 minutes have passed. Finish the visit if the work is done.",
    recommended: "Following the planned order is recommended. Next: {{name}}.",
    visited: "Visited",
    skipped: "Skipped",
    planned: "Planned",
    stopNumber: "Stop {{number}}",
    distanceAway: "{{distance}} away",
    noAddress: "No address is saved. You can start the visit when you are there.",
    chooseStop: "Choose a stop on the left to see the next action.",
    openVisits: "Open unplanned visit",
    planOwnRouteTitle: "Want to create your own route?",
    planOwnRouteBody: "Choose a day, add your customers and save the plan. Only you can edit it.",
    planOwnRoute: "Create my route",
    refresh: "Refresh route",
    loading: "Loading your route and visits…",
    offlineTitle: "No connection — working offline",
    offlineBody: "Showing the saved route. Actions will send when the connection returns.",
    retainedTitle: "Connection lost",
    retainedBody: "Showing the route opened earlier. New actions will send when the connection returns.",
    offlineUnavailableTitle: "Route could not load",
    offlineUnavailableBody: "There is no connection and no saved route for today. Check your connection and try again.",
    slowTitle: "The server is responding slowly",
    slowBody: "Your route has not disappeared. Try refreshing again.",
    slowUnavailableBody: "The route could not load and there is no saved copy for today. Try again.",
    retry: "Try again",
    hint: "Pull the list down to refresh. The green panel always shows one main action.",
    dismissHint: "Hide hint",
    close: "Close",
    step1: "Stop",
    step2: "Travel",
    step3: "Arrive",
    step4: "Visit",
    step5: "Done",
    currentStep: "Step {{step}} of 5: {{label}}",
    workdayRequiredTitle: "Start the workday first",
    workdayRequiredBody: "The route remains a plan until the server confirms your workday start. Then you can start the route.",
    startWorkday: "Start workday",
    workdayStarting: "Starting workday…",
    workdaySyncing: "Syncing workday…",
    workdayStartFailed: "We could not start the workday. Check your connection and try again.",
    workdayPausedTitle: "Workday is paused",
    workdayPausedBody: "Route work and GPS are blocked. Resume the workday in HRM before starting the route.",
    routeStartRequiredTitle: "Route is waiting to start",
    routeStartRequiredBody: "The workday has started. Tap Start route before getting directions or beginning a visit.",
    routeFinishedTitle: "Route finished",
    routeFinishedBody: "Stops visited: {{visited}} of {{total}}. End the workday on the Today screen when you are done.",
    startRoute: "Start route",
    routeStarting: "Starting route…",
    routeStartQueuedTitle: "Route start saved",
    routeStartQueuedBody: "There is no connection. The start request will be sent automatically when it returns.",
    routeStartFailed: "We could not start the route. Refresh the plan and try again.",
    routeStartDeferredTitle: "The route has not started yet",
    routeStartDeferredBody: "The server did not accept the start request. The app will retry it automatically; if it keeps failing, tell your manager.",
  },
} as const

const GEOFENCE_DEFAULT = FALLBACK_CHECK_IN_RADIUS_METERS

/** The zone the server will accept for this stop; see lib/check-in-radius.ts. */
function pointCheckInRadius(point: { geofenceRadiusMeters?: number | null }): number {
  return checkInRadiusMeters(point.geofenceRadiusMeters, useBootstrapStore.getState().data?.policies)
}
/** How long the route read waits for a GPS fix before showing the stops without distances. */
const ROUTE_STOPS_BEFORE_GPS_MS = 1500

function routeLanguage(language: string): RouteLanguage {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

export function routeLayout(width: number): "phone" | "tablet" {
  // The room right of the rail, not the window: see tabContentWidth.
  return isTwoPaneTabWidth(width) ? "tablet" : "phone"
}

function distanceColor(meters: number, radius: number = GEOFENCE_DEFAULT): string {
  if (meters < radius) return fieldTheme.color.success
  if (meters < 500) return fieldTheme.color.amber
  return fieldTheme.color.danger
}

/**
 * A distance that cannot be a real trip means the stored coordinates are wrong
 * (or the 0°,0° placeholder). It is hidden instead of shown as "6745.7 km".
 */
function plausibleDistance(meters: number | null | undefined): number | null {
  if (meters == null || !Number.isFinite(meters) || meters > IMPLAUSIBLE_DISTANCE_METERS) return null
  return meters
}

function sanitizeRouteDistances<T extends { points?: Array<{ distanceMeters?: number | null }> }>(route: T): T {
  if (!Array.isArray(route.points)) return route
  return {
    ...route,
    points: route.points.map((point) => ({ ...point, distanceMeters: plausibleDistance(point.distanceMeters) })),
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function localRouteDateKey(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
}

function routeDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_371_000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function renderTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{{${key}}}`, String(value)),
    template,
  )
}

function pointStatus(point: RoutePoint, copy: (typeof ROUTE_COPY)[RouteLanguage]) {
  if (point.status === "VISITED") return { label: copy.visited, icon: "checkmark-circle" as const, color: fieldTheme.color.success }
  if (point.status === "SKIPPED") return { label: copy.skipped, icon: "remove-circle" as const, color: fieldTheme.color.danger }
  return { label: copy.planned, icon: "ellipse-outline" as const, color: fieldTheme.color.inkMuted }
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  tone = "primary",
}: {
  label: string
  icon: string
  onPress: () => void
  disabled?: boolean
  tone?: "primary" | "secondary" | "danger"
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === "secondary" && styles.actionButtonSecondary,
        tone === "danger" && styles.actionButtonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Icon
        name={icon}
        size={21}
        color={tone === "secondary" ? fieldTheme.color.primaryStrong : fieldTheme.color.onColor}
      />
      <Text style={[styles.actionButtonText, tone === "secondary" && styles.actionButtonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  )
}

function RouteExecutionGate({
  mode,
  busy,
  copy,
  onPress,
  disabled = false,
}: {
  mode: "workday" | "route" | "paused"
  busy: boolean
  copy: (typeof ROUTE_COPY)[RouteLanguage]
  onPress: () => void
  disabled?: boolean
}) {
  const workday = mode === "workday"
  const paused = mode === "paused"
  const title = paused
    ? copy.workdayPausedTitle
    : workday
      ? copy.workdayRequiredTitle
      : copy.routeStartRequiredTitle
  const body = paused
    ? copy.workdayPausedBody
    : workday
      ? copy.workdayRequiredBody
      : copy.routeStartRequiredBody
  return (
    <View style={styles.actionPanel} accessibilityLiveRegion="polite">
      <View style={styles.actionEyebrowRow}>
        <Icon name={workday || paused ? "briefcase-outline" : "play-circle-outline"} size={19} color={fieldTheme.color.amber} />
        <Text style={styles.actionEyebrow}>{title}</Text>
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionAddress}>{body}</Text>
      {!paused ? (
        <ActionButton
          label={busy
            ? (workday ? copy.workdaySyncing : copy.routeStarting)
            : (workday ? copy.startWorkday : copy.startRoute)}
          icon={busy ? "hourglass-outline" : "play-circle"}
          onPress={onPress}
          disabled={busy || disabled}
        />
      ) : null}
    </View>
  )
}

function RouteFinishedPanel({ visited, total, copy }: {
  visited: number
  total: number
  copy: (typeof ROUTE_COPY)[RouteLanguage]
}) {
  return (
    <View style={styles.actionPanel} accessibilityLiveRegion="polite" testID="route-action-panel-finished">
      <View style={styles.actionEyebrowRow}>
        <Icon name="checkmark-circle" size={19} color={fieldTheme.color.success} />
        <Text style={styles.actionEyebrow}>{copy.routeFinishedTitle}</Text>
      </View>
      <Text style={styles.actionTitle}>{copy.routeFinishedTitle}</Text>
      <Text style={styles.actionAddress}>
        {copy.routeFinishedBody.replace("{{visited}}", String(visited)).replace("{{total}}", String(total))}
      </Text>
    </View>
  )
}

// Stands where the panel will be while routeActionPanelState cannot yet tell
// which one it is: the loading words the list already uses, no order and no
// button (Galaxy S23, 2026-09-14 — the gate asked to start a started route).
function RouteActionPanelLoading({ copy }: { copy: (typeof ROUTE_COPY)[RouteLanguage] }) {
  return (
    <View style={[styles.actionPanelEmpty, styles.actionPanelLoading]} testID="route-action-panel-loading">
      <ActivityIndicator color={fieldTheme.color.primary} />
      <Text style={styles.actionEmptyText}>{copy.loading}</Text>
    </View>
  )
}

function JourneySteps({
  activeStep,
  copy,
  compact,
}: {
  activeStep: number
  copy: (typeof ROUTE_COPY)[RouteLanguage]
  compact: boolean
}) {
  const labels = [copy.step1, copy.step2, copy.step3, copy.step4, copy.step5]
  return (
    <View style={styles.stepsWrap} accessibilityLabel={renderTemplate(copy.currentStep, { step: activeStep, label: labels[activeStep - 1] })}>
      <View style={styles.stepsRow}>
        {labels.map((label, index) => {
          const step = index + 1
          const done = step < activeStep
          const current = step === activeStep
          return (
            <React.Fragment key={label}>
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, done && styles.stepCircleDone, current && styles.stepCircleCurrent]}>
                  {done ? (
                    <Icon name="checkmark" size={14} color={fieldTheme.color.onColor} />
                  ) : (
                    <Text style={[styles.stepNumber, current && styles.stepNumberCurrent]}>{step}</Text>
                  )}
                </View>
                {!compact && <Text style={[styles.stepLabel, current && styles.stepLabelCurrent]}>{label}</Text>}
              </View>
              {index < labels.length - 1 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
            </React.Fragment>
          )
        })}
      </View>
      {compact && (
        <Text style={styles.currentStepText}>
          {renderTemplate(copy.currentStep, { step: activeStep, label: labels[activeStep - 1] })}
        </Text>
      )}
    </View>
  )
}

function ConnectionBanner({
  mode,
  copy,
}: {
  mode: RouteBannerMode
  copy: (typeof ROUTE_COPY)[RouteLanguage]
}) {
  if (!mode) return null
  const slowOnly = mode === "slow-retained"
  const cached = mode === "cached"
  return (
    <View
      style={[styles.connectionBanner, slowOnly && styles.connectionBannerSlow]}
      accessibilityLiveRegion="polite"
    >
      <Icon
        name={slowOnly ? "speedometer-outline" : "cloud-offline-outline"}
        size={22}
        color={slowOnly ? fieldTheme.color.amber : fieldTheme.color.coral}
      />
      <View style={styles.connectionCopy}>
        <Text style={styles.connectionTitle}>
          {slowOnly ? copy.slowTitle : cached ? copy.offlineTitle : copy.retainedTitle}
        </Text>
        <Text style={styles.connectionBody}>
          {slowOnly ? copy.slowBody : cached ? copy.offlineBody : copy.retainedBody}
        </Text>
      </View>
    </View>
  )
}

function RouteSummary({
  route,
  done,
  total,
  remaining,
  language,
  copy,
}: {
  route: Route
  done: number
  total: number
  remaining: number
  language: string
  copy: (typeof ROUTE_COPY)[RouteLanguage]
}) {
  const completion = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHeading}>
        <View style={styles.summaryIcon}>
          <Icon name="git-branch-outline" size={22} color={fieldTheme.color.primaryStrong} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryEyebrow}>{copy.plannedRoute}</Text>
          <Text style={styles.summaryTitle} numberOfLines={1}>{route.name || copy.title}</Text>
          <Text style={styles.summaryDate}>
            {new Date(route.date).toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long" })}
          </Text>
          <Text style={styles.summaryBody}>{copy.plannedRouteBody}</Text>
        </View>
        <View style={styles.remainingPill}>
          <Text style={styles.remainingText}>{renderTemplate(copy.remaining, { count: remaining })}</Text>
        </View>
      </View>
      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>{renderTemplate(copy.progress, { done, total })}</Text>
        <Text style={styles.progressPercent}>{completion}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${completion}%` }]} />
      </View>
    </View>
  )
}

function StopRow({
  point,
  index,
  selected,
  recommended,
  onPress,
  language,
  copy,
}: {
  point: RoutePoint
  index: number
  selected: boolean
  recommended: boolean
  onPress: () => void
  language: string
  copy: (typeof ROUTE_COPY)[RouteLanguage]
}) {
  const status = pointStatus(point, copy)
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${renderTemplate(copy.stopNumber, { number: index + 1 })}. ${point.customer.name}. ${status.label}`}
      style={({ pressed }) => [styles.stopRow, selected && styles.stopRowSelected, pressed && styles.stopRowPressed]}
    >
      <View style={[styles.stopNumber, recommended && styles.stopNumberRecommended, point.status === "VISITED" && styles.stopNumberDone]}>
        {point.status === "VISITED" ? (
          <Icon name="checkmark" size={17} color={fieldTheme.color.onColor} />
        ) : (
          <Text style={[styles.stopNumberText, recommended && styles.stopNumberTextRecommended]}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.stopCopy}>
        <View style={styles.stopTitleRow}>
          <Text style={[styles.stopName, point.status === "VISITED" && styles.stopNameDone]} numberOfLines={2}>
            {point.customer.name}
          </Text>
          <View style={styles.stopStatus}>
            <Icon name={status.icon} size={14} color={status.color} />
            <Text style={[styles.stopStatusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        {point.customer.address ? <Text style={styles.stopAddress} numberOfLines={2}>{point.customer.address}</Text> : null}
        <View style={styles.stopMeta}>
          {point.visitedAt ? (
            <View style={styles.metaItem}>
              <Icon name="checkmark-circle-outline" size={15} color={fieldTheme.color.success} />
              <Text style={[styles.metaText, { color: fieldTheme.color.success }]}>
                {new Date(point.visitedAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          {point.distanceMeters != null && point.status !== "VISITED" ? (
            <View style={styles.metaItem}>
              <Icon name="navigate-outline" size={15} color={distanceColor(point.distanceMeters, pointCheckInRadius(point))} />
              <Text style={[styles.metaText, { color: distanceColor(point.distanceMeters, pointCheckInRadius(point)) }]}>
                {formatDistance(point.distanceMeters)}
              </Text>
            </View>
          ) : !hasUsableCoordinates(point.customer) && point.status !== "VISITED" ? (
            <View style={styles.metaItem}>
              <Icon name="help-circle-outline" size={15} color={fieldTheme.color.inkMuted} />
              <Text style={styles.metaText}>{i18next.t("route.noCoordinates")}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={20} color={selected ? fieldTheme.color.primary : fieldTheme.color.border} />
    </Pressable>
  )
}

function InlineHint({ text, dismissLabel }: { text: string; dismissLabel: string }) {
  const enabled = useHintsStore((state) => state.enabled)
  const dismissed = useHintsStore((state) => state.dismissed)
  const hydrated = useHintsStore((state) => state.hydrated)
  const dismiss = useHintsStore((state) => state.dismiss)
  const id = "route.pullRefresh"
  if (!hydrated || !enabled || dismissed.includes(id)) return null
  return (
    <View style={styles.hint}>
      <Icon name="information-circle-outline" size={22} color={fieldTheme.color.blue} />
      <Text style={styles.hintText}>{text}</Text>
      <Pressable
        onPress={() => dismiss(id)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        style={styles.hintClose}
      >
        <Icon name="close" size={20} color={fieldTheme.color.inkMuted} />
      </Pressable>
    </View>
  )
}

/** «Planı dəyiş» next to the stop list of today's own published route. */
function ChangePlanButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      testID="route-change-plan"
      style={({ pressed }) => [styles.changePlanButton, pressed && styles.pressed]}
    >
      <Icon name="create-outline" size={17} color={fieldTheme.color.primaryStrong} />
      <Text style={styles.changePlanText}>{label}</Text>
    </Pressable>
  )
}

function OwnRoutePlanningCard({ copy, onPress }: { copy: (typeof ROUTE_COPY)[RouteLanguage]; onPress: () => void }) {
  return (
    <View style={styles.ownRouteCard}>
      <View style={styles.cardHeading}>
        <Icon name="calendar-outline" size={23} color={fieldTheme.color.primaryStrong} />
        <Text style={styles.cardTitle}>{copy.planOwnRouteTitle}</Text>
      </View>
      <Text style={styles.cardBody}>{copy.planOwnRouteBody}</Text>
      <ActionButton label={copy.planOwnRoute} icon="add-circle-outline" onPress={onPress} tone="secondary" />
    </View>
  )
}

function PointActionPanel({
  point,
  nextPoint,
  activeVisit,
  navigationStarted,
  photoCount,
  elapsedMin,
  mutating,
  copy,
  onNavigate,
  onCheckIn,
  onPhoto,
  onOpenWorkspace,
  onCheckOut,
  signature,
  onSignature,
}: {
  point: RoutePoint | null
  nextPoint: RoutePoint | null
  activeVisit: OptimisticVisit | null
  navigationStarted: boolean
  photoCount: number
  elapsedMin: number
  mutating: boolean
  copy: (typeof ROUTE_COPY)[RouteLanguage]
  onNavigate: (point: RoutePoint) => void
  onCheckIn: (point: RoutePoint) => void
  onPhoto: () => void
  onOpenWorkspace: () => void
  onCheckOut: () => void
  signature: { visible: boolean; required: boolean; signed: boolean }
  onSignature: () => void
}) {
  if (activeVisit) {
    const pending = activeVisit.pendingCheckOut
    const photoFirst = photoCount === 0
    return (
      <View style={styles.actionPanel}>
        <View style={styles.actionEyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.actionEyebrow}>{copy.activeVisit}</Text>
        </View>
        <Text style={styles.actionTitle}>{activeVisit.customer?.name}</Text>
        {activeVisit.customer?.address ? <Text style={styles.actionAddress}>{activeVisit.customer.address}</Text> : null}
        <View style={styles.visitFacts}>
          <View style={styles.factPill}>
            <Icon name="time-outline" size={17} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.factText}>{renderTemplate(copy.visitTimer, { minutes: elapsedMin })}</Text>
          </View>
          <View style={styles.factPill}>
            <Icon name="camera-outline" size={17} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.factText}>{renderTemplate(copy.photos, { count: photoCount })}</Text>
          </View>
          {signature.visible && signature.signed ? (
            <View style={styles.factPill} testID="route-signature-taken">
              <Icon name="checkmark-done-outline" size={17} color={fieldTheme.color.primaryStrong} />
              <Text style={styles.factText}>{copy.signatureTaken}</Text>
            </View>
          ) : null}
        </View>
        {elapsedMin >= 25 ? (
          <View style={[styles.visitTimeNotice, elapsedMin >= 30 && styles.visitTimeNoticeOvertime]} accessibilityLiveRegion="polite">
            <Icon name={elapsedMin >= 30 ? "alert-circle" : "time-outline"} size={18} color={elapsedMin >= 30 ? fieldTheme.color.danger : fieldTheme.color.amber} />
            <Text style={[styles.visitTimeNoticeText, elapsedMin >= 30 && styles.visitTimeNoticeTextOvertime]}>
              {elapsedMin >= 30 ? copy.visitOvertime : copy.visitWarning}
            </Text>
          </View>
        ) : null}
        {pending ? (
          <ActionButton label={copy.waitingForSync} icon="cloud-upload-outline" onPress={() => {}} disabled />
        ) : photoFirst ? (
          <>
            <ActionButton label={copy.openWorkspace} icon="easel-outline" onPress={onOpenWorkspace} tone="secondary" />
            <ActionButton label={copy.takePhoto} icon="camera" onPress={onPhoto} disabled={mutating} />
            <ActionButton label={copy.finishVisit} icon="checkmark-circle-outline" onPress={onCheckOut} disabled={mutating} tone="secondary" />
          </>
        ) : (
          <>
            <ActionButton label={copy.openWorkspace} icon="easel-outline" onPress={onOpenWorkspace} tone="secondary" />
            <ActionButton
              label={mutating ? copy.finishingVisit : copy.finishVisit}
              icon={mutating ? "hourglass-outline" : "checkmark-circle"}
              onPress={onCheckOut}
              disabled={mutating}
            />
            <ActionButton label={copy.takeAnotherPhoto} icon="camera-outline" onPress={onPhoto} disabled={mutating} tone="secondary" />
          </>
        )}
        {!pending && signature.visible && !signature.signed ? (
          <ActionButton
            label={signature.required ? copy.takeSignatureRequired : copy.takeSignature}
            icon="create-outline"
            onPress={onSignature}
            disabled={mutating}
            tone="secondary"
          />
        ) : null}
      </View>
    )
  }

  if (!point) {
    return (
      <View style={styles.actionPanelEmpty}>
        <Icon name="hand-left-outline" size={30} color={fieldTheme.color.primary} />
        <Text style={styles.actionEmptyText}>{copy.chooseStop}</Text>
      </View>
    )
  }

  const visited = point.status === "VISITED"
  const skipped = point.status === "SKIPPED"
  const isRecommended = nextPoint?.id === point.id
  const hasDirections = Boolean(point.customer.address || hasUsableCoordinates(point.customer))
  const showDirections = !navigationStarted && hasDirections

  return (
    <View style={styles.actionPanel}>
      <Text style={styles.actionEyebrow}>{isRecommended ? copy.nextStop : copy.selectedStop}</Text>
      <Text style={styles.actionTitle}>{point.customer.name}</Text>
      {point.customer.address ? <Text style={styles.actionAddress}>{point.customer.address}</Text> : <Text style={styles.actionAddress}>{copy.noAddress}</Text>}
      <View style={styles.detailFacts}>
        <View style={styles.detailFact}>
          <Icon name="list-outline" size={18} color={fieldTheme.color.inkMuted} />
          <Text style={styles.detailFactText}>{renderTemplate(copy.stopNumber, { number: point.orderIndex + 1 })}</Text>
        </View>
        {point.distanceMeters != null ? (
          <View style={styles.detailFact}>
            <Icon name="navigate-outline" size={18} color={distanceColor(point.distanceMeters, pointCheckInRadius(point))} />
            <Text style={[styles.detailFactText, { color: distanceColor(point.distanceMeters, pointCheckInRadius(point)) }]}>
              {renderTemplate(copy.distanceAway, { distance: formatDistance(point.distanceMeters) })}
            </Text>
          </View>
        ) : !hasUsableCoordinates(point.customer) ? (
          <View style={styles.detailFact}>
            <Icon name="help-circle-outline" size={18} color={fieldTheme.color.inkMuted} />
            <Text style={styles.detailFactText}>{i18next.t("route.noCoordinates")}</Text>
          </View>
        ) : null}
      </View>
      {!isRecommended && nextPoint && !visited && !skipped ? (
        <View style={styles.recommendation}>
          <Icon name="information-circle-outline" size={19} color={fieldTheme.color.amber} />
          <Text style={styles.recommendationText}>{renderTemplate(copy.recommended, { name: nextPoint.customer.name })}</Text>
        </View>
      ) : null}
      {visited ? (
        <View style={styles.completedState}>
          <Icon name="checkmark-circle" size={27} color={fieldTheme.color.success} />
          <Text style={styles.completedStateText}>{copy.visited}</Text>
        </View>
      ) : skipped ? (
        <View style={styles.completedState}>
          <Icon name="remove-circle" size={27} color={fieldTheme.color.danger} />
          <Text style={styles.completedStateText}>{copy.skipped}</Text>
        </View>
      ) : showDirections ? (
        <>
          <ActionButton label={copy.openMaps} icon="navigate" onPress={() => onNavigate(point)} />
          <ActionButton label={copy.alreadyHere} icon="location-outline" onPress={() => onCheckIn(point)} disabled={mutating} tone="secondary" />
        </>
      ) : (
        <ActionButton
          label={mutating ? copy.finishingVisit : copy.arrivedCheckIn}
          icon={mutating ? "hourglass-outline" : "log-in-outline"}
          onPress={() => onCheckIn(point)}
          disabled={mutating}
        />
      )}
    </View>
  )
}

export default function RouteScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const agent = useAuthStore((state) => state.agent)
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const startWorkday = useWorkdayStore((state) => state.start)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const currentWorkday = activeWorkday?.key === currentWorkdayKey ? activeWorkday : null
  const workdayPaused = currentWorkday?.syncState === "CONFIRMED" && currentWorkday.paused === true
  const workdayTransitionPending = currentWorkday?.syncState === "START_PENDING" || currentWorkday?.syncState === "FINISH_PENDING"
  const workdayActive = workdayHydrated && currentWorkday?.syncState === "CONFIRMED" && !workdayPaused
  const ownRoutePlanningPolicy = useBootstrapStore((state) => state.data?.policies.canPlanOwnRoutes === true)
  // This shortcut is for field agents only. Managers keep their existing
  // team-planning workspace, so they are never sent into a locked "my route"
  // screen by mistake.
  const canPlanOwnRoutes = String(agent?.role).toUpperCase() === "AGENT"
    && ownRoutePlanningPolicy
  const online = useSyncStatusStore((state) => state.online)
  const { width } = useWindowDimensions()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const tablet = routeLayout(width) === "tablet"
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const copy = ROUTE_COPY[routeLanguage(i18n.language)]
  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [startingWorkday, setStartingWorkday] = useState(false)
  const [startingRoute, setStartingRoute] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [phonePanelVisible, setPhonePanelVisible] = useState(false)
  const [navigationStartedFor, setNavigationStartedFor] = useState<string | null>(null)
  const [activeVisit, setActiveVisit] = useState<OptimisticVisit | null>(null)
  const [elapsedMin, setElapsedMin] = useState(0)
  const [notesVisible, setNotesVisible] = useState(false)
  const [cameraVisible, setCameraVisible] = useState(false)
  // «Foto: N» and the photo-first main button read what the visit really has
  // (server + media outbox + uploads here), not a counter that a restart reset
  // to 0 — Galaxy S23, 2026-09-14: 3 photos on the server, «Foto: 0» shown.
  const { signature, photos } = useActiveVisitProgress(activeVisit)
  const [routeOrigin, setRouteOrigin] = useState<RouteDataOrigin>("none")
  const [loadIssue, setLoadIssue] = useState<RouteLoadIssue>("none")
  // False until the first visit lookup settles, success or not: before that a
  // missing activeVisit means "not read yet", not "no visit open".
  const [activeVisitKnown, setActiveVisitKnown] = useState(false)
  // True only when the last route read that finished said today has no route.
  // A failed read with no saved copy leaves it false: the route is unknown
  // then, not absent, and the panel must not ask to start it.
  const [routeKnownAbsent, setRouteKnownAbsent] = useState(false)

  const fetchActiveVisit = useCallback(async () => {
    try {
      const response = await api.getVisits({ limit: 10 })
      if (response.success) {
        const visits = response.data?.visits || response.data || []
        const list = Array.isArray(visits) ? visits : []
        const active = list.find((visit: any) => visit.status === "CHECKED_IN") || null
        const reconciled = await reconcileOptimisticVisit(
          active ? { ...active, status: "CHECKED_IN", pendingCheckOut: false } : null,
        )
        setActiveVisit(reconciled)
      }
    } catch {
      // Keep the local visit visible when a refresh fails in weak coverage.
      try {
        const optimistic = await readOptimisticVisit()
        if (optimistic) setActiveVisit(optimistic)
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!activeVisit) {
      setElapsedMin(0)
      return
    }
    const update = () => {
      const difference = Date.now() - new Date(activeVisit.checkInAt).getTime()
      setElapsedMin(Math.floor(difference / 60000))
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [activeVisit])

  const fetchRoute = useCallback(async (signal?: AbortSignal) => {
    setLoadIssue("none")
    const today = localRouteDateKey()
    try {
      let response = await api.getRoutes(today, signal)
      if (!response.success || !response.data?.routes?.length) response = await api.getRoutes(undefined, signal)
      if (!response.success) throw new Error(response.error || "ROUTE_LOAD_FAILED")
      if (response.success && response.data?.routes?.length > 0) {
        // Today's finished route stays on screen as finished: dropping it
        // made the tab say «no route today» right after the last visit.
        const statusRank: Record<string, number> = { IN_PROGRESS: 2, PLANNED: 1, COMPLETED: 0 }
        const activeForToday = response.data.routes
          .filter((candidate: any) => routeDateKey(candidate.date) === today && candidate.status in statusRank)
          .sort((left: any, right: any) => statusRank[right.status] - statusRank[left.status])
        const routeData = activeForToday[0]
        if (!routeData) {
          setRoute(null)
          setRouteOrigin("none")
          setRouteKnownAbsent(true)
          return
        }
        if (routeData.id) {
          const coordsRequest = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
            Geolocation.getCurrentPosition(
              (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
            )
          })
          // Galaxy S23, 2026-09-15: after «Planı dəyiş» the tab kept showing
          // the removed stop for the whole GPS wait (up to 8 s before the
          // workday). Stops come first; distances follow when a fix arrives.
          let coords = await Promise.race([
            coordsRequest,
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ROUTE_STOPS_BEFORE_GPS_MS)),
          ])
          if (coords === undefined) {
            const quick = await api.getRoute(routeData.id, undefined, signal)
            if (quick.success && quick.data) {
              setRoute(sanitizeRouteDistances(quick.data))
              setRouteOrigin("live")
              setRouteKnownAbsent(false)
              setLoading(false)
              setRefreshing(false)
            }
            if (quick.success && quick.data) {
              // Fresh stops are on screen: a failed distance read must not put
              // the saved offline copy (with the removed stop) back.
              const fix = await coordsRequest
              if (!fix) return
              try {
                const detailed = await api.getRoute(routeData.id, fix, signal)
                if (detailed.success && detailed.data) setRoute(sanitizeRouteDistances(detailed.data))
              } catch {}
              return
            }
            coords = await coordsRequest
          }
          const detail = await api.getRoute(routeData.id, coords ?? undefined, signal)
          if (detail.success && detail.data) {
            setRoute(sanitizeRouteDistances(detail.data))
            setRouteOrigin("live")
            setRouteKnownAbsent(false)
            return
          }
        }
        setRoute(routeData)
        setRouteOrigin("live")
        setRouteKnownAbsent(false)
      } else {
        setRoute(null)
        setRouteOrigin("none")
        setRouteKnownAbsent(true)
      }
    } catch (error: any) {
      if (error.message === "ABORTED" || error.message === "SESSION_EXPIRED") return
      setRouteKnownAbsent(false)
      const authAgent = useAuthStore.getState().agent
      if (authAgent) {
        try {
          const cached = await readOfflineRoute(authAgent.organizationId, authAgent.id)
          if (cached && routeDateKey(cached.date) === today) {
            setRoute(cached)
            setRouteOrigin("cache")
          }
        } catch {}
      }
      if (error.message === "REQUEST_TIMEOUT") {
        setLoadIssue("timeout")
      } else {
        setLoadIssue("offline")
        console.warn("Failed to fetch route:", error.message)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useAutoRefresh(
    useCallback(() => {
      fetchRoute()
      fetchActiveVisit().catch(() => {}).then(() => setActiveVisitKnown(true))
    }, [fetchRoute, fetchActiveVisit]),
  )

  // The action panel waits for the workday store (see routeActionPanelState).
  // AndroidApp hydrates it at start-up, but the App.tsx entry (AppNavigator)
  // does not; hydrate() is a no-op once done, so asking here keeps the wait finite
  // on every entry instead of trusting that someone else already asked.
  useEffect(() => {
    if (!workdayHydrated) useWorkdayStore.getState().hydrate().catch(() => {})
  }, [workdayHydrated])

  const sortedPoints = useMemo(
    () => route?.points ? [...route.points].sort((left, right) => left.orderIndex - right.orderIndex) : [],
    [route?.points],
  )
  const totalPoints = sortedPoints.length > 0 ? sortedPoints.length : route?.totalPoints ?? 0
  const visitedPoints = sortedPoints.length > 0
    ? sortedPoints.filter((point) => point.status === "VISITED").length
    : route?.visitedPoints ?? 0
  const remaining = Math.max(totalPoints - visitedPoints, 0)
  const nextPoint = sortedPoints.find((point) => point.status === "PENDING") ?? null
  const activeRoutePoint = activeVisit?.routePointId
    ? sortedPoints.find((point) => point.id === activeVisit.routePointId) ?? null
    : null
  const selectedPoint = selectedPointId
    ? sortedPoints.find((point) => point.id === selectedPointId) ?? null
    : null
  const focusPoint = activeRoutePoint ?? selectedPoint ?? nextPoint ?? sortedPoints[0] ?? null
  const currentStep = remaining === 0 && totalPoints > 0
    ? 5
    : activeVisit
      ? activeVisit.pendingCheckOut ? 5 : 4
      : focusPoint && navigationStartedFor === focusPoint.id
        ? 3
        : focusPoint
          ? 2
          : 1
  const presentation = routeScreenPresentation({
    loading,
    hasRoute: Boolean(route),
    routeOrigin,
    issue: loadIssue,
  })

  useEffect(() => {
    if (selectedPointId && !sortedPoints.some((point) => point.id === selectedPointId)) setSelectedPointId(null)
  }, [selectedPointId, sortedPoints])

  const refresh = () => {
    setRefreshing(true)
    fetchRoute()
    fetchActiveVisit()
  }

  const handlePointPress = (point: RoutePoint) => {
    setSelectedPointId(point.id)
    if (!tablet) setPhonePanelVisible(true)
  }

  const handlePhotoTaken = async (path: string) => {
    if (!activeVisit) return
    let uploadCoords: { latitude: number; longitude: number } | null = null
    try {
      let coords: { latitude: number; longitude: number } | null = null
      try {
        coords = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
          )
        })
      } catch {}
      uploadCoords = coords
      await api.uploadPhoto({
        filePath: path,
        visitId: activeVisit.id,
        category: "VISIT",
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      })
      photos.recordUpload(activeVisit.id)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") {
        if (error?.code === "MAX_PHOTOS_REACHED") {
          notify({ tone: "warning", title: t("visit.photoLimitTitle"), message: t("visit.photoLimitBody") })
        } else {
          const queuedPhoto = await enqueueMediaUpload({
            filePath: path,
            visitId: activeVisit.id,
            category: "VISIT",
            latitude: uploadCoords?.latitude,
            longitude: uploadCoords?.longitude,
          })
          photos.recordQueued(activeVisit.id, queuedPhoto.id)
          notify({ tone: "success", title: t("visit.photoQueuedTitle"), message: t("visit.photoQueuedBody") })
        }
      }
    }
  }

  const handleNavigate = (point: RoutePoint) => {
    // Null Island is not a destination: a 0,0 pair opens the map in the Gulf of
    // Guinea, which reads as a real answer. Only an address or a usable pair
    // counts, the same test the check-in uses.
    const query = point.customer.address
      ? point.customer.address
      : hasUsableCoordinates(point.customer)
        ? `${point.customer.latitude},${point.customer.longitude}`
        : ""
    if (!query) return
    setNavigationStartedFor(point.id)
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`).catch(() => {
      setNavigationStartedFor(null)
      notify({ tone: "error", title: t("common.error"), message: copy.noAddress })
    })
  }

  const handleStartWorkday = async () => {
    if (startingWorkday || !workdayHydrated || workdayActive || workdayPaused || workdayTransitionPending) return
    setStartingWorkday(true)
    try {
      await startWorkday(currentWorkdayKey)
      await refreshRouteFieldSession()
      await fetchRoute()
    } catch {
      notify({ tone: "error", title: t("common.error"), message: copy.workdayStartFailed })
    } finally {
      setStartingWorkday(false)
    }
  }

  // Owner, 2026-09-15: a published route could not be changed at all. Only a
  // live read counts: a cached copy may hold a version the server moved past.
  const changePlanAvailability = route && routeOrigin === "live"
    ? publishedRouteEditAvailability({
        role: agent?.role,
        canPlanOwnRoutes: ownRoutePlanningPolicy,
        agentId: agent?.id,
        routeAgentId: route.agentId,
        status: route.status,
        version: route.version,
        online,
      })
    : "unavailable"
  const openChangePlan = () => {
    if (!route) return
    if (changePlanAvailability === "offline") {
      notify({ tone: "warning", title: t("managerShell.planEditProblemTitle"), message: t("managerShell.planEditOffline") })
      return
    }
    if (changePlanAvailability !== "available") return
    const date = routeDateKey(route.date)
    navigation.navigate("PlanningBuilder", {
      ...(date ? { initialDate: date } : {}),
      initialHorizon: 1,
      editPublished: true,
    })
  }
  const changePlanAction = changePlanAvailability !== "unavailable"
    ? <ChangePlanButton label={t("managerShell.planChangePublished")} onPress={openChangePlan} />
    : null

  const handleStartRoute = async () => {
    if (
      startingRoute ||
      !workdayActive ||
      !route ||
      route.status !== "PLANNED" ||
      routeOrigin !== "live" ||
      typeof route.version !== "number" ||
      !Number.isInteger(route.version) ||
      route.version < 1
    ) return

    setStartingRoute(true)
    try {
      await submitRouteCommand({
        command: "START",
        routeId: route.id,
        payload: { expectedVersion: route.version },
      }, (request) => api.executeRouteCommand(request))
      await fetchRoute()
    } catch (error: unknown) {
      const code = (error as { code?: unknown } | null)?.code
      if (code === "MOBILE_ROUTE_COMMAND_QUEUED") {
        // A parked command is not proof of a dead connection: a server error
        // parks it too. On an online tablet the app said "no connection" while
        // production rejected every START with a database error (2026-09-14).
        if (useSyncStatusStore.getState().online === false) {
          notify({ tone: "success", title: copy.routeStartQueuedTitle, message: copy.routeStartQueuedBody })
        } else {
          notify({ tone: "warning", title: copy.routeStartDeferredTitle, message: copy.routeStartDeferredBody })
        }
      } else if (code === "MTM_ROUTE_WORKDAY_REQUIRED") {
        notify({ tone: "warning", title: copy.workdayRequiredTitle, message: copy.workdayRequiredBody })
      } else {
        notify({ tone: "error", title: t("common.error"), message: copy.routeStartFailed })
      }
      await fetchRoute()
    } finally {
      setStartingRoute(false)
    }
  }

  const handleCheckIn = async (point: RoutePoint) => {
    if (mutating) return
    if (!hasUsableCoordinates(point.customer)) {
      // Owner decision 2 (audit 2026-09-05): no coordinates, no check-in. The
      // server would answer NO_COORDINATES; say it here, before GPS.
      const report = await ask({
        title: t("route.noCoordinatesTitle"),
        message: t("route.noCoordinatesBody", { name: point.customer.name }),
        tone: "warning",
        buttons: [
          { text: t("common.cancel"), value: false, style: "cancel" },
          { text: t("visit.reportToManager"), value: true },
        ],
        dismissValue: false,
      })
      if (report) {
        Share.share({
          message: t("visit.reportToManagerMessage", {
            name: point.customer.name,
            address: point.customer.address || t("visit.noAddress"),
          }),
        }).catch(() => {})
      }
      return
    }
    setMutating(true)
    try {
      let coords: { latitude: number; longitude: number } | null = null
      try {
        coords = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
          )
        })
      } catch {
        const staleLimit = 120_000
        const cacheFresh = lastKnownPosition && Date.now() - lastKnownPosition.timestamp < staleLimit
        if (cacheFresh) {
          coords = { latitude: lastKnownPosition!.latitude, longitude: lastKnownPosition!.longitude }
        } else {
          // Held until answered, as before: check-in stays locked while the
          // sheet is open. The back button closes it the same way as «Retry».
          await ask({
            title: t("route.locationUnavailableTitle"),
            message: t("route.locationUnavailableBody"),
            tone: "error",
            buttons: [{ text: t("common.retry"), value: "retry" }],
            dismissValue: "closed",
          })
          setMutating(false)
          return
        }
      }

      // 0°,0° or non-finite stored coordinates count as "no coordinates" (field audit 2026-09-05).
      const customerCoordinates = { latitude: point.customer.latitude, longitude: point.customer.longitude }
      const measuredDistance = coords && hasUsableCoordinates(customerCoordinates)
        ? Math.round(haversineDistance(
            coords.latitude,
            coords.longitude,
            customerCoordinates.latitude,
            customerCoordinates.longitude,
          ))
        : point.distanceMeters
      let forceCheckIn = false
      if (coords && measuredDistance != null && measuredDistance > pointCheckInRadius(point)) {
        const canOverride = api.canForceCheckIn
        let proceed = false
        if (canOverride) {
          proceed = await ask({
            title: t("visit.tooFarTitle"),
            message: t("visit.tooFarBody", { distance: formatDistance(measuredDistance), name: point.customer.name, max: pointCheckInRadius(point) }),
            tone: "warning",
            buttons: [
              { text: t("common.cancel"), value: false, style: "cancel" },
              { text: t("route.tryAnyway"), value: true },
            ],
            dismissValue: false,
          })
        } else {
          // Without the right to start out of zone the only way on is to get
          // there, so the answer offers the way, not just «OK». Either answer
          // ends this check-in.
          const pick = await ask<"ok" | "maps">({
            title: t("visit.tooFarTitle"),
            message: t("route.tooFarSupervisorBody", { distance: formatDistance(measuredDistance), name: point.customer.name, max: pointCheckInRadius(point) }),
            tone: "warning",
            buttons: [
              { text: t("common.ok"), value: "ok", style: "cancel" },
              { text: copy.openMaps, value: "maps" },
            ],
            dismissValue: "ok",
          })
          if (pick === "maps") handleNavigate(point)
        }
        if (!proceed) {
          setMutating(false)
          return
        }
        forceCheckIn = true
      }

      const { visit } = await queueVisitCheckIn({
        customer: point.customer,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        force: forceCheckIn,
        routeId: route?.id,
        routePointId: point.id,
      })
      setActiveVisit(visit)
      setPhonePanelVisible(false)
      setSelectedPointId(point.id)
      notify({ tone: "success", title: t("visit.checkInQueuedTitle"), message: t("visit.checkInQueuedBody", { name: point.customer.name }) })
      runMobileSync().then(async (result) => {
        await Promise.all([fetchRoute(), fetchActiveVisit()])
        if (result.conflicted > 0) notify({ tone: "warning", title: t("visit.syncConflictTitle"), message: t("visit.syncConflictBody") })
      }).catch(() => {})
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        console.warn("[RouteScreen] check-in error:", error?.message ?? error)
        notify({ tone: "error", title: t("common.error"), message: t("visit.checkInFailed") })
      }
    } finally {
      setMutating(false)
    }
  }

  const handleCheckOut = () => {
    if (!activeVisit || mutating) return
    if (signature.blocksCheckOut) {
      void ask({
        title: t("signature.requiredTitle"),
        message: t("signature.requiredBody"),
        tone: "warning",
        buttons: [
          { text: t("common.cancel"), value: false, style: "cancel" },
          { text: t("signature.signNow"), value: true },
        ],
        dismissValue: false,
      }).then((signNow) => {
        if (signNow) signature.openPad()
      })
      return
    }
    setNotesVisible(true)
  }

  const handleSignatureSave = async (capture: SignatureCapture, signerName?: string) => {
    try {
      await signature.save(capture, signerName)
      notify({ tone: "success", title: t("signature.savedTitle"), message: t("signature.savedBody") })
    } catch (error: any) {
      console.warn("[RouteScreen] signature error:", error?.message ?? error)
      // The pad stays open after a failed save, and it is a window of its own
      // that covers a notice. A sheet opens above it, like the system dialog
      // did; not awaited, so the pad's Save button is released at once.
      void ask({
        title: t("common.error"),
        message: t("signature.saveFailed"),
        tone: "error",
        buttons: [{ text: t("common.ok"), value: true }],
        dismissValue: true,
      })
    }
  }

  const performCheckOut = async (notes?: string) => {
    if (!activeVisit || mutating) return
    setMutating(true)
    try {
      let coords: { latitude: number; longitude: number } | null = null
      try {
        coords = await new Promise((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
          )
        })
      } catch {}
      const { visit } = await queueVisitCheckOut(activeVisit, {
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        notes: notes || undefined,
      })
      setActiveVisit(visit)
      // The panel moves on to the next stop instead of staying on the one
      // just finished (Redmi Pad SE, 2026-09-15).
      setSelectedPointId(null)
      notify({ tone: "success", title: t("visit.checkOutQueuedTitle"), message: t("visit.checkOutQueuedBody") })
      runMobileSync().then(async (result) => {
        await Promise.all([fetchRoute(), fetchActiveVisit()])
        if (result.conflicted > 0) notify({ tone: "warning", title: t("visit.syncConflictTitle"), message: t("visit.syncConflictBody") })
      }).catch(() => {})
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        console.warn("[RouteScreen] check-out error:", error?.message ?? error)
        if (error?.code === "PHOTO_REQUIRED") notify({ tone: "warning", title: t("visit.photoRequiredTitle"), message: t("visit.photoRequiredBody") })
        else notify({ tone: "error", title: t("common.error"), message: t("visit.checkOutFailed") })
      }
    } finally {
      setMutating(false)
    }
  }

  const routeStartReady = route?.status === "PLANNED" && routeOrigin === "live" &&
    typeof route.version === "number" && Number.isInteger(route.version) && route.version > 0
  const actionPanelState = routeActionPanelState({
    loading,
    hasRoute: Boolean(route),
    routeStatus: route?.status,
    routeKnownAbsent,
    workdayHydrated,
    workdayActive,
    workdayPaused,
    hasActiveVisit: Boolean(activeVisit),
    activeVisitKnown,
  })
  const actionPanel = actionPanelState === "loading" ? (
    <RouteActionPanelLoading copy={copy} />
  ) : actionPanelState === "finished" ? (
    <RouteFinishedPanel visited={visitedPoints} total={totalPoints} copy={copy} />
  ) : actionPanelState === "route-unknown" ? (
    // The list beside it already says the route did not load and offers a
    // retry; a second card here would only repeat it.
    null
  ) : actionPanelState === "visit" || actionPanelState === "point" ? (
    <PointActionPanel
      point={focusPoint}
      nextPoint={nextPoint}
      activeVisit={activeVisit}
      navigationStarted={Boolean(focusPoint && navigationStartedFor === focusPoint.id)}
      photoCount={photos.count}
      elapsedMin={elapsedMin}
      mutating={mutating}
      copy={copy}
      onNavigate={handleNavigate}
      onCheckIn={handleCheckIn}
      onPhoto={() => setCameraVisible(true)}
      onOpenWorkspace={() => activeVisit && navigation.navigate("VisitWorkspace", { visitId: activeVisit.id, name: activeVisit.customer?.name })}
      onCheckOut={handleCheckOut}
      signature={signature}
      onSignature={signature.openPad}
    />
  ) : (
    <RouteExecutionGate
      mode={actionPanelState === "gate-paused" ? "paused" : actionPanelState === "gate-route" ? "route" : "workday"}
      busy={workdayActive ? startingRoute : startingWorkday || workdayTransitionPending}
      copy={copy}
      onPress={() => {
        if (workdayActive) handleStartRoute().catch(() => {})
        else handleStartWorkday().catch(() => {})
      }}
      disabled={workdayActive ? !routeStartReady : workdayTransitionPending}
    />
  )

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.headerIcon}>
        <Icon name="navigate" size={23} color={fieldTheme.color.onColor} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{copy.title}</Text>
        <Text style={styles.headerSubtitle}>{copy.subtitle}</Text>
        {agent?.name ? <Text style={styles.agentName}>{agent.name}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.openVisits}
        onPress={() => navigation.navigate("Visits")}
        style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
      >
        <Icon name="add" size={22} color={fieldTheme.color.onColor} />
      </Pressable>
    </View>
  )

  const emptyMode = presentation.empty ?? "no-route"
  const emptyError = emptyMode === "offline-unavailable" || emptyMode === "slow-unavailable"
  const emptyState = emptyMode === "loading" ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={fieldTheme.color.primary} />
      <Text style={styles.emptyTitle}>{copy.loading}</Text>
    </View>
  ) : (
    <View style={styles.emptyState} accessibilityLiveRegion={emptyError ? "polite" : "none"}>
      <View style={[
        styles.emptyIcon,
        emptyMode === "offline-unavailable" && styles.emptyIconOffline,
        emptyMode === "slow-unavailable" && styles.emptyIconSlow,
      ]}>
        <Icon
          name={emptyMode === "offline-unavailable" ? "cloud-offline-outline" : emptyMode === "slow-unavailable" ? "speedometer-outline" : "calendar-outline"}
          size={30}
          color={emptyMode === "offline-unavailable" ? fieldTheme.color.coral : emptyMode === "slow-unavailable" ? fieldTheme.color.amber : fieldTheme.color.primary}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {emptyMode === "offline-unavailable"
          ? copy.offlineUnavailableTitle
          : emptyMode === "slow-unavailable"
            ? copy.slowTitle
            : t("route.noRouteTitle")}
      </Text>
      <Text style={styles.emptyBody}>
        {emptyMode === "offline-unavailable"
          ? copy.offlineUnavailableBody
          : emptyMode === "slow-unavailable"
            ? copy.slowUnavailableBody
            : t("route.noRouteHint")}
      </Text>
      <ActionButton
        label={emptyError ? copy.retry : canPlanOwnRoutes ? copy.planOwnRoute : copy.refresh}
        icon={emptyError || !canPlanOwnRoutes ? "refresh" : "add-circle-outline"}
        onPress={() => {
          if (!emptyError && canPlanOwnRoutes) navigation.navigate("PlanningBuilder")
          else { setLoading(true); fetchRoute() }
        }}
        tone="secondary"
      />
    </View>
  )

  if (tablet) {
    return (
      <View style={styles.container}>
        {/* One page that scrolls, not two panes that each scroll inside what
            is left under the header. Held in landscape (Redmi Pad SE,
            2026-09-14) the panes got about 170 dp: the stop list showed one
            and a half stops in a box, and «Marşruta başla» was cut in half. */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: touchTarget }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
        >
          {header}
          <View style={styles.tabletTop}>
            <ConnectionBanner mode={presentation.banner} copy={copy} />
            {route ? <JourneySteps activeStep={currentStep} copy={copy} compact={false} /> : null}
            {route ? <RouteSummary route={route} done={visitedPoints} total={totalPoints} remaining={remaining} language={i18n.language} copy={copy} /> : null}
          </View>
          <View style={styles.tabletBody}>
            <View style={styles.tabletListPane}>
              <View style={[styles.sectionHeading, styles.tabletSectionHeading]}>
                <Text style={styles.sectionTitle}>{t("route.pointsSection")}</Text>
                <View style={styles.sectionHeadingEnd}>
                  {changePlanAction}
                  <Text style={styles.sectionCount}>{t("route.stopsCount", { count: totalPoints })}</Text>
                </View>
              </View>
              <View style={styles.tabletListContent}>
                {sortedPoints.length === 0 ? emptyState : sortedPoints.map((item, index) => (
                  <StopRow
                    key={item.id}
                    point={item}
                    index={index}
                    selected={focusPoint?.id === item.id}
                    recommended={nextPoint?.id === item.id}
                    onPress={() => handlePointPress(item)}
                    language={i18n.language}
                    copy={copy}
                  />
                ))}
              </View>
            </View>
            <View style={styles.tabletActionPane}>
              {remaining === 0 && totalPoints > 0 && !activeVisit ? (
                <View style={styles.completeCard}>
                  <Icon name="checkmark-done-circle" size={34} color={fieldTheme.color.success} />
                  <Text style={styles.completeTitle}>{copy.routeComplete}</Text>
                  <Text style={styles.completeBody}>{copy.routeCompleteBody}</Text>
                </View>
              ) : actionPanel}
              {canPlanOwnRoutes && route ? (
                <OwnRoutePlanningCard copy={copy} onPress={() => navigation.navigate("PlanningBuilder")} />
              ) : null}
              {route ? <InlineHint text={copy.hint} dismissLabel={copy.dismissHint} /> : null}
            </View>
          </View>
        </ScrollView>
        <NotesModal
          visible={notesVisible}
          title={t("visit.checkOutButton")}
          message={t("visit.checkOutNotes")}
          onCancel={() => setNotesVisible(false)}
          onSubmit={(text) => { setNotesVisible(false); performCheckOut(text) }}
        />
        <PhotoCaptureModal visible={cameraVisible} onClose={() => setCameraVisible(false)} onPhotoTaken={handlePhotoTaken} />
        <SignaturePadModal visible={signature.padVisible} customerName={activeVisit?.customer?.name} onCancel={signature.closePad} onSave={handleSignatureSave} />
        <StatusBarBand />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedPoints}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.phoneContent, { paddingBottom: tabBarPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
        ListHeaderComponent={
          <>
            {header}
            <View style={styles.phoneMain}>
              <ConnectionBanner mode={presentation.banner} copy={copy} />
              {route ? <JourneySteps activeStep={currentStep} copy={copy} compact /> : null}
              {route ? <RouteSummary route={route} done={visitedPoints} total={totalPoints} remaining={remaining} language={i18n.language} copy={copy} /> : emptyState}
              {route && remaining === 0 && totalPoints > 0 && !activeVisit ? (
                <View style={styles.completeCard}>
                  <Icon name="checkmark-done-circle" size={34} color={fieldTheme.color.success} />
                  <Text style={styles.completeTitle}>{copy.routeComplete}</Text>
                  <Text style={styles.completeBody}>{copy.routeCompleteBody}</Text>
                </View>
              ) : route ? actionPanel : null}
              {sortedPoints.length > 0 ? (
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>{t("route.pointsSection")}</Text>
                  <View style={styles.sectionHeadingEnd}>
                    {changePlanAction}
                    <Text style={styles.sectionCount}>{t("route.stopsCount", { count: totalPoints })}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <View style={styles.phoneRowWrap}>
            <StopRow
              point={item}
              index={index}
              selected={focusPoint?.id === item.id}
              recommended={nextPoint?.id === item.id}
              onPress={() => handlePointPress(item)}
              language={i18n.language}
              copy={copy}
            />
          </View>
        )}
        ListFooterComponent={
          <View style={styles.phoneFooter}>
            {canPlanOwnRoutes && route ? (
              <OwnRoutePlanningCard copy={copy} onPress={() => navigation.navigate("PlanningBuilder")} />
            ) : null}
            {/* Both sentences are about a route: the list to pull and its green
                panel. Without one, the hint offered the refresh B9 took away. */}
            {route ? <InlineHint text={copy.hint} dismissLabel={copy.dismissHint} /> : null}
          </View>
        }
      />

      <Modal visible={phonePanelVisible} transparent animationType="slide" onRequestClose={() => setPhonePanelVisible(false)}>
        {/* Insets of this window, not the app's: the sheet is not translucent,
            so its content already starts below the status bar, and the root
            provider's top inset put the notice a status bar lower here. */}
        <SafeAreaProvider>
          <View style={styles.modalLayer}>
            <Pressable style={styles.modalBackdrop} onPress={() => setPhonePanelVisible(false)} accessibilityLabel={copy.close} />
            <View style={styles.phoneSheet}>
              <View style={styles.sheetTopRow}>
                <View style={styles.sheetHandle} />
                <Pressable
                  onPress={() => setPhonePanelVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel={copy.close}
                  style={styles.sheetClose}
                >
                  <Icon name="close" size={22} color={fieldTheme.color.ink} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.sheetContent}>{actionPanel}</ScrollView>
            </View>
            {/* This sheet is its own Android window and hides the app's notice
                layer, while check-in, route start, photo and check-out report
                from inside it. The system dialog used to draw over it. */}
            <AppNoticeLayer />
          </View>
        </SafeAreaProvider>
      </Modal>

      <NotesModal
        visible={notesVisible}
        title={t("visit.checkOutButton")}
        message={t("visit.checkOutNotes")}
        onCancel={() => setNotesVisible(false)}
        onSubmit={(text) => { setNotesVisible(false); performCheckOut(text) }}
      />
      <PhotoCaptureModal visible={cameraVisible} onClose={() => setCameraVisible(false)} onPhotoTaken={handlePhotoTaken} />
      <SignaturePadModal visible={signature.padVisible} customerName={activeVisit?.customer?.name} onCancel={signature.closePad} onSave={handleSignatureSave} />
      <StatusBarBand />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  phoneContent: { flexGrow: 1 },
  phoneMain: { paddingHorizontal: fieldTheme.space.lg },
  phoneRowWrap: { paddingHorizontal: fieldTheme.space.lg },
  phoneFooter: { paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg },

  header: {
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.xl,
    paddingBottom: fieldTheme.space.xl,
    flexDirection: "row",
    gap: fieldTheme.space.md,
    alignItems: "flex-start",
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: "rgba(248,252,250,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.82 },
  headerAction: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: "rgba(248,252,250,0.18)" },
  headerCopy: { flex: 1 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 25, fontWeight: "800", letterSpacing: -0.4 },
  headerSubtitle: { color: "#CFE5DD", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs, maxWidth: 620 },
  agentName: { color: "#AFCFC4", fontSize: 12, fontWeight: "700", marginTop: fieldTheme.space.sm },

  connectionBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.coralSoft,
    borderWidth: 1,
    borderColor: "#E9B9AC",
    marginTop: fieldTheme.space.md,
  },
  connectionBannerSlow: { backgroundColor: fieldTheme.color.amberSoft, borderColor: "#E6CF97" },
  connectionCopy: { flex: 1 },
  connectionTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  connectionBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },

  stepsWrap: {
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    paddingHorizontal: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.md,
    marginTop: fieldTheme.space.md,
  },
  stepsRow: { flexDirection: "row", alignItems: "flex-start" },
  stepItem: { width: 50, alignItems: "center" },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.surfaceStrong,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  stepCircleDone: { backgroundColor: fieldTheme.color.success, borderColor: fieldTheme.color.success },
  stepCircleCurrent: { backgroundColor: fieldTheme.color.primaryStrong, borderColor: fieldTheme.color.primaryStrong },
  stepNumber: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  stepNumberCurrent: { color: fieldTheme.color.onColor },
  stepLabel: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "700", marginTop: 5, textAlign: "center" },
  stepLabelCurrent: { color: fieldTheme.color.primaryStrong },
  stepLine: { flex: 1, height: 2, backgroundColor: fieldTheme.color.border, marginTop: 14 },
  stepLineDone: { backgroundColor: fieldTheme.color.success },
  currentStepText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: fieldTheme.space.sm },

  summary: {
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    padding: fieldTheme.space.lg,
    marginTop: fieldTheme.space.md,
  },
  summaryHeading: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: { flex: 1 },
  summaryEyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  summaryTitle: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "800", marginTop: 2 },
  summaryDate: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "700", marginTop: 3 },
  summaryBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  remainingPill: { backgroundColor: fieldTheme.color.amberSoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  remainingText: { color: fieldTheme.color.amber, fontSize: 11, fontWeight: "800" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: fieldTheme.space.lg },
  progressText: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "700" },
  progressPercent: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden", marginTop: fieldTheme.space.sm },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: fieldTheme.color.success },

  actionPanel: {
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 2,
    borderColor: fieldTheme.color.primary,
    padding: fieldTheme.space.xl,
    marginTop: fieldTheme.space.lg,
    gap: fieldTheme.space.md,
  },
  actionPanelEmpty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.xl,
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  // The same gap the real panel keeps under the summary, so nothing jumps
  // when the real panel takes its place.
  actionPanelLoading: { marginTop: fieldTheme.space.lg },
  actionEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 320 },
  actionEyebrowRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: fieldTheme.color.success },
  actionEyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  actionTitle: { color: fieldTheme.color.ink, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.4 },
  actionAddress: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 },
  visitFacts: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  factPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  factText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "700" },
  visitTimeNotice: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.amberSoft, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  visitTimeNoticeOvertime: { backgroundColor: fieldTheme.color.dangerSoft },
  visitTimeNoticeText: { flex: 1, color: fieldTheme.color.amber, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  visitTimeNoticeTextOvertime: { color: fieldTheme.color.danger },
  detailFacts: { gap: fieldTheme.space.sm },
  detailFact: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  detailFactText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "600" },
  recommendation: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft },
  recommendationText: { flex: 1, color: fieldTheme.color.amber, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  completedState: { minHeight: 52, flexDirection: "row", gap: fieldTheme.space.sm, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.successSoft },
  completedStateText: { color: fieldTheme.color.success, fontSize: 15, fontWeight: "800" },

  actionButton: {
    minHeight: 52,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.lg,
    paddingVertical: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
  },
  actionButtonSecondary: { backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: fieldTheme.color.primary },
  actionButtonDanger: { backgroundColor: fieldTheme.color.danger },
  actionButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900", textAlign: "center" },
  actionButtonTextSecondary: { color: fieldTheme.color.primaryStrong },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },

  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: fieldTheme.space.xl, marginBottom: fieldTheme.space.sm },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  sectionCount: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  sectionHeadingEnd: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, flexShrink: 1 },
  changePlanButton: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  changePlanText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  stopRow: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    padding: fieldTheme.space.md,
    marginBottom: fieldTheme.space.sm,
  },
  stopRowSelected: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary },
  stopRowPressed: { opacity: 0.78 },
  stopNumber: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  stopNumberRecommended: { backgroundColor: fieldTheme.color.primaryStrong },
  stopNumberDone: { backgroundColor: fieldTheme.color.success },
  stopNumberText: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "900" },
  stopNumberTextRecommended: { color: fieldTheme.color.onColor },
  stopCopy: { flex: 1, minWidth: 0 },
  // In a narrow list (a phone on its side) the name keeps its words and the
  // status moves under it, instead of "ADV-Sto…" beside the status.
  stopTitleRow: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, alignItems: "center" },
  stopName: { flexGrow: 1, flexShrink: 1, color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  stopNameDone: { color: fieldTheme.color.inkMuted },
  stopStatus: { flexDirection: "row", alignItems: "center", gap: 3 },
  stopStatusText: { fontSize: 10, fontWeight: "800" },
  stopAddress: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 3 },
  stopMeta: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.md, marginTop: fieldTheme.space.sm },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },

  completeCard: { alignItems: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.successSoft, borderRadius: fieldTheme.radius.lg, padding: fieldTheme.space.xl, marginTop: fieldTheme.space.lg },
  completeTitle: { color: fieldTheme.color.success, fontSize: 20, fontWeight: "900" },
  completeBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.xxl, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, marginTop: fieldTheme.space.lg },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  emptyIconOffline: { backgroundColor: fieldTheme.color.coralSoft },
  emptyIconSlow: { backgroundColor: fieldTheme.color.amberSoft },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900", textAlign: "center" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 360 },

  ownRouteCard: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, marginTop: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: "#A9D9CA" },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  cardTitle: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  cardBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.blueSoft, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  hintText: { flex: 1, color: fieldTheme.color.ink, fontSize: 12, lineHeight: 18 },
  hintClose: { width: 44, height: 44, marginTop: -10, marginRight: -10, alignItems: "center", justifyContent: "center" },

  tabletTop: { paddingHorizontal: fieldTheme.space.xl },
  tabletBody: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.xl, padding: fieldTheme.space.xl, paddingTop: fieldTheme.space.lg },
  tabletListPane: { flex: 1, minWidth: 280, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, overflow: "hidden" },
  tabletListContent: { padding: fieldTheme.space.lg, paddingTop: 0 },
  // The heading sat on the pane's edge: «Marşrut nöqtələri» touched the left
  // border and «2 dayanacaq» the right one.
  tabletSectionHeading: { marginTop: fieldTheme.space.lg, paddingHorizontal: fieldTheme.space.lg },
  tabletActionPane: { flex: 1, minWidth: 300 },

  modalLayer: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,35,31,0.48)" },
  phoneSheet: { maxHeight: "82%", backgroundColor: fieldTheme.color.canvas, borderTopLeftRadius: fieldTheme.radius.lg, borderTopRightRadius: fieldTheme.radius.lg },
  sheetTopRow: { minHeight: 52, alignItems: "center", justifyContent: "center" },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: fieldTheme.color.border },
  sheetClose: { position: "absolute", right: fieldTheme.space.md, top: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sheetContent: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xxl },
})
