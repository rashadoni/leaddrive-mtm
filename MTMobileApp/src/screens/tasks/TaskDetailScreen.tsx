import React, { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { toTaskDetail, taskTimeline, type TaskTimelineKey } from "../../services/task-detail"
import { api } from "../../services/api"
import { allOutboxOperations } from "../../services/outbox"
import { countPendingTaskUpdates, queueTaskStatusUpdate } from "../../services/task-outbox"
import { flushRouteFieldOutbox, refreshSyncStatusCounts } from "../../services/sync-engine"
import { useAuthStore } from "../../store/auth"
import { useSyncStatusStore } from "../../store/sync-status"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import FeedbackToast from "../../components/FeedbackToast"
import SyncStatusChip from "../../components/SyncStatusChip"
import { pendingTaskStatusOverlay, taskDetailPrimaryAction } from "./task-detail-state"
import { taskWorkflowStatus } from "./tasks-workflow-state"

const STATUS_KEY: Record<string, string> = {
  PENDING: "task.statusToDo",
  IN_PROGRESS: "task.statusActive",
  COMPLETED: "task.statusDone",
  CANCELLED: "task.statusCancelled",
  OVERDUE: "task.statusOverdue",
}

const PRIORITY_KEY: Record<string, string> = {
  LOW: "task.priorityLow",
  MEDIUM: "task.priorityMedium",
  HIGH: "task.priorityHigh",
  URGENT: "task.priorityUrgent",
}

const TIMELINE_KEY: Record<TaskTimelineKey, string> = {
  created: "task.tlCreated",
  accepted: "task.tlAccepted",
  started: "task.tlStarted",
  due: "task.tlDue",
  completed: "task.tlCompleted",
}

const RECUR_KEY: Record<string, string> = {
  DAILY: "task.recurDaily",
  WEEKLY: "task.recurWeekly",
  MONTHLY: "task.recurMonthly",
}

type FriendlyCopy = {
  back: string
  guide: string
  requirement: string
  requirementHint: string
  noDescription: string
  context: string
  contextHint: string
  customer: string
  due: string
  assignee: string
  notProvided: string
  progress: string
  progressHint: string
  progressLocked: string
  progressPendingStatus: string
  progressSaved: string
  progressNeedsConnection: string
  evidence: string
  evidenceHint: string
  evidenceLoading: string
  evidenceEmpty: string
  evidenceFailed: string
  evidenceReadOnly: string
  retry: string
  result: string
  moreDetails: string
  showDetails: string
  hideDetails: string
  nextStep: string
  start: string
  starting: string
  complete: string
  completing: string
  completeTitle: string
  completeBody: string
  completePlaceholder: string
  completeSubmit: string
  cancel: string
  offlineTitle: string
  offlineBody: string
  pendingBody: string
  syncingTitle: string
  syncingBody: string
  syncErrorTitle: string
  syncErrorBody: string
  savedOnDevice: string
  savedOnDeviceBody: string
  serverSavedBody: string
  completedBody: string
  cancelledBody: string
  overdueBody: string
  readOnlyBody: string
  returnedTitle: string
  returnedHint: string
}

const COPY: Record<"ru" | "az" | "en", FriendlyCopy> = {
  ru: {
    back: "Назад",
    guide: "Понятный порядок выполнения",
    requirement: "Что требуется",
    requirementHint: "Сначала прочитайте задачу и убедитесь, что всё понятно.",
    noDescription: "Описание не добавлено. Уточните ожидаемый результат у руководителя.",
    context: "Срок и клиент",
    contextHint: "Проверьте, где и до какого времени нужно выполнить задачу.",
    customer: "Клиент",
    due: "Срок",
    assignee: "Исполнитель",
    notProvided: "Не указано",
    progress: "Прогресс",
    progressHint: "Отмечайте продвижение по мере выполнения задачи.",
    progressLocked: "Сначала нажмите «Начать задачу». После этого здесь можно будет менять прогресс.",
    progressPendingStatus: "Статус этой задачи ещё на устройстве. Прогресс можно менять после подтверждения сервера.",
    progressSaved: "Прогресс сохранён на сервере.",
    progressNeedsConnection: "Чтобы изменить прогресс, нужен интернет.",
    evidence: "Подтверждение и файлы",
    evidenceHint: "Здесь видны результат и файлы, уже прикреплённые к задаче.",
    evidenceLoading: "Проверяю прикреплённые файлы…",
    evidenceEmpty: "К этой задаче пока нет прикреплённых файлов.",
    evidenceFailed: "Не удалось загрузить список файлов.",
    evidenceReadOnly: "В мобильном приложении виден только список файлов; открыть или добавить их здесь нельзя.",
    retry: "Повторить",
    result: "Результат",
    moreDetails: "Дополнительные детали",
    showDetails: "Показать хронологию и повтор",
    hideDetails: "Скрыть дополнительные детали",
    nextStep: "Следующий шаг",
    start: "Начать задачу",
    starting: "Начинаю…",
    complete: "Завершить задачу",
    completing: "Завершаю…",
    completeTitle: "Завершение задачи",
    completeBody: "Коротко напишите, что сделано. Заметка необязательна.",
    completePlaceholder: "Например: документы переданы, договорённость подтверждена",
    completeSubmit: "Сохранить и завершить",
    cancel: "Отмена",
    offlineTitle: "Сейчас нет связи",
    offlineBody: "Показаны сохранённые данные. Старт или завершение останутся на устройстве и отправятся позже.",
    pendingBody: "Изменения сохранены на устройстве и уйдут на сервер после подключения.",
    syncingTitle: "Идёт синхронизация",
    syncingBody: "Проверяем сервер и отправляем сохранённые изменения.",
    syncErrorTitle: "Нужно проверить синхронизацию",
    syncErrorBody: "Откройте индикатор синхронизации вверху, чтобы повторить или решить конфликт.",
    savedOnDevice: "Сохранено на устройстве",
    savedOnDeviceBody: "Изменение отправится на сервер, когда появится интернет.",
    serverSavedBody: "Изменение подтверждено сервером.",
    completedBody: "Задача завершена. Результат и подтверждения можно проверить выше.",
    cancelledBody: "Задача отменена. Дополнительные действия не требуются.",
    overdueBody: "Просроченная задача доступна здесь только для просмотра. Уточните следующий шаг у руководителя.",
    readOnlyBody: "Эта задача доступна вам для просмотра.",
    returnedTitle: "Возвращена на доработку",
    returnedHint: "Сначала исправьте замечание руководителя, затем завершите задачу снова.",
  },
  az: {
    back: "Geri",
    guide: "Aydın icra ardıcıllığı",
    requirement: "Nə etmək lazımdır",
    requirementHint: "Əvvəlcə tapşırığı oxuyun və hər şeyin aydın olduğuna əmin olun.",
    noDescription: "Təsvir əlavə edilməyib. Gözlənilən nəticəni rəhbərdən dəqiqləşdirin.",
    context: "Son tarix və müştəri",
    contextHint: "Tapşırığın harada və hansı tarixədək görülməli olduğunu yoxlayın.",
    customer: "Müştəri",
    due: "Son tarix",
    assignee: "İcraçı",
    notProvided: "Göstərilməyib",
    progress: "İrəliləyiş",
    progressHint: "Tapşırığı yerinə yetirdikcə irəliləyişi qeyd edin.",
    progressLocked: "Əvvəlcə «Tapşırığı başla» düyməsini basın. Sonra burada irəliləyişi dəyişə bilərsiniz.",
    progressPendingStatus: "Bu tapşırığın statusu hələ cihazdadır. Server təsdiqindən sonra irəliləyişi dəyişin.",
    progressSaved: "İrəliləyiş serverdə saxlanıldı.",
    progressNeedsConnection: "İrəliləyişi dəyişmək üçün internet lazımdır.",
    evidence: "Təsdiq və fayllar",
    evidenceHint: "Tapşırığa əlavə edilmiş nəticə və fayllar burada görünür.",
    evidenceLoading: "Əlavə edilmiş fayllar yoxlanılır…",
    evidenceEmpty: "Bu tapşırığa hələ fayl əlavə edilməyib.",
    evidenceFailed: "Fayl siyahısını yükləmək alınmadı.",
    evidenceReadOnly: "Mobil tətbiqdə yalnız fayl siyahısı görünür; faylı burada açmaq və ya əlavə etmək olmur.",
    retry: "Yenidən yoxla",
    result: "Nəticə",
    moreDetails: "Əlavə məlumat",
    showDetails: "Xronologiya və təkrarı göstər",
    hideDetails: "Əlavə məlumatı gizlət",
    nextStep: "Növbəti addım",
    start: "Tapşırığı başla",
    starting: "Başladılır…",
    complete: "Tapşırığı tamamla",
    completing: "Tamamlanır…",
    completeTitle: "Tapşırığın tamamlanması",
    completeBody: "Görülən işi qısa yazın. Qeyd məcburi deyil.",
    completePlaceholder: "Məsələn: sənədlər təqdim edildi, razılaşma təsdiqləndi",
    completeSubmit: "Yadda saxla və tamamla",
    cancel: "Ləğv et",
    offlineTitle: "Hazırda bağlantı yoxdur",
    offlineBody: "Saxlanmış məlumat göstərilir. Başlama və ya tamamlama cihazda qalaraq sonra göndəriləcək.",
    pendingBody: "Dəyişikliklər cihazda saxlanıb və internet gələndə serverə göndəriləcək.",
    syncingTitle: "Sinxronizasiya gedir",
    syncingBody: "Server yoxlanılır və saxlanmış dəyişikliklər göndərilir.",
    syncErrorTitle: "Sinxronizasiyanı yoxlamaq lazımdır",
    syncErrorBody: "Təkrar cəhd və ya konflikti həll etmək üçün yuxarıdakı sinxronizasiya göstəricisini açın.",
    savedOnDevice: "Cihazda saxlanıldı",
    savedOnDeviceBody: "İnternet gələndə dəyişiklik serverə göndəriləcək.",
    serverSavedBody: "Dəyişiklik server tərəfindən təsdiqləndi.",
    completedBody: "Tapşırıq tamamlanıb. Nəticə və təsdiqləri yuxarıda yoxlaya bilərsiniz.",
    cancelledBody: "Tapşırıq ləğv edilib. Əlavə əməliyyat lazım deyil.",
    overdueBody: "Gecikmiş tapşırıq burada yalnız baxış üçündür. Növbəti addımı rəhbərlə dəqiqləşdirin.",
    readOnlyBody: "Bu tapşırıq sizə baxış üçün açıqdır.",
    returnedTitle: "Yenidən işlənməyə qaytarılıb",
    returnedHint: "Əvvəlcə rəhbərin qeydini düzəldin, sonra tapşırığı yenidən tamamlayın.",
  },
  en: {
    back: "Back",
    guide: "A clear completion path",
    requirement: "What is required",
    requirementHint: "Read the task first and make sure the expected outcome is clear.",
    noDescription: "No description was added. Ask your manager to clarify the expected outcome.",
    context: "Due date and customer",
    contextHint: "Check where the task belongs and when it must be finished.",
    customer: "Customer",
    due: "Due date",
    assignee: "Assignee",
    notProvided: "Not provided",
    progress: "Progress",
    progressHint: "Update progress as you work through the task.",
    progressLocked: "Select “Start task” first. You can update progress here after that.",
    progressPendingStatus: "This task status is still on the device. Update progress after the server confirms it.",
    progressSaved: "Progress was saved on the server.",
    progressNeedsConnection: "An internet connection is required to change progress.",
    evidence: "Evidence and files",
    evidenceHint: "The result and files already attached to this task appear here.",
    evidenceLoading: "Checking attached files…",
    evidenceEmpty: "No files have been attached to this task yet.",
    evidenceFailed: "The file list could not be loaded.",
    evidenceReadOnly: "The mobile app shows the file list only; files cannot be opened or added here.",
    retry: "Try again",
    result: "Result",
    moreDetails: "Additional details",
    showDetails: "Show timeline and recurrence",
    hideDetails: "Hide additional details",
    nextStep: "Next step",
    start: "Start task",
    starting: "Starting…",
    complete: "Complete task",
    completing: "Completing…",
    completeTitle: "Complete task",
    completeBody: "Briefly describe what was done. The note is optional.",
    completePlaceholder: "For example: documents delivered, agreement confirmed",
    completeSubmit: "Save and complete",
    cancel: "Cancel",
    offlineTitle: "You are offline",
    offlineBody: "Saved data is shown. Starting or completing will stay on this device and be sent later.",
    pendingBody: "Changes are saved on this device and will be sent when a connection is available.",
    syncingTitle: "Sync in progress",
    syncingBody: "Checking the server and sending saved changes.",
    syncErrorTitle: "Sync needs attention",
    syncErrorBody: "Open the sync indicator above to retry or resolve a conflict.",
    savedOnDevice: "Saved on this device",
    savedOnDeviceBody: "The change will be sent to the server when a connection is available.",
    serverSavedBody: "The server confirmed the change.",
    completedBody: "This task is complete. Review the result and evidence above.",
    cancelledBody: "This task was cancelled. No further action is needed.",
    overdueBody: "This overdue task is read-only here. Ask your manager to confirm the next step.",
    readOnlyBody: "This task is available to you as read-only.",
    returnedTitle: "Returned for rework",
    returnedHint: "Address the manager's note first, then complete the task again.",
  },
}

interface TaskDoc {
  id: string
  title: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
}

function friendlyCopy(language: string): FriendlyCopy {
  if (language.toLowerCase().startsWith("az")) return COPY.az
  if (language.toLowerCase().startsWith("ru")) return COPY.ru
  return COPY.en
}

function priorityVisual(priority: string) {
  if (priority === "URGENT" || priority === "HIGH") {
    return { fill: fieldTheme.color.dangerSoft, ink: fieldTheme.color.danger, icon: "alert-circle-outline" }
  }
  if (priority === "MEDIUM") {
    return { fill: fieldTheme.color.amberSoft, ink: fieldTheme.color.amber, icon: "flag-outline" }
  }
  return { fill: fieldTheme.color.successSoft, ink: fieldTheme.color.success, icon: "leaf-outline" }
}

function statusVisual(status: string) {
  if (status === "COMPLETED") return { fill: fieldTheme.color.successSoft, ink: fieldTheme.color.success, icon: "checkmark-circle-outline" }
  if (status === "IN_PROGRESS") return { fill: fieldTheme.color.blueSoft, ink: fieldTheme.color.blue, icon: "play-circle-outline" }
  if (status === "CANCELLED") return { fill: fieldTheme.color.dangerSoft, ink: fieldTheme.color.danger, icon: "close-circle-outline" }
  if (status === "OVERDUE") return { fill: fieldTheme.color.coralSoft, ink: fieldTheme.color.coral, icon: "time-outline" }
  return { fill: fieldTheme.color.amberSoft, ink: fieldTheme.color.amber, icon: "hourglass-outline" }
}

function fileIcon(mime: string): string {
  if (mime.startsWith("image/")) return "image-outline"
  if (mime === "application/pdf") return "document-text-outline"
  if (mime.startsWith("video/")) return "videocam-outline"
  return "attach-outline"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toDateLabel(iso: string, language: string, withTime = false): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  if (withTime) {
    return date.toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" })
}

export default function TaskDetailScreen() {
  const { t, i18n } = useTranslation()
  const copy = friendlyCopy(i18n.language || "ru")
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "TaskDetail">>()
  const headerTop = useHeaderTop()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const expandedTablet = isExpandedTabletWidth(width)
  const touchTarget = expandedTablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact

  const [task, setTask] = useState(() => toTaskDetail(route.params.task))
  const myAgentId = useAuthStore((state) => state.agent?.id)
  const { phase, conflicts, pending: globalPending } = useSyncStatusStore()
  const isOwnTask = Boolean(myAgentId) && task.agentId === myAgentId
  const workflowStatus = taskWorkflowStatus(task)
  const canReportProgress = isOwnTask && workflowStatus === "IN_PROGRESS"
  const primaryAction = taskDetailPrimaryAction(workflowStatus, isOwnTask, false)

  const [statusBusy, setStatusBusy] = useState(false)
  const [reconcilingTruth, setReconcilingTruth] = useState(true)
  const [taskConflict, setTaskConflict] = useState(false)
  const [taskPending, setTaskPending] = useState(false)
  const [noteAction, setNoteAction] = useState<"complete" | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [progressSaving, setProgressSaving] = useState(false)
  const [progressMessage, setProgressMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [pendingTaskUpdates, setPendingTaskUpdates] = useState(0)
  const [toast, setToast] = useState<{
    visible: boolean
    type: "success" | "error" | "info"
    title: string
    message?: string
  }>({ visible: false, type: "success", title: "" })
  const [documents, setDocuments] = useState<TaskDoc[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState(false)

  const timeline = taskTimeline(task).filter((entry) => !(workflowStatus === "COMPLETED" && entry.key === "due"))
  const statusLabel = t(STATUS_KEY[task.status] ?? "task.statusToDo")
  const priorityLabel = t(PRIORITY_KEY[task.priority] ?? "task.priorityMedium")
  const priorityTone = priorityVisual(task.priority)
  const statusTone = statusVisual(task.status)

  const refreshPending = useCallback(async () => {
    try {
      const count = await countPendingTaskUpdates()
      setPendingTaskUpdates(count)
      return count
    } catch {
      return 0
    }
  }, [])

  const refreshTaskFromServer = useCallback(async (expectedStatus?: string) => {
    try {
      const response: any = await api.getTasks()
      const serverTask = Array.isArray(response?.data?.tasks)
        ? response.data.tasks.find((candidate: any) => candidate?.id === task.id)
        : null
      const serverWorkflowStatus = serverTask ? taskWorkflowStatus(serverTask) : null
      if (response?.success && serverTask && (!expectedStatus || serverWorkflowStatus === expectedStatus)) {
        setTask(toTaskDetail(serverTask))
        return true
      }
    } catch {}
    return false
  }, [task.id])

  const loadDocuments = useCallback(async (signal?: AbortSignal) => {
    setDocumentsLoading(true)
    setDocumentsError(false)
    try {
      const response: any = await api.getTaskDocuments(task.id, signal)
      if (response?.success) {
        setDocuments(Array.isArray(response.data?.documents) ? response.data.documents : [])
      } else {
        setDocumentsError(true)
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") setDocumentsError(true)
    } finally {
      if (!signal?.aborted) setDocumentsLoading(false)
    }
  }, [task.id])

  useEffect(() => {
    const controller = new AbortController()
    loadDocuments(controller.signal).catch(() => {})
    return () => controller.abort()
  }, [loadDocuments])

  useEffect(() => {
    let disposed = false
    const reconcile = async () => {
      setReconcilingTruth(true)
      try {
        const operations = await allOutboxOperations()
        if (disposed) return
        const taskOperations = operations.filter((operation) => operation.entity === "tasks")
        setPendingTaskUpdates(taskOperations.filter((operation) => operation.status === "pending").length)
        setTaskConflict(taskOperations.some((operation) => operation.status === "conflict" && operation.data.id === task.id))
        const latestPending = taskOperations
          .filter((operation) => operation.status === "pending" && operation.data.id === task.id && typeof operation.data.status === "string")
          .sort((a, b) => b.clientTimestamp - a.clientTimestamp)[0]
        setTaskPending(Boolean(latestPending))
        if (latestPending) {
          const pendingStatus = String(latestPending.data.status)
          setTask((current) => ({
            ...current,
            ...pendingTaskStatusOverlay(pendingStatus, latestPending.data.result),
          }))
        } else if (phase !== "offline") {
          await refreshTaskFromServer()
        }
      } finally {
        if (!disposed) setReconcilingTruth(false)
      }
    }
    reconcile().catch(() => { if (!disposed) setReconcilingTruth(false) })
    return () => { disposed = true }
  }, [conflicts, globalPending, phase, refreshTaskFromServer, task.id])

  const applyTaskStatus = async (nextStatus: "IN_PROGRESS" | "COMPLETED", result?: string) => {
    if (statusBusy) return
    const previous = task
    setStatusBusy(true)
    setTask((current) => ({
      ...current,
      status: nextStatus,
      persistedStatus: nextStatus,
      ...(nextStatus === "COMPLETED"
        ? { result: result || current.result, returnReason: null, progress: 100 }
        : {}),
    }))
    try {
      const queued = await queueTaskStatusUpdate(task.id, nextStatus, result)
      setTaskPending(true)
      await flushRouteFieldOutbox()
      const remaining = await refreshPending()
      await refreshSyncStatusCounts().catch(() => {})
      const queuedAfterFlush = (await allOutboxOperations()).find((operation) => operation.operationId === queued.operationId)
      if (queuedAfterFlush?.status === "conflict") {
        setTaskPending(false)
        setTask(previous)
        setToast({ visible: true, type: "error", title: copy.syncErrorTitle, message: copy.syncErrorBody })
      } else if (!queuedAfterFlush) {
        setTaskPending(false)
        await refreshTaskFromServer(nextStatus)
        setToast({
          visible: true,
          type: "success",
          title: nextStatus === "COMPLETED" ? t("task.completedToastTitle") : t("task.startedToastTitle"),
          message: copy.serverSavedBody,
        })
      } else if (remaining > 0) {
        setTaskPending(true)
        setToast({ visible: true, type: "info", title: copy.savedOnDevice, message: copy.savedOnDeviceBody })
      }
    } catch (error: any) {
      setTask(previous)
      if (error?.message !== "SESSION_EXPIRED") {
        setToast({
          visible: true,
          type: "error",
          title: nextStatus === "COMPLETED" ? t("task.completeFailed") : t("task.updateFailed"),
        })
      }
    } finally {
      setStatusBusy(false)
    }
  }

  const handleProgress = async (next: number) => {
    if (progressSaving || phase === "offline" || taskPending) return
    const clamped = Math.min(100, Math.max(0, next))
    const previous = task.progress
    if (clamped === (previous ?? 0)) return
    setProgressSaving(true)
    setProgressMessage(null)
    setTask((current) => ({ ...current, progress: clamped }))
    try {
      const response = await api.updateTaskProgress(task.id, clamped)
      if (!response?.success) throw new Error("TASK_PROGRESS_FAILED")
      setProgressMessage({ tone: "success", text: copy.progressSaved })
    } catch (error: any) {
      setTask((current) => ({ ...current, progress: previous }))
      if (error?.message !== "SESSION_EXPIRED") {
        setProgressMessage({ tone: "error", text: t("task.progressFailed") })
      }
    } finally {
      setProgressSaving(false)
    }
  }

  const handlePrimaryAction = () => {
    if (primaryAction === "start") {
      applyTaskStatus("IN_PROGRESS").catch(() => {})
    } else if (primaryAction === "complete") {
      setNoteAction("complete")
    }
  }

  const actionLabel = primaryAction === "start"
    ? (statusBusy ? copy.starting : copy.start)
    : primaryAction === "complete"
      ? (statusBusy ? copy.completing : copy.complete)
      : ""

  const actionIcon = primaryAction === "start"
    ? "play"
    : primaryAction === "complete"
      ? "checkmark"
      : "ellipse-outline"

  const noActionBody = task.status === "COMPLETED"
    ? copy.completedBody
    : task.status === "CANCELLED"
      ? copy.cancelledBody
      : task.status === "OVERDUE"
        ? copy.overdueBody
        : copy.readOnlyBody

  const actionBusy = statusBusy || reconcilingTruth
  const primaryBlocked = actionBusy || taskConflict || taskPending
  const progressBlocked = progressSaving || phase === "offline" || taskPending

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.headerTools}>
            <TouchableOpacity
              style={[styles.backButton, { minHeight: touchTarget }]}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={copy.back}
            >
              <Icon name="arrow-back" size={22} color={fieldTheme.color.onColor} />
              <Text style={styles.backText}>{copy.back}</Text>
            </TouchableOpacity>
            <SyncStatusChip inverse />
          </View>
          <Text style={styles.headerEyebrow}>{copy.guide}</Text>
          <Text style={[styles.headerTitle, expandedTablet && styles.headerTitleTablet]}>{task.title}</Text>
          <View style={styles.headerSignals}>
            <View style={[styles.headerPill, { backgroundColor: statusTone.fill }]}>
              <Icon name={statusTone.icon} size={17} color={statusTone.ink} />
              <Text style={[styles.headerPillText, { color: statusTone.ink }]}>{statusLabel}</Text>
            </View>
            <View style={[styles.headerPill, { backgroundColor: priorityTone.fill }]}>
              <Icon name={priorityTone.icon} size={17} color={priorityTone.ink} />
              <Text style={[styles.headerPillText, { color: priorityTone.ink }]}>{priorityLabel}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 132 + Math.max(insets.bottom, 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentFrame}>
          {phase === "syncing" ? (
            <Notice icon="sync-outline" tone="blue" title={copy.syncingTitle} body={copy.syncingBody} busy />
          ) : phase === "error" || conflicts > 0 ? (
            <Notice icon="warning-outline" tone="danger" title={copy.syncErrorTitle} body={copy.syncErrorBody} />
          ) : phase === "offline" ? (
            <Notice
              icon="cloud-offline-outline"
              tone="amber"
              title={copy.offlineTitle}
              body={pendingTaskUpdates > 0 ? `${copy.offlineBody}\n${t("task.pendingSyncTemplate", { count: pendingTaskUpdates })}` : copy.offlineBody}
            />
          ) : pendingTaskUpdates > 0 ? (
            <Notice icon="cloud-upload-outline" tone="blue" title={t("task.pendingSyncTemplate", { count: pendingTaskUpdates })} body={copy.pendingBody} />
          ) : null}

          {task.returnReason ? (
            <Notice icon="return-down-back-outline" tone="danger" title={copy.returnedTitle} body={`${task.returnReason}\n${copy.returnedHint}`} />
          ) : null}

          {expandedTablet ? (
            <View style={styles.tabletFlow}>
              <FlowStep number="1" label={copy.requirement} />
              <Icon name="arrow-forward" size={18} color={fieldTheme.color.inkMuted} />
              <FlowStep number="2" label={copy.context} />
              <Icon name="arrow-forward" size={18} color={fieldTheme.color.inkMuted} />
              <FlowStep number="3" label={copy.progress} />
              <Icon name="arrow-forward" size={18} color={fieldTheme.color.inkMuted} />
              <FlowStep number="4" label={copy.evidence} />
            </View>
          ) : null}

          <View style={[styles.columns, expandedTablet && styles.columnsTablet]}>
            <View style={styles.primaryColumn}>
              <SectionCard step={expandedTablet ? null : "1"} icon="reader-outline" title={copy.requirement} hint={copy.requirementHint}>
                <Text style={[styles.description, !task.description && styles.descriptionMuted]}>
                  {task.description || copy.noDescription}
                </Text>
              </SectionCard>

              <SectionCard step={expandedTablet ? null : "2"} icon="location-outline" title={copy.context} hint={copy.contextHint}>
                <InfoRow
                  icon="business-outline"
                  label={copy.customer}
                  value={task.customerName || copy.notProvided}
                  secondary={task.customerAddress || undefined}
                />
                <InfoRow
                  icon="calendar-outline"
                  label={copy.due}
                  value={task.dueDate ? toDateLabel(task.dueDate, i18n.language) : copy.notProvided}
                />
                <InfoRow
                  icon="person-outline"
                  label={copy.assignee}
                  value={task.agentName || copy.notProvided}
                  last
                />
              </SectionCard>

              <SectionCard step={expandedTablet ? null : "3"} icon="trending-up-outline" title={copy.progress} hint={copy.progressHint}>
                {task.progress !== null || canReportProgress ? (
                  <>
                    <View style={styles.progressTop}>
                      <Text style={styles.progressValue}>{task.progress ?? 0}%</Text>
                      {progressSaving ? <ActivityIndicator size="small" color={fieldTheme.color.primary} /> : null}
                    </View>
                    <View style={styles.progressTrack} accessibilityRole="progressbar">
                      <View style={[styles.progressFill, { width: `${task.progress ?? 0}%` }]} />
                    </View>
                    {canReportProgress ? (
                      <View style={styles.progressButtons}>
                        <TouchableOpacity
                          style={[styles.secondaryButton, styles.progressButton, { minHeight: touchTarget }, ((task.progress ?? 0) <= 0 || progressBlocked) && styles.disabled]}
                          onPress={() => handleProgress((task.progress ?? 0) - 10)}
                          disabled={(task.progress ?? 0) <= 0 || progressBlocked}
                          accessibilityRole="button"
                          accessibilityLabel="-10%"
                        >
                          <Icon name="remove" size={21} color={fieldTheme.color.primaryStrong} />
                          <Text style={styles.secondaryButtonText}>10%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.secondaryButton, styles.progressButton, { minHeight: touchTarget }, ((task.progress ?? 0) >= 100 || progressBlocked) && styles.disabled]}
                          onPress={() => handleProgress((task.progress ?? 0) + 10)}
                          disabled={(task.progress ?? 0) >= 100 || progressBlocked}
                          accessibilityRole="button"
                          accessibilityLabel="+10%"
                        >
                          <Icon name="add" size={21} color={fieldTheme.color.primaryStrong} />
                          <Text style={styles.secondaryButtonText}>10%</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {taskPending ? (
                      <InlineMessage tone="warning" text={copy.progressPendingStatus} />
                    ) : phase === "offline" && canReportProgress ? (
                      <InlineMessage tone="warning" text={copy.progressNeedsConnection} />
                    ) : progressMessage ? (
                      <InlineMessage tone={progressMessage.tone} text={progressMessage.text} />
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    {taskPending ? copy.progressPendingStatus : isOwnTask && task.status === "PENDING" ? copy.progressLocked : copy.notProvided}
                  </Text>
                )}
              </SectionCard>
            </View>

            <View style={styles.secondaryColumn}>
              <SectionCard step={expandedTablet ? null : "4"} icon="shield-checkmark-outline" title={copy.evidence} hint={copy.evidenceHint}>
                {task.result ? (
                  <View style={styles.resultBlock}>
                    <View style={styles.resultHeading}>
                      <Icon name="checkmark-done-outline" size={20} color={fieldTheme.color.success} />
                      <Text style={styles.resultLabel}>{copy.result}</Text>
                    </View>
                    <Text style={styles.resultText}>{task.result}</Text>
                  </View>
                ) : null}

                {documentsLoading ? (
                  <View style={styles.evidenceState}>
                    <ActivityIndicator size="small" color={fieldTheme.color.primary} />
                    <Text style={styles.evidenceStateText}>{copy.evidenceLoading}</Text>
                  </View>
                ) : documentsError ? (
                  <View style={styles.evidenceState}>
                    <Icon name="cloud-offline-outline" size={22} color={fieldTheme.color.danger} />
                    <Text style={styles.evidenceStateText}>{copy.evidenceFailed}</Text>
                    <TouchableOpacity
                      style={[styles.retryButton, { minHeight: touchTarget }]}
                      onPress={() => loadDocuments()}
                      accessibilityRole="button"
                    >
                      <Icon name="refresh" size={18} color={fieldTheme.color.primaryStrong} />
                      <Text style={styles.retryText}>{copy.retry}</Text>
                    </TouchableOpacity>
                  </View>
                ) : documents.length === 0 ? (
                  <View style={styles.evidenceState}>
                    <Icon name="document-outline" size={24} color={fieldTheme.color.inkMuted} />
                    <Text style={styles.evidenceStateText}>{copy.evidenceEmpty}</Text>
                  </View>
                ) : (
                  <View style={styles.fileList}>
                    {documents.map((document) => (
                      <View key={document.id} style={styles.fileRow}>
                        <View style={styles.fileIcon}>
                          <Icon name={fileIcon(document.mimeType)} size={22} color={fieldTheme.color.primaryStrong} />
                        </View>
                        <View style={styles.fileCopy}>
                          <Text style={styles.fileName} numberOfLines={2}>{document.title || document.fileName}</Text>
                          <Text style={styles.fileMeta}>{formatBytes(document.sizeBytes)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.readOnlyNote}>
                  <Icon name="eye-outline" size={18} color={fieldTheme.color.inkMuted} />
                  <Text style={styles.readOnlyText}>{copy.evidenceReadOnly}</Text>
                </View>
              </SectionCard>

              <View style={styles.card}>
                <TouchableOpacity
                  style={[styles.disclosureButton, { minHeight: touchTarget }]}
                  onPress={() => setShowMore((current) => !current)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showMore }}
                >
                  <View style={styles.disclosureCopy}>
                    <Text style={styles.cardTitle}>{copy.moreDetails}</Text>
                    <Text style={styles.cardHint}>{showMore ? copy.hideDetails : copy.showDetails}</Text>
                  </View>
                  <Icon name={showMore ? "chevron-up" : "chevron-down"} size={22} color={fieldTheme.color.primaryStrong} />
                </TouchableOpacity>
                {showMore ? (
                  <View style={styles.additionalDetails}>
                    {timeline.length > 0 ? (
                      <View style={styles.detailGroup}>
                        <Text style={styles.detailGroupTitle}>{t("task.sectionTimeline")}</Text>
                        {timeline.map((entry, index) => (
                          <View key={`${entry.key}-${index}`} style={styles.timelineRow}>
                            <View style={styles.timelineRail}>
                              <View style={[styles.timelineDot, entry.kind === "target" && styles.timelineDotTarget]} />
                              {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                            </View>
                            <View style={styles.timelineCopy}>
                              <Text style={styles.timelineLabel}>{t(TIMELINE_KEY[entry.key])}</Text>
                              <Text style={styles.timelineTime}>{toDateLabel(entry.at, i18n.language, true)}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {task.recurrence ? (
                      <View style={styles.detailGroup}>
                        <Text style={styles.detailGroupTitle}>{t("task.sectionRecurrence")}</Text>
                        <InfoRow
                          icon="repeat-outline"
                          label={t("task.fieldRepeats")}
                          value={task.recurrence.interval > 1
                            ? `${t("task.recurEvery", { count: task.recurrence.interval })} · ${t(RECUR_KEY[task.recurrence.rule] ?? "task.recurDaily")}`
                            : t(RECUR_KEY[task.recurrence.rule] ?? "task.recurDaily")}
                          secondary={task.recurrence.until ? `${t("task.fieldUntil")}: ${toDateLabel(task.recurrence.until, i18n.language)}` : undefined}
                          last
                        />
                      </View>
                    ) : null}
                    {timeline.length === 0 && !task.recurrence ? <Text style={styles.emptyText}>{copy.notProvided}</Text> : null}
                  </View>
                ) : null}
              </View>

            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.actionDockInner, expandedTablet && styles.actionDockInnerTablet]}>
          <View style={styles.actionDockCopy}>
            <View style={styles.nextStepRow}>
              <View style={styles.nextStepNumber}><Text style={styles.nextStepNumberText}>5</Text></View>
              <Text style={styles.nextStepLabel}>{copy.nextStep}</Text>
            </View>
            {!primaryAction ? <Text style={styles.actionDockHint}>{noActionBody}</Text> : null}
            {taskPending ? <Text style={styles.actionDockError}>{copy.pendingBody}</Text> : null}
            {taskConflict ? <Text style={styles.actionDockError}>{copy.syncErrorTitle}</Text> : null}
          </View>
          {primaryAction ? (
            <TouchableOpacity
              style={[styles.primaryButton, expandedTablet && styles.primaryButtonTablet, { minHeight: touchTarget }, primaryBlocked && styles.disabled]}
              onPress={handlePrimaryAction}
              disabled={primaryBlocked}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
            >
              {actionBusy ? (
                <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
              ) : (
                <Icon name={actionIcon} size={21} color={fieldTheme.color.onColor} />
              )}
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.finishedIcon}>
              <Icon
                name={task.status === "COMPLETED" ? "checkmark-done" : "eye-outline"}
                size={23}
                color={task.status === "COMPLETED" ? fieldTheme.color.success : fieldTheme.color.inkMuted}
              />
            </View>
          )}
        </View>
      </View>

      <ActionNoteModal
        visible={noteAction !== null}
        title={copy.completeTitle}
        body={copy.completeBody}
        placeholder={copy.completePlaceholder}
        submitLabel={copy.completeSubmit}
        cancelLabel={copy.cancel}
        busy={statusBusy}
        onCancel={() => setNoteAction(null)}
        onSubmit={(notes) => {
          setNoteAction(null)
          applyTaskStatus("COMPLETED", notes || undefined).catch(() => {})
        }}
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

function SectionCard({
  step,
  icon,
  title,
  hint,
  children,
}: {
  step: string | null
  icon: string
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeading}>
        {step ? <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step}</Text></View> : null}
        <View style={styles.sectionIcon}><Icon name={icon} size={21} color={fieldTheme.color.primaryStrong} /></View>
        <View style={styles.sectionCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardHint}>{hint}</Text>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function FlowStep({ number, label }: { number: string; label: string }) {
  return (
    <View style={styles.flowStep}>
      <View style={styles.flowStepNumber}><Text style={styles.flowStepNumberText}>{number}</Text></View>
      <Text style={styles.flowStepLabel} numberOfLines={2}>{label}</Text>
    </View>
  )
}

function InfoRow({
  icon,
  label,
  value,
  secondary,
  last = false,
}: {
  icon: string
  label: string
  value: string
  secondary?: string
  last?: boolean
}) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <View style={styles.infoIcon}><Icon name={icon} size={20} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {secondary ? <Text style={styles.infoSecondary}>{secondary}</Text> : null}
      </View>
    </View>
  )
}

function Notice({
  icon,
  title,
  body,
  tone,
  busy = false,
}: {
  icon: string
  title: string
  body: string
  tone: "amber" | "blue" | "danger"
  busy?: boolean
}) {
  const visual = tone === "danger"
    ? { backgroundColor: fieldTheme.color.dangerSoft, color: fieldTheme.color.danger }
    : tone === "blue"
      ? { backgroundColor: fieldTheme.color.blueSoft, color: fieldTheme.color.blue }
      : { backgroundColor: fieldTheme.color.amberSoft, color: fieldTheme.color.amber }
  return (
    <View style={[styles.notice, { backgroundColor: visual.backgroundColor }]}>
      <View style={styles.noticeIcon}>
        {busy ? <ActivityIndicator size="small" color={visual.color} /> : <Icon name={icon} size={22} color={visual.color} />}
      </View>
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: visual.color }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  )
}

function InlineMessage({ tone, text }: { tone: "success" | "error" | "warning"; text: string }) {
  const color = tone === "success"
    ? fieldTheme.color.success
    : tone === "error"
      ? fieldTheme.color.danger
      : fieldTheme.color.amber
  const icon = tone === "success" ? "checkmark-circle-outline" : tone === "error" ? "alert-circle-outline" : "cloud-offline-outline"
  return (
    <View style={styles.inlineMessage}>
      <Icon name={icon} size={18} color={color} />
      <Text style={[styles.inlineMessageText, { color }]}>{text}</Text>
    </View>
  )
}

function ActionNoteModal({
  visible,
  title,
  body,
  placeholder,
  submitLabel,
  cancelLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  title: string
  body: string
  placeholder: string
  submitLabel: string
  cancelLabel: string
  busy: boolean
  onCancel: () => void
  onSubmit: (notes: string) => void
}) {
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!visible) setNotes("")
  }, [visible])

  const cancel = () => {
    if (busy) return
    setNotes("")
    onCancel()
  }

  const submit = () => {
    const value = notes.trim()
    setNotes("")
    onSubmit(value)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}><Icon name="checkmark-done-outline" size={27} color={fieldTheme.color.primaryStrong} /></View>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={placeholder}
            placeholderTextColor={fieldTheme.color.inkMuted}
            style={styles.noteInput}
            multiline
            textAlignVertical="top"
            editable={!busy}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalCancel, busy && styles.disabled]}
              onPress={cancel}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSubmit, busy && styles.disabled]}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Icon name="checkmark" size={20} color={fieldTheme.color.onColor} />}
              <Text style={styles.modalSubmitText}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: {
    backgroundColor: fieldTheme.color.primaryStrong,
    paddingHorizontal: fieldTheme.space.lg,
    paddingBottom: fieldTheme.space.xl,
    borderBottomLeftRadius: fieldTheme.radius.lg,
    borderBottomRightRadius: fieldTheme.radius.lg,
  },
  headerInner: { width: "100%", maxWidth: 1120, alignSelf: "center" },
  headerTools: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  backButton: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingRight: fieldTheme.space.md },
  backText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "800" },
  headerEyebrow: { color: fieldTheme.color.primarySoft, fontSize: 13, fontWeight: "800", marginTop: fieldTheme.space.lg },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: fieldTheme.space.xs },
  headerTitleTablet: { fontSize: 32, lineHeight: 39, maxWidth: 780 },
  headerSignals: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  headerPill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.pill },
  headerPillText: { fontSize: 13, fontWeight: "800" },
  scrollContent: { padding: fieldTheme.space.lg },
  contentFrame: { width: "100%", maxWidth: 1120, alignSelf: "center", gap: fieldTheme.space.md },
  tabletFlow: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.lg, paddingVertical: fieldTheme.space.sm },
  flowStep: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  flowStepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primaryStrong },
  flowStepNumberText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  flowStepLabel: { flex: 1, color: fieldTheme.color.ink, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  columns: { gap: fieldTheme.space.md },
  columnsTablet: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.lg },
  primaryColumn: { flex: 1.15, gap: fieldTheme.space.md, minWidth: 0 },
  secondaryColumn: { flex: 0.85, gap: fieldTheme.space.md, minWidth: 0 },
  card: {
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    padding: fieldTheme.space.lg,
  },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primaryStrong },
  stepNumberText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  sectionIcon: { width: 32, height: 32, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  sectionCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  cardHint: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  sectionBody: { marginTop: fieldTheme.space.lg },
  description: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 26, fontWeight: "600" },
  descriptionMuted: { color: fieldTheme.color.inkMuted, fontStyle: "italic", fontWeight: "500" },
  infoRow: { flexDirection: "row", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.md, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  infoRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  infoIcon: { width: 36, height: 36, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  infoValue: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 22, fontWeight: "800", marginTop: 2 },
  infoSecondary: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  progressTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: fieldTheme.space.sm },
  progressValue: { color: fieldTheme.color.primaryStrong, fontSize: 28, fontWeight: "900" },
  progressTrack: { height: 14, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden" },
  progressFill: { height: 14, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primary },
  progressButtons: { flexDirection: "row", gap: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  progressButton: { flex: 1 },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.md },
  secondaryButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "800" },
  inlineMessage: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  inlineMessageText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  resultBlock: { borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.successSoft, padding: fieldTheme.space.md, marginBottom: fieldTheme.space.md },
  resultHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  resultLabel: { color: fieldTheme.color.success, fontSize: 13, fontWeight: "900" },
  resultText: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 22, marginTop: fieldTheme.space.sm },
  evidenceState: { alignItems: "center", gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.lg },
  evidenceStateText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "800" },
  fileList: { gap: fieldTheme.space.sm },
  fileRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, minHeight: 52, paddingVertical: fieldTheme.space.sm, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  fileIcon: { width: 40, height: 40, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  fileCopy: { flex: 1, minWidth: 0 },
  fileName: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  fileMeta: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 2 },
  readOnlyNote: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md, paddingTop: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  readOnlyText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 18 },
  disclosureButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  disclosureCopy: { flex: 1 },
  additionalDetails: { marginTop: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, gap: fieldTheme.space.lg },
  detailGroup: { gap: fieldTheme.space.sm },
  detailGroupTitle: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  timelineRow: { flexDirection: "row", gap: fieldTheme.space.md },
  timelineRail: { width: 14, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: fieldTheme.color.primary, marginTop: 4 },
  timelineDotTarget: { backgroundColor: fieldTheme.color.surface, borderWidth: 2, borderColor: fieldTheme.color.amber },
  timelineLine: { flex: 1, width: 2, minHeight: 18, marginTop: 2, backgroundColor: fieldTheme.color.border },
  timelineCopy: { flex: 1, paddingBottom: fieldTheme.space.md },
  timelineLabel: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  timelineTime: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 2 },
  emptyText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.lg },
  noticeIcon: { width: 28, alignItems: "center", paddingTop: 1 },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { fontSize: 15, lineHeight: 20, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, marginTop: 3 },
  actionDock: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: fieldTheme.color.surface, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md },
  actionDockInner: { width: "100%", maxWidth: 1120, alignSelf: "center", gap: fieldTheme.space.md },
  actionDockInnerTablet: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionDockCopy: { flex: 1, minWidth: 0 },
  nextStepRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  nextStepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  nextStepNumberText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  nextStepLabel: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  actionDockHint: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, marginTop: 4 },
  actionDockError: { color: fieldTheme.color.danger, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 4 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.xl },
  primaryButtonTablet: { minWidth: 230 },
  primaryButtonText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  finishedIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong, alignSelf: "flex-end" },
  disabled: { opacity: 0.45 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: fieldTheme.space.lg, backgroundColor: "rgba(19,35,31,0.55)" },
  modalCard: { width: "100%", maxWidth: 520, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  modalIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  modalTitle: { color: fieldTheme.color.ink, fontSize: 22, lineHeight: 28, fontWeight: "900", marginTop: fieldTheme.space.lg },
  modalBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 21, marginTop: fieldTheme.space.sm },
  noteInput: { minHeight: 120, maxHeight: 220, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.canvas, color: fieldTheme.color.ink, fontSize: 16, lineHeight: 22, padding: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  modalCancel: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border },
  modalCancelText: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  modalSubmit: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary },
  modalSubmitText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
})
