import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { ask } from "../../services/app-feedback"
import { toRouteContactDetail, type RouteContactDetail } from "../../services/route-contact-detail"
import {
  canProposeRouteContactChange,
  initialRouteContactChangeForm,
  matchingSpecialties,
  routeContactChangeFailure,
  routeContactChangeProblem,
  routeContactChanges,
  toRouteContactChangeOffer,
  type RouteContactChangeField,
  type RouteContactChangeForm,
  type RouteContactChangeOffer,
} from "../../services/route-contact-change"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { agentMay } from "../../lib/agent-permissions"
import { useBootstrapStore } from "../../store/bootstrap"
import { useLocationPickStore } from "../../store/location-picks"
import { toRouteOrganizationDetail, type RouteOrganizationDetail } from "../../services/route-organization-detail"
import {
  advancePlacePayload,
  placeChange,
  placeChanged,
  placeProposedPoint,
  PLACE_ADDRESS_MAX,
} from "../../services/route-contact-place"
import {
  formatLocationFixDistance,
  locationFixDistanceMeters,
  locationFixFailure,
  mayProposeInAdvance,
  toLocationFixRequest,
  usablePoint,
  type LocationFixRequest,
} from "./organization-location-fix-model"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

/** A longer list gets a search field; a short one is quicker to read than to search. */
const SPECIALTY_SEARCH_FROM = 9

