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
import { useNavigation, useRoute } from "@react-navigation/native"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { managerApi } from "../../services/manager-api"
import {
  toOrganizationDetail,
  type OrgDetailContact,
  type OrgDetailVisit,
  type OrganizationDetail,
} from "../../services/organization-detail"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import {
  disclosedOrganizationItems,
  organizationDetailViewState,
  recentOrganizationVisits,
  selectOrganizationPrimaryAction,
  usableOrganizationRecordId,
  type OrganizationPrimaryAction,
} from "./organization-detail-state"

type Language = "ru" | "az" | "en"

const OBJECT_TYPE_KEY: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

const CONTACT_TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

const COPY = {
  ru: {
    eyebrow: "Карточка организации",
    back: "Назад",
    loadingTitle: "Открываем организацию",
    loadingBody: "Загружаем адрес, контакты и последние визиты.",
    errorTitle: "Не удалось открыть организацию",
    errorBody: "Проверьте интернет и попробуйте снова. Сохранённой полной карточки на устройстве нет.",
    staleTitle: "Не удалось обновить карточку",
    staleBody: "Показываем данные, которые уже были открыты. Проверьте связь и повторите обновление.",
    retry: "Попробовать снова",
    nextStep: "Следующий шаг",
    directionsTitle: "Поехать в организацию",
    directionsBody: "Откройте адрес в картах и постройте путь.",
    directionsAction: "Построить путь",
    callTitle: "Связаться с организацией",
    callBody: "Позвоните по указанному номеру.",
    callContactBody: (name: string) => `Позвоните контакту: ${name}.`,
    callAction: "Позвонить",
    contactTitle: "Открыть основной контакт",
    contactBody: "Посмотрите профиль и рабочие данные контакта.",
    contactAction: "Открыть контакт",
    visitTitle: "Проверить последний визит",
    visitBody: "Откройте сохранённый итог последнего визита.",
    visitAction: "Открыть визит",
    noActionTitle: "Основные данные организации",
    noActionBody: "Адрес и телефон пока не указаны. Контакты и визиты доступны ниже, если они были добавлены.",
    quickActions: "Быстрые действия",
    overview: "Главное",
    address: "Адрес",
    phone: "Телефон",
    contactPerson: "Контактное лицо",
    lastVisit: "Последний визит",
    noAddress: "Адрес не указан",
    noPhone: "Телефон не указан",
    contacts: "Контакты",
    contactsHint: "Нажмите на имя, чтобы открыть профиль.",
    noContacts: "К этой организации пока не привязаны контакты.",
    primaryContact: "Основной",
    recentVisits: "Последние визиты",
    visitsHint: "Нажмите на визит, чтобы увидеть сохранённый итог.",
    noVisits: "У этой организации пока нет визитов.",
    moreDetails: "Дополнительные сведения",
    moreDetailsHint: "Территория, ответственные и служебные поля.",
    showDetails: "Показать сведения",
    hideDetails: "Скрыть сведения",
    showAll: (count: number) => `Показать все (${count})`,
    showLess: "Показать меньше",
    actionError: "Не удалось открыть действие. Проверьте настройки устройства и попробуйте снова.",
    unknownDate: "Дата не указана",
    status: { ACTIVE: "Активна", INACTIVE: "Неактивна", PENDING: "На проверке", ARCHIVED: "В архиве" },
    visitStatus: { PLANNED: "Запланирован", CHECKED_IN: "Идёт сейчас", CHECKED_OUT: "Завершён", COMPLETED: "Завершён", CANCELLED: "Отменён" },
    outcome: { SUCCESSFUL: "Успешно", PARTIAL: "Частично", NO_CONTACT: "Контакт не состоялся", RESCHEDULE: "Перенесён" },
  },
  az: {
    eyebrow: "Təşkilat kartı",
    back: "Geri",
    loadingTitle: "Təşkilat açılır",
    loadingBody: "Ünvan, kontaktlar və son ziyarətlər yüklənir.",
    errorTitle: "Təşkilatı açmaq alınmadı",
    errorBody: "İnterneti yoxlayın və yenidən cəhd edin. Tam kart cihazda saxlanılmayıb.",
    staleTitle: "Kartı yeniləmək alınmadı",
    staleBody: "Əvvəl açılmış məlumatlar göstərilir. Bağlantını yoxlayın və yenidən yeniləyin.",
    retry: "Yenidən cəhd et",
    nextStep: "Növbəti addım",
    directionsTitle: "Təşkilata get",
    directionsBody: "Ünvanı xəritədə açın və yolu qurun.",
    directionsAction: "Yolu qur",
    callTitle: "Təşkilatla əlaqə saxla",
    callBody: "Göstərilən nömrəyə zəng edin.",
    callContactBody: (name: string) => `Kontakta zəng edin: ${name}.`,
    callAction: "Zəng et",
    contactTitle: "Əsas kontaktı aç",
    contactBody: "Kontaktın profilinə və iş məlumatlarına baxın.",
    contactAction: "Kontaktı aç",
    visitTitle: "Son ziyarəti yoxla",
    visitBody: "Son ziyarətin saxlanmış nəticəsini açın.",
    visitAction: "Ziyarəti aç",
    noActionTitle: "Təşkilatın əsas məlumatları",
    noActionBody: "Ünvan və telefon hələ göstərilməyib. Əlavə edilibsə, kontaktlar və ziyarətlər aşağıda görünəcək.",
    quickActions: "Sürətli əməliyyatlar",
    overview: "Əsas məlumat",
    address: "Ünvan",
    phone: "Telefon",
    contactPerson: "Əlaqə şəxsi",
    lastVisit: "Son ziyarət",
    noAddress: "Ünvan göstərilməyib",
    noPhone: "Telefon göstərilməyib",
    contacts: "Kontaktlar",
    contactsHint: "Profili açmaq üçün ada toxunun.",
    noContacts: "Bu təşkilata hələ kontakt bağlanmayıb.",
    primaryContact: "Əsas",
    recentVisits: "Son ziyarətlər",
    visitsHint: "Saxlanmış nəticəni görmək üçün ziyarətə toxunun.",
    noVisits: "Bu təşkilatın hələ ziyarəti yoxdur.",
    moreDetails: "Əlavə məlumatlar",
    moreDetailsHint: "Ərazi, məsullar və xidməti sahələr.",
    showDetails: "Məlumatları göstər",
    hideDetails: "Məlumatları gizlət",
    showAll: (count: number) => `Hamısını göstər (${count})`,
    showLess: "Daha az göstər",
    actionError: "Əməliyyatı açmaq alınmadı. Cihaz ayarlarını yoxlayın və yenidən cəhd edin.",
    unknownDate: "Tarix göstərilməyib",
    status: { ACTIVE: "Aktivdir", INACTIVE: "Aktiv deyil", PENDING: "Yoxlamadadır", ARCHIVED: "Arxivdədir" },
    visitStatus: { PLANNED: "Planlaşdırılıb", CHECKED_IN: "İndi davam edir", CHECKED_OUT: "Tamamlanıb", COMPLETED: "Tamamlanıb", CANCELLED: "Ləğv edilib" },
    outcome: { SUCCESSFUL: "Uğurlu", PARTIAL: "Qismən", NO_CONTACT: "Görüş baş tutmadı", RESCHEDULE: "Başqa vaxta keçirilib" },
  },
  en: {
    eyebrow: "Organization card",
    back: "Back",
    loadingTitle: "Opening the organization",
    loadingBody: "Loading its address, contacts and recent visits.",
    errorTitle: "We couldn't open this organization",
    errorBody: "Check your connection and try again. A complete card is not saved on this device.",
    staleTitle: "We couldn't refresh this card",
    staleBody: "Showing the information already opened. Check your connection and refresh again.",
    retry: "Try again",
    nextStep: "Next step",
    directionsTitle: "Go to the organization",
    directionsBody: "Open the address in maps and get directions.",
    directionsAction: "Get directions",
    callTitle: "Contact the organization",
    callBody: "Call the saved phone number.",
    callContactBody: (name: string) => `Call the contact: ${name}.`,
    callAction: "Call now",
    contactTitle: "Open the primary contact",
    contactBody: "Review the contact's profile and workplace details.",
    contactAction: "Open contact",
    visitTitle: "Review the last visit",
    visitBody: "Open the saved result from the most recent visit.",
    visitAction: "Open visit",
    noActionTitle: "Organization essentials",
    noActionBody: "No address or phone is saved yet. Contacts and visits appear below when available.",
    quickActions: "Quick actions",
    overview: "Essentials",
    address: "Address",
    phone: "Phone",
    contactPerson: "Contact person",
    lastVisit: "Last visit",
    noAddress: "No address provided",
    noPhone: "No phone provided",
    contacts: "Contacts",
    contactsHint: "Tap a name to open the profile.",
    noContacts: "No contacts are linked to this organization yet.",
    primaryContact: "Primary",
    recentVisits: "Recent visits",
    visitsHint: "Tap a visit to see its saved summary.",
    noVisits: "This organization has no visits yet.",
    moreDetails: "Additional details",
    moreDetailsHint: "Territory, ownership and operational fields.",
    showDetails: "Show details",
    hideDetails: "Hide details",
    showAll: (count: number) => `Show all (${count})`,
    showLess: "Show less",
    actionError: "We couldn't open that action. Check the device settings and try again.",
    unknownDate: "Date not provided",
    status: { ACTIVE: "Active", INACTIVE: "Inactive", PENDING: "Pending review", ARCHIVED: "Archived" },
    visitStatus: { PLANNED: "Planned", CHECKED_IN: "In progress", CHECKED_OUT: "Completed", COMPLETED: "Completed", CANCELLED: "Cancelled" },
    outcome: { SUCCESSFUL: "Successful", PARTIAL: "Partial", NO_CONTACT: "No contact", RESCHEDULE: "Rescheduled" },
  },
} as const

