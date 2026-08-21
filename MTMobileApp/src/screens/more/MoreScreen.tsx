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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { isManagerRole } from "../../auth/roles"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { navGroupFromCapabilities } from "../../services/bootstrap"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

type MoreRoute = "Visits" | "Base" | "GpsHistory" | "Profile" | "ContactTransfer"

type MoreAction = {
  route: MoreRoute
  icon: string
  titleKey: string
  bodyKey: string
  iconColor: string
  iconBackground: string
}

const COMMON_ACTIONS: MoreAction[] = [
  {
    route: "Visits",
    icon: "checkmark-circle-outline",
    titleKey: "moreV2.visitsTitle",
    bodyKey: "moreV2.visitsBody",
    iconColor: fieldTheme.color.blue,
    iconBackground: fieldTheme.color.blueSoft,
  },
  {
    route: "Base",
    icon: "business-outline",
    titleKey: "moreV2.baseTitle",
    bodyKey: "moreV2.baseBody",
    iconColor: fieldTheme.color.primaryStrong,
    iconBackground: fieldTheme.color.primarySoft,
  },
  {
    route: "GpsHistory",
    icon: "location-outline",
    titleKey: "moreV2.gpsTitle",
    bodyKey: "moreV2.gpsBody",
    iconColor: fieldTheme.color.violet,
    iconBackground: fieldTheme.color.violetSoft,
  },
  {
    route: "Profile",
    icon: "person-circle-outline",
    titleKey: "moreV2.profileTitle",
    bodyKey: "moreV2.profileBody",
    iconColor: fieldTheme.color.amber,
    iconBackground: fieldTheme.color.amberSoft,
  },
]

const CONTACT_TRANSFER_ACTION: MoreAction = {
  route: "ContactTransfer",
  icon: "people-outline",
  titleKey: "moreV2.transferTitle",
  bodyKey: "moreV2.transferBody",
  iconColor: fieldTheme.color.coral,
  iconBackground: fieldTheme.color.coralSoft,
}

const MANAGER_ACTIONS = [
  ...COMMON_ACTIONS.filter((action) => action.route !== "GpsHistory"),
  CONTACT_TRANSFER_ACTION,
]

export default function MoreScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()
  const role = useAuthStore((state) => state.agent?.role)
  const capabilities = useBootstrapStore((state) => state.capabilities)
  const manager = capabilities.length > 0
    ? navGroupFromCapabilities(capabilities) === "team"
    : isManagerRole(role)
  const tablet = isTabletWidth(width)
  // Personal GPS history requires FIELD_TRACK. Managers use the team map and
  // must not be sent to an endpoint that correctly answers 403 for their role.
  const actions = manager ? MANAGER_ACTIONS : COMMON_ACTIONS

  const open = (route: MoreRoute) => {
    switch (route) {
      case "Visits":
        navigation.navigate("Visits")
        break
      case "Base":
        navigation.navigate("Base")
        break
      case "GpsHistory":
        navigation.navigate("GpsHistory")
        break
      case "Profile":
        navigation.navigate("Profile")
        break
      case "ContactTransfer":
        navigation.navigate("ContactTransfer")
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
      <View style={styles.content}>
        <View style={styles.heading}>
          <View style={styles.eyebrowRow}>
            <Icon name="apps-outline" size={18} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.eyebrow}>{t("moreV2.eyebrow")}</Text>
          </View>
          <Text style={styles.title}>{t("moreV2.title")}</Text>
          <Text style={styles.subtitle}>{t("moreV2.subtitle")}</Text>
        </View>

        <View style={styles.guide} accessibilityRole="summary">
          <Icon name="information-circle-outline" size={22} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.guideText}>{t("moreV2.guide")}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t("moreV2.sectionTitle")}</Text>
        <View style={styles.actionGrid}>
          {actions.map((action) => {
            const title = t(action.titleKey)
            const body = t(action.bodyKey)
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
                <View style={[styles.iconSurface, { backgroundColor: action.iconBackground }]}>
                  <Icon name={action.icon} size={25} color={action.iconColor} />
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
    gap: fieldTheme.space.sm,
  },
  eyebrowRow: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
  },
  eyebrow: {
    color: fieldTheme.color.primaryStrong,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  title: {
    color: fieldTheme.color.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  subtitle: {
    maxWidth: 640,
    color: fieldTheme.color.inkMuted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "500",
  },
  guide: {
    minHeight: 56,
    marginTop: fieldTheme.space.xl,
    paddingHorizontal: fieldTheme.space.lg,
    paddingVertical: fieldTheme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primarySoft,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  guideText: {
    flex: 1,
    color: fieldTheme.color.primaryStrong,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  sectionTitle: {
    marginTop: fieldTheme.space.xxl,
    marginBottom: fieldTheme.space.md,
    color: fieldTheme.color.ink,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
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
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.sm,
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
