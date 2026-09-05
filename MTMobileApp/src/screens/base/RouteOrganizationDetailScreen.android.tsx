import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import {
  toRouteOrganizationDetail,
  type RouteOrganizationContact,
  type RouteOrganizationDetail,
  type RouteOrganizationVisit,
} from "../../services/route-organization-detail"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    back: "Назад",
    eyebrow: "Точка маршрута",
    loading: "Открываем точку",
    loadingBody: "Загружаем только данные, нужные для работы по маршруту.",
    error: "Не удалось открыть точку",
    errorBody: "Проверьте соединение и повторите попытку. Для защиты данных приложение не переходит на расширенную старую карточку.",
    retry: "Повторить",
    routeOnly: "Карточка содержит только данные точки, её активные контакты и ваши последние визиты.",
    essentials: "Главное",
    contacts: "Контакты",
    visits: "Мои последние визиты",
    noContacts: "Активных контактов для этой точки пока нет.",
    noVisits: "Ваших завершённых или начатых визитов пока нет.",
    address: "Адрес",
    phone: "Телефон",
    code: "Код",
    category: "Категория",
    status: "Статус",
    call: "Позвонить",
    directions: "Построить путь",
    primary: "Основной",
    showAll: (count: number) => `Показать все (${count})`,
    showLess: "Показать меньше",
    unknown: "Не указано",
  },
  az: {
    back: "Geri",
    eyebrow: "Marşrut nöqtəsi",
    loading: "Nöqtə açılır",
    loadingBody: "Yalnız marşrut işi üçün lazım olan məlumatlar yüklənir.",
    error: "Nöqtəni açmaq alınmadı",
    errorBody: "Bağlantını yoxlayın və yenidən cəhd edin. Məlumatların qorunması üçün tətbiq geniş köhnə karta keçmir.",
    retry: "Yenidən cəhd et",
    routeOnly: "Kart yalnız nöqtə məlumatlarını, aktiv kontaktları və son ziyarətlərinizi göstərir.",
    essentials: "Əsas məlumatlar",
    contacts: "Kontaktlar",
    visits: "Son ziyarətlərim",
    noContacts: "Bu nöqtə üçün hələ aktiv kontakt yoxdur.",
    noVisits: "Hələ tamamlanmış və ya başlamış ziyarətiniz yoxdur.",
    address: "Ünvan",
    phone: "Telefon",
    code: "Kod",
    category: "Kateqoriya",
    status: "Status",
    call: "Zəng et",
    directions: "Yolu qur",
    primary: "Əsas",
    showAll: (count: number) => `Hamısını göstər (${count})`,
    showLess: "Daha az göstər",
    unknown: "Göstərilməyib",
  },
  en: {
    back: "Back",
    eyebrow: "Route location",
    loading: "Opening location",
    loadingBody: "Loading only the information needed for route work.",
    error: "We couldn't open this location",
    errorBody: "Check your connection and try again. To protect data, the app will not fall back to the broad legacy card.",
    retry: "Try again",
    routeOnly: "This card shows only location information, active contacts, and your recent visits.",
    essentials: "Essentials",
    contacts: "Contacts",
    visits: "My recent visits",
    noContacts: "There are no active contacts for this location yet.",
    noVisits: "You have no completed or started visits here yet.",
    address: "Address",
    phone: "Phone",
    code: "Code",
    category: "Category",
    status: "Status",
    call: "Call",
    directions: "Get directions",
    primary: "Primary",
    showAll: (count: number) => `Show all (${count})`,
    showLess: "Show less",
    unknown: "Not provided",
  },
} as const

const TYPE_LABEL: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

const CONTACT_TYPE_LABEL: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function readable(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.toLowerCase().replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())
}

function locationAddress(detail: RouteOrganizationDetail): string | undefined {
  const seen = new Set<string>()
  const parts = [detail.address, detail.locality || detail.city, detail.district]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => {
      const key = value.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return parts.join(", ") || undefined
}

function formatVisitDate(value: string | undefined, locale: string, fallback: string): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {typeof count === "number" ? <View style={styles.countPill}><Text style={styles.countText}>{count}</Text></View> : null}
      </View>
      {children}
    </View>
  )
}

function DataRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataIcon}><Icon name={icon} size={18} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.dataCopy}>
        <Text style={styles.dataLabel}>{label}</Text>
        <Text style={styles.dataValue}>{value}</Text>
      </View>
    </View>
  )
}

function ExpandButton({ expanded, label, onPress, touchTarget }: { expanded: boolean; label: string; onPress: () => void; touchTarget: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.expandButton, { minHeight: touchTarget }, pressed && styles.pressed]}
    >
      <Text style={styles.expandText}>{label}</Text>
      <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={fieldTheme.color.primaryStrong} />
    </Pressable>
  )
}

function usableId(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 && normalized !== "undefined" && normalized !== "null"
}

