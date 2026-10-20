import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { readOfflineTasks } from "../../services/offline-reads"
import { flushRouteFieldOutbox } from "../../services/sync-engine"
import { countPendingTaskUpdates, queueTaskStatusUpdate } from "../../services/task-outbox"
import { CACHED_VIEW_NOTICE_KEYS, cachedViewNotice } from "../../lib/cached-view-notice"
import { useSyncStatusStore } from "../../store/sync-status"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import FeedbackToast from "../../components/FeedbackToast"
import StatusBarBand from "../../components/StatusBarBand"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import NotificationBell from "../../components/NotificationBell"
import { fieldTheme, themed, useFieldColorScheme } from "../../theme/fieldTheme"
import {
  TASK_FILTERS,
  TASK_ORDERS,
  filterCounts,
  filterTasks,
  isClosedTask,
  isOverdueTask,
  isReturnedTask,
  isTaskOrder,
  orderClosedTasks,
  orderOpenTasks,
  taskState,
  type TaskFilter,
  type TaskOrder,
  type TaskState,
} from "./task-list"

/**
 * The agent's tasks as one list, like the CRM's boards (owner, 2026-10-20:
 * «не понятно сразу, в какой вкладке задача… нужно, чтоб все задачи
 * отображались и рядом статус, который можно менять»; «бери из досок»).
 * Groups «Открытые / Закрытые», a filter on top, the status on the right of
 * every row — a tap opens the choice. The order and the filter are in
 * task-list.ts.
 */

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED"
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  persistedStatus?: string | null
  priority: string
  dueDate?: string | null
  createdAt?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  returnReason?: string | null
  result?: string | null
  progress?: number | null
  agentId?: string | null
  customer?: { name?: string | null; address?: string | null } | null
}

interface FriendlyCopy {
  title: string
  subtitle: string
  cancel: string
  filters: Record<TaskFilter, string>
  orders: Record<TaskOrder, string>
  orderTitle: string
  orderLabel: string
  openGroup: string
  closedGroup: string
  statusTitle: string
  statusNow: string
  completeHint: string
  cancelled: string
  returned: (reason: string) => string
  status: Record<TaskStatus, string>
  loading: string
  loadingBody: string
  emptyTitle: Record<TaskFilter, string>
  emptyBody: Record<TaskFilter, string>
  retry: string
  offlineBody: string
  pendingBody: string
  syncNow: string
  syncing: string
  syncedTitle: string
  stillPendingTitle: string
  savedDeviceTitle: string
  savedDeviceBody: string
  serverSavedBody: string
  priority: Record<TaskPriority, string>
  noDue: string
  overdueDays: (days: number) => string
  dueToday: string
  dueTomorrow: string
  dueDays: (days: number) => string
  startedTitle: string
  statusChanged: string
  completedTitle: string
  completeTitle: string
  completeBody: string
  notesPlaceholder: string
  completeTask: string
  loadFailed: string
  updateFailed: string
  completeFailed: string
}

