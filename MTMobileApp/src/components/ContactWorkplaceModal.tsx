import React, { useEffect, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useTranslation } from "react-i18next"
import { api } from "../services/api"
import type { ContactWorkplace } from "../services/contact-detail"

export interface WorkplaceFields {
  id?: string
  customerId: string
  jobTitle?: string | null
  department?: string | null
  room?: string | null
  phone?: string | null
  isPrimary: boolean
  startedOn?: string | null
  endedOn?: string | null
  expectedUpdatedAt?: string
}

type Organization = { id: string; name: string; city?: string; objectType?: string }

export default function ContactWorkplaceModal({
  visible,
  workplace,
  agentRequest,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  workplace?: ContactWorkplace | null
  agentRequest: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (fields: WorkplaceFields, reason: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Organization | null>(null)
  const [values, setValues] = useState({ jobTitle: "", department: "", room: "", phone: "", startedOn: "", endedOn: "", isPrimary: false })
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!visible) return
    setQuery(workplace?.name ?? "")
    setSelected(workplace ? { id: workplace.customerId, name: workplace.name, city: workplace.city, objectType: workplace.objectType } : null)
    setValues({
      jobTitle: workplace?.jobTitle ?? "",
      department: workplace?.department ?? "",
      room: workplace?.room ?? "",
      phone: workplace?.phone ?? "",
      startedOn: workplace?.startedOn ?? "",
      endedOn: workplace?.endedOn ?? "",
      isPrimary: workplace?.isPrimary ?? false,
    })
    setReason("")
    setError("")
  }, [visible, workplace])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => {
      setLoading(true)
      api.getOrganizations({ search: query.trim() || undefined, page: 1, limit: 20 })
        .then((response: any) => {
          const rows = Array.isArray(response?.data?.organizations) ? response.data.organizations : []
          setOrganizations(rows.map((row: any) => ({ id: String(row.id), name: String(row.name ?? ""), city: row.city ? String(row.city) : undefined, objectType: row.objectType ? String(row.objectType) : undefined })))
        })
        .catch(() => setOrganizations([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query, visible])

  const submit = () => {
    if (!selected) return setError(t("contacts.validationOrganization"))
    if ((values.startedOn && !/^\d{4}-\d{2}-\d{2}$/.test(values.startedOn)) || (values.endedOn && !/^\d{4}-\d{2}-\d{2}$/.test(values.endedOn))) return setError(t("contacts.validationDate"))
    if (values.startedOn && values.endedOn && values.startedOn > values.endedOn) return setError(t("contacts.validationWorkplaceDates"))
    if (agentRequest && reason.trim().length < 3) return setError(t("contacts.validationReason"))
    setError("")
    onSubmit({
      ...(workplace?.id ? { id: workplace.id } : {}),
      ...(workplace?.updatedAt ? { expectedUpdatedAt: workplace.updatedAt } : {}),
      customerId: selected.id,
      jobTitle: values.jobTitle.trim() || null,
      department: values.department.trim() || null,
      room: values.room.trim() || null,
      phone: values.phone.trim() || null,
      isPrimary: values.isPrimary,
      startedOn: values.startedOn || null,
      endedOn: values.endedOn || null,
    }, reason.trim())
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>{t("common.cancel")}</Text></Pressable>
          <Text style={styles.title}>{workplace ? t("contacts.editWorkplace") : t("contacts.addWorkplace")}</Text>
          <Pressable disabled={busy} onPress={submit} style={[styles.save, busy && styles.disabled]}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{agentRequest ? t("contacts.submitRequest") : t("common.save")}</Text>}</Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t("contacts.workplaceOrganization")}</Text>
          <TextInput value={query} onChangeText={(value) => { setQuery(value); if (selected?.name !== value) setSelected(null) }} style={styles.input} placeholder={t("organizations.searchPlaceholder")} placeholderTextColor="#94a3b8" />
          <View style={styles.orgList}>
            {loading ? <ActivityIndicator color="#6C63FF" /> : organizations.map((organization) => (
              <Pressable key={organization.id} onPress={() => { setSelected(organization); setQuery(organization.name) }} style={[styles.orgRow, selected?.id === organization.id && styles.orgRowSelected]}>
                <View style={styles.orgCopy}><Text style={styles.orgName}>{organization.name}</Text><Text style={styles.orgMeta}>{[organization.objectType, organization.city].filter(Boolean).join(" · ")}</Text></View>
                {selected?.id === organization.id && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </View>
          {(["jobTitle", "department", "room", "phone", "startedOn", "endedOn"] as const).map((key) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{t(`contacts.workplace_${key}`)}</Text>
              <TextInput value={values[key]} onChangeText={(value) => setValues((state) => ({ ...state, [key]: value }))} keyboardType={key === "phone" ? "phone-pad" : "default"} style={styles.input} placeholder={key.endsWith("On") ? "YYYY-MM-DD" : "—"} placeholderTextColor="#94a3b8" />
            </View>
          ))}
          <Pressable onPress={() => setValues((state) => ({ ...state, isPrimary: !state.isPrimary }))} style={[styles.primary, values.isPrimary && styles.primarySelected]}>
            <Text style={[styles.primaryText, values.isPrimary && styles.primaryTextSelected]}>{values.isPrimary ? "✓ " : ""}{t("contacts.workplacePrimary")}</Text>
          </Pressable>
          {agentRequest && <View style={styles.field}><Text style={styles.label}>{t("contacts.changeReason")}</Text><TextInput value={reason} onChangeText={setReason} multiline style={[styles.input, styles.multiline]} placeholder={t("contacts.changeReasonPlaceholder")} placeholderTextColor="#94a3b8" /></View>}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  header: { minHeight: 76, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  title: { flex: 1, textAlign: "center", color: "#111827", fontSize: 17, fontWeight: "900" },
  cancel: { color: "#64748b", fontSize: 14, fontWeight: "700", paddingVertical: 12 },
  save: { minWidth: 92, minHeight: 44, borderRadius: 12, backgroundColor: "#6C63FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  saveText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 18, paddingBottom: 80 },
  label: { color: "#475569", fontSize: 12, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dbe2ea", borderRadius: 12, backgroundColor: "#fff", color: "#0f172a", paddingHorizontal: 13, fontSize: 15 },
  field: { marginTop: 13 },
  orgList: { marginTop: 8, maxHeight: 250, gap: 6 },
  orgRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff" },
  orgRowSelected: { borderColor: "#6C63FF", backgroundColor: "#ede9fe" },
  orgCopy: { flex: 1 },
  orgName: { color: "#0f172a", fontSize: 14, fontWeight: "800" },
  orgMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  check: { color: "#6C63FF", fontSize: 20, fontWeight: "900" },
  primary: { minHeight: 48, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#dbe2ea", backgroundColor: "#fff", justifyContent: "center", paddingHorizontal: 14 },
  primarySelected: { borderColor: "#6C63FF", backgroundColor: "#ede9fe" },
  primaryText: { color: "#475569", fontSize: 14, fontWeight: "800" },
  primaryTextSelected: { color: "#5b21b6" },
  multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  error: { marginTop: 14, color: "#b91c1c", backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 12, fontSize: 13, fontWeight: "700" },
})
