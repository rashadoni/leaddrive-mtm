import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useNotificationInbox, useNotificationUnread } from "../../store/notification-inbox"
import {
  feedNavigation,
  feedTargetLabel,
  feedTimeLabel,
  type FeedItem,
  type FeedKind,
} from "../../services/notification-feed"
import { feedCopy, feedLanguage } from "../../services/notification-feed-copy"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { lastPushStatus, registerPushToken, type PushStatus } from "../../services/push-registration"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import StatusBarBand from "../../components/StatusBarBand"

/** While the list is open it asks again this often. */
const NOTIFICATIONS_REFRESH_INTERVAL_MS = 60_000

const COPY = {
  ru: {
    title: "Уведомления",
    newCount: (count: number) => `Новых: ${count}`,
    allRead: "Всё прочитано",
    back: "Назад",
    loading: "Загружаем уведомления…",
    empty: "Пока ничего нового.",
    emptyBody: "Здесь появятся сообщения менеджера, решения по вашим заявкам, маршруты и напоминания.",
    emptyBodyManager: "Здесь появятся заявки, которые ждут вашего решения, и уведомления для вас.",
    markAll: "Отметить всё прочитанным",
    settings: "Что показывать",
    sectionNew: "НОВЫЕ",
    sectionEarlier: "РАНЬШЕ",
    kindMessage: "Сообщения команды",
    kindRequest: "Решения по заявкам",
    kindTask: "Задачи",
    kindVisit: "Визиты",
    kindWorkday: "Рабочий день",
    kindRoute: "Маршрут",
    kindApproval: "Ждёт моего решения",
    kindOther: "Прочее",
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
  },
  az: {
    title: "Bildirişlər",
    newCount: (count: number) => `${count} yeni`,
    allRead: "Hamısı oxunub",
    back: "Geri",
    loading: "Bildirişlər yüklənir…",
    empty: "Hələlik yenilik yoxdur.",
    emptyBody: "Menecerin mesajları, sorğularınız üzrə qərarlar, marşrutlar və xatırlatmalar burada görünəcək.",
    emptyBodyManager: "Qərarınızı gözləyən sorğular və sizə gələn bildirişlər burada görünəcək.",
    markAll: "Hamısını oxunmuş et",
    settings: "Nə göstərilsin",
    sectionNew: "YENİ",
    sectionEarlier: "ƏVVƏLKİ",
    kindMessage: "Komanda mesajları",
    kindRequest: "Sorğu qərarları",
    kindTask: "Tapşırıqlar",
    kindVisit: "Ziyarətlər",
    kindWorkday: "İş günü",
    kindRoute: "Marşrut",
    kindApproval: "Qərarımı gözləyənlər",
    kindOther: "Digər",
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
  },
  en: {
    title: "Notifications",
    newCount: (count: number) => `${count} new`,
    allRead: "All read",
    back: "Back",
    loading: "Loading notifications…",
    empty: "Nothing new yet.",
    emptyBody: "Manager messages, decisions on your requests, routes and reminders will appear here.",
    emptyBodyManager: "Requests waiting for your decision and notifications for you will appear here.",
    markAll: "Mark all as read",
    settings: "What to show",
    sectionNew: "NEW",
    sectionEarlier: "EARLIER",
    kindMessage: "Team messages",
    kindRequest: "Request decisions",
    kindTask: "Tasks",
    kindVisit: "Visits",
    kindWorkday: "Workday",
    kindRoute: "Route",
    kindApproval: "Awaiting my decision",
    kindOther: "Other",
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
  },
} as const

const KIND_VISUAL: Record<FeedKind, { icon: string; color: string; background: string }> = {
  message: { icon: "chatbubble-ellipses-outline", color: fieldTheme.color.primaryStrong, background: fieldTheme.color.primarySoft },
  request: { icon: "document-text-outline", color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft },
  task: { icon: "alarm-outline", color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft },
  visit: { icon: "time-outline", color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft },
  workday: { icon: "calendar-outline", color: fieldTheme.color.primaryStrong, background: fieldTheme.color.surfaceStrong },
  route: { icon: "map-outline", color: fieldTheme.color.blue, background: fieldTheme.color.blueSoft },
  approval: { icon: "shield-checkmark-outline", color: fieldTheme.color.violet, background: fieldTheme.color.violetSoft },
  other: { icon: "information-circle-outline", color: fieldTheme.color.inkMuted, background: fieldTheme.color.surfaceStrong },
}
const ALERT_VISUAL = { icon: "warning-outline", color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft }

