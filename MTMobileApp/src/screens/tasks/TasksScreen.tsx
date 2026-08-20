import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { readOfflineTasks } from "../../services/offline-reads"
import { flushOutbox } from "../../services/outbox"
import { countPendingTaskUpdates, queueTaskStatusUpdate } from "../../services/task-outbox"
import { useAuthStore } from "../../store/auth"
import { isManagerRole } from "../../auth/roles"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import FeedbackToast from "../../components/FeedbackToast"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth } from "../../theme/layoutBreakpoints"

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED"
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  dueDate?: string | null
  result?: string | null
  progress?: number | null
  agentId?: string | null
  customer?: { name?: string | null; address?: string | null } | null
}

interface FriendlyCopy {
  title: string
  subtitle: string
  managerSubtitle: string
  focus: string
  focusActive: string
  focusOverdue: string
  focusToday: string
  focusCalm: string
  focusDone: string
  showRecommended: string
  selectTasks: string
  selectHint: string
  reassign: string
  reassignTitle: string
  reassignSearch: string
  noAgents: string
  needsInternet: string
  cancel: string
  selected: (count: number) => string
  status: Record<TaskStatus, string>
  loading: string
  loadingBody: string
  emptyTitle: Record<TaskStatus, string>
  emptyBody: Record<TaskStatus, string>
  retry: string
  offlineTitle: string
  offlineBody: string
  pendingTitle: (count: number) => string
  pendingBody: string
  syncNow: string
  syncing: string
  syncedTitle: string
  stillPendingTitle: string
  savedDeviceTitle: string
  savedDeviceBody: string
  serverSavedBody: string
  refreshedAt: (time: string) => string
  priority: Record<TaskPriority, { name: string; hint: string }>
  due: string
  noDue: string
  overdueDays: (days: number) => string
  dueToday: string
  dueTomorrow: string
  dueDays: (days: number) => string
  start: string
  starting: string
  startedTitle: string
  complete: string
  completing: string
  completedTitle: string
  openDetails: string
  detailTitle: string
  description: string
  noDescription: string
  customer: string
  noCustomer: string
  syncState: string
  syncPending: string
  syncSaved: string
  result: string
  progress: string
  completeTitle: string
  completeBody: string
  notesPlaceholder: string
  completeTask: string
  loadFailed: string
  updateFailed: string
  completeFailed: string
  reassignDone: (count: number) => string
  reassignFailed: string
  pickAgentFailed: string
}

