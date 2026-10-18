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
import { fieldContactsEnabled } from "../../lib/field-contacts-policy"
import { agentMay } from "../../lib/agent-permissions"
import { ask } from "../../services/app-feedback"
import { readRoughLocation } from "../../services/location-fix"
import {
  formatLocationFixDistance,
  locationFixOffer,
  toLocationFixRequest,
  usablePoint,
  type LocationFixPoint,
  type LocationFixRequest,
} from "./organization-location-fix-model"
import { useBootstrapStore } from "../../store/bootstrap"
import { useLocationFixStore } from "../../store/location-fixes"
import { fieldTheme } from "../../theme/fieldTheme"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import { isExpandedTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"
import { statusLabel } from "../../lib/status-labels"
import { upperInitial } from "../../lib/upper"

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
    routeOnlyPlaces: "Карточка содержит только данные точки и ваши последние визиты.",
    essentials: "Главное",
    contacts: "Контакты",
    visits: "Мои последние визиты",
    noContacts: "Активных контактов для этой точки пока нет.",
    noVisits: "Ваших завершённых или начатых визитов пока нет.",
    address: "Адрес",
    contactPerson: "Контактное лицо",
    phone: "Телефон",
    code: "Код",
    category: "Категория",
    status: "Статус",
    call: "Позвонить",
    directions: "Как добраться",
    primary: "Основной",
    showAll: (count: number) => `Показать все (${count})`,
    showLess: "Показать меньше",
    unknown: "Не указано",
    fixAsk: "Адрес неверный?",
    fixFarTitle: (distance: string) => `Точка клиента в ${distance} отсюда`,
    fixFarBody: "Если вы уже у клиента — значит, точка в базе стоит не там. Покажите, где он на самом деле.",
    fixFarButton: "Клиент здесь — исправить адрес",
    fixNoPinTitle: "У клиента нет точки на карте",
    fixNoPinBody: "Без неё нельзя начать визит. Если вы у клиента — покажите, где он.",
    fixNoPinButton: "Клиент здесь — поставить точку",
    fixWaitingTitle: "Адрес на проверке у руководителя",
    fixWaitingMine: "Вы сообщили, что точка стоит не там. Как только руководитель решит, придёт уведомление. Визит можно начинать с того места, которое вы указали.",
    fixWaitingOther: "Коллега уже сообщил, что точка стоит не там. Ждём решения руководителя.",
    fixCancel: "Отменить запрос",
    fixCancelAsk: "Отменить запрос на исправление адреса?",
    fixCancelYes: "Отменить запрос",
    fixCancelNo: "Оставить",
    fixCancelFailed: "Не удалось отменить запрос. Попробуйте ещё раз.",
    fixApproved: "Точку исправили по вашему запросу.",
    fixRejected: "Руководитель оставил точку на месте.",
    fixUnits: { m: "м", km: "км" },
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
    routeOnlyPlaces: "Kart yalnız nöqtə məlumatlarını və son ziyarətlərinizi göstərir.",
    essentials: "Əsas məlumatlar",
    contacts: "Kontaktlar",
    visits: "Son ziyarətlərim",
    noContacts: "Bu nöqtə üçün hələ aktiv kontakt yoxdur.",
    noVisits: "Hələ tamamlanmış və ya başlamış ziyarətiniz yoxdur.",
    address: "Ünvan",
    contactPerson: "Əlaqə şəxsi",
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
    fixAsk: "Ünvan səhvdir?",
    fixFarTitle: (distance: string) => `Müştərinin nöqtəsi buradan ${distance} aralıdır`,
    fixFarBody: "Əgər artıq müştərinin yanındasınızsa, deməli bazadakı nöqtə yerində deyil. Onun əslində harada olduğunu göstərin.",
    fixFarButton: "Müştəri buradadır — ünvanı düzəlt",
    fixNoPinTitle: "Müştərinin xəritədə nöqtəsi yoxdur",
    fixNoPinBody: "Onsuz vizitə başlamaq olmur. Müştərinin yanındasınızsa, harada olduğunu göstərin.",
    fixNoPinButton: "Müştəri buradadır — nöqtə qoy",
    fixWaitingTitle: "Ünvan rəhbərin yoxlamasındadır",
    fixWaitingMine: "Nöqtənin yerində olmadığını bildirmisiniz. Rəhbər qərar verən kimi bildiriş gələcək. Vizitə göstərdiyiniz yerdən başlaya bilərsiniz.",
    fixWaitingOther: "Həmkarınız artıq nöqtənin yerində olmadığını bildirib. Rəhbərin qərarı gözlənilir.",
    fixCancel: "Sorğunu ləğv et",
    fixCancelAsk: "Ünvan düzəlişi sorğusu ləğv edilsin?",
    fixCancelYes: "Sorğunu ləğv et",
    fixCancelNo: "Saxla",
    fixCancelFailed: "Sorğunu ləğv etmək alınmadı. Yenidən cəhd edin.",
    fixApproved: "Nöqtə sizin sorğunuzla düzəldildi.",
    fixRejected: "Rəhbər nöqtəni yerində saxladı.",
    fixUnits: { m: "m", km: "km" },
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
    routeOnlyPlaces: "This card shows only location information and your recent visits.",
    essentials: "Essentials",
    contacts: "Contacts",
    visits: "My recent visits",
    noContacts: "There are no active contacts for this location yet.",
    noVisits: "You have no completed or started visits here yet.",
    address: "Address",
    contactPerson: "Contact person",
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
    fixAsk: "Wrong address?",
    fixFarTitle: (distance: string) => `The customer's pin is ${distance} from here`,
    fixFarBody: "If you are already at the customer, the pin on file is in the wrong place. Show where the customer really is.",
    fixFarButton: "Customer is here — correct the address",
    fixNoPinTitle: "The customer has no pin on the map",
    fixNoPinBody: "A visit cannot start without it. If you are at the customer, show where it is.",
    fixNoPinButton: "Customer is here — set the pin",
    fixWaitingTitle: "The address is with your manager",
    fixWaitingMine: "You reported that the pin is in the wrong place. You will be notified as soon as the manager decides. You can start the visit from the place you showed.",
    fixWaitingOther: "A colleague has already reported that the pin is in the wrong place. Waiting for the manager.",
    fixCancel: "Withdraw the request",
    fixCancelAsk: "Withdraw the address correction request?",
    fixCancelYes: "Withdraw the request",
    fixCancelNo: "Keep it",
    fixCancelFailed: "Could not withdraw the request. Try again.",
    fixApproved: "The pin was corrected at your request.",
    fixRejected: "The manager left the pin where it was.",
    fixUnits: { m: "m", km: "km" },
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
  // Switched off by the organization: the card is about the place only, with
  // no list of people and no way into a contact card from here.
  const contactsEnabled = useBootstrapStore((state) => fieldContactsEnabled(state.data?.policies))
  const mayPlanOwnRoutes = useBootstrapStore((state) => state.data?.policies.canPlanOwnRoutes === true)
  const [detail, setDetail] = useState<RouteOrganizationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [contactsExpanded, setContactsExpanded] = useState(false)
  const [visitsExpanded, setVisitsExpanded] = useState(false)
  // «Клиент здесь»: the organization may switch the request off; only an explicit «no» hides it.
  const mayFixLocation = useBootstrapStore((state) => agentMay(state.data?.policies, "customerLocationRequest"))
  const [locationRequest, setLocationRequest] = useState<LocationFixRequest | null>(null)
  const [position, setPosition] = useState<LocationFixPoint | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelFailed, setCancelFailed] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false)
    try {
      const response = await api.getRouteOrganizationDetail(id, signal)
      if (!response?.success || !response.data?.organization) throw new Error("ROUTE_ORGANIZATION_NOT_AVAILABLE")
      if (signal?.aborted) return
      setDetail(toRouteOrganizationDetail(response.data.organization))
      const request = toLocationFixRequest(response.data.locationRequest)
      setLocationRequest(request)
      // The server's word on whether this agent's request still waits: the
      // check-in is measured against the reported place only while it does.
      if (request?.mine && request.status === "SUBMITTED" && request.proposed) useLocationFixStore.getState().remember(id, request.proposed)
      else useLocationFixStore.getState().forget(id)
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

  // Back from «Где клиент на самом деле?»: the card says «на проверке» without being pulled.
  useEffect(() => navigation.addListener("focus", () => {
    if (detail) void load()
  }), [detail, load, navigation])

  // Roughly where the phone is — only to notice a pin that is evidently in the wrong place.
  const pinKnown = !!detail && detail.latitude != null
  const waiting = locationRequest?.status === "SUBMITTED"
  useEffect(() => {
    if (!mayFixLocation || !pinKnown || waiting) return
    let alive = true
    void readRoughLocation().then((reading) => {
      if (alive && reading) setPosition({ latitude: reading.latitude, longitude: reading.longitude })
    })
    return () => { alive = false }
  }, [mayFixLocation, pinKnown, waiting])

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
  const pin = detail ? usablePoint(detail) : null
  // «No pin» is read only from a server that says so; an older one says nothing about pins at all.
  const offer = !detail || !mayFixLocation || waiting || (!pin && !detail.pinReported)
    ? { kind: "none" as const }
    : locationFixOffer(pin, position)
  const openLocationFix = () => {
    if (!detail) return
    navigation.navigate("OrganizationLocationFix", {
      id: detail.id,
      name: detail.name,
      ...(pin ? { latitude: pin.latitude, longitude: pin.longitude } : {}),
    })
  }
  const cancelLocationRequest = async () => {
    if (!detail || cancelling) return
    const confirmed = await ask({
      title: copy.fixCancelAsk,
      message: "",
      tone: "warning",
      buttons: [
        { text: copy.fixCancelNo, value: false, style: "cancel" },
        { text: copy.fixCancelYes, value: true },
      ],
      dismissValue: false,
    })
    if (!confirmed) return
    setCancelling(true)
    setCancelFailed(false)
    try {
      await api.cancelOrganizationLocationRequest(detail.id)
      setLocationRequest(null)
      useLocationFixStore.getState().forget(detail.id)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setCancelFailed(true)
    } finally {
      setCancelling(false)
      void load()
    }
  }
  const addToRoute = () => {
    if (!detail) return
    navigation.navigate("PlanningBuilder", {
      initialHorizon: 1,
      initialTarget: { kind: "organization", id: detail.id, name: detail.name },
    })
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
        <Text style={styles.scopeText}>{contactsEnabled ? copy.routeOnly : copy.routeOnlyPlaces}</Text>
      </View>

      <Section title={copy.essentials}>
        <DataRow icon="location-outline" label={copy.address} value={address ?? copy.unknown} />
        <DataRow icon="person-outline" label={copy.contactPerson} value={detail.contactPerson ?? copy.unknown} />
        <DataRow icon="call-outline" label={copy.phone} value={detail.phone ?? copy.unknown} />
        {detail.code ? <DataRow icon="barcode-outline" label={copy.code} value={detail.code} /> : null}
        {detail.category ? <DataRow icon="pricetag-outline" label={copy.category} value={detail.category} /> : null}
        {detail.status ? <DataRow icon="shield-checkmark-outline" label={copy.status} value={statusLabel(t, "customer", detail.status)} /> : null}
        {waiting ? (
          <View style={styles.fixWaiting} accessibilityLiveRegion="polite" testID="location-fix-waiting">
            <View style={styles.fixHeading}>
              <Icon name="time-outline" size={19} color={fieldTheme.color.amber} />
              <Text style={styles.fixWaitingTitle}>{copy.fixWaitingTitle}</Text>
            </View>
            <Text style={styles.fixBody}>{locationRequest?.mine ? copy.fixWaitingMine : copy.fixWaitingOther}</Text>
            {locationRequest?.mine ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void cancelLocationRequest()}
                disabled={cancelling}
                testID="location-fix-cancel"
                style={({ pressed }) => [styles.fixGhostButton, { minHeight: touchTarget }, cancelling && styles.disabled, pressed && styles.pressed]}
              >
                {cancelling ? <ActivityIndicator size="small" color={fieldTheme.color.primaryStrong} /> : null}
                <Text style={styles.fixGhostText}>{copy.fixCancel}</Text>
              </Pressable>
            ) : null}
            {cancelFailed ? <Text style={styles.fixError}>{copy.fixCancelFailed}</Text> : null}
          </View>
        ) : offer.kind !== "none" ? (
          <View style={styles.fixOffer} accessibilityLiveRegion="polite" testID="location-fix-offer">
            <View style={styles.fixHeading}>
              <Icon name="location" size={19} color={fieldTheme.color.amber} />
              <Text style={styles.fixWaitingTitle}>
                {offer.kind === "no-pin"
                  ? copy.fixNoPinTitle
                  : copy.fixFarTitle(formatLocationFixDistance(offer.distanceMeters, i18n.language, copy.fixUnits))}
              </Text>
            </View>
            <Text style={styles.fixBody}>{offer.kind === "no-pin" ? copy.fixNoPinBody : copy.fixFarBody}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={openLocationFix}
              testID="location-fix-open"
              style={({ pressed }) => [styles.routeActionButton, { minHeight: touchTarget }, pressed && styles.pressed]}
            >
              <Icon name="pin" size={18} color={fieldTheme.color.primaryStrong} />
              <Text style={styles.routeActionText}>{offer.kind === "no-pin" ? copy.fixNoPinButton : copy.fixFarButton}</Text>
            </Pressable>
          </View>
        ) : locationRequest?.mine && locationRequest.status !== "SUBMITTED" ? (
          <View style={locationRequest.status === "APPROVED" ? styles.fixAnswerGood : styles.fixAnswer} testID="location-fix-answer">
            <Text style={styles.fixBody}>
              {locationRequest.status === "APPROVED" ? copy.fixApproved : copy.fixRejected}
              {locationRequest.status === "REJECTED" && locationRequest.decisionComment ? ` «${locationRequest.decisionComment}»` : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          {mayPlanOwnRoutes ? <Pressable accessibilityRole="button" onPress={addToRoute} style={({ pressed }) => [styles.routeActionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="calendar-outline" size={19} color={fieldTheme.color.primaryStrong} /><Text style={styles.routeActionText}>{t("contacts.addToRoute")}</Text></Pressable> : null}
          {address ? <Pressable accessibilityRole="button" onPress={openDirections} style={({ pressed }) => [styles.actionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="navigate-outline" size={19} color={fieldTheme.color.onColor} /><Text style={styles.actionText}>{copy.directions}</Text></Pressable> : null}
          {mayFixLocation && !waiting && offer.kind === "none" && (pin || detail.pinReported) ? <Pressable accessibilityRole="button" onPress={openLocationFix} testID="location-fix-ask" style={({ pressed }) => [styles.routeActionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="pin-outline" size={19} color={fieldTheme.color.primaryStrong} /><Text style={styles.routeActionText}>{copy.fixAsk}</Text></Pressable> : null}
          {detail.phone ? <Pressable accessibilityRole="button" onPress={() => call(detail.phone)} style={({ pressed }) => [styles.routeActionButton, { minHeight: touchTarget }, pressed && styles.pressed]}><Icon name="call-outline" size={19} color={fieldTheme.color.primaryStrong} /><Text style={styles.routeActionText}>{copy.call}</Text></Pressable> : null}
        </View>
      </Section>

      {contactsEnabled ? (
        <Section title={copy.contacts} count={contacts.length}>
          {visibleContacts.length === 0 ? <Text style={styles.emptyText}>{copy.noContacts}</Text> : visibleContacts.map((contact, index) => {
            const subtitle = [contact.position, contact.specialty || (contact.type ? t(CONTACT_TYPE_LABEL[contact.type] ?? "contacts.typeOther") : "")].filter(Boolean).join(" · ")
            return (
              <View key={usableId(contact.id) ? contact.id : `${contact.name}-${index}`} style={styles.relationshipRow}>
                <Pressable accessibilityRole="button" onPress={() => openContact(contact)} style={({ pressed }) => [styles.relationshipMain, { minHeight: touchTarget }, pressed && styles.pressed]}>
                  <View style={[styles.avatar, contact.isPrimary && styles.avatarPrimary]}><Text style={styles.avatarText}>{upperInitial(contact.name)}</Text></View>
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
      ) : null}

      <Section title={copy.visits} count={visits.length}>
        {visibleVisits.length === 0 ? <Text style={styles.emptyText}>{copy.noVisits}</Text> : visibleVisits.map((visit) => (
          <Pressable key={visit.id} accessibilityRole="button" onPress={() => openVisit(visit)} style={({ pressed }) => [styles.visitRow, { minHeight: touchTarget + 8 }, pressed && styles.pressed]}>
            <View style={styles.visitIcon}><Icon name="calendar-clear-outline" size={20} color={fieldTheme.color.blue} /></View>
            <View style={styles.relationshipCopy}>
              <Text style={styles.relationshipName}>{formatVisitDate(visit.checkInAt, i18n.language, copy.unknown)}</Text>
              <Text style={styles.relationshipSubtitle}>{[statusLabel(t, "visit", visit.status), visit.outcome ? statusLabel(t, "visitOutcome", visit.outcome) : undefined].filter(Boolean).join(" · ")}</Text>
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
          <Icon name="arrow-back" size={23} color={fieldTheme.color.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.headerSubtitle}>{typeLabel}{detail?.status ? ` · ${statusLabel(t, "customer", detail.status)}` : ""}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
      >
        {body}
      </ScrollView>
      <LightScreenStatusBar />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  // White like the tabs' headers (owner-approved colours, 2026-10-18).
  header: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  backButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border },
  headerCopy: { flex: 1, paddingTop: 2 },
  eyebrow: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.7 },
  headerTitle: { marginTop: 2, color: fieldTheme.color.ink, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  headerSubtitle: { marginTop: 2, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  scrollContent: { flexGrow: 1, padding: fieldTheme.space.md },
  content: { gap: fieldTheme.space.md, width: "100%", maxWidth: 880, alignSelf: "center" },
  centerState: { flex: 1, minHeight: 320, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.xl },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 18, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  stateBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  scopeNote: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  scopeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  section: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm },
  sectionTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  countPill: { minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border },
  countText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  dataRow: { flexDirection: "row", gap: fieldTheme.space.sm, alignItems: "flex-start", paddingVertical: fieldTheme.space.xs },
  dataIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm },
  dataCopy: { flex: 1, gap: 1 },
  dataLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.35 },
  dataValue: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.xs },
  fixOffer: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.amber, backgroundColor: fieldTheme.color.surface },
  fixWaiting: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.amber, backgroundColor: fieldTheme.color.surface },
  fixHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  fixWaitingTitle: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  fixBody: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19 },
  fixGhostButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  fixGhostText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  fixError: { color: fieldTheme.color.danger, fontSize: 13, lineHeight: 18 },
  fixAnswer: { padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.danger, backgroundColor: fieldTheme.color.surface },
  fixAnswerGood: { padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, borderLeftWidth: 4, borderLeftColor: fieldTheme.color.success, backgroundColor: fieldTheme.color.surface },
  disabled: { opacity: 0.5 },
  actionButton: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  actionText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  routeActionButton: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  routeActionText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
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
  visitIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm },
  expandButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border },
  expandText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
})
