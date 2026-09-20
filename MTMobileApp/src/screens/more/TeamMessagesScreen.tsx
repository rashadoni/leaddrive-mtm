import React, { useCallback, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { enqueueOutboxOperation } from "../../services/outbox"
import { runMobileSync } from "../../services/sync-engine"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"

type Message = {
  id: string
  senderName: string
  body: string | null
  sentAt: string
  acknowledgementRequired: boolean
  acknowledged?: boolean
}

type Thread = {
  id: string
  type: string
  title: string
  lastMessageAt: string
  unread: boolean
  needsAcknowledgement: boolean
  lastMessage: Message | null
}

const COPY = {
  ru: { title: "Сообщения команды", back: "Назад", empty: "Новых сообщений пока нет", failed: "Не удалось загрузить сообщения", retry: "Повторить", unread: "Новое", unreadCount: (count: number) => `Непрочитано: ${count}`, acknowledge: "Подтвердить", acknowledged: "Подтверждено", loading: "Загружаем сообщения…" },
  az: { title: "Komanda mesajları", back: "Geri", empty: "Hələ yeni mesaj yoxdur", failed: "Mesajları yükləmək alınmadı", retry: "Yenidən", unread: "Yeni", unreadCount: (count: number) => `Oxunmayıb: ${count}`, acknowledge: "Təsdiqlə", acknowledged: "Təsdiqlənib", loading: "Mesajlar yüklənir…" },
  en: { title: "Team messages", back: "Back", empty: "There are no messages yet", failed: "Messages could not be loaded", retry: "Retry", unread: "New", unreadCount: (count: number) => `Unread: ${count}`, acknowledge: "Acknowledge", acknowledged: "Acknowledged", loading: "Loading messages…" },
} as const

const TEAM_MESSAGES_REFRESH_INTERVAL_MS = 30_000

function language(value: string): keyof typeof COPY {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

export default function TeamMessagesScreen() {
  const navigation = useNavigation()
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const [threads, setThreads] = useState<Thread[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await api.getMobileMessages()
      if (!response.success) throw new Error("MESSAGES_LOAD_FAILED")
      setThreads(Array.isArray(response.data?.threads) ? response.data.threads : [])
      setUnreadCount(Number.isInteger(response.data?.unread) && response.data.unread >= 0
        ? response.data.unread
        : null)
      setError(false)
    } catch (loadError: unknown) {
      if (!(loadError instanceof Error && loadError.message === "SESSION_EXPIRED")) setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useAutoRefresh(useCallback(() => { load().catch(() => {}) }, [load]), TEAM_MESSAGES_REFRESH_INTERVAL_MS)

  const receipt = async (thread: Thread, type: "READ" | "ACKNOWLEDGED") => {
    const message = thread.lastMessage
    if (!message || busyMessageId) return
    setBusyMessageId(message.id)
    try {
      await enqueueOutboxOperation({
        entity: "messageReceipts",
        op: "create",
        data: {
          messageId: message.id,
          type,
          clientReceiptId: `${type.toLowerCase()}-${message.id}`,
          occurredAt: new Date().toISOString(),
        },
      })
      await runMobileSync()
      await load()
    } finally {
      setBusyMessageId(null)
    }
  }

  const openThread = (thread: Thread) => {
    setExpanded((current) => current === thread.id ? null : thread.id)
    if (thread.unread) receipt(thread, "READ").catch(() => {})
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        {unreadCount !== null && unreadCount > 0 ? (
          <Text accessibilityRole="text" style={styles.unreadCount}>{copy.unreadCount(unreadCount)}</Text>
        ) : null}
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().catch(() => {}) }} colors={[fieldTheme.color.primary]} />}
        contentContainerStyle={[styles.content, tablet && styles.contentTablet, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xxl) }]}
      >
        {loading ? (
          <View style={styles.state}><ActivityIndicator color={fieldTheme.color.primary} /><Text style={styles.stateText}>{copy.loading}</Text></View>
        ) : error ? (
          <View style={styles.state}>
            <Icon name="cloud-offline-outline" size={34} color={fieldTheme.color.amber} />
            <Text style={styles.stateText}>{copy.failed}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setLoading(true); load().catch(() => {}) }} style={styles.retry}><Text style={styles.retryText}>{copy.retry}</Text></Pressable>
          </View>
        ) : threads.length === 0 ? (
          <View style={styles.state}><Icon name="chatbubbles-outline" size={36} color={fieldTheme.color.primary} /><Text style={styles.stateText}>{copy.empty}</Text></View>
        ) : threads.map((thread) => {
          const message = thread.lastMessage
          const isOpen = expanded === thread.id
          return (
            <View key={thread.id} style={[styles.card, thread.unread && styles.cardUnread]}>
              <Pressable accessibilityRole="button" onPress={() => openThread(thread)} style={({ pressed }) => [styles.cardTop, pressed && styles.pressed]}>
                <View style={[styles.messageIcon, thread.unread && styles.messageIconUnread]}>
                  <Icon name={thread.type === "BROADCAST" ? "megaphone-outline" : "chatbubble-outline"} size={22} color={thread.unread ? fieldTheme.color.onColor : fieldTheme.color.primaryStrong} />
                </View>
                <View style={styles.cardCopy}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{thread.title}</Text>
                    {thread.unread ? <Text style={styles.unread}>{copy.unread}</Text> : null}
                  </View>
                  <Text style={styles.sender}>{message?.senderName || "—"} · {new Date(thread.lastMessageAt).toLocaleString(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
                  {!isOpen ? <Text style={styles.preview} numberOfLines={2}>{message?.body || ""}</Text> : null}
                </View>
                <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={fieldTheme.color.inkMuted} />
              </Pressable>
              {isOpen ? (
                <View style={styles.messageBody}>
                  <Text style={styles.bodyText}>{message?.body || ""}</Text>
                  {message?.acknowledgementRequired ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!thread.needsAcknowledgement || busyMessageId === message.id}
                      onPress={() => { receipt(thread, "ACKNOWLEDGED").catch(() => {}) }}
                      style={({ pressed }) => [styles.ackButton, !thread.needsAcknowledgement && styles.ackButtonDone, pressed && styles.pressed]}
                    >
                      {busyMessageId === message.id
                        ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
                        : <Icon name={thread.needsAcknowledgement ? "checkmark-circle-outline" : "checkmark-circle"} size={19} color={fieldTheme.color.onColor} />}
                      <Text style={styles.ackText}>{thread.needsAcknowledgement ? copy.acknowledge : copy.acknowledged}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.sm, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong },
  title: { flex: 1, color: fieldTheme.color.ink, fontSize: 21, lineHeight: 27, fontWeight: "900" },
  unreadCount: { overflow: "hidden", borderRadius: 999, backgroundColor: fieldTheme.color.primarySoft, color: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.sm, paddingVertical: fieldTheme.space.xs, fontSize: 11, lineHeight: 16, fontWeight: "900" },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.lg },
  contentTablet: { padding: fieldTheme.space.xl },
  state: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md },
  stateText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.lg },
  retryText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  card: { overflow: "hidden", borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface },
  cardUnread: { borderColor: fieldTheme.color.primary },
  cardTop: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md },
  messageIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: fieldTheme.color.primarySoft },
  messageIconUnread: { backgroundColor: fieldTheme.color.primary },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  cardTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  unread: { color: fieldTheme.color.primaryStrong, fontSize: 10, fontWeight: "900" },
  sender: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  preview: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.xs },
  messageBody: { gap: fieldTheme.space.md, padding: fieldTheme.space.lg, paddingTop: 0 },
  bodyText: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 22 },
  ackButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  ackButtonDone: { backgroundColor: fieldTheme.color.success },
  ackText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.76 },
})