type Copy = typeof COPY.ru | typeof COPY.az | typeof COPY.en

function languageFor(value: string): Language {
  const language = value.toLowerCase()
  if (language.startsWith("az")) return "az"
  if (language.startsWith("en")) return "en"
  return "ru"
}

function readableCode(value: string | undefined, labels: Readonly<Record<string, string>>): string {
  if (!value) return "—"
  return labels[value] ?? value.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase())
}

function organizationAddress(detail: OrganizationDetail): string {
  const parts = [detail.address, detail.locality || detail.city, detail.district]
  const seen = new Set<string>()
  return parts
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => {
      const key = value.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(", ")
}

function formatVisitDate(value: string | undefined, language: string, fallback: string): string {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString(language, { day: "numeric", month: "short", year: "numeric" })
}

function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string
  hint?: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        </View>
        {typeof count === "number" ? (
          <View style={styles.countPill}><Text style={styles.countText}>{count}</Text></View>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function InfoRow({ icon, label, value, muted = false }: { icon: string; label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}><Icon name={icon} size={19} color={fieldTheme.color.primaryStrong} /></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, muted && styles.infoValueMuted]}>{value}</Text>
      </View>
    </View>
  )
}

function DisclosureButton({ label, expanded, onPress, touchTarget }: { label: string; expanded: boolean; onPress: () => void; touchTarget: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.disclosureButton, { minHeight: touchTarget }, pressed && styles.pressed]}
    >
      <Text style={styles.disclosureText}>{label}</Text>
      <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={fieldTheme.color.primaryStrong} />
    </Pressable>
  )
}

