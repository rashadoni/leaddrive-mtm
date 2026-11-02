import React, { useMemo, useRef, useState } from "react"
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { ask } from "../../services/app-feedback"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import {
  dayHoursText,
  hoursPayload,
  proposedWeek,
  readWorkingHours,
  weekdayOf,
  type HoursFixChoice,
  type Language,
} from "./organization-hours-model"

/**
 * «Часы не те?» (owner, 2026-11-02, mockup «MTM: часы приёма клиентов»): the
 * agent at a place whose «часы приёма» are wrong says what the door says. A
 * manager accepts it in the CRM; nothing about the place changes until then.
 */
const COPY = {
  ru: {
    back: "Назад",
    title: "Часы не те?",
    now: (text: string) => `В базе сегодня: ${text}`,
    none: "часы не указаны",
    what: "Что не так",
    time: "Другое время работы",
    lunch: "Другой обед",
    closedToday: "Сегодня закрыто",
    open: "Открыто с",
    close: "до",
    lunchFrom: "Обед с",
    lunchTo: "до",
    weekdays: "Так во все будни",
    comment: "Комментарий",
    commentPlaceholder: "Например: табличка на двери",
    send: "Отправить менеджеру",
    note: "Часы поменяются, когда менеджер примет. Агент базу сам не правит.",
    invalid: "Проверьте время: ЧЧ:ММ, закрытие позже открытия, обед внутри дня.",
    sent: "Отправлено менеджеру",
    sentBody: "Когда он примет, часы места поменяются. Ответ придёт уведомлением.",
    failed: "Не удалось отправить. Проверьте связь и повторите.",
    pending: "О часах этого места уже есть запрос — дождитесь ответа менеджера.",
    unchanged: "Это те же часы, что уже в базе.",
  },
  az: {
    back: "Geri",
    title: "Saatlar düz deyil?",
    now: (text: string) => `Bazada bu gün: ${text}`,
    none: "saatlar göstərilməyib",
    what: "Nə düz deyil",
    time: "Başqa iş vaxtı",
    lunch: "Başqa nahar",
    closedToday: "Bu gün bağlıdır",
    open: "Açılır",
    close: "bağlanır",
    lunchFrom: "Nahar",
    lunchTo: "-dək",
    weekdays: "Bütün iş günləri belədir",
    comment: "Şərh",
    commentPlaceholder: "Məsələn: qapıdakı lövhə",
    send: "Rəhbərə göndər",
    note: "Saatlar rəhbər qəbul etdikdən sonra dəyişəcək. Agent bazanı özü dəyişmir.",
    invalid: "Vaxtı yoxlayın: SS:DD, bağlanma açılmadan sonra, nahar günün içində.",
    sent: "Rəhbərə göndərildi",
    sentBody: "Qəbul etdikdə yerin saatları dəyişəcək. Cavab bildirişlə gələcək.",
    failed: "Göndərmək alınmadı. Əlaqəni yoxlayın və təkrar edin.",
    pending: "Bu yerin saatları barədə artıq sorğu var — rəhbərin cavabını gözləyin.",
    unchanged: "Bunlar bazadakı saatlarla eynidir.",
  },
  en: {
    back: "Back",
    title: "Hours wrong?",
    now: (text: string) => `In the system today: ${text}`,
    none: "no hours given",
    what: "What is wrong",
    time: "Different opening hours",
    lunch: "Different lunch",
    closedToday: "Closed today",
    open: "Open from",
    close: "to",
    lunchFrom: "Lunch from",
    lunchTo: "to",
    weekdays: "Same on every weekday",
    comment: "Comment",
    commentPlaceholder: "For example: the sign on the door",
    send: "Send to the manager",
    note: "The hours change once a manager accepts. Agents do not edit places.",
    invalid: "Check the time: HH:MM, closing after opening, lunch inside the day.",
    sent: "Sent to the manager",
    sentBody: "Once accepted, the place's hours change. The answer comes as a notification.",
    failed: "Could not send. Check the connection and try again.",
    pending: "A request about this place's hours is already waiting — wait for the manager.",
    unchanged: "These are the hours already in the system.",
  },
} as const

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

/** «9:5» or «0930» typed on a phone keyboard → «09:05» / «09:30»; anything else stays as typed. */
function tidyClock(value: string): string {
  const digits = value.replace(/[^\d]/g, "")
  if (/^\d{3,4}$/.test(digits)) {
    const padded = digits.padStart(4, "0")
    return `${padded.slice(0, 2)}:${padded.slice(2)}`
  }
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  return match ? `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}` : value.trim()
}

export default function RouteOrganizationHoursFixScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "OrganizationHoursFix">>()
  const { i18n } = useTranslation()
  const language = languageFor(i18n.language)
  const copy = COPY[language]
  const headerTop = useHeaderTop()
  const { id, name } = route.params
  const current = useMemo(() => readWorkingHours(route.params.hours), [route.params.hours])
  const today = weekdayOf(new Date())
  const todays = current ? current[today] : undefined
  const idempotencyKey = useRef(`hours-fix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const [choice, setChoice] = useState<HoursFixChoice>("time")
  const [open, setOpen] = useState(todays?.open ?? "09:00")
  const [close, setClose] = useState(todays?.close ?? "18:00")
  const [breakFrom, setBreakFrom] = useState(todays?.breakFrom ?? "13:00")
  const [breakTo, setBreakTo] = useState(todays?.breakTo ?? "14:00")
  const [allWeekdays, setAllWeekdays] = useState(today <= 5)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const week = proposedWeek(current, today, choice, { open: tidyClock(open), close: tidyClock(close), breakFrom: tidyClock(breakFrom), breakTo: tidyClock(breakTo), allWeekdays })

  const send = async () => {
    if (sending) return
    if (!week) {
      setSaid(copy.invalid)
      return
    }
    setSending(true)
    setSaid(null)
    try {
      const response = await api.submitOrganizationHoursRequest(id, {
        idempotencyKey: idempotencyKey.current,
        hours: hoursPayload(week),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      })
      if (!response?.success) throw new Error("HOURS_REQUEST_NOT_STORED")
      await ask({ title: copy.sent, message: copy.sentBody, tone: "success", buttons: [{ text: "OK", value: true }], dismissValue: true })
      navigation.goBack()
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      const code = String(error?.code ?? error?.data?.code ?? error?.message ?? "")
      setSaid(code.includes("MTM_HOURS_REQUEST_PENDING") ? copy.pending : code.includes("MTM_HOURS_REQUEST_UNCHANGED") ? copy.unchanged : copy.failed)
    } finally {
      setSending(false)
    }
  }

  const option = (value: HoursFixChoice, label: string) => (
    <Pressable
      key={value}
      accessibilityRole="radio"
      accessibilityState={{ selected: choice === value }}
      onPress={() => setChoice(value)}
      testID={`hours-fix-${value}`}
      style={({ pressed }) => [styles.option, choice === value && styles.optionOn, pressed && styles.pressed]}
    >
      <Icon name={choice === value ? "radio-button-on" : "radio-button-off"} size={20} color={choice === value ? fieldTheme.color.primary : fieldTheme.color.inkMuted} />
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  )

  const clockInput = (label: string, value: string, setValue: (value: string) => void, testID: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={() => setValue(tidyClock(value))}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        placeholder="09:00"
        testID={testID}
        style={styles.input}
      />
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="arrow-back" size={21} color={fieldTheme.color.onColor} />
          <Text style={styles.backText}>{copy.back}</Text>
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{name || ""}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.now} testID="hours-fix-now">{copy.now(todays === undefined ? copy.none : dayHoursText(todays, language))}</Text>
        <Text style={styles.section}>{copy.what}</Text>
        {option("time", copy.time)}
        {option("lunch", copy.lunch)}
        {option("closedToday", copy.closedToday)}
        {choice === "time" ? (
          <View style={styles.row}>{clockInput(copy.open, open, setOpen, "hours-fix-open")}{clockInput(copy.close, close, setClose, "hours-fix-close")}</View>
        ) : choice === "lunch" ? (
          <View style={styles.row}>{clockInput(copy.lunchFrom, breakFrom, setBreakFrom, "hours-fix-lunch-from")}{clockInput(copy.lunchTo, breakTo, setBreakTo, "hours-fix-lunch-to")}</View>
        ) : null}
        {choice !== "closedToday" && today <= 5 ? (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allWeekdays }} onPress={() => setAllWeekdays((value) => !value)} style={({ pressed }) => [styles.check, pressed && styles.pressed]} testID="hours-fix-weekdays">
            <Icon name={allWeekdays ? "checkbox" : "square-outline"} size={22} color={fieldTheme.color.primary} />
            <Text style={styles.optionText}>{copy.weekdays}</Text>
          </Pressable>
        ) : null}
        <View style={styles.field}>
          <Text style={styles.label}>{copy.comment}</Text>
          <TextInput value={comment} onChangeText={setComment} maxLength={300} placeholder={copy.commentPlaceholder} style={styles.input} testID="hours-fix-comment" />
        </View>
        {said ? (
          <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="alert-circle-outline" size={18} color={fieldTheme.color.amber} />
            <Text style={styles.problemText} testID="hours-fix-problem">{said}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={() => void send()} disabled={sending} testID="hours-fix-send" style={({ pressed }) => [styles.submit, sending && styles.disabled, pressed && styles.pressed]}>
          {sending ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Icon name="send" size={18} color={fieldTheme.color.onColor} />}
          <Text style={styles.submitText}>{copy.send}</Text>
        </Pressable>
        <Text style={styles.note}>{copy.note}</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.primaryStrong },
  backButton: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingRight: fieldTheme.space.md },
  backText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
  title: { color: fieldTheme.color.onColor, fontSize: 21, lineHeight: 27, fontWeight: "900", marginTop: fieldTheme.space.xs },
  subtitle: { color: fieldTheme.color.primarySoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
  body: { gap: fieldTheme.space.sm, padding: fieldTheme.space.lg },
  now: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20 },
  section: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900", marginTop: fieldTheme.space.sm },
  option: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  optionOn: { borderWidth: 2, borderColor: fieldTheme.color.primary },
  optionText: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700", flexShrink: 1 },
  row: { flexDirection: "row", gap: fieldTheme.space.sm },
  field: { flex: 1, gap: 4 },
  label: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, paddingHorizontal: 12, color: fieldTheme.color.ink, fontSize: 15, backgroundColor: fieldTheme.color.surface },
  check: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  problem: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 10, backgroundColor: fieldTheme.color.amberSoft },
  problemText: { flex: 1, color: fieldTheme.color.amber, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  footer: { gap: fieldTheme.space.sm, padding: fieldTheme.space.lg, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  submit: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 15, backgroundColor: fieldTheme.color.primary },
  submitText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  note: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
}))
