import React, { useCallback, useEffect } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAutoRefresh } from "../hooks/useAutoRefresh"
import { listenForPushRefresh, useNotificationInbox, useNotificationUnread } from "../store/notification-inbox"
import { badgeLabel } from "../services/notification-feed"
import { feedLanguage } from "../services/notification-feed-copy"
import { fieldTheme, themed } from "../theme/fieldTheme"
import GuideSpot from "./guide/GuideSpot"

/**
 * How often a bell on the screen in front asks again by itself. A push that
 * arrives asks at once; this is for what comes without one (four requests,
 * the agent's task list among them — not every minute on mobile data).
 */
export const NOTIFICATION_BELL_REFRESH_MS = 120_000

const LABEL = {
  az: (count: number) => (count > 0 ? `Bildirişlər, ${count} yeni` : "Bildirişlər"),
  ru: (count: number) => (count > 0 ? `Уведомления, новых: ${count}` : "Уведомления"),
  en: (count: number) => (count > 0 ? `Notifications, ${count} new` : "Notifications"),
} as const

/**
 * The bell in the top corner of every main screen (owner-approved mockup,
 * 2026-10-18): a red number for what is unread, the one list on a tap. Every
 * header is white since the same day — or dark in the night palette — so the
 * bell has one look, in the palette's colours.
 */
export default function NotificationBell() {
  const navigation = useNavigation<any>()
  const { i18n } = useTranslation()
  const unread = useNotificationUnread()
  const refresh = useNotificationInbox((state) => state.refresh)

  useEffect(() => { listenForPushRefresh() }, [])
  useAutoRefresh(useCallback(() => { void refresh().catch(() => {}) }, [refresh]), NOTIFICATION_BELL_REFRESH_MS)

  return (
    <Pressable
      testID="notification-bell"
      accessibilityRole="button"
      accessibilityLabel={LABEL[feedLanguage(i18n.language)](unread)}
      hitSlop={6}
      onPress={() => navigation.navigate("Notifications")}
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      <Icon
        name={unread > 0 ? "notifications" : "notifications-outline"}
        size={23}
        color={fieldTheme.color.primaryStrong}
      />
      {unread > 0 ? (
        <View testID="notification-bell-badge" style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>{badgeLabel(unread)}</Text>
        </View>
      ) : null}
      {/* The first-run guide's «Zəngə bas»: the bell of the screen in front. */}
      <GuideSpot id="bell" />
    </Pressable>
  )
}

const styles = themed(() => StyleSheet.create({
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: fieldTheme.color.surfaceStrong,
    borderColor: fieldTheme.color.border,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.danger,
    borderColor: fieldTheme.color.surface,
  },
  badgeText: { color: fieldTheme.color.onColor, fontSize: 11, lineHeight: 14, fontWeight: "900" },
  pressed: { opacity: 0.75 },
}))
