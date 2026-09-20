import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { useWorkdayStore } from "../../store/workday"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  buildNotifications,
  mergeReadIds,
  unreadCount,
  type NotificationItem,
  type NotificationKind,
  type NotificationPreferences,
} from "../../services/notification-center"
import { toDoctorCreateRequestItem } from "../../services/doctor-create-requests"
import { lastPushStatus, registerPushToken, type PushStatus } from "../../services/push-registration"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { useHeaderTop } from "../../hooks/useTabBarHeight"

const READ_STORAGE_KEY = "@mtm_notifications_read_v1"
const PREFERENCES_STORAGE_KEY = "@mtm_notifications_preferences_v1"

const COPY = {
  ru: {
    title: "Уведомления",
    subtitle: "Сообщения, решения по заявкам, сроки задач и незакрытый день — в одном месте.",
    back: "Назад",
    empty: "Пока ничего нового.",
    emptyBody: "Здесь появятся сообщения менеджера, решения по вашим заявкам и напоминания о сроках.",
    markAll: "Отметить всё прочитанным",
    settings: "Что показывать",
    kindMessage: "Сообщения команды",
    kindRequest: "Заявки на врачей",
    kindTask: "Сроки задач",
    kindVisit: "Длинные визиты",
    kindWorkday: "Рабочий день",
    unread: "Новое",
    pushNote: "Список выше приложение показывает, когда вы его открываете.",
    pushTitle: "Push с сервера",
    pushRegistered: "Адрес этого телефона у сервера есть — push придёт.",
    pushRegisteredOff: "Адрес есть, но сервер пока не отправляет push.",
    pushNoAddress: "Google не выдал этому телефону адрес: push не придёт.",
    pushRefused: "Сервер не принял адрес этого телефона.",
    pushUnsupported: "На этом устройстве push не поддерживается.",
    pushUnknown: "Ещё не проверялось.",
    pushCheck: "Проверить",
    pushChecking: "Проверяем…",
    messageFrom: (name: string) => (name ? `Сообщение от ${name}` : "Сообщение команды"),
    requestApproved: (name: string) => `${name}: заявка одобрена`,
    requestRejected: (name: string) => `${name}: заявка отклонена`,
    requestNeedsInfo: (name: string) => `${name}: нужны уточнения`,
    taskOverdue: (title: string) => `Просрочена задача: ${title}`,
    taskToday: (title: string) => `Сегодня срок задачи: ${title}`,
    visitLong: (minutes: number) => `Визит идёт ${minutes} мин`,
    workdayOpen: "Рабочий день ещё не закрыт",
    workdayOpenBody: "Закройте день, когда закончите работу.",
  },
  az: {
    title: "Bildirişlər",
    subtitle: "Mesajlar, sorğu qərarları, tapşırıq müddətləri və bağlanmamış iş günü bir yerdə.",
    back: "Geri",
    empty: "Hələlik yenilik yoxdur.",
    emptyBody: "Menecerin mesajları, sorğularınız üzrə qərarlar və müddət xatırlatmaları burada görünəcək.",
    markAll: "Hamısını oxunmuş et",
    settings: "Nə göstərilsin",
    kindMessage: "Komanda mesajları",
    kindRequest: "Həkim sorğuları",
    kindTask: "Tapşırıq müddətləri",
    kindVisit: "Uzun ziyarətlər",
    kindWorkday: "İş günü",
    unread: "Yeni",
    pushNote: "Yuxarıdakı siyahını tətbiq siz onu açanda göstərir.",
    pushTitle: "Serverdən push",
    pushRegistered: "Bu telefonun ünvanı serverdədir — push gələcək.",
    pushRegisteredOff: "Ünvan var, amma server hələ push göndərmir.",
    pushNoAddress: "Google bu telefona ünvan vermədi: push gəlməyəcək.",
    pushRefused: "Server bu telefonun ünvanını qəbul etmədi.",
    pushUnsupported: "Bu cihazda push dəstəklənmir.",
    pushUnknown: "Hələ yoxlanılmayıb.",
    pushCheck: "Yoxla",
    pushChecking: "Yoxlanılır…",
    messageFrom: (name: string) => (name ? `${name} mesaj göndərdi` : "Komanda mesajı"),
    requestApproved: (name: string) => `${name}: sorğu təsdiqləndi`,
    requestRejected: (name: string) => `${name}: sorğu rədd edildi`,
    requestNeedsInfo: (name: string) => `${name}: dəqiqləşdirmə lazımdır`,
    taskOverdue: (title: string) => `Gecikmiş tapşırıq: ${title}`,
    taskToday: (title: string) => `Bu gün müddəti bitir: ${title}`,
    visitLong: (minutes: number) => `Ziyarət ${minutes} dəqiqədir davam edir`,
    workdayOpen: "İş günü hələ bağlanmayıb",
    workdayOpenBody: "İşi bitirəndə günü bağlayın.",
  },
  en: {
    title: "Notifications",
    subtitle: "Messages, decisions on your requests, task deadlines and an open workday — in one place.",
    back: "Back",
    empty: "Nothing new yet.",
    emptyBody: "Manager messages, decisions on your requests and deadline reminders will appear here.",
    markAll: "Mark all as read",
    settings: "What to show",
    kindMessage: "Team messages",
    kindRequest: "Doctor requests",
    kindTask: "Task deadlines",
    kindVisit: "Long visits",
    kindWorkday: "Workday",
    unread: "New",
    pushNote: "The app shows the list above when you open it.",
    pushTitle: "Push from the server",
    pushRegistered: "The server has this phone's address — push will arrive.",
    pushRegisteredOff: "The address is there, but the server does not send push yet.",
    pushNoAddress: "Google gave this phone no address: push will not arrive.",
    pushRefused: "The server would not take this phone's address.",
    pushUnsupported: "Push is not supported on this device.",
    pushUnknown: "Not checked yet.",
    pushCheck: "Check",
    pushChecking: "Checking…",
    messageFrom: (name: string) => (name ? `Message from ${name}` : "Team message"),
    requestApproved: (name: string) => `${name}: request approved`,
    requestRejected: (name: string) => `${name}: request declined`,
    requestNeedsInfo: (name: string) => `${name}: more detail needed`,
    taskOverdue: (title: string) => `Overdue task: ${title}`,
    taskToday: (title: string) => `Due today: ${title}`,
    visitLong: (minutes: number) => `Visit running ${minutes} min`,
    workdayOpen: "The workday is still open",
    workdayOpenBody: "Close the day when you finish work.",
  },
} as const

