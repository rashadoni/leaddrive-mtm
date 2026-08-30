import React, { useState } from "react"
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import ContactsList from "./ContactsList"
import RouteOrganizationExplorerScreen from "./RouteOrganizationExplorerScreen.android"

type BaseTab = "organizations" | "contacts"

const TABS: Array<{ key: BaseTab; icon: string; labelKey: string; bodyKey: string }> = [
  {
    key: "organizations",
    icon: "business-outline",
    labelKey: "organizations.title",
    bodyKey: "baseHub.organizationsBody",
  },
  {
    key: "contacts",
    icon: "people-outline",
    labelKey: "contacts.title",
    bodyKey: "baseHub.contactsBody",
  },
]

/** Route Field's catalog hub; the legacy manager catalog is not imported here. */
export default function RouteBaseScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const [tab, setTab] = useState<BaseTab>("organizations")
  const active = TABS.find((item) => item.key === tab) ?? TABS[0]
  const canGoBack = navigation.canGoBack()

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.titleRow}>
            {canGoBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("baseHub.back")}
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.backButton, tablet && styles.backButtonTablet, pressed && styles.pressed]}
              >
                <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
              </Pressable>
            ) : null}
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{t("baseHub.eyebrow")}</Text>
              <Text style={styles.headerTitle}>{t("baseHub.title")}</Text>
              <Text style={styles.headerSubtitle}>{t(active.bodyKey)}</Text>
            </View>
          </View>

          <View style={[styles.segment, tablet && styles.segmentTablet]}>
            {TABS.map((item) => {
              const selected = tab === item.key
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(item.labelKey)}
                  onPress={() => setTab(item.key)}
                  style={({ pressed }) => [styles.segmentButton, tablet && styles.segmentButtonTablet, selected && styles.segmentButtonActive, pressed && styles.pressed]}
                >
                  <Icon name={selected ? item.icon.replace("-outline", "") : item.icon} size={21} color={selected ? fieldTheme.color.primaryStrong : "#C8DDD4"} />
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{t(item.labelKey)}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {tab === "organizations" ? <RouteOrganizationExplorerScreen /> : <ContactsList />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingBottom: fieldTheme.space.lg, paddingHorizontal: fieldTheme.space.lg },
  headerInner: { width: "100%", maxWidth: 1100, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  backButtonTablet: { width: LAYOUT_TOUCH_TARGETS.expandedTablet, height: LAYOUT_TOUCH_TARGETS.expandedTablet },
  titleCopy: { flex: 1 },
  eyebrow: { color: "#BBD6CB", fontSize: 12, lineHeight: 16, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 29, lineHeight: 35, fontWeight: "900", marginTop: 2 },
  headerSubtitle: { color: "#D7E9E1", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.xs, marginTop: fieldTheme.space.lg, gap: fieldTheme.space.xs },
  segmentTablet: { maxWidth: 560 },
  segmentButton: { flex: 1, minHeight: LAYOUT_TOUCH_TARGETS.compact, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm },
  segmentButtonTablet: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet },
  segmentButtonActive: { backgroundColor: fieldTheme.color.surface },
  segmentText: { fontSize: 14, fontWeight: "800", color: "#D7E9E1" },
  segmentTextActive: { color: fieldTheme.color.primaryStrong },
  content: { flex: 1 },
  pressed: { opacity: 0.72 },
})
