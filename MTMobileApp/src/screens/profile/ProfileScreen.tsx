import React, { useCallback, useEffect, useState } from "react"
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import ConfirmSheet from "../../components/ConfirmSheet"
import { setLocale, getCurrentLocale, SUPPORTED_LOCALES, type SupportedLocale } from "../../i18n"
import { useHintsStore } from "../../store/hints"
import { version as APP_VERSION } from "../../../package.json"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { upperInitial } from "../../lib/upper"
import { statusLabel } from "../../lib/status-labels"
import { isActiveAlert, readAlertMessage } from "../../lib/alert-messages"

interface MtmAlert {
  id: string
  type: string
  category: string
  title: string
  description?: string
  isResolved: boolean
  createdAt: string
  // What happened and with which numbers, so the phone can say it in the
  // rep's language instead of showing the server's English (audit A4).
  metadata?: unknown
}

// Translation keys of the language picker, built without upper-casing so the
// key stays ASCII whatever the UI locale's casing rules are (audit B13).
const LANGUAGE_LABEL_KEY: Record<string, string> = {
  az: "profile.languageAz",
  en: "profile.languageEn",
  ru: "profile.languageRu",
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const twoColumn = isExpandedTabletWidth(width)
  const { agent, logout, switchServer, serverDomain } = useAuthStore()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [profile, setProfile] = useState<any>(null)
  const [alerts, setAlerts] = useState<MtmAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"logout" | "switch" | null>(null)
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(getCurrentLocale())
  const hintsEnabled = useHintsStore((state) => state.enabled)
  const setHintsEnabled = useHintsStore((state) => state.setEnabled)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const [profileResult, alertsResult] = await Promise.all([
        api.getProfile().catch(() => null),
        api.getAlerts({ resolved: false }).catch(() => null),
      ])
      const profileLoaded = profileResult?.success === true
      const alertsLoaded = alertsResult?.success === true
      if (profileLoaded) setProfile(profileResult.data)
      if (alertsLoaded) {
        // "Active" means unresolved AND recent. A June warning nobody closed
        // is still on the server, it just stops pushing today's off the card
        // (audit A4).
        const now = new Date()
        setAlerts((alertsResult.data?.alerts || []).filter((alert: MtmAlert) => isActiveAlert(alert, now)))
      }
      setLoadError(!profileLoaded && !alertsLoaded)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setLoadError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const onPickLocale = async (locale: SupportedLocale) => {
    await setLocale(locale)
    setCurrentLocale(locale)
  }

  const handleConfirm = () => {
    if (confirmAction === "logout") logout()
    else if (confirmAction === "switch") switchServer()
    setConfirmAction(null)
  }

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color={fieldTheme.color.primary} />
        <Text style={styles.loadingText}>{t("profile.loadingProfile")}</Text>
      </View>
    )
  }

  const mainColumn = (
    <View style={styles.column}>
      {alerts.length > 0 ? (
        <SectionCard icon="notifications-outline" title={t("profile.alertsTitle")} count={alerts.length}>
          {alerts.slice(0, 5).map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={[styles.alertIcon, { backgroundColor: severityTint(alert.category) }]}>
                <Icon name="alert-outline" size={18} color={severityColor(alert.category)} />
              </View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle}>{alert.title || alert.type?.replace(/_/g, " ")}</Text>
                {(() => {
                  const message = readAlertMessage(alert.metadata)
                  const text = message.kind === "localized"
                    ? t(`alertMessages.${message.key}`, message.params)
                    : alert.description
                  return text ? <Text style={styles.alertDescription} numberOfLines={2}>{text}</Text> : null
                })()}
              </View>
              <Text style={styles.alertDate}>
                {new Date(alert.createdAt).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
              </Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      <SectionCard icon="person-outline" title={t("profile.contactInfoTitle")}>
        <InfoRow icon="mail-outline" label={t("profile.infoEmail")} value={agent?.email || "—"} />
        <InfoRow icon="call-outline" label={t("profile.infoPhone")} value={agent?.phone || "—"} />
      </SectionCard>
    </View>
  )

  const settingsColumn = (
    <View style={styles.column}>
      <SectionCard icon="cloud-done-outline" title={t("profile.connectionTitle")}>
        <InfoRow icon="business-outline" label={t("profile.infoServer")} value={serverDomain || "—"} />
        <InfoRow
          icon={loadError ? "cloud-offline-outline" : "checkmark-circle-outline"}
          label={t("profile.infoStatus")}
          value={t(loadError ? "profile.statusNotConfirmed" : "profile.statusConnected")}
          valueColor={loadError ? fieldTheme.color.amber : fieldTheme.color.success}
        />
      </SectionCard>

      <SectionCard icon="language-outline" title={t("profile.language")}>
        <View style={styles.localeRow}>
          {SUPPORTED_LOCALES.map((locale) => {
            const selected = currentLocale === locale
            const label = t(LANGUAGE_LABEL_KEY[locale] ?? `profile.language${locale}` as any)
            return (
              <Pressable
                key={locale}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                onPress={() => { void onPickLocale(locale) }}
                style={({ pressed }) => [
                  styles.localeButton,
                  selected && styles.localeButtonSelected,
                  pressed && styles.pressed,
                ]}
              >
                {selected ? <Icon name="checkmark-circle" size={18} color={fieldTheme.color.onColor} /> : null}
                <Text style={[styles.localeText, selected && styles.localeTextSelected]}>{label}</Text>
              </Pressable>
            )
          })}
        </View>
      </SectionCard>

      <SectionCard icon="help-circle-outline" title={t("profile.hintsTitle")}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleLabel}>{t("profile.hintsShow")}</Text>
            <Text style={styles.toggleNote}>{t("profile.hintsNote")}</Text>
          </View>
          <Switch
            value={hintsEnabled}
            onValueChange={setHintsEnabled}
            trackColor={{ false: fieldTheme.color.border, true: fieldTheme.color.primarySoft }}
            thumbColor={hintsEnabled ? fieldTheme.color.primary : fieldTheme.color.inkMuted}
          />
        </View>
      </SectionCard>


      <View style={styles.accountActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmAction("switch")}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          <Icon name="business-outline" size={20} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.secondaryActionText}>{t("profile.switchServer")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmAction("logout")}
          style={({ pressed }) => [styles.dangerAction, pressed && styles.pressed]}
        >
          <Icon name="log-out-outline" size={20} color={fieldTheme.color.danger} />
          <Text style={styles.dangerActionText}>{t("profile.logout")}</Text>
        </Pressable>
      </View>
    </View>
  )

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { void load(true) }}
            colors={[fieldTheme.color.primary]}
            tintColor={fieldTheme.color.primary}
          />
        )}
      >
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerInner}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("profile.back")}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
            </Pressable>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{upperInitial(agent?.name)}</Text>
            </View>
            <View style={styles.identity}>
              <Text style={styles.name}>{agent?.name || agent?.email}</Text>
              <Text style={styles.role}>{statusLabel(t, "role", agent?.role)}</Text>
              {agent?.organizationName ? <Text style={styles.organization}>{agent.organizationName}</Text> : null}
            </View>
          </View>
        </View>

        {loadError ? (
          <View style={styles.errorBanner}>
            <Icon name="cloud-offline-outline" size={21} color={fieldTheme.color.amber} />
            <Text style={styles.errorText}>{t("profile.loadError")}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void load(true) }} style={styles.retryButton}>
              <Text style={styles.retryText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.content, twoColumn && styles.contentTwoColumn]}>
          {mainColumn}
          {settingsColumn}
        </View>
        <Text style={styles.version}>Route & Field v{APP_VERSION}</Text>
      </ScrollView>

      <ConfirmSheet
        visible={confirmAction === "logout"}
        iconColor={fieldTheme.color.danger}
        title={t("profile.logoutTitle")}
        message={t("profile.logoutMessage")}
        confirmText={t("profile.logoutConfirm")}
        cancelText={t("common.cancel")}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
      <ConfirmSheet
        visible={confirmAction === "switch"}
        iconColor={fieldTheme.color.primary}
        title={t("profile.switchTitle")}
        message={t("profile.switchMessage")}
        confirmText={t("profile.switchConfirm")}
        cancelText={t("common.cancel")}
        destructive
        onCancel={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
      />
    </View>
  )
}