const COPY = {
  ru: {
    title: "Предложить изменение",
    hint: "Руководитель проверит заявку. Пока он не одобрит, данные клиента не меняются.",
    category: "Класс",
    specialty: "Специальность",
    specialtySearch: "Найти специальность",
    specialtyNone: "В списке организации такой специальности нет.",
    firstName: "Имя *",
    lastName: "Фамилия *",
    reason: "Почему нужно изменить *",
    reasonHint: "Что вы узнали и от кого.",
    submit: "Отправить руководителю",
    sent: "Заявка отправлена",
    sentBody: "Руководитель проверит её. Ответ появится в карточке клиента.",
    loading: "Открываем карточку…",
    loadFailed: "Не удалось открыть карточку. Проверьте соединение.",
    retry: "Повторить",
    back: "Назад",
    pending: "По этому клиенту уже есть ваша заявка. Дождитесь ответа руководителя.",
    place: {
      title: "Адрес и точка",
      workplace: "Место работы",
      address: "Адрес",
      addressHint: "Улица и дом, как написать в карточке места.",
      pinNow: "Точка на карте стоит",
      pinNone: "Точки на карте нет",
      pinMoves: (distance: string) => `Новая точка — в ${distance} от прежней`,
      pinFirst: "Новая точка — у места её не было",
      put: "Поставить точку",
      move: "Передвинуть точку",
      later: "Когда придёте на новое место, откройте карточку места и нажмите «Подтвердить: клиент здесь» — тогда визит там засчитается.",
      loading: "Открываем место…",
      failed: "Не удалось открыть место. Проверьте соединение.",
      waiting: "По этому месту уже ждёт заявка на адрес. Дождитесь решения руководителя.",
      replaces: "Ваше прошлое предложение по этому месту заменится этим.",
      units: { m: "м", km: "км" },
    },
    contactPending: "Изменения врача: ваша прошлая заявка ещё ждёт руководителя.",
    contactDisabled: "Изменения врача ваша организация отключила — здесь можно предложить только адрес и точку.",
    sentPlace: "Руководитель проверит заявку. Когда придёте на новое место, подтвердите его в карточке места: «Подтвердить: клиент здесь».",
    contactSentPlaceNot: "Изменения врача отправлены, а адрес и точка — нет. ",
    placeProblems: {
      pinNeeded: "У места нет точки на карте — поставьте её.",
    },
    placeFailures: {
      pending: "По этому месту уже ждёт заявка на адрес.",
      switchedOff: "Организация отключила заявки на адрес.",
      notFound: "Это место вам сейчас недоступно.",
      tooMany: "Слишком много заявок подряд. Попробуйте позже.",
      unchanged: "Точка и адрес уже такие — исправлять нечего.",
      offline: "Нет связи с сервером. Проверьте интернет и отправьте ещё раз.",
      failed: "Не удалось отправить адрес и точку. Попробуйте ещё раз.",
    },
    problems: {
      name: "Укажите имя и фамилию.",
      nothing: "Вы ничего не изменили.",
      reason: "Напишите, почему нужно изменить данные.",
    },
    failures: {
      disabled: "Ваша организация отключила заявки на изменение клиентов. Обратитесь к руководителю.",
      stale: "Карточку только что изменили. Мы обновили данные — проверьте и отправьте ещё раз.",
      incomplete: "В карточке клиента не заполнены обязательные поля. Попросите руководителя заполнить карточку — после этого заявку можно будет отправить.",
      listChanged: "Список в организации изменился. Мы обновили форму — выберите ещё раз.",
      failed: "Не удалось отправить заявку. Проверьте соединение и повторите.",
    },
  },
  az: {
    title: "Dəyişiklik təklif et",
    hint: "Rəhbər sorğunu yoxlayacaq. O təsdiqləyənə qədər müştərinin məlumatları dəyişmir.",
    category: "Sinif",
    specialty: "İxtisas",
    specialtySearch: "İxtisası tap",
    specialtyNone: "Təşkilatın siyahısında belə ixtisas yoxdur.",
    firstName: "Ad *",
    lastName: "Soyad *",
    reason: "Niyə dəyişmək lazımdır *",
    reasonHint: "Nə öyrəndiniz və kimdən.",
    submit: "Rəhbərə göndər",
    sent: "Sorğu göndərildi",
    sentBody: "Rəhbər onu yoxlayacaq. Cavab müştərinin kartında görünəcək.",
    loading: "Kart açılır…",
    loadFailed: "Kartı açmaq alınmadı. Bağlantını yoxlayın.",
    retry: "Yenidən",
    back: "Geri",
    pending: "Bu müştəri üzrə artıq sorğunuz var. Rəhbərin cavabını gözləyin.",
    place: {
      title: "Ünvan və nöqtə",
      workplace: "İş yeri",
      address: "Ünvan",
      addressHint: "Küçə və ev — yerin kartında necə yazılmalıdırsa.",
      pinNow: "Nöqtə xəritədədir",
      pinNone: "Xəritədə nöqtə yoxdur",
      pinMoves: (distance: string) => `Yeni nöqtə — əvvəlkindən ${distance} aralı`,
      pinFirst: "Yeni nöqtə — yerin nöqtəsi yox idi",
      put: "Nöqtə qoy",
      move: "Nöqtəni köçür",
      later: "Yeni yerə çatanda yerin kartını açın və «Təsdiqlə: müştəri buradadır» basın — onda vizit orada sayılacaq.",
      loading: "Yer açılır…",
      failed: "Yeri açmaq alınmadı. Bağlantını yoxlayın.",
      waiting: "Bu yer üzrə ünvan sorğusu artıq gözləyir. Rəhbərin qərarını gözləyin.",
      replaces: "Bu yer üzrə əvvəlki təklifiniz bununla əvəz olunacaq.",
      units: { m: "m", km: "km" },
    },
    contactPending: "Həkimin dəyişiklikləri: əvvəlki sorğunuz hələ rəhbəri gözləyir.",
    contactDisabled: "Təşkilatınız həkim dəyişikliklərini söndürüb — burada yalnız ünvan və nöqtə təklif etmək olar.",
    sentPlace: "Rəhbər sorğunu yoxlayacaq. Yeni yerə çatanda onu yerin kartında təsdiqləyin: «Təsdiqlə: müştəri buradadır».",
    contactSentPlaceNot: "Həkimin dəyişiklikləri göndərildi, ünvan və nöqtə isə yox. ",
    placeProblems: {
      pinNeeded: "Yerin xəritədə nöqtəsi yoxdur — onu qoyun.",
    },
    placeFailures: {
      pending: "Bu yer üzrə ünvan sorğusu artıq gözləyir.",
      switchedOff: "Təşkilat ünvan sorğularını söndürüb.",
      notFound: "Bu yer hazırda sizə əlçatan deyil.",
      tooMany: "Ardıcıl çox sorğu göndərilib. Sonra yenidən cəhd edin.",
      unchanged: "Nöqtə və ünvan artıq belədir — düzəldiləsi bir şey yoxdur.",
      offline: "Serverlə əlaqə yoxdur. İnterneti yoxlayın və yenidən göndərin.",
      failed: "Ünvanı və nöqtəni göndərmək alınmadı. Yenidən cəhd edin.",
    },
    problems: {
      name: "Adı və soyadı göstərin.",
      nothing: "Heç nə dəyişməmisiniz.",
      reason: "Məlumatları niyə dəyişmək lazım olduğunu yazın.",
    },
    failures: {
      disabled: "Təşkilatınız müştəri dəyişikliyi sorğularını söndürüb. Rəhbərinizə müraciət edin.",
      stale: "Kart indicə dəyişdirilib. Məlumatları yenilədik — yoxlayın və yenidən göndərin.",
      incomplete: "Müştərinin kartında məcburi sahələr doldurulmayıb. Rəhbərdən kartı doldurmağı xahiş edin — sonra sorğunu göndərmək mümkün olacaq.",
      listChanged: "Təşkilatın siyahısı dəyişib. Formanı yenilədik — yenidən seçin.",
      failed: "Sorğunu göndərmək alınmadı. Bağlantını yoxlayın və təkrar edin.",
    },
  },
  en: {
    title: "Propose a change",
    hint: "A manager will review the request. Until they approve, the client's data does not change.",
    category: "Class",
    specialty: "Specialty",
    specialtySearch: "Find a specialty",
    specialtyNone: "The organization's list has no such specialty.",
    firstName: "First name *",
    lastName: "Last name *",
    reason: "Why it should change *",
    reasonHint: "What you learned and from whom.",
    submit: "Send to manager",
    sent: "Request sent",
    sentBody: "A manager will review it. The answer will appear on the client's card.",
    loading: "Opening the card…",
    loadFailed: "The card could not be opened. Check the connection.",
    retry: "Retry",
    back: "Back",
    pending: "You already have a request for this client. Wait for the manager's answer.",
    place: {
      title: "Address and pin",
      workplace: "Workplace",
      address: "Address",
      addressHint: "Street and house, as the place's card should say.",
      pinNow: "The place has a pin on the map",
      pinNone: "The place has no pin on the map",
      pinMoves: (distance: string) => `New pin — ${distance} from the old one`,
      pinFirst: "New pin — the place had none",
      put: "Put the pin",
      move: "Move the pin",
      later: "When you reach the new place, open the place's card and press «Confirm: the customer is here» — then the visit there counts.",
      loading: "Opening the place…",
      failed: "The place could not be opened. Check the connection.",
      waiting: "An address request about this place is already waiting. Wait for the manager's decision.",
      replaces: "Your earlier proposal for this place will be replaced by this one.",
      units: { m: "m", km: "km" },
    },
    contactPending: "The doctor's details: your earlier request is still waiting for the manager.",
    contactDisabled: "Your organization has switched off changes to doctors — only the address and the pin can be proposed here.",
    sentPlace: "A manager will review the request. When you reach the new place, confirm it on the place's card: «Confirm: the customer is here».",
    contactSentPlaceNot: "The doctor's changes were sent, the address and the pin were not. ",
    placeProblems: {
      pinNeeded: "The place has no pin on the map — put one.",
    },
    placeFailures: {
      pending: "An address request about this place is already waiting.",
      switchedOff: "The organization has switched address requests off.",
      notFound: "This place is not available to you now.",
      tooMany: "Too many requests in a row. Try later.",
      unchanged: "The pin and the address are already so — nothing to correct.",
      offline: "No connection to the server. Check the internet and send again.",
      failed: "The address and the pin could not be sent. Try again.",
    },
    problems: {
      name: "Enter the first and last name.",
      nothing: "You have not changed anything.",
      reason: "Write why the data should change.",
    },
    failures: {
      disabled: "Your organization has switched off change requests for clients. Ask your manager.",
      stale: "The card has just been changed. We refreshed the data — check it and send again.",
      incomplete: "Required fields on the client's card are empty. Ask a manager to fill in the card — then the request can be sent.",
      listChanged: "The organization's list has changed. We refreshed the form — choose again.",
      failed: "The request could not be sent. Check the connection and try again.",
    },
  },
} as const

