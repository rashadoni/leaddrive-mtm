import React from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import type { MoreStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

import { agentMayAttendanceRequests } from "../../lib/agent-permissions"
import { useBootstrapStore } from "../../store/bootstrap"
import { useAuthStore } from "../../store/auth"
import NotificationBell from "../../components/NotificationBell"

type MoreRoute = "AttendanceRequests" | "Notifications" | "Messages" | "Visits" | "GpsHistory" | "Profile"

type MoreAction = {
  route: MoreRoute
  icon: string
  titleKey?: string
  bodyKey?: string
  title?: string
  body?: string
}

const COMMON_ACTIONS: MoreAction[] = [
  {
    route: "Visits",
    icon: "checkmark-circle-outline",
    titleKey: "moreV2.visitsTitle",
    bodyKey: "moreV2.visitsBody",
  },
  {
    route: "GpsHistory",
    icon: "location-outline",
    titleKey: "moreV2.gpsTitle",
    bodyKey: "moreV2.gpsBody",
  },
  {
    route: "Profile",
    icon: "person-circle-outline",
    titleKey: "moreV2.profileTitle",
    bodyKey: "moreV2.profileBody",
  },
]

export default function MoreScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()
  const tablet = isTabletWidth(width)
  const messagesCopy = i18n.language.toLowerCase().startsWith("az")
    ? { title: "Komanda mesajları", body: "Menecerin elanlarını və şəxsi mesajlarını oxuyun" }
    : i18n.language.toLowerCase().startsWith("en")
      ? { title: "Team messages", body: "Read manager announcements and direct messages" }
      : { title: "Сообщения команды", body: "Объявления менеджера и личные сообщения" }
  const notificationsCopy = i18n.language.toLowerCase().startsWith("az")
    ? { title: "Bildirişlər", body: "Mesajlar, sorğu qərarları və müddət xatırlatmaları" }
    : i18n.language.toLowerCase().startsWith("en")
      ? { title: "Notifications", body: "Messages, request decisions and deadline reminders" }
      : { title: "Уведомления", body: "Сообщения, решения по заявкам и напоминания о сроках" }
  const policies = useBootstrapStore(state => state.data?.policies)
  const role = useAuthStore(state => state.agent?.role)
  const actions: MoreAction[] = [
    ...(role === "AGENT" && agentMayAttendanceRequests(policies) ? [{
      route: "AttendanceRequests" as const, icon: "document-text-outline",
      titleKey: "attendanceRequests.title", bodyKey: "attendanceRequests.menuBody",
    }] : []),
    {
      route: "Notifications",
      icon: "notifications-outline",
      title: notificationsCopy.title,
      body: notificationsCopy.body,
    },
    {
      route: "Messages",
      icon: "chatbubble-ellipses-outline",
      title: messagesCopy.title,
      body: messagesCopy.body,
    },
    ...COMMON_ACTIONS,
  ]

  const open = (route: MoreRoute) => {
    switch (route) {
      case "AttendanceRequests":
        navigation.navigate("AttendanceRequests")
        break
      case "Notifications":
        // The bell's list lives over the tabs, not in this stack.
        navigation.navigate("Notifications" as never)
        break
      case "Messages":
        navigation.navigate("Messages")
        break
      case "Visits":
        navigation.navigate("Visits")
        break
      case "GpsHistory":
        navigation.navigate("GpsHistory")
        break
      case "Profile":
        navigation.navigate("Profile")
        break
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: headerTop,
          paddingBottom: tablet ? Math.max(insets.bottom, fieldTheme.space.xl) : tabBarPadding,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <LightScreenStatusBar />
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.title}>{t("moreV2.title")}</Text>
          <NotificationBell tone="light" />
        </View>
        <View style={styles.actionGrid}>
          {actions.map((action) => {
            const title = action.title ?? t(action.titleKey!)
            const body = action.body ?? t(action.bodyKey!)
            return (
              <Pressable
                key={action.route}
                testID={`more-action-${action.route}`}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${body}`}
                accessibilityHint={t("moreV2.openHint")}
                onPress={() => open(action.route)}
                style={({ pressed }) => [
                  styles.action,
                  tablet && styles.actionTablet,
                  pressed && styles.actionPressed,
                ]}
              >
                {/* One grey for every row, no coloured square (owner-approved colours, 2026-10-18). */}
                <View style={styles.iconSurface}>
                  <Icon name={action.icon} size={25} color={fieldTheme.color.inkMuted} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionTitle}>{title}</Text>
                  <Text style={styles.actionBody}>{body}</Text>
                </View>
                <Icon name="chevron-forward" size={22} color={fieldTheme.color.inkMuted} />
              </Pressable>
            )
          })}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: fieldTheme.color.canvas,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: fieldTheme.space.lg,
  },
  content: {
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: fieldTheme.space.sm,
  },
  title: {
    flex: 1,
    color: fieldTheme.color.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: fieldTheme.space.md,
  },
  action: {
    width: "100%",
    minHeight: 88,
    padding: fieldTheme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  actionTablet: {
    width: "48.8%",
    flexGrow: 1,
    flexBasis: 360,
  },
  actionPressed: {
    backgroundColor: fieldTheme.color.surfaceStrong,
    transform: [{ scale: 0.99 }],
  },
  iconSurface: {
    width: 32,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCopy: {
    flex: 1,
    gap: fieldTheme.space.xs,
  },
  actionTitle: {
    color: fieldTheme.color.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  actionBody: {
    color: fieldTheme.color.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
})