const COPY: Record<"ru" | "az" | "en", FriendlyCopy> = {
  ru: {
    title: "Задачи",
    subtitle: "Сначала — то, что нужно сделать сейчас",
    managerSubtitle: "Выберите задачи, чтобы открыть или передать сотруднику",
    focus: "Что делать сейчас",
    focusActive: "Сначала завершите уже начатую задачу.",
    focusOverdue: "Начните с просроченной задачи — она стоит первой.",
    focusToday: "Сначала выполните задачу со сроком сегодня.",
    focusCalm: "Просроченных задач нет. Выполняйте список сверху вниз.",
    focusDone: "Все задачи завершены. Новая задача появится здесь автоматически.",
    showRecommended: "Показать",
    selectTasks: "Передать задачи",
    selectHint: "Нажмите на нужные задачи, затем выберите сотрудника.",
    reassign: "Выбрать сотрудника",
    reassignTitle: "Кому передать задачи?",
    reassignSearch: "Имя сотрудника",
    noAgents: "Доступных сотрудников нет.",
    needsInternet: "Для передачи задач нужен интернет.",
    cancel: "Отмена",
    selected: (count) => `Выбрано: ${count}`,
    status: { PENDING: "1 · К выполнению", IN_PROGRESS: "2 · В работе", COMPLETED: "3 · Готово" },
    loading: "Загружаю задачи…",
    loadingBody: "Проверяю актуальный список на сервере.",
    emptyTitle: { PENDING: "Новых задач нет", IN_PROGRESS: "Нет задач в работе", COMPLETED: "Завершённых задач пока нет" },
    emptyBody: { PENDING: "Когда появится новая задача, она будет здесь.", IN_PROGRESS: "Откройте вкладку «К выполнению» и начните задачу.", COMPLETED: "Завершённые задачи появятся здесь вместе с результатом." },
    retry: "Повторить",
    offlineTitle: "Сейчас нет связи",
    offlineBody: "Показана последняя сохранённая копия. Изменения останутся на устройстве.",
    pendingTitle: (count) => `Ждут отправки: ${count}`,
    pendingBody: "Изменения сохранены на устройстве и уйдут на сервер после подключения.",
    syncNow: "Синхронизировать",
    syncing: "Отправляю…",
    syncedTitle: "Все изменения отправлены",
    stillPendingTitle: "Изменения пока на устройстве",
    savedDeviceTitle: "Сохранено на устройстве",
    savedDeviceBody: "Отправим изменение на сервер, когда появится интернет.",
    serverSavedBody: "Изменение подтверждено сервером.",
    refreshedAt: (time) => `Обновлено в ${time}`,
    priority: {
      LOW: { name: "Обычная", hint: "можно выполнить после более срочных" },
      MEDIUM: { name: "Важная", hint: "выполните в указанный срок" },
      HIGH: { name: "Высокая", hint: "не откладывайте" },
      URGENT: { name: "Срочная", hint: "выполните первой" },
    },
    due: "Срок",
    noDue: "Срок не указан",
    overdueDays: (days) => `Просрочено на ${days} дн.`,
    dueToday: "Срок сегодня",
    dueTomorrow: "Срок завтра",
    dueDays: (days) => `До срока ${days} дн.`,
    start: "Начать задачу",
    starting: "Начинаю…",
    startedTitle: "Задача начата",
    complete: "Завершить задачу",
    completing: "Завершаю…",
    completedTitle: "Задача завершена",
    openDetails: "Детали и файлы",
    detailTitle: "Выбранная задача",
    description: "Что нужно сделать",
    noDescription: "Описание не добавлено. Уточните детали у руководителя.",
    customer: "Клиент",
    noCustomer: "Клиент не указан",
    syncState: "Сохранение",
    syncPending: "Есть изменения, ожидающие отправки",
    syncSaved: "Данные получены с сервера",
    result: "Результат",
    progress: "Выполнено",
    completeTitle: "Результат задачи",
    completeBody: "Коротко напишите, что сделано. Заметка необязательна.",
    notesPlaceholder: "Например: согласовано, документы отправлены",
    completeTask: "Сохранить и завершить",
    loadFailed: "Не удалось обновить задачи. Проверьте интернет и повторите.",
    updateFailed: "Не удалось изменить статус задачи.",
    completeFailed: "Не удалось завершить задачу.",
    reassignDone: (count) => `Передано задач: ${count}`,
    reassignFailed: "Не удалось передать задачи.",
    pickAgentFailed: "Не удалось загрузить сотрудников. Повторите при стабильном интернете.",
  },
  az: {
    title: "Tapşırıqlar",
    subtitle: "Əvvəlcə indi görülməli işi edin",
    managerSubtitle: "Tapşırığı açmaq və ya əməkdaşa ötürmək üçün seçin",
    focus: "İndi nə etməli",
    focusActive: "Əvvəlcə başladığınız tapşırığı bitirin.",
    focusOverdue: "Gecikmiş tapşırıqdan başlayın — siyahıda birincidir.",
    focusToday: "Əvvəlcə son tarixi bu gün olan tapşırığı edin.",
    focusCalm: "Gecikmiş tapşırıq yoxdur. Siyahını yuxarıdan aşağı icra edin.",
    focusDone: "Bütün tapşırıqlar tamamlanıb. Yeni tapşırıq burada avtomatik görünəcək.",
    showRecommended: "Göstər",
    selectTasks: "Tapşırıqları ötür",
    selectHint: "Lazım olan tapşırıqları seçin, sonra əməkdaşı göstərin.",
    reassign: "Əməkdaş seç",
    reassignTitle: "Tapşırıqlar kimə ötürülsün?",
    reassignSearch: "Əməkdaşın adı",
    noAgents: "Uyğun əməkdaş yoxdur.",
    needsInternet: "Tapşırıqları ötürmək üçün internet lazımdır.",
    cancel: "Ləğv et",
    selected: (count) => `Seçilib: ${count}`,
    status: { PENDING: "1 · Görüləcək", IN_PROGRESS: "2 · İcrada", COMPLETED: "3 · Tamam" },
    loading: "Tapşırıqlar yüklənir…",
    loadingBody: "Serverdəki son siyahı yoxlanılır.",
    emptyTitle: { PENDING: "Yeni tapşırıq yoxdur", IN_PROGRESS: "İcrada tapşırıq yoxdur", COMPLETED: "Tamamlanmış tapşırıq yoxdur" },
    emptyBody: { PENDING: "Yeni tapşırıq gələndə burada görünəcək.", IN_PROGRESS: "«Görüləcək» bölməsindən tapşırıq başladın.", COMPLETED: "Tamamlanan tapşırıqlar nəticə ilə burada görünəcək." },
    retry: "Yenidən yoxla",
    offlineTitle: "Hazırda bağlantı yoxdur",
    offlineBody: "Son saxlanmış nüsxə göstərilir. Dəyişikliklər cihazda qalacaq.",
    pendingTitle: (count) => `Göndərilmə gözləyir: ${count}`,
    pendingBody: "Dəyişikliklər cihazda saxlanıb və internet gələndə serverə göndəriləcək.",
    syncNow: "Sinxronlaşdır",
    syncing: "Göndərilir…",
    syncedTitle: "Bütün dəyişikliklər göndərildi",
    stillPendingTitle: "Dəyişikliklər hələ cihazdadır",
    savedDeviceTitle: "Cihazda saxlanıldı",
    savedDeviceBody: "İnternet gələndə dəyişiklik serverə göndəriləcək.",
    serverSavedBody: "Dəyişiklik server tərəfindən təsdiqləndi.",
    refreshedAt: (time) => `Yeniləndi: ${time}`,
    priority: {
      LOW: { name: "Adi", hint: "daha vacib işlərdən sonra edilə bilər" },
      MEDIUM: { name: "Vacib", hint: "göstərilən tarixədək edin" },
      HIGH: { name: "Yüksək", hint: "təxirə salmayın" },
      URGENT: { name: "Təcili", hint: "birinci bunu edin" },
    },
    due: "Son tarix",
    noDue: "Son tarix göstərilməyib",
    overdueDays: (days) => `${days} gün gecikib`,
    dueToday: "Son tarix bu gündür",
    dueTomorrow: "Son tarix sabahdır",
    dueDays: (days) => `Son tarixə ${days} gün`,
    start: "Tapşırığı başla",
    starting: "Başladılır…",
    startedTitle: "Tapşırıq başladıldı",
    complete: "Tapşırığı tamamla",
    completing: "Tamamlanır…",
    completedTitle: "Tapşırıq tamamlandı",
    openDetails: "Təfərrüat və fayllar",
    detailTitle: "Seçilmiş tapşırıq",
    description: "Nə etmək lazımdır",
    noDescription: "Təsvir əlavə edilməyib. Təfərrüatları rəhbərdən dəqiqləşdirin.",
    customer: "Müştəri",
    noCustomer: "Müştəri göstərilməyib",
    syncState: "Yadda saxlama",
    syncPending: "Göndərilməyi gözləyən dəyişiklik var",
    syncSaved: "Məlumat serverdən alınıb",
    result: "Nəticə",
    progress: "İrəliləyiş",
    completeTitle: "Tapşırığın nəticəsi",
    completeBody: "Görülən işi qısa yazın. Qeyd məcburi deyil.",
    notesPlaceholder: "Məsələn: razılaşdırıldı, sənədlər göndərildi",
    completeTask: "Yadda saxla və tamamla",
    loadFailed: "Tapşırıqlar yenilənmədi. İnterneti yoxlayıb yenidən cəhd edin.",
    updateFailed: "Tapşırığın statusu dəyişmədi.",
    completeFailed: "Tapşırığı tamamlamaq mümkün olmadı.",
    reassignDone: (count) => `${count} tapşırıq ötürüldü`,
    reassignFailed: "Tapşırıqları ötürmək mümkün olmadı.",
    pickAgentFailed: "Əməkdaşlar yüklənmədi. Sabit internetlə yenidən cəhd edin.",
  },
  en: {
    title: "Tasks",
    subtitle: "Start with what needs doing now",
    managerSubtitle: "Choose a task to open it or pass it to a team member",
    focus: "What to do now",
    focusActive: "Finish the task you already started first.",
    focusOverdue: "Start with the overdue task at the top of the list.",
    focusToday: "Start with the task due today.",
    focusCalm: "Nothing is overdue. Work down the list from the top.",
    focusDone: "All tasks are complete. A new task will appear here automatically.",
    showRecommended: "Show me",
    selectTasks: "Pass tasks on",
    selectHint: "Tap the tasks you need, then choose a team member.",
    reassign: "Choose team member",
    reassignTitle: "Who should receive these tasks?",
    reassignSearch: "Team member name",
    noAgents: "No available team members.",
    needsInternet: "You need an internet connection to pass tasks on.",
    cancel: "Cancel",
    selected: (count) => `Selected: ${count}`,
    status: { PENDING: "1 · To do", IN_PROGRESS: "2 · In progress", COMPLETED: "3 · Done" },
    loading: "Loading tasks…",
    loadingBody: "Checking the latest list on the server.",
    emptyTitle: { PENDING: "No new tasks", IN_PROGRESS: "No tasks in progress", COMPLETED: "No completed tasks yet" },
    emptyBody: { PENDING: "A new task will appear here when it is assigned.", IN_PROGRESS: "Open “To do” and start a task.", COMPLETED: "Completed tasks will appear here with their result." },
    retry: "Try again",
    offlineTitle: "You are offline",
    offlineBody: "This is the last saved copy. Your changes will stay on this device.",
    pendingTitle: (count) => `Waiting to send: ${count}`,
    pendingBody: "Changes are saved on this device and will reach the server when you reconnect.",
    syncNow: "Sync now",
    syncing: "Sending…",
    syncedTitle: "All changes sent",
    stillPendingTitle: "Changes are still on this device",
    savedDeviceTitle: "Saved on this device",
    savedDeviceBody: "We will send the change to the server when you reconnect.",
    serverSavedBody: "The server confirmed this change.",
    refreshedAt: (time) => `Updated at ${time}`,
    priority: {
      LOW: { name: "Routine", hint: "do this after more urgent work" },
      MEDIUM: { name: "Important", hint: "finish by the due date" },
      HIGH: { name: "High", hint: "do not put this off" },
      URGENT: { name: "Urgent", hint: "do this first" },
    },
    due: "Due",
    noDue: "No due date",
    overdueDays: (days) => `${days} day${days === 1 ? "" : "s"} overdue`,
    dueToday: "Due today",
    dueTomorrow: "Due tomorrow",
    dueDays: (days) => `${days} day${days === 1 ? "" : "s"} left`,
    start: "Start task",
    starting: "Starting…",
    startedTitle: "Task started",
    complete: "Complete task",
    completing: "Completing…",
    completedTitle: "Task completed",
    openDetails: "Details & files",
    detailTitle: "Selected task",
    description: "What to do",
    noDescription: "No description was added. Ask your manager for the details.",
    customer: "Client",
    noCustomer: "No client selected",
    syncState: "Saving",
    syncPending: "Some changes are waiting to send",
    syncSaved: "Data received from the server",
    result: "Result",
    progress: "Progress",
    completeTitle: "Task result",
    completeBody: "Briefly say what you did. The note is optional.",
    notesPlaceholder: "For example: approved, documents sent",
    completeTask: "Save and complete",
    loadFailed: "We could not refresh tasks. Check your connection and try again.",
    updateFailed: "We could not change the task status.",
    completeFailed: "We could not complete the task.",
    reassignDone: (count) => `${count} task${count === 1 ? "" : "s"} passed on`,
    reassignFailed: "We could not pass these tasks on.",
    pickAgentFailed: "We could not load team members. Try again with a stable connection.",
  },
}

