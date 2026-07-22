import React, { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useTranslation } from "react-i18next"
import type { ContactDetail } from "../services/contact-detail"

export type ContactEditFields = Record<string, string | null>

const TEXT_FIELDS = [
  ["lastName", "contacts.fieldLastName"],
  ["firstName", "contacts.fieldFirstName"],
  ["middleName", "contacts.fieldMiddleName"],
  ["birthDate", "contacts.fieldBirthDate"],
  ["specialtyCode", "contacts.fieldSpecialtyCode"],
  ["specialtyName", "contacts.fieldSpecialty"],
  ["qualificationCategory", "contacts.fieldQualification"],
  ["profile", "contacts.fieldProfile"],
  ["productCategory", "contacts.fieldProductCategory"],
  ["workPhone", "contacts.fieldWorkPhone"],
  ["homePhone", "contacts.fieldHomePhone"],
  ["mobilePhone", "contacts.fieldMobilePhone"],
  ["email", "contacts.fieldEmail"],
  ["viberPhone", "contacts.fieldViber"],
  ["whatsappPhone", "contacts.fieldWhatsapp"],
  ["telegramPhone", "contacts.fieldTelegram"],
  ["postalCode", "contacts.fieldPostalCode"],
  ["addressRegion", "contacts.fieldAddressRegion"],
  ["addressLocality", "contacts.fieldAddressLocality"],
  ["addressDistrict", "contacts.fieldAddressDistrict"],
  ["addressStreet", "contacts.fieldAddressStreet"],
  ["externalCode", "contacts.fieldCode"],
  ["source", "contacts.fieldSource"],
  ["duplicateOfContactId", "contacts.fieldDuplicateOf"],
] as const

const GROUPS = [
  { key: "type", label: "contacts.fieldType", values: ["DOCTOR", "PHARMACIST", "OTHER"] },
  { key: "gender", label: "contacts.fieldGender", values: ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"] },
  { key: "category", label: "contacts.fieldCategory", values: ["A", "B", "C", "D"] },
  { key: "status", label: "contacts.fieldStatus", values: ["ACTIVE", "INACTIVE", "PROSPECT", "DUPLICATE", "MERGED"] },
  { key: "verificationStatus", label: "contacts.fieldVerification", values: ["UNVERIFIED", "VERIFIED", "REJECTED"] },
  { key: "consentStatus", label: "contacts.fieldConsent", values: ["UNKNOWN", "GRANTED", "REVOKED"] },
  { key: "contactPreference", label: "contacts.fieldPreference", values: ["PHONE", "EMAIL", "WHATSAPP", "VIBER", "TELEGRAM", "DO_NOT_CONTACT"] },
] as const

function initial(detail: ContactDetail): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key] of TEXT_FIELDS) values[key] = String(detail[key as keyof ContactDetail] ?? "")
  for (const group of GROUPS) values[group.key] = String(detail[group.key as keyof ContactDetail] ?? "")
  values.notes = detail.notes ?? ""
  return values
}