type Language = keyof typeof COPY

function language(value: string): Language {
  const normalized = value.toLowerCase()
  if (normalized.startsWith("az")) return "az"
  if (normalized.startsWith("en")) return "en"
  return "ru"
}

const KIND_VISUAL: Record<NotificationKind, { icon: string; color: string; background: string }> = {
  message: { icon: "chatbubble-ellipses-outline", color: fieldTheme.color.primaryStrong, background: fieldTheme.color.primarySoft },
  request: { icon: "person-add-outline", color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft },
  task: { icon: "alarm-outline", color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft },
  visit: { icon: "time-outline", color: fieldTheme.color.danger, background: fieldTheme.color.dangerSoft },
  workday: { icon: "calendar-outline", color: fieldTheme.color.inkMuted, background: fieldTheme.color.surfaceStrong },
}

const KIND_ORDER: NotificationKind[] = ["message", "request", "task", "visit", "workday"]

export default function NotificationsScreen() {
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, undefined>>>()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const workday = useWorkdayStore((state) => state.activeWorkday)

  const [items, setItems] = useState<NotificationItem[]>([])
  const [readIds, setReadIds] = useState<string[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [refreshing, setRefreshing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [push, setPush] = useState<PushStatus | null>(null)
  const [pushChecking, setPushChecking] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [storedRead, storedPreferences] = await Promise.all([
          AsyncStorage.getItem(READ_STORAGE_KEY),
          AsyncStorage.getItem(PREFERENCES_STORAGE_KEY),
        ])
        if (storedRead) setReadIds(JSON.parse(storedRead))
        if (storedPreferences) setPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(storedPreferences) })
      } catch {}
      setPush(await lastPushStatus())
    })()
  }, [])

  /**
   * Asking again, from the agent's side. The registration itself runs on
   * every start; this button exists because the answer matters to a person
   * standing in a clinic wondering why the phone stays silent.
   */
  const checkPush = useCallback(async () => {
    setPushChecking(true)
    try {
      setPush(await registerPushToken())
    } finally {
      setPushChecking(false)
    }
  }, [])

  const pushLine = useMemo(() => {
    if (!push) return copy.pushUnknown
    if (push.state === "registered") return push.serverSends === false ? copy.pushRegisteredOff : copy.pushRegistered
    if (push.state === "noAddress") return copy.pushNoAddress
    if (push.state === "serverRefused") return copy.pushRefused
    return copy.pushUnsupported
  }, [copy, push])

  /**
   * Everything here is read from what the app already has. A source that
   * fails is simply absent: a broken task read must not empty the list of
   * messages beside it.
   */
  const load = useCallback(async (current: NotificationPreferences, read: string[]) => {
    const [messages, requests, tasks] = await Promise.all([
      current.message ? api.getMobileMessages().catch(() => null) : null,
      current.request ? api.getDoctorCreateRequests(20).catch(() => null) : null,
      current.task ? api.getTasks().catch(() => null) : null,
    ])

    const threads: any[] = Array.isArray(messages?.data?.threads) ? messages.data.threads : []
    const requestRows: any[] = Array.isArray(requests?.data?.requests) ? requests.data.requests : []
    const taskRows: any[] = Array.isArray(tasks?.data?.tasks) ? tasks.data.tasks : []

    setItems(buildNotifications({
      copy,
      preferences: current,
      readIds: read,
      sources: {
        messages: threads.map((thread) => ({
          id: String(thread?.id ?? ""),
          subject: typeof thread?.title === "string" ? thread.title : undefined,
          body: typeof thread?.lastMessage?.body === "string" ? thread.lastMessage.body : undefined,
          createdAt: typeof thread?.lastMessageAt === "string" ? thread.lastMessageAt : undefined,
          read: thread?.unread === false,
          senderName: typeof thread?.lastMessage?.senderName === "string" ? thread.lastMessage.senderName : undefined,
        })).filter((thread) => thread.id),
        requests: requestRows
          .map(toDoctorCreateRequestItem)
          .filter((request): request is NonNullable<typeof request> => request !== null)
          .map((request) => ({
            id: request.id,
            status: request.status,
            displayName: request.displayName,
            clinicName: request.clinicName,
            decisionComment: request.decisionComment,
            reviewedAt: request.reviewedAt,
            submittedAt: request.submittedAt,
          })),
        tasks: taskRows.map((task) => ({
          id: String(task?.id ?? ""),
          title: String(task?.title ?? ""),
          status: String(task?.status ?? ""),
          dueDate: typeof task?.dueDate === "string" ? task.dueDate : undefined,
        })).filter((task) => task.id && task.title),
        workday: workday ? { open: !workday.paused, startedAt: workday.startedAt } : null,
      },
    }))
  }, [copy, workday])

  useFocusEffect(
    useCallback(() => {
      void load(preferences, readIds)
    }, [load, preferences, readIds]),
  )

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load(preferences, readIds)
    } finally {
      setRefreshing(false)
    }
  }, [load, preferences, readIds])

  const persistRead = useCallback(async (ids: string[]) => {
    setReadIds(ids)
    try {
      await AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids))
    } catch {}
  }, [])

  const markRead = useCallback((item: NotificationItem) => {
    const next = mergeReadIds(readIds, [item.id])
    void persistRead(next)
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)))
  }, [persistRead, readIds])

  const markAllRead = useCallback(() => {
    const next = mergeReadIds(readIds, items.map((item) => item.id))
    void persistRead(next)
    setItems((current) => current.map((entry) => ({ ...entry, read: true })))
  }, [items, persistRead, readIds])

  const togglePreference = useCallback((kind: NotificationKind, value: boolean) => {
    const next = { ...preferences, [kind]: value }
    setPreferences(next)
    void AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next)).catch(() => {})
    void load(next, readIds)
  }, [load, preferences, readIds])

  const unread = useMemo(() => unreadCount(items), [items])

  const openTarget = useCallback((item: NotificationItem) => {
    markRead(item)
    if (item.target === "Messages") navigation.navigate("Messages" as never)
  }, [markRead, navigation])

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.back}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
          >
            <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>{copy.title}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{copy.subtitle}</Text>
          </View>
          {unread > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unread}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xxl) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
      >
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={markAllRead}
            disabled={unread === 0}
            style={({ pressed }) => [styles.secondaryButton, unread === 0 && styles.disabled, pressed && styles.pressed]}
          >
            <Icon name="checkmark-done-outline" size={18} color={fieldTheme.color.primary} />
            <Text style={styles.secondaryButtonText} numberOfLines={1}>{copy.markAll}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSettingsOpen((open) => !open)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            testID="notifications-settings-toggle"
          >
            <Icon name="options-outline" size={18} color={fieldTheme.color.primary} />
            <Text style={styles.secondaryButtonText} numberOfLines={1}>{copy.settings}</Text>
          </Pressable>
        </View>

        {settingsOpen ? (
          <View style={styles.settingsCard}>
            {KIND_ORDER.map((kind) => (
              <View key={kind} style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>
                  {kind === "message" ? copy.kindMessage
                    : kind === "request" ? copy.kindRequest
                      : kind === "task" ? copy.kindTask
                        : kind === "visit" ? copy.kindVisit
                          : copy.kindWorkday}
                </Text>
                <Switch
                  value={preferences[kind]}
                  onValueChange={(value) => togglePreference(kind, value)}
                  trackColor={{ true: fieldTheme.color.primary, false: fieldTheme.color.border }}
                />
              </View>
            ))}
            {/* Said plainly, because an agent who thinks the phone will buzz
                will stop opening the app to check. */}
            <Text style={styles.pushNote}>{copy.pushNote}</Text>
            <View style={styles.pushRow}>
              <View style={styles.pushText}>
                <Text style={styles.pushTitle}>{copy.pushTitle}</Text>
                <Text
                  style={[styles.pushState, push && push.state !== "registered" ? styles.pushStateBad : null]}
                >
                  {pushLine}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={checkPush}
                disabled={pushChecking}
                style={[styles.pushButton, { minHeight: touchTarget }]}
              >
                <Text style={styles.pushButtonText} numberOfLines={1}>
                  {pushChecking ? copy.pushChecking : copy.pushCheck}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="notifications-outline" size={30} color={fieldTheme.color.inkMuted} />
            <Text style={styles.emptyTitle}>{copy.empty}</Text>
            <Text style={styles.emptyBody}>{copy.emptyBody}</Text>
          </View>
        ) : items.map((item) => {
          const visual = KIND_VISUAL[item.kind]
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => openTarget(item)}
              style={({ pressed }) => [styles.item, !item.read && styles.itemUnread, pressed && styles.pressed]}
            >
              <View style={[styles.itemIcon, { backgroundColor: visual.background }]}>
                <Icon name={visual.icon} size={20} color={visual.color} />
              </View>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                {item.body ? <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text> : null}
              </View>
              {item.read ? null : (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{copy.unread}</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: fieldTheme.color.onColor, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  subtitle: { color: "#D7E9E1", fontSize: 13, lineHeight: 18, marginTop: 2 },
  headerBadge: { minWidth: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, paddingHorizontal: 8, backgroundColor: fieldTheme.color.onColor },
  headerBadgeText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.sm },
  actionRow: { flexDirection: "row", gap: fieldTheme.space.sm },
  secondaryButton: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md },
  secondaryButtonText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  settingsCard: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  settingsRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  settingsLabel: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  pushNote: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: fieldTheme.space.xs, marginBottom: fieldTheme.space.xs },
  pushRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingTop: fieldTheme.space.sm, marginBottom: fieldTheme.space.xs },
  pushText: { flex: 1, gap: 2 },
  pushTitle: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900" },
  pushState: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  pushStateBad: { color: fieldTheme.color.danger },
  pushButton: { justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.pill },
  pushButtonText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  emptyCard: { alignItems: "center", gap: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.xl },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.md },
  itemUnread: { borderColor: fieldTheme.color.primary },
  itemIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  itemBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  unreadPill: { borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm, paddingVertical: 2, backgroundColor: fieldTheme.color.primarySoft },
  unreadPillText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
})