export default function RouteOrganizationDetailScreen() {
  const { t, i18n } = useTranslation()
  const copy = COPY[languageFor(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "OrganizationDetail">>()
  const headerTop = useHeaderTop()
  const { width } = useWindowDimensions()
  const tablet = isExpandedTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const { id, name } = route.params
  const [detail, setDetail] = useState<RouteOrganizationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [contactsExpanded, setContactsExpanded] = useState(false)
  const [visitsExpanded, setVisitsExpanded] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false)
    try {
      const response = await api.getRouteOrganizationDetail(id, signal)
      if (!response?.success || !response.data?.organization) throw new Error("ROUTE_ORGANIZATION_NOT_AVAILABLE")
      if (signal?.aborted) return
      setDetail(toRouteOrganizationDetail(response.data.organization))
    } catch (error: any) {
      if (signal?.aborted || error?.message === "ABORTED" || error?.message === "SESSION_EXPIRED") return
      setFailed(true)
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [id])

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setLoading(true)
    setContactsExpanded(false)
    setVisitsExpanded(false)
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const retry = () => {
    if (detail) setRefreshing(true)
    else setLoading(true)
    void load()
  }

  const contacts = useMemo(
    () => detail ? [...detail.contacts].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)) : [],
    [detail],
  )
  const visits = useMemo(
    () => detail ? [...detail.visits].sort((left, right) => Date.parse(right.checkInAt ?? "") - Date.parse(left.checkInAt ?? "")) : [],
    [detail],
  )
  const visibleContacts = contactsExpanded ? contacts : contacts.slice(0, 4)
  const visibleVisits = visitsExpanded ? visits : visits.slice(0, 4)
  const address = detail ? locationAddress(detail) : undefined
  const title = detail?.name || name || t("organizations.objectOther")
  const typeLabel = detail?.objectType ? t(TYPE_LABEL[detail.objectType] ?? "organizations.objectOther") : t("organizations.objectOther")

  const openExternal = async (url: string) => {
    try {
      await Linking.openURL(url)
    } catch {
      setFailed(true)
    }
  }
  const call = (phone?: string) => {
    if (phone) void openExternal(`tel:${phone.replace(/\s/g, "")}`)
  }
  const openDirections = () => {
    if (address) void openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
  }
  const openContact = (contact: RouteOrganizationContact) => {
    if (usableId(contact.id)) navigation.navigate("ContactDetail", { id: contact.id, name: contact.name })
  }
  const openVisit = (visit: RouteOrganizationVisit) => {
    if (usableId(visit.id)) navigation.navigate("VisitWorkspace", { visitId: visit.id, name: title })
  }

  const body = loading && !detail ? (
    <View style={styles.centerState} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={fieldTheme.color.primary} />
      <Text style={styles.stateTitle}>{copy.loading}</Text>
      <Text style={styles.stateBody}>{copy.loadingBody}</Text>
    </View>
  ) : failed && !detail ? (
    <View style={styles.centerState} accessibilityLiveRegion="polite">
      <Icon name="shield-checkmark-outline" size={40} color={fieldTheme.color.amber} />
      <Text style={styles.stateTitle}>{copy.error}</Text>
      <Text style={styles.stateBody}>{copy.errorBody}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.retryButton, { minHeight: touchTarget }, pressed && styles.pressed]}>
        <Icon name="refresh" size={19} color={fieldTheme.color.onColor} />
        <Text style={styles.retryText}>{copy.retry}</Text>
      </Pressable>
    </View>
  ) : detail ? (
    <View style={styles.content}>
      <View style={styles.scopeNote} accessibilityLiveRegion="polite">
        <Icon name="shield-checkmark-outline" size={19} color={fieldTheme.color.primaryStrong} />
        <Text style={styles.scopeText}>{copy.routeOnly}</Text>
      </View>

      <Section title={copy.essentials}>
        <DataRow icon="location-outline" label={copy.address} value={address ?? copy.unknown} />
        <DataRow icon="call-outline" label={copy.phone} value={detail.phone ?? copy.unknown} />
        {detail.code ? <DataRow icon="barcode-outline" label={copy.code} value={detail.code} /> : null}
        {detail.category ? <DataRow icon="pricetag-outline" label={copy.category} value={detail.category} /> : null}
        {detail.status ? <DataRow icon="shield-checkmark-outline" label={copy.status} value={readable(detail.status) ?? copy.unknown} /> : null}
        <View style={styles.actions}>
          {address ? <Pressable accessibilityRole="button" onPress={openDirections} style={({ pressed }) => [styles.actionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="navigate-outline" size={19} color={fieldTheme.color.onColor} /><Text style={styles.actionText}>{copy.directions}</Text></Pressable> : null}
          {detail.phone ? <Pressable accessibilityRole="button" onPress={() => call(detail.phone)} style={({ pressed }) => [styles.actionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="call-outline" size={19} color={fieldTheme.color.onColor} /><Text style={styles.actionText}>{copy.call}</Text></Pressable> : null}
        </View>
      </Section>

      <Section title={copy.contacts} count={contacts.length}>
        {visibleContacts.length === 0 ? <Text style={styles.emptyText}>{copy.noContacts}</Text> : visibleContacts.map((contact, index) => {
          const subtitle = [contact.position, contact.specialty || (contact.type ? t(CONTACT_TYPE_LABEL[contact.type] ?? "contacts.typeOther") : "")].filter(Boolean).join(" · ")
          return (
            <View key={usableId(contact.id) ? contact.id : `${contact.name}-${index}`} style={styles.relationshipRow}>
              <Pressable accessibilityRole="button" onPress={() => openContact(contact)} style={({ pressed }) => [styles.relationshipMain, { minHeight: touchTarget }, pressed && styles.pressed]}>
                <View style={[styles.avatar, contact.isPrimary && styles.avatarPrimary]}><Text style={styles.avatarText}>{contact.name.slice(0, 1).toUpperCase() || "?"}</Text></View>
                <View style={styles.relationshipCopy}>
                  <View style={styles.nameLine}><Text style={styles.relationshipName} numberOfLines={1}>{contact.name || copy.unknown}</Text>{contact.isPrimary ? <Text style={styles.primaryText}>{copy.primary}</Text> : null}</View>
                  {subtitle ? <Text style={styles.relationshipSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
                </View>
                <Icon name="chevron-forward" size={19} color={fieldTheme.color.inkMuted} />
              </Pressable>
              {contact.phone ? <Pressable accessibilityRole="button" accessibilityLabel={`${copy.call}: ${contact.name}`} onPress={() => call(contact.phone)} style={({ pressed }) => [styles.callButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}><Icon name="call-outline" size={20} color={fieldTheme.color.primaryStrong} /></Pressable> : null}
            </View>
          )
        })}
        {contacts.length > 4 ? <ExpandButton expanded={contactsExpanded} label={contactsExpanded ? copy.showLess : copy.showAll(contacts.length)} onPress={() => setContactsExpanded((value) => !value)} touchTarget={touchTarget} /> : null}
      </Section>

      <Section title={copy.visits} count={visits.length}>
        {visibleVisits.length === 0 ? <Text style={styles.emptyText}>{copy.noVisits}</Text> : visibleVisits.map((visit) => (
          <Pressable key={visit.id} accessibilityRole="button" onPress={() => openVisit(visit)} style={({ pressed }) => [styles.visitRow, { minHeight: touchTarget + 8 }, pressed && styles.pressed]}>
            <View style={styles.visitIcon}><Icon name="calendar-clear-outline" size={20} color={fieldTheme.color.blue} /></View>
            <View style={styles.relationshipCopy}>
              <Text style={styles.relationshipName}>{formatVisitDate(visit.checkInAt, i18n.language, copy.unknown)}</Text>
              <Text style={styles.relationshipSubtitle}>{[readable(visit.status), readable(visit.outcome)].filter(Boolean).join(" · ") || copy.unknown}</Text>
            </View>
            <Icon name="chevron-forward" size={19} color={fieldTheme.color.inkMuted} />
          </Pressable>
        ))}
        {visits.length > 4 ? <ExpandButton expanded={visitsExpanded} label={visitsExpanded ? copy.showLess : copy.showAll(visits.length)} onPress={() => setVisitsExpanded((value) => !value)} touchTarget={touchTarget} /> : null}
      </Section>
    </View>
  ) : null

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}>
          <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.headerSubtitle}>{typeLabel}{detail?.status ? ` · ${readable(detail.status)}` : ""}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
      >
        {body}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.primaryStrong },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  headerCopy: { flex: 1, paddingTop: 2 },
  eyebrow: { color: "#BBD6CB", fontSize: 12, fontWeight: "800", letterSpacing: 0.7 },
  headerTitle: { marginTop: 2, color: fieldTheme.color.onColor, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  headerSubtitle: { marginTop: 2, color: "#D7E9E1", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  scrollContent: { flexGrow: 1, padding: fieldTheme.space.md },
  content: { gap: fieldTheme.space.md, width: "100%", maxWidth: 880, alignSelf: "center" },
  centerState: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.xl },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  scopeNote: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  scopeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  section: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm },
  sectionTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  countPill: { minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  countText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  dataRow: { flexDirection: "row", gap: fieldTheme.space.sm, alignItems: "flex-start", paddingVertical: fieldTheme.space.xs },
  dataIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primarySoft },
  dataCopy: { flex: 1, gap: 1 },
  dataLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.35 },
  dataValue: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.xs },
  actionButton: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  actionText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  emptyText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 },
  relationshipRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  relationshipMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.sm },
  avatar: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: fieldTheme.color.surfaceStrong },
  avatarPrimary: { backgroundColor: fieldTheme.color.primarySoft },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "900" },
  relationshipCopy: { flex: 1, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs },
  relationshipName: { flex: 1, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  relationshipSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  primaryText: { color: fieldTheme.color.primaryStrong, fontSize: 10, fontWeight: "900" },
  callButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm },
  visitRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingVertical: fieldTheme.space.sm },
  visitIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.blueSoft },
  expandButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  expandText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
})