export default function ContactEditModal({
  visible,
  detail,
  agentRequest,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  detail: ContactDetail
  agentRequest: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (fields: ContactEditFields, reason: string) => void
}) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = width >= 600
  const [values, setValues] = useState<Record<string, string>>(() => initial(detail))
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (visible) {
      setValues(initial(detail))
      setReason("")
      setError("")
    }
  }, [detail, visible])

  const changed = useMemo(() => {
    const original = initial(detail)
    const result: ContactEditFields = {}
    for (const [key, value] of Object.entries(values)) {
      if (value !== (original[key] ?? "")) result[key] = value.trim() || null
    }
    return result
  }, [detail, values])

  const submit = () => {
    if (!values.firstName.trim() || !values.lastName.trim()) return setError(t("contacts.validationName"))
    if (values.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate)) return setError(t("contacts.validationDate"))
    if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) return setError(t("contacts.validationEmail"))
    if (agentRequest && reason.trim().length < 3) return setError(t("contacts.validationReason"))
    if (Object.keys(changed).length === 0) return setError(t("contacts.validationNoChanges"))
    setError("")
    onSubmit(changed, reason.trim())
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onCancel}><Text style={styles.cancel}>{t("common.cancel")}</Text></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{agentRequest ? t("contacts.requestEditTitle") : t("contacts.editTitle")}</Text>
            <Text style={styles.subtitle}>{detail.name}</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.save, busy && styles.disabled]}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{agentRequest ? t("contacts.submitRequest") : t("common.save")}</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>{t("contacts.sectionPersonal")}</Text>
          <View style={[styles.grid, tablet && styles.gridTablet]}>
            {TEXT_FIELDS.slice(0, 9).map(([key, label]) => <Input key={key} label={t(label)} value={values[key]} onChange={(value) => setValues((state) => ({ ...state, [key]: value }))} tablet={tablet} />)}
          </View>

          {GROUPS.slice(0, 4).map((group) => (
            <ChoiceGroup key={group.key} label={t(group.label)} values={group.values} selected={values[group.key]} onSelect={(value) => setValues((state) => ({ ...state, [group.key]: value }))} />
          ))}

          <Text style={styles.sectionTitle}>{t("contacts.sectionCommunication")}</Text>
          <View style={[styles.grid, tablet && styles.gridTablet]}>
            {TEXT_FIELDS.slice(9, 16).map(([key, label]) => <Input key={key} label={t(label)} value={values[key]} onChange={(value) => setValues((state) => ({ ...state, [key]: value }))} tablet={tablet} keyboardType={key === "email" ? "email-address" : "phone-pad"} />)}
          </View>

          <Text style={styles.sectionTitle}>{t("contacts.sectionHomeAddress")}</Text>
          <View style={[styles.grid, tablet && styles.gridTablet]}>
            {TEXT_FIELDS.slice(16, 21).map(([key, label]) => <Input key={key} label={t(label)} value={values[key]} onChange={(value) => setValues((state) => ({ ...state, [key]: value }))} tablet={tablet} />)}
          </View>

          <Text style={styles.sectionTitle}>{t("contacts.sectionDataQuality")}</Text>
          {GROUPS.slice(4).map((group) => (
            <ChoiceGroup key={group.key} label={t(group.label)} values={group.values} selected={values[group.key]} onSelect={(value) => setValues((state) => ({ ...state, [group.key]: value }))} />
          ))}
          <View style={[styles.grid, tablet && styles.gridTablet]}>
            {TEXT_FIELDS.slice(21).map(([key, label]) => <Input key={key} label={t(label)} value={values[key]} onChange={(value) => setValues((state) => ({ ...state, [key]: value }))} tablet={tablet} />)}
          </View>
          <Input label={t("contacts.fieldNotes")} value={values.notes} onChange={(value) => setValues((state) => ({ ...state, notes: value }))} multiline />
          {agentRequest && <Input label={t("contacts.changeReason")} value={reason} onChange={setReason} multiline />}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.bottomSpace} />
        </ScrollView>
      </View>
    </Modal>
  )
}

function Input({ label, value, onChange, tablet, multiline, keyboardType }: { label: string; value: string; onChange: (value: string) => void; tablet?: boolean; multiline?: boolean; keyboardType?: "default" | "email-address" | "phone-pad" }) {
  return (
    <View style={[styles.inputWrap, tablet && !multiline && styles.inputTablet]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboardType} autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"} multiline={multiline} style={[styles.input, multiline && styles.multiline]} placeholder="—" placeholderTextColor="#94a3b8" />
    </View>
  )
}

function ChoiceGroup({ label, values, selected, onSelect }: { label: string; values: readonly string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <View style={styles.choiceWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {values.map((value) => (
          <Pressable key={value} accessibilityRole="button" onPress={() => onSelect(value)} style={[styles.chip, value === selected && styles.chipActive]}>
            <Text style={[styles.chipText, value === selected && styles.chipTextActive]}>{value.replaceAll("_", " ")}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  header: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  headerCopy: { flex: 1 },
  title: { color: "#111827", fontSize: 18, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 12, marginTop: 2 },
  cancel: { color: "#64748b", fontSize: 14, fontWeight: "700", paddingVertical: 10 },
  save: { minWidth: 94, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#6C63FF", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  content: { width: "100%", maxWidth: 980, alignSelf: "center", padding: 18 },
  sectionTitle: { color: "#4f46e5", fontSize: 13, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase", marginTop: 16, marginBottom: 10 },
  grid: { gap: 10 },
  gridTablet: { flexDirection: "row", flexWrap: "wrap" },
  inputWrap: { width: "100%", gap: 5, marginBottom: 10 },
  inputTablet: { width: "48.8%" },
  label: { color: "#475569", fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dbe2ea", borderRadius: 12, backgroundColor: "#fff", color: "#0f172a", paddingHorizontal: 13, fontSize: 15 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  choiceWrap: { gap: 7, marginBottom: 12 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 42, justifyContent: "center", paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: "#dbe2ea", backgroundColor: "#fff" },
  chipActive: { borderColor: "#6C63FF", backgroundColor: "#ede9fe" },
  chipText: { color: "#64748b", fontSize: 12, fontWeight: "800" },
  chipTextActive: { color: "#5b21b6" },
  error: { color: "#b91c1c", backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 12, fontSize: 13, fontWeight: "700" },
  bottomSpace: { height: 60 },
})