const COPY: Record<"ru" | "az" | "en", FriendlyCopy> = {
  ru: {
    title: "Задачи",
    subtitle: "Все ваши задачи. Статус меняется справа.",
    cancel: "Отмена",
    filters: { ALL: "Все", PENDING: "Не взяты", IN_PROGRESS: "Взяты", COMPLETED: "Выполнены" },
    orders: { urgent: "сначала срочное", due: "по сроку", priority: "по важности", newest: "новые сверху" },
    orderTitle: "Порядок",
    orderLabel: "Порядок:",
    openGroup: "Открытые задачи",
    closedGroup: "Закрытые задачи",
    statusTitle: "Статус задачи",
    statusNow: "сейчас",
    completeHint: "Попросим коротко написать, что сделано — можно пропустить",
    cancelled: "Отменена",
    returned: (reason) => `Возвращена: ${reason}`,
    status: { PENDING: "К выполнению", IN_PROGRESS: "В работе", COMPLETED: "Готово" },
    loading: "Загружаю задачи…",
    loadingBody: "Проверяю актуальный список на сервере.",
    emptyTitle: { ALL: "Задач пока нет", PENDING: "Не взятых задач нет", IN_PROGRESS: "Нет задач в работе", COMPLETED: "Выполненных задач пока нет" },
    emptyBody: { ALL: "Когда руководитель даст задачу, она появится здесь.", PENDING: "Все задачи уже взяты в работу или выполнены.", IN_PROGRESS: "Возьмите задачу: нажмите на её статус справа.", COMPLETED: "Выполненные задачи появятся здесь вместе с результатом." },
    retry: "Повторить",
    offlineBody: "Показана последняя сохранённая копия. Изменения останутся на устройстве.",
    pendingBody: "Изменения сохранены на устройстве и уйдут на сервер после подключения.",
    syncNow: "Синхронизировать",
    syncing: "Отправляю…",
    syncedTitle: "Все изменения отправлены",
    stillPendingTitle: "Изменения пока на устройстве",
    savedDeviceTitle: "Сохранено на устройстве",
    savedDeviceBody: "Отправим изменение на сервер, когда появится интернет.",
    serverSavedBody: "Изменение подтверждено сервером.",
    priority: {
      LOW: "Обычная",
      MEDIUM: "Важная",
      HIGH: "Высокая",
      URGENT: "Срочная",
    },
    noDue: "Срок не указан",
    overdueDays: (days) => `Просрочено на ${days} дн.`,
    dueToday: "Срок сегодня",
    dueTomorrow: "Срок завтра",
    dueDays: (days) => `До срока ${days} дн.`,
    startedTitle: "Задача начата",
    statusChanged: "Статус изменён",
    completedTitle: "Задача завершена",
    completeTitle: "Результат задачи",
    completeBody: "Коротко напишите, что сделано. Заметка необязательна.",
    notesPlaceholder: "Например: согласовано, документы отправлены",
    completeTask: "Сохранить и завершить",
    loadFailed: "Не удалось обновить задачи. Проверьте интернет и повторите.",
    updateFailed: "Не удалось изменить статус задачи.",
    completeFailed: "Не удалось завершить задачу.",
  },
  az: {
    title: "Tapşırıqlar",
    subtitle: "Bütün tapşırıqlarınız. Statusu sağda dəyişin.",
    cancel: "Ləğv et",
    filters: { ALL: "Hamısı", PENDING: "Başlanmayıb", IN_PROGRESS: "İcrada", COMPLETED: "Tamamlanıb" },
    orders: { urgent: "əvvəlcə təcili", due: "son tarixə görə", priority: "vaciblik üzrə", newest: "yenilər yuxarıda" },
    orderTitle: "Sıra",
    orderLabel: "Sıra:",
    openGroup: "Açıq tapşırıqlar",
    closedGroup: "Bağlı tapşırıqlar",
    statusTitle: "Tapşırığın statusu",
    statusNow: "indi",
    completeHint: "Görülən işi qısa yazmağı xahiş edəcəyik — keçmək olar",
    cancelled: "Ləğv edilib",
    returned: (reason) => `Geri qaytarılıb: ${reason}`,
    status: { PENDING: "Görüləcək", IN_PROGRESS: "İcrada", COMPLETED: "Tamam" },
    loading: "Tapşırıqlar yüklənir…",
    loadingBody: "Serverdəki son siyahı yoxlanılır.",
    emptyTitle: { ALL: "Hələ tapşırıq yoxdur", PENDING: "Başlanmamış tapşırıq yoxdur", IN_PROGRESS: "İcrada tapşırıq yoxdur", COMPLETED: "Tamamlanmış tapşırıq hələ yoxdur" },
    emptyBody: { ALL: "Rəhbər tapşırıq verəndə burada görünəcək.", PENDING: "Bütün tapşırıqlar ya icradadır, ya da tamamlanıb.", IN_PROGRESS: "Tapşırığa başlamaq üçün sağdakı statusuna toxunun.", COMPLETED: "Tamamlanan tapşırıqlar nəticə ilə burada görünəcək." },
    retry: "Yenidən yoxla",
    offlineBody: "Son saxlanmış nüsxə göstərilir. Dəyişikliklər cihazda qalacaq.",
    pendingBody: "Dəyişikliklər cihazda saxlanıb və internet gələndə serverə göndəriləcək.",
    syncNow: "Sinxronlaşdır",
    syncing: "Göndərilir…",
    syncedTitle: "Bütün dəyişikliklər göndərildi",
    stillPendingTitle: "Dəyişikliklər hələ cihazdadır",
    savedDeviceTitle: "Cihazda saxlanıldı",
    savedDeviceBody: "İnternet gələndə dəyişiklik serverə göndəriləcək.",
    serverSavedBody: "Dəyişiklik server tərəfindən təsdiqləndi.",
    priority: {
      LOW: "Adi",
      MEDIUM: "Vacib",
      HIGH: "Yüksək",
      URGENT: "Təcili",
    },
    noDue: "Son tarix göstərilməyib",
    overdueDays: (days) => `${days} gün gecikib`,
    dueToday: "Son tarix bu gündür",
    dueTomorrow: "Son tarix sabahdır",
    dueDays: (days) => `Son tarixə ${days} gün`,
    startedTitle: "Tapşırıq başladıldı",
    statusChanged: "Status dəyişdi",
    completedTitle: "Tapşırıq tamamlandı",
    completeTitle: "Tapşırığın nəticəsi",
    completeBody: "Görülən işi qısa yazın. Qeyd məcburi deyil.",
    notesPlaceholder: "Məsələn: razılaşdırıldı, sənədlər göndərildi",
    completeTask: "Yadda saxla və tamamla",
    loadFailed: "Tapşırıqlar yenilənmədi. İnterneti yoxlayıb yenidən cəhd edin.",
    updateFailed: "Tapşırığın statusu dəyişmədi.",
    completeFailed: "Tapşırığı tamamlamaq mümkün olmadı.",
  },
  en: {
    title: "Tasks",
    subtitle: "All your tasks. Change the status on the right.",
    cancel: "Cancel",
    filters: { ALL: "All", PENDING: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Done" },
    orders: { urgent: "urgent first", due: "by due date", priority: "by priority", newest: "newest first" },
    orderTitle: "Order",
    orderLabel: "Order:",
    openGroup: "Open tasks",
    closedGroup: "Closed tasks",
    statusTitle: "Task status",
    statusNow: "now",
    completeHint: "We'll ask for a short note on what was done — you can skip it",
    cancelled: "Cancelled",
    returned: (reason) => `Returned: ${reason}`,
    status: { PENDING: "To do", IN_PROGRESS: "In progress", COMPLETED: "Done" },
    loading: "Loading tasks…",
    loadingBody: "Checking the latest list on the server.",
    emptyTitle: { ALL: "No tasks yet", PENDING: "No tasks waiting to start", IN_PROGRESS: "No tasks in progress", COMPLETED: "No completed tasks yet" },
    emptyBody: { ALL: "A task from your manager will appear here.", PENDING: "Every task is already in progress or done.", IN_PROGRESS: "Start a task: tap its status on the right.", COMPLETED: "Completed tasks will appear here with their result." },
    retry: "Try again",
    offlineBody: "This is the last saved copy. Your changes will stay on this device.",
    pendingBody: "Changes are saved on this device and will reach the server when you reconnect.",
    syncNow: "Sync now",
    syncing: "Sending…",
    syncedTitle: "All changes sent",
    stillPendingTitle: "Changes are still on this device",
    savedDeviceTitle: "Saved on this device",
    savedDeviceBody: "We will send the change to the server when you reconnect.",
    serverSavedBody: "The server confirmed this change.",
    priority: {
      LOW: "Routine",
      MEDIUM: "Important",
      HIGH: "High",
      URGENT: "Urgent",
    },
    noDue: "No due date",
    overdueDays: (days) => `${days} day${days === 1 ? "" : "s"} overdue`,
    dueToday: "Due today",
    dueTomorrow: "Due tomorrow",
    dueDays: (days) => `${days} day${days === 1 ? "" : "s"} left`,
    startedTitle: "Task started",
    statusChanged: "Status changed",
    completedTitle: "Task completed",
    completeTitle: "Task result",
    completeBody: "Briefly say what you did. The note is optional.",
    notesPlaceholder: "For example: approved, documents sent",
    completeTask: "Save and complete",
    loadFailed: "We could not refresh tasks. Check your connection and try again.",
    updateFailed: "We could not change the task status.",
    completeFailed: "We could not complete the task.",
  },
}

const ORDER_KEY = "mtm.tasks.order"

function copyFor(language: string): FriendlyCopy {
  if (language.toLowerCase().startsWith("az")) return COPY.az
  if (language.toLowerCase().startsWith("ru")) return COPY.ru
  return COPY.en
}

function normalizedPriority(priority?: string | null): TaskPriority {
  const value = String(priority || "MEDIUM").toUpperCase()
  return value === "LOW" || value === "HIGH" || value === "URGENT" ? value : "MEDIUM"
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysFromToday(iso?: string | null): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return Math.round((startOfLocalDay(date) - startOfLocalDay(new Date())) / 86_400_000)
}

function shortDate(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(language, { day: "numeric", month: "short" })
}

/** The line under the title: the deadline in words, or when a closed task was closed. */
function dueText(task: Task, copy: FriendlyCopy, language: string, now: number): string {
  if (isClosedTask(task)) {
    const closedAt = task.completedAt || task.updatedAt
    return closedAt ? shortDate(closedAt, language) : task.dueDate ? shortDate(task.dueDate, language) : copy.noDue
  }
  const days = daysFromToday(task.dueDate)
  if (days === null) return copy.noDue
  if (isOverdueTask(task, now)) return copy.overdueDays(Math.max(1, Math.abs(days)))
  if (days === 0) return copy.dueToday
  if (days === 1) return copy.dueTomorrow
  if (days <= 7) return copy.dueDays(days)
  return shortDate(task.dueDate as string, language)
}

/** A status by its mark, as on the CRM's boards: an envelope waits, a wrench works, a tick is done. */
const STATUS_GLYPH: Record<TaskState, { icon: string; tone: "blue" | "amber" | "success" | "inkMuted" }> = {
  PENDING: { icon: "mail-outline", tone: "blue" },
  IN_PROGRESS: { icon: "construct-outline", tone: "amber" },
  COMPLETED: { icon: "checkbox", tone: "success" },
  CANCELLED: { icon: "close-circle-outline", tone: "inkMuted" },
}

const PRIORITY_GLYPH: Record<TaskPriority, { icon: string; tone: "danger" | "coral" | "amber" | "blue" }> = {
  URGENT: { icon: "alert-circle", tone: "danger" },
  HIGH: { icon: "chevron-up", tone: "coral" },
  MEDIUM: { icon: "reorder-two", tone: "amber" },
  LOW: { icon: "chevron-down", tone: "blue" },
}

function statusLabel(state: TaskState, copy: FriendlyCopy): string {
  return state === "CANCELLED" ? copy.cancelled : copy.status[state]
}

type Row =
  | { kind: "group"; group: "open" | "closed"; count: number; collapsed: boolean }
  | { kind: "task"; task: Task; closed: boolean }

export default function TasksScreen() {
  const colorScheme = useFieldColorScheme()
  const { t, i18n } = useTranslation()
  const copy = useMemo(() => copyFor(i18n.language), [i18n.language])
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const online = useSyncStatusStore((state) => state.online)
  // Two facts, not one: the request failed, and the radio is or is not on.
  const notice = cachedViewNotice({ online, requestFailed: offline })
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<TaskFilter>("ALL")
  const [order, setOrder] = useState<TaskOrder>("urgent")
  const [openCollapsed, setOpenCollapsed] = useState(false)
  const [closedCollapsed, setClosedCollapsed] = useState(true)
  const [statusTask, setStatusTask] = useState<Task | null>(null)
  const [orderSheet, setOrderSheet] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error" | "info"; title: string; message?: string }>({
    visible: false,
    type: "success",
    title: "",
  })
  const [notesVisible, setNotesVisible] = useState(false)
  const [pendingCompleteTask, setPendingCompleteTask] = useState<Task | null>(null)
  const [pendingSync, setPendingSync] = useState(0)

  // The order chosen last time stays on this phone.
  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY).then((value) => { if (isTaskOrder(value)) setOrder(value) }).catch(() => {})
  }, [])
  const chooseOrder = (next: TaskOrder) => {
    setOrder(next)
    setOrderSheet(false)
    AsyncStorage.setItem(ORDER_KEY, next).catch(() => {})
  }

  const refreshPending = useCallback(async (): Promise<number> => {
    try {
      const count = await countPendingTaskUpdates()
      setPendingSync(count)
      return count
    } catch {
      return 0
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.getTasks()
      if (response.success) {
        setTasks(response.data?.tasks || [])
        setOffline(false)
        setLoadError(false)
      } else {
        throw new Error("TASKS_LOAD_FAILED")
      }
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        const agent = useAuthStore.getState().agent
        if (agent) {
          try {
            const cached = await readOfflineTasks(agent.organizationId, agent.id)
            if (cached.length > 0) setTasks(cached)
          } catch {}
        }
        setOffline(true)
        setLoadError(true)
        console.warn("[TasksScreen] Failed to fetch tasks:", error.message)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useAutoRefresh(
    useCallback(() => {
      fetchTasks()
      refreshPending()
    }, [fetchTasks, refreshPending]),
  )

  const applyTaskStatus = async (
    task: Task,
    newStatus: TaskStatus,
    result: string | undefined,
    failureMessage: string,
  ) => {
    setUpdatingTaskId(task.id)
    setTasks((previous) => previous.map((item) => (
      item.id === task.id
        ? { ...item, status: newStatus, persistedStatus: newStatus, result: result ?? item.result }
        : item
    )))
    try {
      await queueTaskStatusUpdate(task.id, newStatus, result)
      const flush = await flushRouteFieldOutbox()
      const remaining = await refreshPending()
      if (flush.sent > 0 && remaining === 0) {
        await fetchTasks()
        const title = newStatus === "COMPLETED" ? copy.completedTitle : newStatus === "IN_PROGRESS" ? copy.startedTitle : copy.statusChanged
        setToast({ visible: true, type: "success", title, message: copy.serverSavedBody })
      } else {
        setToast({ visible: true, type: "info", title: copy.savedDeviceTitle, message: copy.savedDeviceBody })
      }
    } catch (error: any) {
      console.warn("[TasksScreen] queue-task error:", error?.message ?? error)
      setToast({ visible: true, type: "error", title: failureMessage })
      fetchTasks()
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    if (updatingTaskId || taskState(task) === newStatus) return
    if (newStatus === "COMPLETED") {
      setPendingCompleteTask(task)
      setNotesVisible(true)
      return
    }
    await applyTaskStatus(task, newStatus, undefined, copy.updateFailed)
  }

  const handleCompleteWithNotes = async (notes: string) => {
    if (!pendingCompleteTask || updatingTaskId) return
    const task = pendingCompleteTask
    setPendingCompleteTask(null)
    await applyTaskStatus(task, "COMPLETED", notes || undefined, copy.completeFailed)
  }

  const syncNow = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await flushRouteFieldOutbox()
      const remaining = await refreshPending()
      await fetchTasks()
      setToast({
        visible: true,
        type: remaining === 0 ? "success" : "info",
        title: remaining === 0 ? copy.syncedTitle : copy.stillPendingTitle,
        message: remaining === 0 ? copy.serverSavedBody : copy.savedDeviceBody,
      })
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") {
        setOffline(true)
        setToast({ visible: true, type: "error", title: copy.loadFailed })
      }
    } finally {
      setSyncing(false)
    }
  }

  const counts = useMemo(() => filterCounts(tasks), [tasks])
  const rows = useMemo<Row[]>(() => {
    const now = Date.now()
    const visible = filterTasks(tasks, filter)
    const open = orderOpenTasks(visible, order, now).map((task): Row => ({ kind: "task", task, closed: false }))
    const closed = orderClosedTasks(visible).map((task): Row => ({ kind: "task", task, closed: true }))
    if (visible.length === 0) return []
    if (filter === "COMPLETED") return closed
    if (filter !== "ALL") return open
    return [
      { kind: "group", group: "open", count: open.length, collapsed: openCollapsed },
      ...(openCollapsed ? [] : open),
      ...(closed.length > 0
        ? [{ kind: "group", group: "closed", count: closed.length, collapsed: closedCollapsed } as Row, ...(closedCollapsed ? [] : closed)]
        : []),
    ]
  }, [closedCollapsed, filter, openCollapsed, order, tasks])

  const openTask = (task: Task) => navigation.navigate("TaskDetail", { task })
  const refresh = () => {
    setRefreshing(true)
    fetchTasks()
    refreshPending()
  }

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "group") {
      return (
        <View style={styles.listCell}>
          <Pressable
            style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
            onPress={() => (item.group === "open" ? setOpenCollapsed((value) => !value) : setClosedCollapsed((value) => !value))}
            accessibilityRole="button"
            accessibilityState={{ expanded: !item.collapsed }}
            testID={`tasks-group-${item.group}`}
          >
            <Icon name={item.collapsed ? "chevron-forward" : "chevron-down"} size={18} color={fieldTheme.color.ink} />
            <Text style={styles.groupTitle}>{item.group === "open" ? copy.openGroup : copy.closedGroup}</Text>
            <View style={styles.groupCount}><Text style={styles.groupCountText}>{item.count}</Text></View>
          </Pressable>
        </View>
      )
    }
    return (
      <View style={styles.listCell}>
        <TaskRow
          task={item.task}
          closed={item.closed}
          copy={copy}
          language={i18n.language}
          busy={updatingTaskId === item.task.id}
          onOpen={() => openTask(item.task)}
          onStatus={() => setStatusTask(item.task)}
        />
      </View>
    )
  }

  // One list is the whole page, on the phone and on the tablet: the header,
  // the notices and the filter scroll with the tasks (no inner scroll).
  const listHeader = (
    <>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.headerCopy}>
            <View style={styles.headerTopRow}>
              <Text style={styles.headerTitle}>{copy.title}</Text>
              <NotificationBell />
            </View>
            <Text style={styles.headerSubtitle}>{copy.subtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyTop}>
        {offline ? (
          <Notice
            icon="cloud-offline-outline"
            title={t(CACHED_VIEW_NOTICE_KEYS[notice === "none" ? "stale" : notice])}
            body={tasks.length === 0 && loadError ? copy.loadFailed : copy.offlineBody}
            tone="amber"
            action={copy.retry}
            busy={refreshing}
            onAction={refresh}
          />
        ) : null}

        {pendingSync > 0 ? (
          <Notice
            icon="cloud-upload-outline"
            title={t("task.pendingSyncTemplate", { count: pendingSync })}
            body={copy.pendingBody}
            tone="blue"
            action={syncing ? copy.syncing : copy.syncNow}
            busy={syncing}
            onAction={syncNow}
          />
        ) : null}

        {/* A filter narrows the list; it does not hide where a task is: «Все» is the default. */}
        <View style={styles.filters} testID="tasks-filters">
          {TASK_FILTERS.map((value) => {
            const chosen = filter === value
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [styles.filterChip, chosen && styles.filterChipOn, pressed && styles.pressed]}
                onPress={() => setFilter(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                testID={`tasks-filter-${value}`}
              >
                <Text style={[styles.filterText, chosen && styles.filterTextOn]}>{copy.filters[value]}</Text>
                <Text style={styles.filterCount}>{counts[value]}</Text>
              </Pressable>
            )
          })}
        </View>
        <Pressable
          style={({ pressed }) => [styles.orderButton, pressed && styles.pressed]}
          onPress={() => setOrderSheet(true)}
          accessibilityRole="button"
          testID="tasks-order"
        >
          <Text style={styles.orderLabel}>{copy.orderLabel} </Text>
          <Text style={styles.orderValue}>{copy.orders[order]}</Text>
          <Icon name="chevron-down" size={16} color={fieldTheme.color.primaryStrong} />
        </Pressable>
      </View>
    </>
  )

  const statusOptions: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED"]
  const current = statusTask ? taskState(statusTask) : null

  return (
    <View style={styles.container}>
      <FlatList
        // Rows are drawn again when the phone switches day and night, and while a status is being saved.
        extraData={`${colorScheme}:${updatingTaskId ?? ""}`}
        data={loading && tasks.length === 0 ? [] : rows}
        keyExtractor={(row) => (row.kind === "group" ? `group:${row.group}` : row.task.id)}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.listCell}>
            {loading && tasks.length === 0 ? <LoadingState copy={copy} /> : <EmptyState copy={copy} filter={filter} onRetry={offline ? refresh : undefined} />}
          </View>
        }
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
      />
      <LightScreenStatusBar />
      <StatusBarBand tone="light" />

      <BottomSheet visible={statusTask !== null} onClose={() => setStatusTask(null)} closeLabel={copy.cancel} testID="tasks-status-sheet">
        <Text style={styles.sheetCaption}>{copy.statusTitle}</Text>
        {statusTask ? <Text style={styles.sheetTitle} numberOfLines={2}>{statusTask.title}</Text> : null}
        {statusOptions.map((status) => {
          const glyph = STATUS_GLYPH[status]
          const isCurrent = current === status
          return (
            <Pressable
              key={status}
              style={({ pressed }) => [styles.sheetOption, isCurrent && styles.sheetOptionOn, pressed && styles.pressed]}
              onPress={() => {
                const task = statusTask
                setStatusTask(null)
                if (task) void handleStatusChange(task, status)
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              testID={`tasks-status-${status}`}
            >
              <Icon name={glyph.icon} size={20} color={fieldTheme.color[glyph.tone]} />
              <View style={styles.sheetOptionCopy}>
                <Text style={styles.sheetOptionText}>{copy.status[status]}</Text>
                {status === "COMPLETED" && !isCurrent ? <Text style={styles.sheetOptionHint}>{copy.completeHint}</Text> : null}
              </View>
              {isCurrent ? <Text style={styles.sheetNow}>{copy.statusNow}</Text> : null}
            </Pressable>
          )
        })}
      </BottomSheet>

      <BottomSheet visible={orderSheet} onClose={() => setOrderSheet(false)} closeLabel={copy.cancel} testID="tasks-order-sheet">
        <Text style={styles.sheetTitle}>{copy.orderTitle}</Text>
        {TASK_ORDERS.map((value) => (
          <Pressable
            key={value}
            style={({ pressed }) => [styles.sheetOption, order === value && styles.sheetOptionOn, pressed && styles.pressed]}
            onPress={() => chooseOrder(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: order === value }}
            testID={`tasks-order-${value}`}
          >
            <Text style={styles.sheetOptionText}>{copy.orders[value]}</Text>
          </Pressable>
        ))}
      </BottomSheet>

      <CompletionModal
        visible={notesVisible}
        copy={copy}
        busy={!!pendingCompleteTask && updatingTaskId === pendingCompleteTask.id}
        onCancel={() => { setNotesVisible(false); setPendingCompleteTask(null) }}
        onSubmit={(notes) => { setNotesVisible(false); handleCompleteWithNotes(notes) }}
      />

      <FeedbackToast
        visible={toast.visible}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onDismiss={() => setToast((value) => ({ ...value, visible: false }))}
      />
    </View>
  )
}