function SectionCard({ icon, title, count, children }: {
  icon: string
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeading}>
        <View style={styles.cardTitleRow}>
          <Icon name={icon} size={20} color={fieldTheme.color.primary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {count != null ? <View style={styles.countBadge}><Text style={styles.countText}>{count}</Text></View> : null}
      </View>
      {children}
    </View>
  )
}

function InfoRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}><Icon name={icon} size={18} color={fieldTheme.color.inkMuted} /></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  )
}

function severityColor(category?: string) {
  if (category === "CRITICAL") return fieldTheme.color.danger
  if (category === "WARNING") return fieldTheme.color.amber
  return fieldTheme.color.blue
}

function severityTint(category?: string) {
  if (category === "CRITICAL") return fieldTheme.color.dangerSoft
  if (category === "WARNING") return fieldTheme.color.amberSoft
  return fieldTheme.color.blueSoft
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.canvas },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "600" },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  headerInner: { width: "100%", maxWidth: 1120, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  backButton: { width: 48, height: 48, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,252,250,0.14)" },
  avatar: { width: 58, height: 58, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primary },
  avatarText: { color: fieldTheme.color.onColor, fontSize: 25, fontWeight: "900" },
  identity: { flex: 1, minWidth: 0 },
  name: { color: fieldTheme.color.onColor, fontSize: 24, lineHeight: 30, fontWeight: "900" },
  role: { color: fieldTheme.color.primarySoft, marginTop: 2, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  organization: { color: "#CFE3DA", marginTop: 3, fontSize: 13, fontWeight: "600" },
  errorBanner: { width: "100%", maxWidth: 1120, alignSelf: "center", marginTop: fieldTheme.space.lg, padding: fieldTheme.space.md, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#E7CB8A", backgroundColor: fieldTheme.color.amberSoft },
  errorText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, fontWeight: "700" },
  retryButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, paddingHorizontal: fieldTheme.space.md, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.surface },
  retryText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: fieldTheme.space.lg, gap: fieldTheme.space.lg },
  contentTwoColumn: { flexDirection: "row", alignItems: "flex-start", padding: fieldTheme.space.xl, gap: fieldTheme.space.xl },
  column: { flex: 1, minWidth: 0, gap: fieldTheme.space.lg },
  card: { padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, marginBottom: fieldTheme.space.lg },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  cardTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900" },
  countBadge: { minWidth: 30, height: 30, paddingHorizontal: fieldTheme.space.sm, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.coralSoft },
  countText: { color: fieldTheme.color.coral, fontSize: 13, fontWeight: "900" },
  alertRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.sm, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  alertIcon: { width: 38, height: 38, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center" },
  alertCopy: { flex: 1, minWidth: 0 },
  alertTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  alertDescription: { marginTop: 2, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  alertDate: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  infoRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  infoIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.canvas },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  infoValue: { marginTop: 2, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  localeRow: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  localeButton: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet, minWidth: 104, flexGrow: 1, paddingHorizontal: fieldTheme.space.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas },
  localeButtonSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primary },
  localeText: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  localeTextSelected: { color: fieldTheme.color.onColor },
  toggleRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  toggleCopy: { flex: 1, minWidth: 0 },
  toggleLabel: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  toggleNote: { marginTop: 4, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  accountActions: { gap: fieldTheme.space.sm },
  secondaryAction: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet, paddingHorizontal: fieldTheme.space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.primarySoft },
  secondaryActionText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  dangerAction: { minHeight: LAYOUT_TOUCH_TARGETS.expandedTablet, paddingHorizontal: fieldTheme.space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#EDBEBE", backgroundColor: fieldTheme.color.dangerSoft },
  dangerActionText: { color: fieldTheme.color.danger, fontSize: 14, fontWeight: "900" },
  version: { marginBottom: fieldTheme.space.lg, color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "600", textAlign: "center" },
  pressed: { opacity: 0.72 },
})