const STATUS_TABS: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED"]

function copyFor(language: string): FriendlyCopy {
  if (language.toLowerCase().startsWith("az")) return COPY.az
  if (language.toLowerCase().startsWith("ru")) return COPY.ru
  return COPY.en
}

function normalizedPriority(priority?: string): TaskPriority {
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

function isOverdue(task: Task): boolean {
  const days = daysFromToday(task.dueDate)
  return days !== null && days < 0 && task.status !== "COMPLETED"
}

function dueText(task: Task, copy: FriendlyCopy, language: string): string {
  const days = daysFromToday(task.dueDate)
  if (days === null) return copy.noDue
  if (task.status === "COMPLETED") {
    return new Date(task.dueDate as string).toLocaleDateString(language, { day: "numeric", month: "short" })
  }
  if (days < 0) return copy.overdueDays(Math.abs(days))
  if (days === 0) return copy.dueToday
  if (days === 1) return copy.dueTomorrow
  if (days <= 7) return copy.dueDays(days)
  return new Date(task.dueDate as string).toLocaleDateString(language, { day: "numeric", month: "short" })
}

function taskRank(task: Task): number {
  const days = daysFromToday(task.dueDate)
  const priority = normalizedPriority(task.priority)
  const priorityRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[priority]
  const dateRank = days === null ? 2_500 : Math.max(0, Math.min(days, 100)) * 20
  if (days !== null && days < 0) return -20_000 + priorityRank * 1_000 + days
  return priorityRank * 4_000 + dateRank
}

function taskProgress(task: Task): number | null {
  if (typeof task.progress !== "number" || !Number.isFinite(task.progress)) return null
  return Math.min(100, Math.max(0, Math.round(task.progress)))
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => taskRank(a) - taskRank(b) || a.title.localeCompare(b.title))
}

function priorityVisual(priority?: string) {
  switch (normalizedPriority(priority)) {
    case "URGENT":
      return { ink: fieldTheme.color.danger, fill: fieldTheme.color.dangerSoft, icon: "alert-circle-outline" }
    case "HIGH":
      return { ink: fieldTheme.color.coral, fill: fieldTheme.color.coralSoft, icon: "arrow-up-circle-outline" }
    case "LOW":
      return { ink: fieldTheme.color.success, fill: fieldTheme.color.successSoft, icon: "time-outline" }
    default:
      return { ink: fieldTheme.color.amber, fill: fieldTheme.color.amberSoft, icon: "flag-outline" }
  }
}

