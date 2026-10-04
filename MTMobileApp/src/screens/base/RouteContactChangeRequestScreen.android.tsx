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
import { fieldTheme } from "../../theme/fieldTheme"
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

/**
 * Route Field: an agent asks a manager to change a client — its class, its
 * specialty or its name. Nothing is changed from here; the request waits for
 * approval. The card is read again when the form opens, so the agent proposes
 * against the current version and from the organization's current lists.
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
    } catch (loadError: any) {
      if (loadError?.message === "SESSION_EXPIRED") return
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const set = (field: RouteContactChangeField) => (value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const submit = async () => {
    if (!detail?.updatedAt || !offer || !form || saving) return
    const problem = routeContactChangeProblem(detail, form, offer.fields, reason)
    if (problem) {
      setError(copy.problems[problem])
      return
    }
    setSaving(true)
    setError("")
    try {
      const response = await api.submitRouteContactChangeRequest(id, {
        idempotencyKey: idempotencyKey.current,
        reason: reason.trim(),
        expectedContactUpdatedAt: detail.updatedAt,
        changes: routeContactChanges(detail, form, offer.fields),
      })
      if (!response?.success) throw new Error("CONTACT_CHANGE_NOT_STORED")
      await ask({
        title: copy.sent,
        message: copy.sentBody,
        tone: "success",
        buttons: [{ text: "OK", value: true }],
        dismissValue: true,
      })
      navigation.goBack()
    } catch (submitError) {
      const failure = routeContactChangeFailure(submitError)
      setError(copy.failures[failure])
      // The card or the organization's lists moved under the form: show the
      // current ones. What the agent wrote as the reason stays.
      if (failure === "stale" || failure === "listChanged") void load()
    } finally {
      setSaving(false)
    }
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
      ) : !canProposeRouteContactChange(offer, detail) ? (
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
            {offers("category") && offer.classes.length > 0 ? (
              <Choices testID="contact-change-classes" label={copy.category} values={offer.classes} selected={form.category} onSelect={set("category")} />
            ) : null}

            {offers("specialtyName") && offer.specialties.length > 0 ? (
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

            {offers("firstName") ? (
              <View style={styles.field}>
                <Text style={styles.label}>{copy.firstName}</Text>
                <TextInput value={form.firstName} onChangeText={set("firstName")} style={styles.input} testID="contact-change-first-name" />
              </View>
            ) : null}
            {offers("lastName") ? (
              <View style={styles.field}>
                <Text style={styles.label}>{copy.lastName}</Text>
                <TextInput value={form.lastName} onChangeText={set("lastName")} style={styles.input} testID="contact-change-last-name" />
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

const styles = StyleSheet.create({
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
})