function language(value: string): keyof typeof COPY {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function Choices({ label, values, selected, onSelect, testID }: {
  label: string
  values: readonly string[]
  selected: string
  onSelect: (value: string) => void
  testID: string
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips} testID={testID}>
        {values.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === selected }}
            onPress={() => onSelect(value)}
            style={[styles.chip, value === selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, value === selected && styles.chipTextSelected]}>{value}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** One workplace the form can correct: a place the server names by id. */
type PlaceOption = { customerId: string; name: string }

/** What the form knows of the chosen place: its card and the request about it, if one waits. */
type PlaceState = { detail: RouteOrganizationDetail; request: LocationFixRequest | null }

/**
 * Route Field: an agent asks a manager to change a client — its class, its
 * specialty or its name. Nothing is changed from here; the request waits for
 * approval. The card is read again when the form opens, so the agent proposes
 * against the current version and from the organization's current lists.
 *
 * «Адрес и точка» (owner, 2026-11-04: «местоположения и адрес также сделать в
 * этом разделе, а не искать где-то в другом месте»; «должно быть и до и на
 * месте»): the street address and the pin of a place the client works at,
 * proposed in advance from wherever the agent is. It goes as the place's own
 * request (services/route-contact-place.ts); the agent confirms it standing
 * at the place later, on the place's card.
 */
export default function RouteContactChangeRequestScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "ContactChangeRequest">>()
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const headerTop = useHeaderTop()
  const { id, name } = route.params
  const idempotencyKey = useRef(`contact-change-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const [detail, setDetail] = useState<RouteContactDetail | null>(null)
  const [offer, setOffer] = useState<RouteContactChangeOffer | null>(null)
  const [form, setForm] = useState<RouteContactChangeForm | null>(null)
  const [reason, setReason] = useState("")
  const [specialtyQuery, setSpecialtyQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // «Адрес и точка»
  const mayFixLocation = useBootstrapStore((state) => agentMay(state.data?.policies, "customerLocationRequest"))
  const placeKey = useRef(`place-advance-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [place, setPlace] = useState<PlaceState | null>(null)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeFailed, setPlaceFailed] = useState(false)
  const [addressText, setAddressText] = useState("")
  // Sent already: a second press after a half-failed sending does not send it again.
  const [contactSent, setContactSent] = useState(false)
  const picked = useLocationPickStore((state) => (placeId ? state.picks[placeId] ?? null : null))

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const response = await api.getRouteContactDetail(id)
      if (!response?.success || !response.data?.contact) throw new Error("CONTACT_NOT_FOUND")
      const loaded = toRouteContactDetail(response.data.contact)
      setDetail(loaded)
      setOffer(toRouteContactChangeOffer(response.data.changeRequest))
      setForm(initialRouteContactChangeForm(loaded))
      setPlaceId((chosen) => chosen ?? loaded.workplaces.find((workplace) => !!workplace.customerId)?.customerId ?? null)
    } catch (loadError: any) {
      if (loadError?.message === "SESSION_EXPIRED") return
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  // A fresh form starts with no pin put on the map.
  useEffect(() => () => {
    const picks = useLocationPickStore.getState()
    Object.keys(picks.picks).forEach((customerId) => picks.clear(customerId))
  }, [])

  const loadPlace = useCallback(async (customerId: string) => {
    setPlaceLoading(true)
    setPlaceFailed(false)
    try {
      const response = await api.getRouteOrganizationDetail(customerId)
      if (!response?.success || !response.data?.organization) throw new Error("ROUTE_ORGANIZATION_NOT_AVAILABLE")
      const loaded = toRouteOrganizationDetail(response.data.organization)
      setPlace({ detail: loaded, request: toLocationFixRequest(response.data.locationRequest) })
      setAddressText(loaded.address ?? "")
    } catch (loadError: any) {
      if (loadError?.message === "SESSION_EXPIRED") return
      setPlace(null)
      setPlaceFailed(true)
    } finally {
      setPlaceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!placeId || !mayFixLocation) return
    void loadPlace(placeId)
  }, [loadPlace, mayFixLocation, placeId])

  const set = (field: RouteContactChangeField) => (value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const workplaces: PlaceOption[] = []
  for (const workplace of detail?.workplaces ?? []) {
    if (workplace.customerId && !workplaces.some((known) => known.customerId === workplace.customerId)) {
      workplaces.push({ customerId: workplace.customerId, name: workplace.name })
    }
  }
  const contactPart = !!offer && canProposeRouteContactChange(offer, detail)
  const placePart = mayFixLocation && workplaces.length > 0
  const placePin = place ? usablePoint(place.detail) : null
  const placeStanding = mayProposeInAdvance(place?.request ?? null)
  const change = place && placeStanding !== "waiting"
    ? placeChange({ address: place.detail.address, pin: placePin }, { address: addressText, picked })
    : { address: null, pin: null }
  const placeOpen = placePart && !!place && placeStanding !== "waiting"
  const distance = (meters: number) => formatLocationFixDistance(meters, language(i18n.language), copy.place.units)

  const openMap = () => {
    if (!placeId || !place) return
    navigation.navigate("OrganizationLocationFix", {
      id: placeId,
      name: place.detail.name,
      ...(placePin ? { latitude: placePin.latitude, longitude: placePin.longitude } : {}),
      mode: "advance",
    })
  }

  const submit = async () => {
    if (!detail || !offer || !form || saving) return
    const contactChanges = contactPart && !contactSent ? routeContactChanges(detail, form, offer.fields) : {}
    const hasContact = Object.keys(contactChanges).length > 0
    const hasPlace = placeOpen && placeChanged(change)
    if (contactPart && !contactSent && routeContactChangeProblem(detail, form, offer.fields, reason) === "name") {
      setError(copy.problems.name)
      return
    }
    if (!hasContact && !hasPlace) {
      setError(copy.problems.nothing)
      return
    }
    if (reason.trim().length < 3) {
      setError(copy.problems.reason)
      return
    }
    const proposed = hasPlace ? placeProposedPoint(change, placePin) : null
    if (hasPlace && !proposed) {
      setError(copy.placeProblems.pinNeeded)
      return
    }
    setSaving(true)
    setError("")
    let contactDone = contactSent
    if (hasContact) {
      try {
        if (!detail.updatedAt) throw new Error("CONTACT_CHANGE_NOT_STORED")
        const response = await api.submitRouteContactChangeRequest(id, {
          idempotencyKey: idempotencyKey.current,
          reason: reason.trim(),
          expectedContactUpdatedAt: detail.updatedAt,
          changes: contactChanges,
        })
        if (!response?.success) throw new Error("CONTACT_CHANGE_NOT_STORED")
        contactDone = true
        setContactSent(true)
      } catch (submitError) {
        const failure = routeContactChangeFailure(submitError)
        setError(copy.failures[failure])
        // The card or the organization's lists moved under the form: show the
        // current ones. What the agent wrote as the reason stays.
        if (failure === "stale" || failure === "listChanged") void load()
        setSaving(false)
        return
      }
    }
    if (hasPlace && proposed && placeId) {
      try {
        const response = await api.submitOrganizationLocationRequest(placeId, advancePlacePayload(placeKey.current, proposed, change, reason))
        if (!response?.success) throw new Error("LOCATION_REQUEST_NOT_STORED")
        useLocationPickStore.getState().clear(placeId)
      } catch (placeError: any) {
        if (placeError?.message === "SESSION_EXPIRED") {
          setSaving(false)
          return
        }
        const failure = locationFixFailure(placeError)
        const said = failure in copy.placeFailures ? copy.placeFailures[failure as keyof typeof copy.placeFailures] : copy.placeFailures.failed
        setError(`${hasContact || contactDone ? copy.contactSentPlaceNot : ""}${said}`)
        if (failure === "pending") void loadPlace(placeId)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    await ask({
      title: copy.sent,
      message: hasPlace ? copy.sentPlace : copy.sentBody,
      tone: "success",
      buttons: [{ text: "OK", value: true }],
      dismissValue: true,
    })
    navigation.goBack()
  }

  const offers = (field: RouteContactChangeField) => !!offer?.fields.includes(field)
  const specialties = offer ? matchingSpecialties(offer.specialties, specialtyQuery) : []

  return (
    <KeyboardAvoidingView style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.back}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Icon name="arrow-back" size={21} color={fieldTheme.color.onColor} />
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={2}>{copy.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{detail?.name || name || ""}</Text>
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator size="large" color={fieldTheme.color.primaryStrong} />
          <Text style={styles.stateText}>{copy.loading}</Text>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        </View>
      ) : loadFailed || !detail || !offer || !form ? (
        <View style={styles.state}>
          <Icon name="cloud-offline-outline" size={34} color={fieldTheme.color.inkMuted} />
          <Text style={styles.stateText}>{copy.loadFailed}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : !contactPart && !placePart ? (
        <View style={styles.state}>
          <Icon name="time-outline" size={34} color={fieldTheme.color.inkMuted} />
          <Text style={styles.stateText}>{offer.allowed ? copy.pending : copy.failures.disabled}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Icon name="shield-checkmark-outline" size={22} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.noticeText}>{copy.hint}</Text>
          </View>
          <View style={[styles.card, tablet && styles.cardTablet]}>
            {!contactPart ? (
              <Text style={styles.muted} testID="contact-change-contact-closed">{offer.allowed ? copy.contactPending : copy.contactDisabled}</Text>
            ) : null}
            {contactPart && offers("category") && offer.classes.length > 0 ? (
              <Choices testID="contact-change-classes" label={copy.category} values={offer.classes} selected={form.category} onSelect={set("category")} />
            ) : null}

            {contactPart && offers("specialtyName") && offer.specialties.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.label}>{copy.specialty}</Text>
                {offer.specialties.length >= SPECIALTY_SEARCH_FROM ? (
                  <TextInput
                    value={specialtyQuery}
                    onChangeText={setSpecialtyQuery}
                    placeholder={copy.specialtySearch}
                    placeholderTextColor={fieldTheme.color.inkMuted}
                    style={styles.input}
                    testID="contact-change-specialty-search"
                  />
                ) : null}
                {specialties.length > 0 ? (
                  <View style={styles.chips} testID="contact-change-specialties">
                    {specialties.map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: value === form.specialtyName }}
                        onPress={() => set("specialtyName")(value)}
                        style={[styles.chip, value === form.specialtyName && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, value === form.specialtyName && styles.chipTextSelected]}>{value}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : <Text style={styles.muted}>{copy.specialtyNone}</Text>}
              </View>
            ) : null}

            {contactPart && offers("firstName") ? (
              <View style={styles.field}>
                <Text style={styles.label}>{copy.firstName}</Text>
                <TextInput value={form.firstName} onChangeText={set("firstName")} style={styles.input} testID="contact-change-first-name" />
              </View>
            ) : null}
            {contactPart && offers("lastName") ? (
              <View style={styles.field}>
                <Text style={styles.label}>{copy.lastName}</Text>
                <TextInput value={form.lastName} onChangeText={set("lastName")} style={styles.input} testID="contact-change-last-name" />
              </View>
            ) : null}

            {placePart ? (
              <View style={styles.placeBlock} testID="contact-change-place">
                <View style={styles.placeHeading}>
                  <Icon name="location-outline" size={19} color={fieldTheme.color.primaryStrong} />
                  <Text style={styles.placeTitle}>{copy.place.title}</Text>
                </View>
                {workplaces.length > 1 ? (
                  <Choices
                    testID="contact-change-place-workplaces"
                    label={copy.place.workplace}
                    values={workplaces.map((workplace) => workplace.name)}
                    selected={workplaces.find((workplace) => workplace.customerId === placeId)?.name ?? ""}
                    onSelect={(name) => {
                      const chosen = workplaces.find((workplace) => workplace.name === name)
                      if (chosen && chosen.customerId !== placeId) setPlaceId(chosen.customerId)
                    }}
                  />
                ) : (
                  <View style={styles.field}>
                    <Text style={styles.label}>{copy.place.workplace}</Text>
                    <Text style={styles.placeName}>{workplaces[0]?.name}</Text>
                  </View>
                )}
                {placeLoading ? (
                  <View style={styles.placeRow}>
                    <ActivityIndicator color={fieldTheme.color.primaryStrong} />
                    <Text style={styles.muted}>{copy.place.loading}</Text>
                  </View>
                ) : placeFailed || !place ? (
                  <View style={styles.placeRow}>
                    <Text style={[styles.muted, styles.flex]}>{copy.place.failed}</Text>
                    {placeId ? (
                      <Pressable accessibilityRole="button" onPress={() => void loadPlace(placeId)} style={({ pressed }) => [styles.placeButton, pressed && styles.pressed]}>
                        <Text style={styles.placeButtonText}>{copy.retry}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : placeStanding === "waiting" ? (
                  <Text style={styles.muted} testID="contact-change-place-waiting">{copy.place.waiting}</Text>
                ) : (
                  <>
                    {placeStanding === "replaces" ? <Text style={styles.muted} testID="contact-change-place-replaces">{copy.place.replaces}</Text> : null}
                    <View style={styles.field}>
                      <Text style={styles.label}>{copy.place.address}</Text>
                      <Text style={styles.muted}>{copy.place.addressHint}</Text>
                      <TextInput
                        value={addressText}
                        onChangeText={setAddressText}
                        maxLength={PLACE_ADDRESS_MAX}
                        style={styles.input}
                        testID="contact-change-address"
                      />
                    </View>
                    <View style={styles.placeRow}>
                      <Icon name="map-outline" size={20} color={fieldTheme.color.ink} />
                      <Text style={[styles.placePin, styles.flex]} testID="contact-change-pin">
                        {change.pin
                          ? placePin ? copy.place.pinMoves(distance(locationFixDistanceMeters(placePin, change.pin))) : copy.place.pinFirst
                          : placePin ? copy.place.pinNow : copy.place.pinNone}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={openMap}
                        testID="contact-change-put-pin"
                        style={({ pressed }) => [styles.placeButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.placeButtonText}>{placePin || change.pin ? copy.place.move : copy.place.put}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.muted}>{copy.place.later}</Text>
                  </>
                )}
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>{copy.reason}</Text>
              <Text style={styles.muted}>{copy.reasonHint}</Text>
              <TextInput value={reason} onChangeText={setReason} multiline style={[styles.input, styles.multiline]} testID="contact-change-reason" />
            </View>

            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.submit, pressed && styles.pressed, saving && styles.disabled]}
              testID="contact-change-submit"
            >
              {saving ? <ActivityIndicator color={fieldTheme.color.onColor} /> : <Icon name="send-outline" size={20} color={fieldTheme.color.onColor} />}
              <Text style={styles.submitText}>{copy.submit}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.lg, backgroundColor: fieldTheme.color.primaryStrong },
  backButton: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingRight: fieldTheme.space.md },
  backText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  title: { color: fieldTheme.color.onColor, fontSize: 23, lineHeight: 29, fontWeight: "900", marginTop: fieldTheme.space.sm },
  subtitle: { color: fieldTheme.color.primarySoft, fontSize: 14, lineHeight: 20, marginTop: 3 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 },
  stateText: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, fontWeight: "700", textAlign: "center" },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 14, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontWeight: "900" },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingBottom: 40, gap: 14 },
  contentTablet: { padding: 24 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 16, backgroundColor: fieldTheme.color.primarySoft },
  noticeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19 },
  card: { gap: 18, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  cardTablet: { padding: 22 },
  field: { gap: 7 },
  label: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800" },
  muted: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderRadius: fieldTheme.radius.pill, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas },
  chipSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  chipText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "800" },
  chipTextSelected: { color: fieldTheme.color.primaryStrong },
  input: { minHeight: 48, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 14, paddingHorizontal: 14, color: fieldTheme.color.ink, backgroundColor: fieldTheme.color.canvas, fontSize: 15 },
  multiline: { minHeight: 96, paddingTop: 13, textAlignVertical: "top" },
  error: { color: fieldTheme.color.danger, fontSize: 13, lineHeight: 18 },
  submit: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 15, backgroundColor: fieldTheme.color.primary },
  submitText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
  placeBlock: { gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.canvas },
  placeHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  placeName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700" },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: fieldTheme.color.surface },
  placePin: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  placeButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  placeButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900" },
  flex: { flex: 1 },
}))