function Notice({
  icon,
  title,
  body,
  tone,
  action,
  busy,
  onAction,
}: {
  icon: string
  title: string
  body: string
  tone: "amber" | "blue"
  action: string
  busy: boolean
  onAction: () => void
}) {
  const ink = tone === "amber" ? fieldTheme.color.amber : fieldTheme.color.blue
  return (
    <View style={[styles.notice, { borderLeftColor: ink }]}>
      <Icon name={icon} size={24} color={ink} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: ink }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
      <TouchableOpacity style={styles.noticeAction} onPress={onAction} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator size="small" color={ink} /> : <Text style={[styles.noticeActionText, { color: ink }]}>{action}</Text>}
      </TouchableOpacity>
    </View>
  )
}

function TaskRow({
  task,
  closed,
  copy,
  language,
  busy,
  onOpen,
  onStatus,
}: {
  task: Task
  closed: boolean
  copy: FriendlyCopy
  language: string
  busy: boolean
  onOpen: () => void
  onStatus: () => void
}) {
  const now = Date.now()
  const state = taskState(task)
  const glyph = STATUS_GLYPH[state]
  const priority = normalizedPriority(task.priority)
  const priorityCopy = copy.priority[priority]
  const priorityGlyph = PRIORITY_GLYPH[priority]
  const overdue = isOverdueTask(task, now)
  const returned = isReturnedTask(task)
  const customerName = task.customer?.name?.trim()
  return (
    <TouchableOpacity
      style={[styles.row, closed && styles.rowClosed]}
      activeOpacity={0.82}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      testID={`task-row-${task.id}`}
    >
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Icon name={priorityGlyph.icon} size={16} color={fieldTheme.color[priorityGlyph.tone]} accessibilityLabel={priorityCopy} style={styles.rowPriority} />
          <Text style={[styles.rowTitle, closed && styles.rowTitleClosed]} numberOfLines={3}>{task.title}</Text>
        </View>
        <Text style={[styles.rowDue, overdue && styles.rowDueLate]}>{dueText(task, copy, language, now)}</Text>
        {returned ? <Text style={styles.rowReturned} numberOfLines={2}>{copy.returned(task.returnReason?.trim() ?? "")}</Text> : null}
        {customerName ? <Text style={styles.rowCustomer} numberOfLines={1}>{customerName}</Text> : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.statusChip, closed && styles.statusChipClosed, pressed && styles.pressed]}
        onPress={onStatus}
        disabled={closed || busy}
        accessibilityRole="button"
        accessibilityLabel={`${copy.statusTitle}: ${statusLabel(state, copy)}`}
        accessibilityState={{ disabled: closed || busy }}
        testID={`task-status-${task.id}`}
      >
        {busy ? <ActivityIndicator size="small" color={fieldTheme.color.primary} /> : <Icon name={glyph.icon} size={16} color={fieldTheme.color[glyph.tone]} />}
        <Text style={styles.statusText} numberOfLines={1}>{statusLabel(state, copy)}</Text>
        {closed ? null : <Icon name="chevron-down" size={14} color={fieldTheme.color.inkMuted} />}
      </Pressable>
    </TouchableOpacity>
  )
}