function ContactRow({
  contact,
  copy,
  subtitle,
  onOpen,
  onCall,
  touchTarget,
}: {
  contact: OrgDetailContact
  copy: Copy
  subtitle: string
  onOpen?: () => void
  onCall?: () => void
  touchTarget: number
}) {
  return (
    <View style={styles.relationshipRow}>
      <Pressable
        disabled={!onOpen}
        accessibilityRole={onOpen ? "button" : undefined}
        accessibilityLabel={onOpen ? `${copy.contactAction}: ${contact.name}` : contact.name}
        onPress={onOpen}
        style={({ pressed }) => [styles.relationshipMain, { minHeight: touchTarget }, pressed && onOpen && styles.pressed]}
      >
        <View style={[styles.avatar, contact.isPrimary && styles.avatarPrimary]}>
          <Text style={styles.avatarText}>{contact.name.trim().slice(0, 1).toUpperCase() || "?"}</Text>
        </View>
        <View style={styles.relationshipCopy}>
          <View style={styles.relationshipTitleRow}>
            <Text style={styles.relationshipTitle} numberOfLines={1}>{contact.name || "—"}</Text>
            {contact.isPrimary ? (
              <View style={styles.primaryPill}>
                <Icon name="star" size={11} color={fieldTheme.color.amber} />
                <Text style={styles.primaryText}>{copy.primaryContact}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={styles.relationshipSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {onOpen ? <Icon name="chevron-forward" size={19} color={fieldTheme.color.inkMuted} /> : null}
      </Pressable>
      {onCall ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy.callAction}: ${contact.name}`}
          onPress={onCall}
          style={({ pressed }) => [styles.rowAction, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
        >
          <Icon name="call-outline" size={20} color={fieldTheme.color.primaryStrong} />
        </Pressable>
      ) : null}
    </View>
  )
}

function VisitRow({
  visit,
  date,
  status,
  outcome,
  onOpen,
  touchTarget,
  copy,
  compact,
}: {
  visit: OrgDetailVisit
  date: string
  status: string
  outcome?: string
  onOpen?: () => void
  touchTarget: number
  copy: Copy
  compact: boolean
}) {
  return (
    <Pressable
      disabled={!onOpen}
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityLabel={onOpen ? `${copy.visitAction}: ${date}` : date}
      onPress={onOpen}
      style={({ pressed }) => [styles.visitRow, { minHeight: touchTarget + 12 }, pressed && onOpen && styles.pressed]}
    >
      <View style={styles.visitIcon}><Icon name="calendar-clear-outline" size={20} color={fieldTheme.color.blue} /></View>
      <View style={styles.relationshipCopy}>
        <View style={styles.relationshipTitleRow}>
          <Text style={styles.relationshipTitle}>{date}</Text>
          {compact ? <View style={styles.statusPill}><Text style={styles.statusText}>{status}</Text></View> : null}
        </View>
        <Text style={styles.relationshipSubtitle} numberOfLines={2}>
          {[visit.agentName, outcome].filter(Boolean).join(" · ") || status}
        </Text>
      </View>
      {!compact ? <View style={styles.statusPill}><Text style={styles.statusText}>{status}</Text></View> : null}
      {onOpen ? <Icon name="chevron-forward" size={19} color={fieldTheme.color.inkMuted} /> : null}
    </Pressable>
  )
}

export default function OrganizationDetailScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "OrganizationDetail">>()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const splitLayout = isExpandedTabletWidth(width)
  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const copy = COPY[languageFor(i18n.language)]
  const { id, name } = route.params

  const [detail, setDetail] = useState<OrganizationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [contactsExpanded, setContactsExpanded] = useState(false)
  const [visitsExpanded, setVisitsExpanded] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(false)

  const fetchDetail = useCallback(async (signal?: AbortSignal) => {
    setLoadFailed(false)
    try {
      const response = await managerApi.getOrganization(id, signal)
      if (!response.success || !response.data?.organization) {
        throw new Error(response.error || "ORGANIZATION_NOT_AVAILABLE")
      }
      if (signal?.aborted) return
      setDetail(toOrganizationDetail(response.data.organization))
    } catch (error: any) {
      if (error?.message === "ABORTED" || error?.message === "SESSION_EXPIRED") return
      setLoadFailed(true)
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
    setActionError(false)
    void fetchDetail(controller.signal)
    return () => controller.abort()
  }, [fetchDetail])

  const retry = () => {
    setActionError(false)
    if (detail) setRefreshing(true)
    else setLoading(true)
    void fetchDetail()
  }

  const state = organizationDetailViewState({ loading, hasDetail: Boolean(detail), loadFailed })
  const title = detail?.name || name || t("organizations.objectOther")
  const sortedContacts = useMemo(
    () => detail ? [...detail.contacts].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary)) : [],
    [detail],
  )
  const sortedVisits = useMemo(() => recentOrganizationVisits(detail?.visits ?? []).slice(0, 15), [detail?.visits])
  const initialRows = tablet ? 4 : 3
  const visibleContacts = disclosedOrganizationItems(sortedContacts, contactsExpanded, initialRows)
  const visibleVisits = disclosedOrganizationItems(sortedVisits, visitsExpanded, initialRows)
  const primaryContact = sortedContacts.find((contact) => usableOrganizationRecordId(contact.id)) ?? sortedContacts[0]
  const lastVisit = sortedVisits[0]
  const address = detail ? organizationAddress(detail) : ""
  const primaryPhone = detail?.phone || primaryContact?.phone
  const primaryAction = detail ? selectOrganizationPrimaryAction({
    hasAddress: Boolean(address),
    phone: primaryPhone,
    contactId: primaryContact?.id,
    visitId: lastVisit?.id,
  }) : "none"

  const runLink = async (url: string) => {
    setActionError(false)
    try {
      await Linking.openURL(url)
    } catch {
      setActionError(true)
    }
  }

  const openDirections = () => {
    if (address) void runLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
  }
  const call = (phone?: string) => {
    if (phone) void runLink(`tel:${phone.replace(/\s/g, "")}`)
  }
  const openContact = (contact?: OrgDetailContact) => {
    if (contact && usableOrganizationRecordId(contact.id)) {
      navigation.navigate("ContactDetail", { id: contact.id, name: contact.name })
    }
  }
  const openVisit = (visit?: OrgDetailVisit) => {
    if (visit && usableOrganizationRecordId(visit.id)) {
      navigation.navigate("VisitWorkspace", { visitId: visit.id, name: title })
    }
  }

  const primaryActionContent: Record<OrganizationPrimaryAction, { icon: string; title: string; body: string; label?: string; onPress?: () => void }> = {
    directions: { icon: "navigate", title: copy.directionsTitle, body: copy.directionsBody, label: copy.directionsAction, onPress: openDirections },
    call: {
      icon: "call",
      title: copy.callTitle,
      body: detail?.phone || !primaryContact?.name ? copy.callBody : copy.callContactBody(primaryContact.name),
      label: copy.callAction,
      onPress: () => call(primaryPhone),
    },
    contact: { icon: "person", title: copy.contactTitle, body: copy.contactBody, label: copy.contactAction, onPress: () => openContact(primaryContact) },
    visit: { icon: "calendar-clear", title: copy.visitTitle, body: copy.visitBody, label: copy.visitAction, onPress: () => openVisit(lastVisit) },
    none: { icon: "business-outline", title: copy.noActionTitle, body: copy.noActionBody },
  }
  const nextAction = primaryActionContent[primaryAction]

  const objectType = detail?.objectType
    ? t(OBJECT_TYPE_KEY[detail.objectType] ?? "organizations.objectOther")
    : t("organizations.objectOther")
  const status = detail?.status ? readableCode(detail.status, copy.status) : null
  const lastVisitDate = lastVisit ? formatVisitDate(lastVisit.checkInAt, i18n.language, copy.unknownDate) : copy.unknownDate

  const detailRows = detail ? [
    detail.code ? { label: t("organizations.fieldCode"), value: detail.code } : null,
    detail.category ? { label: t("organizations.category"), value: detail.category } : null,
    detail.status ? { label: t("organizations.status"), value: readableCode(detail.status, copy.status) } : null,
    detail.region ? { label: t("organizations.region"), value: detail.region } : null,
    detail.administrativeDistrict ? { label: t("organizations.adminDistrict"), value: detail.administrativeDistrict } : null,
    detail.locality ? { label: t("organizations.locality"), value: detail.locality } : null,
    detail.cityDistrict ? { label: t("organizations.cityDistrict"), value: detail.cityDistrict } : null,
    detail.specialization ? { label: t("organizations.specialization"), value: detail.specialization } : null,
    detail.organizationKind ? { label: t("organizations.organizationKind"), value: detail.organizationKind } : null,
    detail.territoryCode ? { label: t("organizations.territory"), value: detail.territoryCode } : null,
    detail.managingManagerName ? { label: t("organizations.manager"), value: detail.managingManagerName } : null,
    detail.assignedAgentNames.length > 0 ? { label: t("organizations.assignedAgent"), value: detail.assignedAgentNames.join(", ") } : null,
    detail.notes ? { label: t("organizations.fieldNotes"), value: detail.notes } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row)) : []

  const nextStep = (
    <View style={styles.nextCard}>
      <Text style={styles.nextEyebrow}>{copy.nextStep}</Text>
      <View style={styles.nextContent}>
        <View style={styles.nextIcon}><Icon name={nextAction.icon} size={25} color={fieldTheme.color.onColor} /></View>
        <View style={styles.nextCopy}>
          <Text style={styles.nextTitle}>{nextAction.title}</Text>
          <Text style={styles.nextBody}>{nextAction.body}</Text>
        </View>
      </View>
      {nextAction.onPress && nextAction.label ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextAction.label}
          onPress={nextAction.onPress}
          style={({ pressed }) => [styles.primaryButton, { minHeight: touchTarget }, pressed && styles.primaryButtonPressed]}
        >
          <Icon name={nextAction.icon} size={20} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.primaryButtonText}>{nextAction.label}</Text>
        </Pressable>
      ) : null}
      {detail && primaryAction === "directions" && primaryPhone ? (
        <View style={styles.quickArea}>
          <Text style={styles.quickLabel}>{copy.quickActions}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.callAction}
            onPress={() => call(primaryPhone)}
            style={({ pressed }) => [styles.quickButton, { minHeight: touchTarget }, pressed && styles.pressed]}
          >
            <Icon name="call-outline" size={19} color={fieldTheme.color.onColor} />
            <Text style={styles.quickButtonText}>{copy.callAction}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )

  const overviewSection = detail ? (
    <Section title={copy.overview}>
      <InfoRow icon="location-outline" label={copy.address} value={address || copy.noAddress} muted={!address} />
      <InfoRow icon="call-outline" label={copy.phone} value={detail.phone || primaryContact?.phone || copy.noPhone} muted={!detail.phone && !primaryContact?.phone} />
      {detail.contactPerson ? <InfoRow icon="person-outline" label={copy.contactPerson} value={detail.contactPerson} /> : null}
      {lastVisit ? <InfoRow icon="time-outline" label={copy.lastVisit} value={lastVisitDate} /> : null}
    </Section>
  ) : null

  const detailsSection = detailRows.length > 0 ? (
    <Section title={copy.moreDetails} hint={copy.moreDetailsHint}>
      <DisclosureButton
        label={detailsExpanded ? copy.hideDetails : copy.showDetails}
        expanded={detailsExpanded}
        onPress={() => setDetailsExpanded((value) => !value)}
        touchTarget={touchTarget}
      />
      {detailsExpanded ? (
        <View style={styles.detailRows}>
          {detailRows.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  ) : null

  const contactsSection = detail ? (
    <Section title={copy.contacts} hint={copy.contactsHint} count={sortedContacts.length}>
      {visibleContacts.length === 0 ? (
        <View style={styles.inlineEmpty}>
          <Icon name="people-outline" size={24} color={fieldTheme.color.inkMuted} />
          <Text style={styles.inlineEmptyText}>{copy.noContacts}</Text>
        </View>
      ) : visibleContacts.map((contact, index) => {
        const subtitle = [
          contact.position,
          contact.specialty || (contact.type ? t(CONTACT_TYPE_KEY[contact.type] ?? "contacts.typeOther") : ""),
        ].filter(Boolean).join(" · ")
        return (
          <ContactRow
            key={usableOrganizationRecordId(contact.id) ? contact.id : `${contact.name}-${subtitle}-${index}`}
            contact={contact}
            copy={copy}
            subtitle={subtitle}
            onOpen={usableOrganizationRecordId(contact.id) ? () => openContact(contact) : undefined}
            onCall={contact.phone ? () => call(contact.phone) : undefined}
            touchTarget={touchTarget}
          />
        )
      })}
      {sortedContacts.length > initialRows ? (
        <DisclosureButton
          label={contactsExpanded ? copy.showLess : copy.showAll(sortedContacts.length)}
          expanded={contactsExpanded}
          onPress={() => setContactsExpanded((value) => !value)}
          touchTarget={touchTarget}
        />
      ) : null}
    </Section>
  ) : null

  const visitsSection = detail ? (
    <Section title={copy.recentVisits} hint={copy.visitsHint} count={sortedVisits.length}>
      {visibleVisits.length === 0 ? (
        <View style={styles.inlineEmpty}>
          <Icon name="calendar-outline" size={24} color={fieldTheme.color.inkMuted} />
          <Text style={styles.inlineEmptyText}>{copy.noVisits}</Text>
        </View>
      ) : visibleVisits.map((visit, index) => {
        const visitStatus = readableCode(visit.status, copy.visitStatus)
        const outcome = visit.outcome ? readableCode(visit.outcome, copy.outcome) : undefined
        return (
          <VisitRow
            key={usableOrganizationRecordId(visit.id) ? visit.id : `${visit.checkInAt || "visit"}-${index}`}
            visit={visit}
            date={formatVisitDate(visit.checkInAt, i18n.language, copy.unknownDate)}
            status={visitStatus}
            outcome={outcome}
            onOpen={usableOrganizationRecordId(visit.id) ? () => openVisit(visit) : undefined}
            touchTarget={touchTarget}
            copy={copy}
            compact={!splitLayout}
          />
        )
      })}
      {sortedVisits.length > initialRows ? (
        <DisclosureButton
          label={visitsExpanded ? copy.showLess : copy.showAll(sortedVisits.length)}
          expanded={visitsExpanded}
          onPress={() => setVisitsExpanded((value) => !value)}
          touchTarget={touchTarget}
        />
      ) : null}
    </Section>
  ) : null

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.back}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { width: touchTarget, height: touchTarget }, pressed && styles.headerPressed]}
          >
            <Icon name="arrow-back" size={24} color={fieldTheme.color.onColor} />
          </Pressable>
          <View style={styles.headerMain}>
            <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
            <View style={styles.headerMeta}>
              <Text style={styles.headerSubtitle}>{objectType}</Text>
              {status ? <Text style={styles.headerSubtitle}> · {status}</Text> : null}
            </View>
          </View>
          {detail?.category ? (
            <View style={styles.categoryBadge}><Text style={styles.categoryText}>{detail.category}</Text></View>
          ) : null}
        </View>
      </View>

      {state === "loading" ? (
        <View style={styles.statePanel} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={fieldTheme.color.primary} />
          <Text style={styles.stateTitle}>{copy.loadingTitle}</Text>
          <Text style={styles.stateBody}>{copy.loadingBody}</Text>
        </View>
      ) : state === "error" ? (
        <View style={styles.statePanel} accessibilityLiveRegion="polite">
          <View style={[styles.stateIcon, styles.stateIconError]}><Icon name="cloud-offline-outline" size={30} color={fieldTheme.color.coral} /></View>
          <Text style={styles.stateTitle}>{copy.errorTitle}</Text>
          <Text style={styles.stateBody}>{copy.errorBody}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.retry}
            onPress={retry}
            style={({ pressed }) => [styles.retryButton, { minHeight: touchTarget }, pressed && styles.pressed]}
          >
            <Icon name="refresh" size={20} color={fieldTheme.color.onColor} />
            <Text style={styles.retryButtonText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} tintColor={fieldTheme.color.primary} colors={[fieldTheme.color.primary]} />}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.xl) + fieldTheme.space.xl }]}
        >
          {state === "stale" ? (
            <View style={styles.staleBanner} accessibilityLiveRegion="polite">
              <Icon name="cloud-offline-outline" size={21} color={fieldTheme.color.coral} />
              <View style={styles.bannerCopy}>
                <Text style={styles.bannerTitle}>{copy.staleTitle}</Text>
                <Text style={styles.bannerBody}>{copy.staleBody}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.retry}
                onPress={retry}
                style={({ pressed }) => [styles.bannerRetry, { minWidth: touchTarget, minHeight: touchTarget }, pressed && styles.pressed]}
              >
                <Icon name="refresh" size={20} color={fieldTheme.color.primaryStrong} />
              </Pressable>
            </View>
          ) : null}
          {actionError ? (
            <View style={styles.actionError} accessibilityLiveRegion="polite">
              <Icon name="alert-circle-outline" size={20} color={fieldTheme.color.danger} />
              <Text style={styles.actionErrorText}>{copy.actionError}</Text>
            </View>
          ) : null}

          {splitLayout ? (
            <View style={styles.tabletColumns}>
              <View style={styles.tabletPrimary}>
                {nextStep}
                <View style={[styles.surface, styles.tabletSurface]}>
                  {overviewSection}
                  {detailsSection}
                </View>
              </View>
              <View style={[styles.surface, styles.tabletSurface, styles.tabletSecondary]}>
                {contactsSection}
                {visitsSection}
              </View>
            </View>
          ) : (
            <>
              {nextStep}
              <View style={styles.surface}>
                {overviewSection}
                {contactsSection}
                {visitsSection}
                {detailsSection}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  headerRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, width: "100%", maxWidth: 1120, alignSelf: "center" },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: "rgba(248,252,250,0.12)" },
  headerPressed: { backgroundColor: "rgba(248,252,250,0.22)" },
  headerMain: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: "#AFCFC4", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.4, marginTop: 2 },
  headerMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: fieldTheme.space.xs },
  headerSubtitle: { color: "#CFE5DD", fontSize: 13, fontWeight: "600" },
  categoryBadge: { minHeight: 32, minWidth: 36, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.pill, backgroundColor: "rgba(248,252,250,0.14)", alignItems: "center", justifyContent: "center" },
  categoryText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  scrollContent: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: fieldTheme.space.lg },

  statePanel: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xxl, gap: fieldTheme.space.md },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  stateIconError: { backgroundColor: fieldTheme.color.coralSoft },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 21, fontWeight: "900", textAlign: "center" },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 420 },
  retryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.xl, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primaryStrong },
  retryButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },

  staleBanner: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#E9B9AC", backgroundColor: fieldTheme.color.coralSoft, marginBottom: fieldTheme.space.lg },
  bannerCopy: { flex: 1 },
  bannerTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  bannerBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  bannerRetry: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface },
  actionError: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: "#E9AAAA", backgroundColor: fieldTheme.color.dangerSoft, marginBottom: fieldTheme.space.lg },
  actionErrorText: { flex: 1, color: fieldTheme.color.danger, fontSize: 13, lineHeight: 19, fontWeight: "700" },

  tabletColumns: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.xl },
  tabletPrimary: { flex: 0.9, minWidth: 300, gap: fieldTheme.space.lg },
  tabletSecondary: { flex: 1.1, minWidth: 340 },
  tabletSurface: { marginTop: 0 },
  surface: { backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, overflow: "hidden", marginTop: fieldTheme.space.lg },
  nextCard: { backgroundColor: fieldTheme.color.primaryStrong, borderRadius: fieldTheme.radius.lg, padding: fieldTheme.space.xl, gap: fieldTheme.space.lg },
  nextEyebrow: { color: "#AFCFC4", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  nextContent: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  nextIcon: { width: 48, height: 48, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,252,250,0.13)" },
  nextCopy: { flex: 1 },
  nextTitle: { color: fieldTheme.color.onColor, fontSize: 21, lineHeight: 26, fontWeight: "900", letterSpacing: -0.3 },
  nextBody: { color: "#CFE5DD", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.onColor, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.lg },
  primaryButtonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "900" },
  quickArea: { borderTopWidth: 1, borderTopColor: "rgba(248,252,250,0.18)", paddingTop: fieldTheme.space.md, gap: fieldTheme.space.sm },
  quickLabel: { color: "#AFCFC4", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  quickButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: "rgba(248,252,250,0.13)" },
  quickButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },

  section: { padding: fieldTheme.space.lg, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: fieldTheme.space.md, marginBottom: fieldTheme.space.md },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  sectionHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  countPill: { minWidth: 30, minHeight: 30, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surfaceStrong, alignItems: "center", justifyContent: "center" },
  countText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  infoIcon: { width: 36, height: 36, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  infoValue: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, fontWeight: "700", marginTop: 2 },
  infoValueMuted: { color: fieldTheme.color.inkMuted, fontWeight: "600" },

  relationshipRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  relationshipMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  relationshipCopy: { flex: 1, minWidth: 0 },
  relationshipTitleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  relationshipTitle: { flexShrink: 1, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  relationshipSubtitle: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  avatarPrimary: { backgroundColor: fieldTheme.color.amberSoft },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "900" },
  primaryPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: fieldTheme.color.amberSoft },
  primaryText: { color: fieldTheme.color.amber, fontSize: 9, fontWeight: "900" },
  rowAction: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft, marginLeft: fieldTheme.space.sm },
  visitRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  visitIcon: { width: 40, height: 40, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.blueSoft },
  statusPill: { maxWidth: 116, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm, paddingVertical: 5, backgroundColor: fieldTheme.color.surfaceStrong },
  statusText: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800", textAlign: "center" },
  inlineEmpty: { minHeight: 92, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg },
  inlineEmptyText: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 360 },
  disclosureButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, marginTop: fieldTheme.space.sm, backgroundColor: fieldTheme.color.primarySoft, paddingHorizontal: fieldTheme.space.md },
  disclosureText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  detailRows: { marginTop: fieldTheme.space.md },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  detailLabel: { width: "38%", color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  detailValue: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },

  pressed: { opacity: 0.72 },
})