export default function TasksScreen() {
  const { i18n } = useTranslation()
  const copy = useMemo(() => copyFor(i18n.language), [i18n.language])
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tablet = isExpandedTabletWidth(width)
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<TaskStatus>("PENDING")
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error" | "info"; title: string; message?: string }>({
    visible: false,
    type: "success",
    title: "",
  })
  const [notesVisible, setNotesVisible] = useState(false)
  const [pendingCompleteTask, setPendingCompleteTask] = useState<Task | null>(null)
  const [pendingSync, setPendingSync] = useState(0)
  const isManager = isManagerRole(useAuthStore((state) => state.agent?.role))
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pickerVisible, setPickerVisible] = useState(false)
  const [team, setTeam] = useState<Array<{ id: string; name: string; role?: string }>>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

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
        setLastUpdatedAt(new Date())
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
    setTasks((previous) => previous.map((item) => (item.id === task.id ? { ...item, status: newStatus, result: result ?? item.result } : item)))
    try {
      await queueTaskStatusUpdate(task.id, newStatus, result)
      const flush = await flushOutbox((operations) => api.syncPush(operations))
      const remaining = await refreshPending()
      if (flush.sent > 0 && remaining === 0) {
        await fetchTasks()
        setToast({ visible: true, type: "success", title: newStatus === "COMPLETED" ? copy.completedTitle : copy.startedTitle, message: copy.serverSavedBody })
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
    if (updatingTaskId) return
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
      await flushOutbox((operations) => api.syncPush(operations))
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

  const toggleSelect = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelect = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const openReassign = async () => {
    if (selectedIds.size === 0) return
    if (offline) {
      setToast({ visible: true, type: "error", title: copy.needsInternet })
      return
    }
    setPickerVisible(true)
    setTeamLoading(true)
    try {
      const response = await api.getManagerTeam()
      setTeam((response?.data?.agents || []).map((agent: any) => ({ id: agent.id, name: agent.name, role: agent.role })))
    } catch (error: any) {
      setTeam([])
      setPickerVisible(false)
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: copy.pickAgentFailed })
    } finally {
      setTeamLoading(false)
    }
  }

  const doReassign = async (agentId: string) => {
    if (bulkBusy) return
    setBulkBusy(true)
    const ids = Array.from(selectedIds)
    try {
      const response = await api.bulkReassignTasks(ids, agentId)
      if (response?.success) {
        const count = response.data?.reassigned ?? ids.length
        setPickerVisible(false)
        exitSelect()
        setToast({ visible: true, type: "success", title: copy.reassignDone(count), message: copy.serverSavedBody })
        await fetchTasks()
      } else {
        setPickerVisible(false)
        setToast({ visible: true, type: "error", title: copy.reassignFailed })
      }
    } catch (error: any) {
      setPickerVisible(false)
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: copy.reassignFailed })
    } finally {
      setBulkBusy(false)
    }
  }

  const filtered = useMemo(
    () => sortTasks(tasks.filter((task) => task.status === activeTab)),
    [activeTab, tasks],
  )
  const focusedTask = filtered.find((task) => task.id === focusedTaskId) ?? filtered[0] ?? null
  const overdueCount = tasks.filter(isOverdue).length
  const dueTodayCount = tasks.filter((task) => daysFromToday(task.dueDate) === 0 && task.status !== "COMPLETED").length
  const inProgressCount = tasks.filter((task) => task.status === "IN_PROGRESS").length
  const pendingCount = tasks.filter((task) => task.status === "PENDING").length
  const recommendedTab: TaskStatus | null = inProgressCount > 0 ? "IN_PROGRESS" : pendingCount > 0 ? "PENDING" : null
  const focusMessage = inProgressCount > 0
    ? copy.focusActive
    : overdueCount > 0
      ? copy.focusOverdue
      : dueTodayCount > 0
        ? copy.focusToday
        : pendingCount > 0
          ? copy.focusCalm
          : copy.focusDone

  useEffect(() => {
    if (!filtered.some((task) => task.id === focusedTaskId)) setFocusedTaskId(filtered[0]?.id ?? null)
  }, [filtered, focusedTaskId])

  const openTask = (task: Task) => navigation.navigate("TaskDetail", { task })
  const refresh = () => {
    setRefreshing(true)
    fetchTasks()
    refreshPending()
  }

  const renderTask = ({ item, index }: { item: Task; index: number }) => (
    <TaskCard
      task={item}
      copy={copy}
      language={i18n.language}
      tablet={tablet}
      focus={index === 0 && activeTab !== "COMPLETED"}
      selected={selectMode ? selectedIds.has(item.id) : tablet && focusedTask?.id === item.id}
      selectMode={selectMode}
      busy={updatingTaskId === item.id}
      onPress={() => {
        if (selectMode) toggleSelect(item.id)
        else if (tablet) setFocusedTaskId(item.id)
        else openTask(item)
      }}
      onLongPress={isManager && !selectMode ? () => { setSelectMode(true); setSelectedIds(new Set([item.id])) } : undefined}
      onOpen={() => openTask(item)}
      onStatus={(status) => handleStatusChange(item, status)}
    />
  )

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={[styles.headerInner, !tablet && styles.headerInnerPhone]}>
          <View style={styles.headerCopy}>
            <View style={styles.eyebrowRow}>
              <Icon name="checkmark-done-outline" size={18} color={fieldTheme.color.primarySoft} />
              <Text style={styles.eyebrow}>{copy.focus}</Text>
            </View>
            <Text style={styles.headerTitle}>{copy.title}</Text>
            <Text style={styles.headerSubtitle}>{isManager ? copy.managerSubtitle : copy.subtitle}</Text>
          </View>
          {isManager ? (
            <TouchableOpacity
              style={[styles.managerButton, !tablet && styles.managerButtonPhone, selectMode && styles.managerButtonActive]}
              onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}
              accessibilityRole="button"
              accessibilityLabel={selectMode ? copy.cancel : copy.selectTasks}
            >
              <Icon name={selectMode ? "close" : "swap-horizontal-outline"} size={20} color={fieldTheme.color.onColor} />
              <Text style={styles.managerButtonText}>{selectMode ? copy.cancel : copy.selectTasks}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        {!selectMode ? (
          <TouchableOpacity
            style={styles.focusStrip}
            activeOpacity={recommendedTab ? 0.82 : 1}
            disabled={!recommendedTab}
            onPress={() => recommendedTab && setActiveTab(recommendedTab)}
            accessibilityRole={recommendedTab ? "button" : undefined}
            accessibilityLabel={recommendedTab ? copy.showRecommended : undefined}
          >
            <View style={styles.focusIcon}>
              <Icon name="navigate-outline" size={22} color={fieldTheme.color.primaryStrong} />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.focusLabel}>{copy.focus}</Text>
              <Text style={styles.focusMessage}>{focusMessage}</Text>
              {lastUpdatedAt && !offline && !tablet ? (
                <Text style={styles.freshnessInline}>{copy.refreshedAt(lastUpdatedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }))}</Text>
              ) : null}
            </View>
            {lastUpdatedAt && !offline && tablet ? (
              <Text style={styles.freshness}>{copy.refreshedAt(lastUpdatedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }))}</Text>
            ) : null}
            {recommendedTab ? (
              <View style={[styles.focusAction, !tablet && styles.focusActionPhone]}>
                <Text style={styles.focusActionText}>{copy.showRecommended}</Text>
                <Icon name="arrow-forward" size={18} color={fieldTheme.color.primaryStrong} />
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {offline ? (
          <Notice
            icon="cloud-offline-outline"
            title={copy.offlineTitle}
            body={tasks.length === 0 && loadError ? copy.loadFailed : copy.offlineBody}
            tone="amber"
            action={copy.retry}
            busy={refreshing}
            stacked={!tablet}
            onAction={refresh}
          />
        ) : null}

        {pendingSync > 0 ? (
          <Notice
            icon="cloud-upload-outline"
            title={copy.pendingTitle(pendingSync)}
            body={copy.pendingBody}
            tone="blue"
            action={syncing ? copy.syncing : copy.syncNow}
            busy={syncing}
            stacked={!tablet}
            onAction={syncNow}
          />
        ) : null}

        {selectMode ? (
          <View style={[styles.selectionBar, !tablet && styles.selectionBarPhone]}>
            <View style={styles.selectionGuide}>
              <Icon name="checkbox-outline" size={22} color={fieldTheme.color.primaryStrong} />
              <View style={styles.noticeCopy}>
                <Text style={styles.selectionCount}>{copy.selected(selectedIds.size)}</Text>
                <Text style={styles.selectionHint}>{offline ? copy.needsInternet : copy.selectHint}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.reassignButton, !tablet && styles.reassignButtonPhone, (selectedIds.size === 0 || offline) && styles.disabled]}
              disabled={selectedIds.size === 0 || offline}
              onPress={openReassign}
              accessibilityRole="button"
              accessibilityLabel={copy.reassign}
            >
              <Icon name="person-add-outline" size={19} color={fieldTheme.color.onColor} />
              <Text style={styles.reassignButtonText}>{copy.reassign}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.tabs}>
          {STATUS_TABS.map((status) => {
            const count = tasks.filter((task) => task.status === status).length
            const active = activeTab === status
            return (
              <TouchableOpacity
                key={status}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => { setActiveTab(status); if (selectMode) setSelectedIds(new Set()) }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={2}>{copy.status[status]}</Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {loading && tasks.length === 0 ? (
          <LoadingState copy={copy} />
        ) : tablet ? (
          <View style={styles.tabletWorkspace}>
            <FlatList
              data={filtered}
              keyExtractor={(task) => task.id}
              renderItem={renderTask}
              style={styles.tabletList}
              contentContainerStyle={styles.tabletListContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
              ListEmptyComponent={<EmptyState copy={copy} status={activeTab} onRetry={offline ? refresh : undefined} />}
            />
            <View style={styles.detailPane}>
              {selectMode ? (
                <SelectionEmpty copy={copy} count={selectedIds.size} />
              ) : focusedTask ? (
                <TaskDetailPanel
                  task={focusedTask}
                  copy={copy}
                  language={i18n.language}
                  pendingSync={pendingSync}
                  busy={updatingTaskId === focusedTask.id}
                  onOpen={() => openTask(focusedTask)}
                  onStatus={(status) => handleStatusChange(focusedTask, status)}
                />
              ) : (
                <EmptyState copy={copy} status={activeTab} onRetry={offline ? refresh : undefined} />
              )}
            </View>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(task) => task.id}
            renderItem={renderTask}
            style={styles.phoneList}
            contentContainerStyle={[styles.phoneListContent, { paddingBottom: tabBarPadding }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
            ListEmptyComponent={<EmptyState copy={copy} status={activeTab} onRetry={offline ? refresh : undefined} />}
          />
        )}
      </View>

      <CompletionModal
        visible={notesVisible}
        copy={copy}
        busy={!!pendingCompleteTask && updatingTaskId === pendingCompleteTask.id}
        onCancel={() => { setNotesVisible(false); setPendingCompleteTask(null) }}
        onSubmit={(notes) => { setNotesVisible(false); handleCompleteWithNotes(notes) }}
      />

      <ReassignModal
        visible={pickerVisible}
        copy={copy}
        agents={team}
        loading={teamLoading}
        busy={bulkBusy}
        onCancel={() => setPickerVisible(false)}
        onPick={doReassign}
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

function Notice({
  icon,
  title,
  body,
  tone,
  action,
  busy,
  stacked,
  onAction,
}: {
  icon: string
  title: string
  body: string
  tone: "amber" | "blue"
  action: string
  busy: boolean
  stacked: boolean
  onAction: () => void
}) {
  const visual = tone === "amber"
    ? { ink: fieldTheme.color.amber, fill: fieldTheme.color.amberSoft, border: "#E8D69F" }
    : { ink: fieldTheme.color.blue, fill: fieldTheme.color.blueSoft, border: "#B9D0EE" }
  return (
    <View style={[styles.notice, stacked && styles.noticeStacked, { backgroundColor: visual.fill, borderColor: visual.border }]}>
      <Icon name={icon} size={24} color={visual.ink} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: visual.ink }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
      <TouchableOpacity style={[styles.noticeAction, stacked && styles.noticeActionStacked]} onPress={onAction} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator size="small" color={visual.ink} /> : <Text style={[styles.noticeActionText, { color: visual.ink }]}>{action}</Text>}
      </TouchableOpacity>
    </View>
  )
}

function TaskCard({
  task,
  copy,
  language,
  tablet,
  focus,
  selected,
  selectMode,
  busy,
  onPress,
  onLongPress,
  onOpen,
  onStatus,
}: {
  task: Task
  copy: FriendlyCopy
  language: string
  tablet: boolean
  focus: boolean
  selected: boolean
  selectMode: boolean
  busy: boolean
  onPress: () => void
  onLongPress?: () => void
  onOpen: () => void
  onStatus: (status: TaskStatus) => void
}) {
  const priority = normalizedPriority(task.priority)
  const priorityCopy = copy.priority[priority]
  const visual = priorityVisual(priority)
  const overdue = isOverdue(task)
  const status = STATUS_TABS.includes(task.status as TaskStatus) ? task.status as TaskStatus : "PENDING"
  const customerName = task.customer?.name?.trim()
  const progress = taskProgress(task)
  return (
    <View style={[styles.taskCard, focus && styles.taskCardFocus, selected && styles.taskCardSelected]}>
      <TouchableOpacity
        style={styles.taskTapArea}
        activeOpacity={0.82}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={selectMode ? "checkbox" : "button"}
        accessibilityState={selectMode ? { checked: selected } : undefined}
        accessibilityLabel={task.title}
      >
        <View style={styles.taskHeadingRow}>
          {selectMode ? (
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected ? <Icon name="checkmark" size={18} color={fieldTheme.color.onColor} /> : null}
            </View>
          ) : (
            <View style={[styles.priorityIcon, { backgroundColor: visual.fill }]}>
              <Icon name={visual.icon} size={21} color={visual.ink} />
            </View>
          )}
          <View style={styles.taskTitleWrap}>
            {focus ? <Text style={styles.focusTaskLabel}>{copy.focus}</Text> : null}
            <Text style={styles.taskTitle} numberOfLines={tablet ? 2 : 3}>{task.title}</Text>
          </View>
          {tablet && !selectMode ? <Icon name="chevron-forward" size={21} color={fieldTheme.color.inkMuted} /> : null}
        </View>

        <View style={styles.taskSignals}>
          <View style={[styles.signalPill, { backgroundColor: visual.fill }]}>
            <Text style={[styles.signalText, { color: visual.ink }]}>{priorityCopy.name} · {priorityCopy.hint}</Text>
          </View>
          <View style={[styles.signalPill, overdue ? styles.overduePill : styles.duePill]}>
            <Icon name="calendar-outline" size={15} color={overdue ? fieldTheme.color.danger : fieldTheme.color.inkMuted} />
            <Text style={[styles.signalText, overdue ? styles.overdueText : styles.dueText]}>{dueText(task, copy, language)}</Text>
          </View>
        </View>

        {customerName ? (
          <View style={styles.customerLine}>
            <Icon name="business-outline" size={17} color={fieldTheme.color.inkMuted} />
            <Text style={styles.customerText} numberOfLines={1}>{customerName}</Text>
          </View>
        ) : null}

        {progress !== null && status === "IN_PROGRESS" ? (
          <View style={styles.cardProgress}>
            <View style={styles.progressHeading}>
              <Text style={styles.progressLabel}>{copy.progress}</Text>
              <Text style={styles.progressValue}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          </View>
        ) : null}
      </TouchableOpacity>

      {!tablet && !selectMode ? (
        <View style={styles.cardActions}>
          {status === "PENDING" ? (
            <PrimaryButton icon="play" label={busy ? copy.starting : copy.start} busy={busy} onPress={() => onStatus("IN_PROGRESS")} />
          ) : status === "IN_PROGRESS" ? (
            <PrimaryButton icon="checkmark" label={busy ? copy.completing : copy.complete} busy={busy} onPress={() => onStatus("COMPLETED")} />
          ) : null}
          <TouchableOpacity style={[styles.detailsButton, status === "COMPLETED" && styles.detailsButtonWide]} onPress={onOpen} accessibilityRole="button">
            <Text style={styles.detailsButtonText}>{copy.openDetails}</Text>
            <Icon name="arrow-forward" size={18} color={fieldTheme.color.primaryStrong} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

function TaskDetailPanel({
  task,
  copy,
  language,
  pendingSync,
  busy,
  onOpen,
  onStatus,
}: {
  task: Task
  copy: FriendlyCopy
  language: string
  pendingSync: number
  busy: boolean
  onOpen: () => void
  onStatus: (status: TaskStatus) => void
}) {
  const priority = normalizedPriority(task.priority)
  const priorityCopy = copy.priority[priority]
  const visual = priorityVisual(priority)
  const status = STATUS_TABS.includes(task.status as TaskStatus) ? task.status as TaskStatus : "PENDING"
  const progress = taskProgress(task)
  return (
    <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.detailEyebrow}>{copy.detailTitle}</Text>
      <Text style={styles.detailHeading}>{task.title}</Text>
      <View style={styles.detailStatusRow}>
        <View style={[styles.detailStatus, { backgroundColor: visual.fill }]}>
          <Icon name={visual.icon} size={18} color={visual.ink} />
          <Text style={[styles.detailStatusText, { color: visual.ink }]}>{priorityCopy.name} · {priorityCopy.hint}</Text>
        </View>
        <View style={styles.detailStatus}>
          <Icon name="ellipse" size={12} color={status === "COMPLETED" ? fieldTheme.color.success : status === "IN_PROGRESS" ? fieldTheme.color.blue : fieldTheme.color.amber} />
          <Text style={styles.detailStatusText}>{copy.status[status].replace(/^\d\s·\s/, "")}</Text>
        </View>
      </View>

      <DetailLine icon="reader-outline" label={copy.description} value={task.description?.trim() || copy.noDescription} />
      <DetailLine
        icon="business-outline"
        label={copy.customer}
        value={task.customer?.name?.trim() || copy.noCustomer}
        secondary={task.customer?.address?.trim() || undefined}
      />
      <DetailLine icon="calendar-outline" label={copy.due} value={dueText(task, copy, language)} danger={isOverdue(task)} />
      <DetailLine
        icon={pendingSync > 0 ? "cloud-upload-outline" : "cloud-done-outline"}
        label={copy.syncState}
        value={pendingSync > 0 ? copy.syncPending : copy.syncSaved}
      />
      {progress !== null && status === "IN_PROGRESS" ? (
        <View style={styles.detailProgress}>
          <View style={styles.progressHeading}>
            <Text style={styles.progressLabel}>{copy.progress}</Text>
            <Text style={styles.progressValue}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        </View>
      ) : null}
      {status === "COMPLETED" && task.result ? <DetailLine icon="checkmark-circle-outline" label={copy.result} value={task.result} /> : null}

      <View style={styles.detailActions}>
        {status === "PENDING" ? (
          <PrimaryButton icon="play" label={busy ? copy.starting : copy.start} busy={busy} onPress={() => onStatus("IN_PROGRESS")} />
        ) : status === "IN_PROGRESS" ? (
          <PrimaryButton icon="checkmark" label={busy ? copy.completing : copy.complete} busy={busy} onPress={() => onStatus("COMPLETED")} />
        ) : null}
        <TouchableOpacity style={styles.detailOpenButton} onPress={onOpen} accessibilityRole="button">
          <Icon name="open-outline" size={19} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.detailOpenText}>{copy.openDetails}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function DetailLine({ icon, label, value, secondary, danger }: { icon: string; label: string; value: string; secondary?: string; danger?: boolean }) {
  return (
    <View style={styles.detailLine}>
      <View style={styles.detailLineIcon}><Icon name={icon} size={21} color={danger ? fieldTheme.color.danger : fieldTheme.color.primaryStrong} /></View>
      <View style={styles.detailLineCopy}>
        <Text style={styles.detailLineLabel}>{label}</Text>
        <Text style={[styles.detailLineValue, danger && styles.detailLineDanger]}>{value}</Text>
        {secondary ? <Text style={styles.detailLineSecondary}>{secondary}</Text> : null}
      </View>
    </View>
  )
}

function PrimaryButton({ icon, label, busy, onPress }: { icon: string; label: string; busy: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={onPress} accessibilityRole="button">
      {busy ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Icon name={icon} size={19} color={fieldTheme.color.onColor} />}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  )
}

function EmptyState({ copy, status, onRetry }: { copy: FriendlyCopy; status: TaskStatus; onRetry?: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={status === "COMPLETED" ? "checkmark-done-outline" : "list-outline"} size={30} color={fieldTheme.color.primaryStrong} />
      </View>
      <Text style={styles.emptyTitle}>{copy.emptyTitle[status]}</Text>
      <Text style={styles.emptyBody}>{copy.emptyBody[status]}</Text>
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

function SelectionEmpty({ copy, count }: { copy: FriendlyCopy; count: number }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Icon name="people-outline" size={30} color={fieldTheme.color.primaryStrong} /></View>
      <Text style={styles.emptyTitle}>{copy.selected(count)}</Text>
      <Text style={styles.emptyBody}>{copy.selectHint}</Text>
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

function ReassignModal({
  visible,
  copy,
  agents,
  loading,
  busy,
  onCancel,
  onPick,
}: {
  visible: boolean
  copy: FriendlyCopy
  agents: Array<{ id: string; name: string; role?: string }>
  loading: boolean
  busy: boolean
  onCancel: () => void
  onPick: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const filtered = agents.filter((agent) => agent.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const cancel = () => { setQuery(""); onCancel() }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.modalTitle}>{copy.reassignTitle}</Text>
            {busy ? (
              <View style={styles.closeButton}><ActivityIndicator size="small" color={fieldTheme.color.primary} /></View>
            ) : (
              <TouchableOpacity style={styles.closeButton} onPress={cancel} accessibilityRole="button" accessibilityLabel={copy.cancel}>
                <Icon name="close" size={24} color={fieldTheme.color.inkMuted} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.searchBox}>
            <Icon name="search-outline" size={20} color={fieldTheme.color.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder={copy.reassignSearch}
              placeholderTextColor={fieldTheme.color.inkMuted}
            />
          </View>
          {loading ? (
            <View style={styles.pickerLoading}><ActivityIndicator color={fieldTheme.color.primary} /></View>
          ) : filtered.length === 0 ? (
            <Text style={styles.pickerEmpty}>{copy.noAgents}</Text>
          ) : (
            <ScrollView style={styles.agentList} keyboardShouldPersistTaps="handled">
              {filtered.map((agent) => (
                <TouchableOpacity key={agent.id} style={[styles.agentRow, busy && styles.disabled]} disabled={busy} onPress={() => onPick(agent.id)} accessibilityRole="button">
                  <View style={styles.agentAvatar}><Text style={styles.agentAvatarText}>{agent.name.slice(0, 1).toUpperCase()}</Text></View>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Icon name="arrow-forward" size={20} color={fieldTheme.color.primaryStrong} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingBottom: fieldTheme.space.xl, paddingHorizontal: fieldTheme.space.lg },
  headerInner: { width: "100%", maxWidth: 1280, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.lg },
  headerInnerPhone: { flexDirection: "column", alignItems: "stretch", gap: fieldTheme.space.md },
  headerCopy: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  eyebrow: { color: fieldTheme.color.primarySoft, fontSize: 12, fontWeight: "800" },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: fieldTheme.space.sm },
  headerSubtitle: { color: "#CDE2D9", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs, maxWidth: 620 },
  managerButton: { minHeight: 48, maxWidth: 220, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: "#73A797", paddingHorizontal: fieldTheme.space.md },
  managerButtonPhone: { width: "100%", maxWidth: 320, alignSelf: "flex-start" },
  managerButtonActive: { backgroundColor: "#174D40" },
  managerButtonText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  body: { flex: 1, width: "100%", maxWidth: 1280, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg },
  focusStrip: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#B7DDCE", backgroundColor: fieldTheme.color.primarySoft, paddingHorizontal: fieldTheme.space.lg, paddingVertical: fieldTheme.space.md },
  focusIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1 },
  focusLabel: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  focusMessage: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20, fontWeight: "700", marginTop: 2 },
  freshness: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "700", textAlign: "right", maxWidth: 130 },
  freshnessInline: { color: fieldTheme.color.primaryStrong, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: fieldTheme.space.xs },
  focusAction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.xs, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.md },
  focusActionPhone: { minWidth: 88, paddingHorizontal: fieldTheme.space.sm },
  focusActionText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  notice: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginTop: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, padding: fieldTheme.space.md },
  noticeStacked: { flexWrap: "wrap", alignItems: "flex-start" },
  noticeTitle: { fontSize: 14, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17, marginTop: 2 },
  noticeAction: { minHeight: 44, minWidth: 96, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: "rgba(19,35,31,0.16)", backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center" },
  noticeActionStacked: { width: "100%" },
  noticeActionText: { fontSize: 12, fontWeight: "900" },
  selectionBar: { minHeight: 76, marginTop: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#B7DDCE", backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  selectionBarPhone: { flexDirection: "column", alignItems: "stretch" },
  selectionGuide: { flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  selectionCount: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  selectionHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  reassignButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.lg },
  reassignButtonPhone: { width: "100%" },
  reassignButtonText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  tabs: { flexDirection: "row", gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.lg },
  tab: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.sm },
  tabActive: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primary },
  tabText: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "center", flexShrink: 1 },
  tabTextActive: { color: fieldTheme.color.onColor },
  tabCount: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: fieldTheme.color.surfaceStrong, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  tabCountActive: { backgroundColor: "rgba(248,252,250,0.2)" },
  tabCountText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "900" },
  tabCountTextActive: { color: fieldTheme.color.onColor },
  phoneList: { flex: 1 },
  phoneListContent: { gap: fieldTheme.space.md },
  tabletWorkspace: { flex: 1, flexDirection: "row", gap: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  tabletList: { flex: 0.44 },
  tabletListContent: { gap: fieldTheme.space.md, paddingBottom: fieldTheme.space.xl },
  detailPane: { flex: 0.56, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, overflow: "hidden" },
  taskCard: { borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.lg },
  taskTapArea: { minHeight: 48 },
  taskCardFocus: { borderColor: "#8BBFAE", backgroundColor: "#F4FAF7" },
  taskCardSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  taskHeadingRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  priorityIcon: { width: 44, height: 44, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center" },
  taskTitleWrap: { flex: 1, minHeight: 44, justifyContent: "center" },
  focusTaskLabel: { color: fieldTheme.color.primaryStrong, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 2 },
  taskTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  checkbox: { width: 44, height: 44, borderRadius: fieldTheme.radius.sm, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  taskSignals: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  signalPill: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.md, paddingVertical: 6 },
  signalText: { fontSize: 11, lineHeight: 16, fontWeight: "800" },
  duePill: { backgroundColor: fieldTheme.color.surfaceStrong },
  overduePill: { backgroundColor: fieldTheme.color.dangerSoft },
  dueText: { color: fieldTheme.color.inkMuted },
  overdueText: { color: fieldTheme.color.danger },
  customerLine: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  customerText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "700" },
  cardProgress: { marginTop: fieldTheme.space.md },
  progressHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm },
  progressLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  progressValue: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden", marginTop: fieldTheme.space.sm },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.primary },
  cardActions: { flexDirection: "row", alignItems: "stretch", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  primaryButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.md },
  primaryButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900", textAlign: "center", flexShrink: 1 },
  detailsButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.md },
  detailsButtonWide: { flex: 1 },
  detailsButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900", textAlign: "center", flexShrink: 1 },
  detailContent: { padding: fieldTheme.space.xl, gap: fieldTheme.space.lg },
  detailEyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  detailHeading: { color: fieldTheme.color.ink, fontSize: 25, lineHeight: 31, fontWeight: "900", maxWidth: 680 },
  detailStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  detailStatus: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surfaceStrong, paddingHorizontal: fieldTheme.space.md },
  detailStatusText: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "800" },
  detailLine: { minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingTop: fieldTheme.space.lg },
  detailLineIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: fieldTheme.color.surfaceStrong, alignItems: "center", justifyContent: "center" },
  detailLineCopy: { flex: 1 },
  detailLineLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  detailLineValue: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20, fontWeight: "800", marginTop: 3 },
  detailLineSecondary: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  detailLineDanger: { color: fieldTheme.color.danger },
  detailProgress: { borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingTop: fieldTheme.space.lg },
  detailActions: { gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  detailOpenButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  detailOpenText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  emptyState: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: fieldTheme.color.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: fieldTheme.space.lg },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 23, fontWeight: "900", textAlign: "center" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 360, marginTop: fieldTheme.space.sm },
  emptyButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.lg, marginTop: fieldTheme.space.lg },
  emptyButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  loadingTitle: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900", marginTop: fieldTheme.space.lg },
  loadingBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: fieldTheme.space.xs },
  modalOverlay: { flex: 1, backgroundColor: "rgba(19,35,31,0.55)", justifyContent: "center", padding: fieldTheme.space.xl },
  modalCard: { width: "100%", maxWidth: 620, alignSelf: "center", borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  modalIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: fieldTheme.color.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: fieldTheme.space.lg },
  modalTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  modalBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.sm },
  notesInput: { minHeight: 112, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, padding: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  modalActions: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  modalCancelButton: { minHeight: 48, minWidth: 104, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  modalCancelText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "900" },
  modalSubmitButton: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.md },
  modalSubmitText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900", textAlign: "center", flexShrink: 1 },
  pickerCard: { width: "100%", maxWidth: 620, maxHeight: "80%", alignSelf: "center", borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  pickerHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: fieldTheme.color.surfaceStrong },
  searchBox: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas, paddingHorizontal: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  searchInput: { flex: 1, minHeight: 46, color: fieldTheme.color.ink, fontSize: 15 },
  pickerLoading: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  pickerEmpty: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", paddingVertical: fieldTheme.space.xxl },
  agentList: { flexGrow: 0, marginTop: fieldTheme.space.md },
  agentRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingVertical: fieldTheme.space.sm },
  agentAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: fieldTheme.color.primarySoft, alignItems: "center", justifyContent: "center" },
  agentAvatarText: { color: fieldTheme.color.primaryStrong, fontSize: 16, fontWeight: "900" },
  agentName: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
})
