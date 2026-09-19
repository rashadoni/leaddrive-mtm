import React, { useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

const COPY = {
  ru: {
    title: "Новый врач",
    hint: "После проверки дублей заявка уйдёт менеджеру. Врач появится в приложении только после одобрения.",
    name: "Имя и фамилия *",
    specialty: "Специальность",
    phone: "Телефон",
    clinic: "Клиника *",
    address: "Адрес",
    notes: "Заметки",
    submit: "Отправить менеджеру",
    required: "Укажите имя врача и клинику.",
    success: "Заявка отправлена",
    successBody: "Менеджер проверит возможные дубли и подтвердит добавление врача.",
    duplicate: "Найдены возможные дубли: {{count}}. Менеджер увидит их при проверке.",
    failed: "Не удалось отправить заявку.",
    back: "Назад",
  },
  az: {
    title: "Yeni həkim",
    hint: "Dubl yoxlamasından sonra sorğu menecerə gedəcək. Həkim yalnız təsdiqdən sonra tətbiqdə görünəcək.",
    name: "Ad və soyad *", specialty: "İxtisas", phone: "Telefon", clinic: "Klinika *", address: "Ünvan", notes: "Qeydlər",
    submit: "Menecerə göndər", required: "Həkimin adını və klinikanı göstərin.", success: "Sorğu göndərildi",
    successBody: "Menecer mümkün dubları yoxlayacaq və həkimin əlavə edilməsini təsdiqləyəcək.",
    duplicate: "Mümkün dubl tapıldı: {{count}}. Menecer onları yoxlama zamanı görəcək.", failed: "Sorğunu göndərmək alınmadı.", back: "Geri",
  },
  en: {
    title: "New doctor",
    hint: "After duplicate checking, the request goes to the manager. The doctor appears in the app only after approval.",
    name: "Full name *", specialty: "Specialty", phone: "Phone", clinic: "Clinic *", address: "Address", notes: "Notes",
    submit: "Send to manager", required: "Enter the doctor's name and clinic.", success: "Request sent",
    successBody: "The manager will review possible duplicates and approve the new doctor.",
    duplicate: "Possible duplicates found: {{count}}. The manager will see them during review.", failed: "The request could not be sent.", back: "Back",
  },
} as const

function language(value: string): keyof typeof COPY {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function Field({ label, value, onChangeText, multiline = false, keyboardType }: {
  label: string
  value: string
  onChangeText: (value: string) => void
  multiline?: boolean
  keyboardType?: "default" | "phone-pad"
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[styles.input, multiline && styles.multiline]}
        placeholderTextColor={fieldTheme.color.inkMuted}
      />
    </View>
  )
}

export default function DoctorCreateRequestScreen() {
  const navigation = useNavigation()
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const idempotencyKey = useRef(`doctor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const [form, setForm] = useState({ displayName: "", specialtyName: "", phone: "", clinicName: "", address: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async () => {
    if (form.displayName.trim().length < 2 || form.clinicName.trim().length < 2) {
      setError(copy.required)
      return
    }
    setSaving(true)
    setError("")
    try {
      const response = await api.submitDoctorCreateRequest({
        idempotencyKey: idempotencyKey.current,
        displayName: form.displayName.trim(),
        specialtyName: form.specialtyName.trim() || null,
        phone: form.phone.trim() || null,
        clinicName: form.clinicName.trim(),
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      })
      if (!response?.success) throw new Error(response?.error || copy.failed)
      const count = Array.isArray(response.data?.duplicateCandidates) ? response.data.duplicateCandidates.length : 0
      Alert.alert(copy.success, count ? copy.duplicate.replace("{{count}}", String(count)) : copy.successBody, [
        { text: "OK", onPress: () => navigation.goBack() },
      ])
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
        </Pressable>
        <Text style={styles.title}>{copy.title}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Icon name="shield-checkmark-outline" size={22} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.noticeText}>{copy.hint}</Text>
        </View>
        <View style={[styles.card, tablet && styles.cardTablet]}>
          <Field label={copy.name} value={form.displayName} onChangeText={set("displayName")} />
          <Field label={copy.specialty} value={form.specialtyName} onChangeText={set("specialtyName")} />
          <Field label={copy.phone} value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
          <Field label={copy.clinic} value={form.clinicName} onChangeText={set("clinicName")} />
          <Field label={copy.address} value={form.address} onChangeText={set("address")} />
          <Field label={copy.notes} value={form.notes} onChangeText={set("notes")} multiline />
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} style={({ pressed }) => [styles.submit, pressed && styles.pressed, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color={fieldTheme.color.onColor} /> : <Icon name="send-outline" size={20} color={fieldTheme.color.onColor} />}
            <Text style={styles.submitText}>{copy.submit}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong },
  title: { color: fieldTheme.color.ink, fontSize: 21, fontWeight: "900" },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingBottom: 40, gap: 14 },
  contentTablet: { padding: 24 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 16, backgroundColor: fieldTheme.color.primarySoft },
  noticeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19 },
  card: { gap: 15, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  cardTablet: { padding: 22 },
  field: { gap: 6 },
  label: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800" },
  input: { minHeight: 48, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 14, paddingHorizontal: 14, color: fieldTheme.color.ink, backgroundColor: fieldTheme.color.canvas, fontSize: 15 },
  multiline: { minHeight: 96, paddingTop: 13, textAlignVertical: "top" },
  error: { color: fieldTheme.color.danger, fontSize: 13, lineHeight: 18 },
  submit: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 15, backgroundColor: fieldTheme.color.primary },
  submitText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
})