const FIELD_KINDS: FeedKind[] = ["message", "request", "route", "task", "visit", "workday", "other"]
const MANAGER_KINDS: FeedKind[] = ["approval", "request", "workday", "other"]

type Copy = (typeof COPY)[keyof typeof COPY]

function kindLabel(kind: FeedKind, copy: Copy): string {
  switch (kind) {
    case "message": return copy.kindMessage
    case "request": return copy.kindRequest
    case "task": return copy.kindTask
    case "visit": return copy.kindVisit
    case "workday": return copy.kindWorkday
    case "route": return copy.kindRoute
    case "approval": return copy.kindApproval
    default: return copy.kindOther
  }
}

/**
 * The list the bell opens: every line of the agent's or the manager's inbox,
 * new ones first, each with a button that says where it leads.
 */
export default function NotificationsScreen() {
  const { i18n } = useTranslation()
  const language = feedLanguage(i18n.language)
  const copy = COPY[language]
  const feed = feedCopy(language)
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact

  const items = useNotificationInbox((state) => state.items)
  const loading = useNotificationInbox((state) => state.loading)
  const loadedAt = useNotificationInbox((state) => state.loadedAt)
  const context = useNotificationInbox((state) => state.context)
  const preferences = useNotificationInbox((state) => state.preferences)
  const refresh = useNotificationInbox((state) => state.refresh)
  const rebuild = useNotificationInbox((state) => state.rebuild)
  const markRead = useNotificationInbox((state) => state.markRead)
  const markAllRead = useNotificationInbox((state) => state.markAllRead)
  const setPreference = useNotificationInbox((state) => state.setPreference)
  const unread = useNotificationUnread()

  const [refreshing, setRefreshing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [push, setPush] = useState<PushStatus | null>(null)
  const [pushChecking, setPushChecking] = useState(false)

  useEffect(() => {
    void lastPushStatus().then(setPush).catch(() => {})
  }, [])

  // The lines are written in the app's language: a switch rewrites them.
  useEffect(() => { rebuild() }, [language, rebuild])

  useAutoRefresh(useCallback(() => { void refresh({ force: true }).catch(() => {}) }, [refresh]), NOTIFICATIONS_REFRESH_INTERVAL_MS)

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

  const manualRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh({ force: true })
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  const open = useCallback((item: FeedItem) => {
    markRead(item)
    if (!item.target) return
    const { name, params } = feedNavigation(item.target)
    navigation.navigate(name, params)
  }, [markRead, navigation])

  const now = new Date()
  const formatDate = useCallback(
    (iso: string) => formatLocalizedDate(iso, i18n.language, { day: "numeric", month: "short" }),
    [i18n.language],
  )
  const fresh = items.filter((item) => !item.read)
  const earlier = items.filter((item) => item.read)
  const kinds = context?.shell === "manager" ? MANAGER_KINDS : FIELD_KINDS

  const renderItem = (item: FeedItem) => {
    const visual = item.alert ? ALERT_VISUAL : KIND_VISUAL[item.kind]
    const when = feedTimeLabel(item.at, now, feed, formatDate)
    return (
      <Pressable
        key={item.id}
        testID={`notification-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={[item.title, item.body, item.target ? feedTargetLabel(item.target, feed) : null].filter(Boolean).join(". ")}
        onPress={() => open(item)}
        style={({ pressed }) => [styles.item, !item.read && styles.itemUnread, pressed && styles.pressed]}
      >
        <View style={[styles.itemIcon, { backgroundColor: visual.background }]}>
          <Icon name={visual.icon} size={20} color={visual.color} />
        </View>
        <View style={styles.itemCopy}>
          <View style={styles.itemTitleRow}>
            {item.read ? null : <View style={styles.unreadDot} />}
            <Text style={styles.itemTitle}>{item.title}</Text>
          </View>
          {item.body ? <Text style={styles.itemBody} numberOfLines={3}>{item.body}</Text> : null}
          {when || item.target ? (
            <View style={styles.itemMeta}>
              <Text style={styles.itemTime}>{when}</Text>
              {item.target ? (
                <View style={styles.cta}>
                  <Text style={styles.ctaText} numberOfLines={1}>{feedTargetLabel(item.target, feed)}</Text>
                  <Icon name="chevron-forward" size={14} color={fieldTheme.color.primary} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, fieldTheme.space.xxl) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={manualRefresh} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
      >
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={[styles.headerRow, tablet && styles.contentTablet]}>
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
              <Text style={styles.subtitle} numberOfLines={1}>{unread > 0 ? copy.newCount(unread) : copy.allRead}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.content, tablet && styles.contentTablet]}>
          <View style={styles.actionRow}>
            <Pressable
              testID="notifications-mark-all"
              accessibilityRole="button"
              onPress={() => { void markAllRead() }}
              disabled={unread === 0}
              style={({ pressed }) => [styles.secondaryButton, unread === 0 && styles.disabled, pressed && styles.pressed]}
            >
              <Icon name="checkmark-done-outline" size={18} color={fieldTheme.color.primary} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>{copy.markAll}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsOpen((value) => !value)}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              testID="notifications-settings-toggle"
            >
              <Icon name="options-outline" size={18} color={fieldTheme.color.primary} />
              <Text style={styles.secondaryButtonText} numberOfLines={1}>{copy.settings}</Text>
            </Pressable>
          </View>

          {settingsOpen ? (
            <View style={styles.settingsCard}>
              {kinds.map((kind) => (
                <View key={kind} style={styles.settingsRow}>
                  <Text style={styles.settingsLabel}>{kindLabel(kind, copy)}</Text>
                  <Switch
                    value={preferences[kind]}
                    onValueChange={(value) => setPreference(kind, value)}
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
                  <Text style={[styles.pushState, push && push.state !== "registered" ? styles.pushStateBad : null]}>
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
            loading && !loadedAt ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color={fieldTheme.color.primary} />
                <Text style={styles.emptyBody}>{copy.loading}</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Icon name="notifications-outline" size={30} color={fieldTheme.color.inkMuted} />
                <Text style={styles.emptyTitle}>{copy.empty}</Text>
                <Text style={styles.emptyBody}>{context?.shell === "manager" ? copy.emptyBodyManager : copy.emptyBody}</Text>
              </View>
            )
          ) : null}

          {fresh.length > 0 ? <Text style={styles.section}>{copy.sectionNew}</Text> : null}
          {fresh.map(renderItem)}
          {earlier.length > 0 ? <Text style={styles.section}>{copy.sectionEarlier}</Text> : null}
          {earlier.map(renderItem)}
        </View>
      </ScrollView>
      {/* The green header scrolls away with the list; the band keeps the clock readable. */}
      <StatusBarBand />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: fieldTheme.color.onColor, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  subtitle: { color: "#D7E9E1", fontSize: 13, lineHeight: 18, marginTop: 2 },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.sm },
  contentTablet: { width: "100%", maxWidth: 820, alignSelf: "center" },
  actionRow: { flexDirection: "row", gap: fieldTheme.space.sm },
  secondaryButton: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md },
  secondaryButtonText: { flexShrink: 1, color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
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
  section: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginTop: fieldTheme.space.sm, marginHorizontal: 2 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, padding: fieldTheme.space.md },
  itemUnread: { borderColor: fieldTheme.color.primary, backgroundColor: "#F4FBF8" },
  itemIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: fieldTheme.color.danger },
  itemTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  itemBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  itemMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  itemTime: { flexShrink: 1, color: fieldTheme.color.inkMuted, fontSize: 11 },
  cta: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 2, borderWidth: 1, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.pill, paddingLeft: fieldTheme.space.md, paddingRight: fieldTheme.space.sm },
  ctaText: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
})