function BottomSheet({ visible, onClose, closeLabel, testID, children }: {
  visible: boolean
  onClose: () => void
  closeLabel: string
  testID: string
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + fieldTheme.space.lg }]} testID={testID}>
          <View style={styles.sheetGrab} />
          {children}
        </View>
      </View>
    </Modal>
  )
}

function EmptyState({ copy, filter, onRetry }: { copy: FriendlyCopy; filter: TaskFilter; onRetry?: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={filter === "COMPLETED" ? "checkmark-done-outline" : "list-outline"} size={30} color={fieldTheme.color.primaryStrong} />
      </View>
      <Text style={styles.emptyTitle}>{copy.emptyTitle[filter]}</Text>
      <Text style={styles.emptyBody}>{copy.emptyBody[filter]}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.emptyButton} onPress={onRetry} accessibilityRole="button">
          <Icon name="refresh" size={18} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.emptyButtonText}>{copy.retry}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function LoadingState({ copy }: { copy: FriendlyCopy }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={fieldTheme.color.primary} />
      <Text style={styles.loadingTitle}>{copy.loading}</Text>
      <Text style={styles.loadingBody}>{copy.loadingBody}</Text>
    </View>
  )
}

function CompletionModal({
  visible,
  copy,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  copy: FriendlyCopy
  busy: boolean
  onCancel: () => void
  onSubmit: (notes: string) => void
}) {
  const [notes, setNotes] = useState("")
  const cancel = () => { setNotes(""); onCancel() }
  const submit = () => { const value = notes.trim(); setNotes(""); onSubmit(value) }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}><Icon name="checkmark-done" size={25} color={fieldTheme.color.primaryStrong} /></View>
          <Text style={styles.modalTitle}>{copy.completeTitle}</Text>
          <Text style={styles.modalBody}>{copy.completeBody}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            style={styles.notesInput}
            placeholder={copy.notesPlaceholder}
            placeholderTextColor={fieldTheme.color.inkMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={cancel} disabled={busy} accessibilityRole="button">
              <Text style={styles.modalCancelText}>{copy.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalSubmitButton, busy && styles.disabled]} onPress={submit} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Icon name="checkmark" size={19} color={fieldTheme.color.onColor} />}
              <Text style={styles.modalSubmitText}>{copy.completeTask}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  // White like every tab's header (owner-approved colours, 2026-10-18).
  header: { backgroundColor: fieldTheme.color.surface, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, paddingBottom: fieldTheme.space.lg, paddingHorizontal: fieldTheme.space.lg },
  headerInner: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  // Not `flex: 1`: on the phone the header is a column with no height of its
  // own, and a zero flex basis there collapses the title block to 0 px — the
  // phone showed an empty green band with the title missing (2026-09-14).
  headerCopy: { flexGrow: 1, flexShrink: 1 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md, marginTop: fieldTheme.space.sm },
  headerTitle: { flexShrink: 1, color: fieldTheme.color.ink, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  headerSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs, maxWidth: 620 },
  // No flex: 1 — inside the list's content a zero flex basis is 0 px.
  bodyTop: { width: "100%", maxWidth: 1280, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, paddingBottom: fieldTheme.space.sm },
  // One column on the phone and on the tablet: a list of rows, like the boards' list.
  listCell: { width: "100%", maxWidth: 1280, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg },
  pressed: { opacity: 0.72 },
  // A notice is white with a coloured left edge (owner-approved colours, 2026-10-18).
  notice: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginBottom: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.md },
  noticeCopy: { flex: 1 },
  noticeTitle: { fontSize: 14, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17, marginTop: 2 },
  noticeAction: { minHeight: 44, minWidth: 88, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center" },
  noticeActionText: { fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  // A chosen filter is outlined dark, never filled (owner-approved colours, 2026-10-18).
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterChip: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, paddingHorizontal: 12 },
  filterChipOn: { borderWidth: 2, borderColor: fieldTheme.color.primaryStrong },
  filterText: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "700" },
  filterTextOn: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  filterCount: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  orderButton: { minHeight: 40, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2, marginTop: 4 },
  orderLabel: { color: fieldTheme.color.inkMuted, fontSize: 13 },
  orderValue: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "800" },
  groupHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingTop: fieldTheme.space.sm },
  groupTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  groupCount: { minWidth: 26, borderRadius: 6, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, paddingHorizontal: 6, paddingVertical: 1, alignItems: "center" },
  groupCountText: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, paddingVertical: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, marginBottom: 6 },
  rowClosed: { opacity: 0.62 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  rowPriority: { marginTop: 2 },
  rowTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  rowTitleClosed: { fontWeight: "600" },
  rowDue: { color: fieldTheme.color.inkMuted, fontSize: 12.5, lineHeight: 17, marginTop: 3, marginLeft: 22 },
  rowDueLate: { color: fieldTheme.color.danger, fontWeight: "800" },
  rowReturned: { color: fieldTheme.color.amber, fontSize: 12.5, lineHeight: 17, fontWeight: "800", marginTop: 2, marginLeft: 22 },
  rowCustomer: { color: fieldTheme.color.inkMuted, fontSize: 12.5, lineHeight: 17, marginTop: 1, marginLeft: 22 },
  // The status is the colour of its mark and words on white, not a tinted pill.
  statusChip: { minHeight: 40, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, paddingHorizontal: 9 },
  statusChipClosed: { borderColor: fieldTheme.color.surface },
  statusText: { flexShrink: 1, color: fieldTheme.color.ink, fontSize: 12.5, fontWeight: "800" },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: fieldTheme.color.scrim },
  sheet: { backgroundColor: fieldTheme.color.surface, borderTopLeftRadius: fieldTheme.radius.lg, borderTopRightRadius: fieldTheme.radius.lg, paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.sm },
  sheetGrab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: fieldTheme.color.border, marginBottom: fieldTheme.space.md },
  sheetCaption: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "800" },
  sheetTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", marginTop: 2, marginBottom: 4 },
  sheetOption: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1.5, borderColor: fieldTheme.color.border, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  sheetOptionOn: { borderWidth: 2, borderColor: fieldTheme.color.primaryStrong },
  sheetOptionCopy: { flex: 1 },
  sheetOptionText: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  sheetOptionHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  sheetNow: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  emptyState: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center", marginBottom: fieldTheme.space.lg },
  // Stretched, not sized to its own measurement: centred heavy text measured
  // itself one word short on the phone and «Yeni tapşırıq yoxdur» lost «yoxdur».
  emptyTitle: { alignSelf: "stretch", color: fieldTheme.color.ink, fontSize: 18, lineHeight: 23, fontWeight: "900", textAlign: "center" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 360, marginTop: fieldTheme.space.sm },
  emptyButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.lg, marginTop: fieldTheme.space.lg },
  emptyButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  loadingTitle: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900", marginTop: fieldTheme.space.lg },
  loadingBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: fieldTheme.space.xs },
  modalOverlay: { flex: 1, backgroundColor: fieldTheme.color.scrim, justifyContent: "center", padding: fieldTheme.space.xl },
  modalCard: { width: "100%", maxWidth: 620, alignSelf: "center", borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  modalIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center", marginBottom: fieldTheme.space.lg },
  modalTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  modalBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.sm },
  notesInput: { minHeight: 112, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, padding: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  modalActions: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  modalCancelButton: { minHeight: 48, minWidth: 104, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  modalCancelText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "900" },
  modalSubmitButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.md },
  modalSubmitText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900", textAlign: "center", flexShrink: 1 },
}))
