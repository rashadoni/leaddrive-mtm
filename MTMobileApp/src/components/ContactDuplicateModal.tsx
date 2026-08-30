import React, { useEffect, useState } from "react"
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useTranslation } from "react-i18next"
import { commercialApi } from "../services/commercial-api"

type Candidate = {
  id: string
  name: string
  specialty?: string
  workplace?: string
}

export default function ContactDuplicateModal({
  visible,
  currentContactId,
  agentRequest,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  currentContactId: string
  agentRequest: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (targetContactId: string, reason: string) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!visible) return
    setQuery("")
    setCandidates([])
    setSelected(null)
    setReason("")
    setError("")
  }, [visible])

  useEffect(() => {
    if (!visible || query.trim().length < 2) {
      setCandidates([])
      return
    }
    const timer = setTimeout(() => {
      setLoading(true)
      commercialApi.getContacts({ search: query.trim(), page: 1, limit: 20 })
        .then((response: any) => {
          const rows = Array.isArray(response?.data?.contacts) ? response.data.contacts : []
          setCandidates(rows
            .filter((row: any) => String(row?.id ?? "") !== currentContactId)
            .map((row: any) => ({
              id: String(row.id),
              name: String(row.displayName ?? ""),
              specialty: row.specialtyName ? String(row.specialtyName) : undefined,
              workplace: row.workplaces?.[0]?.customer?.name ? String(row.workplaces[0].customer.name) : undefined,
            })))
        })
        .catch(() => setCandidates([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [currentContactId, query, visible])

  const submit = () => {
    if (!selected) return setError(t("contacts.validationDuplicate"))
    if (agentRequest && reason.trim().length < 3) return setError(t("contacts.validationReason"))
    setError("")
    onSubmit(selected.id, reason.trim())
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>{t("common.cancel")}</Text></Pressable>
          <Text style={styles.title}>{t("contacts.duplicateTitle")}</Text>
          <Pressable disabled={busy} onPress={submit} style={[styles.submit, busy && styles.disabled]}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitText}>{agentRequest ? t("contacts.submitRequest") : t("contacts.markDuplicate")}</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.explanation}>{t("contacts.duplicateExplanation")}</Text>
          <Text style={styles.label}>{t("contacts.duplicateSearch")}</Text>
          <TextInput value={query} onChangeText={(value) => { setQuery(value); setSelected(null) }} style={styles.input} placeholder={t("contacts.duplicateSearchPlaceholder")} placeholderTextColor="#94a3b8" autoFocus />
          <View style={styles.results}>
            {loading ? <ActivityIndicator color="#6C63FF" /> : candidates.map((candidate) => (
              <Pressable key={candidate.id} onPress={() => setSelected(candidate)} style={[styles.row, selected?.id === candidate.id && styles.rowSelected]}>
                <View style={styles.rowCopy}>
                  <Text style={styles.name}>{candidate.name}</Text>
                  <Text style={styles.meta}>{[candidate.specialty, candidate.workplace].filter(Boolean).join(" · ")}</Text>
                </View>
                {selected?.id === candidate.id && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </View>
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
  cancel: { color: "#64748b", fontSize: 14, fontWeight: "700", paddingVertical: 12 },
  title: { flex: 1, textAlign: "center", color: "#111827", fontSize: 17, fontWeight: "900" },
  submit: { minWidth: 104, minHeight: 44, borderRadius: 12, backgroundColor: "#b45309", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  submitText: { color: "#fff", fontSize: 12, fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.55 },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 18, paddingBottom: 80 },
  explanation: { color: "#475569", fontSize: 13, lineHeight: 20, marginBottom: 18 },
  label: { color: "#475569", fontSize: 12, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dbe2ea", borderRadius: 12, backgroundColor: "#fff", color: "#0f172a", paddingHorizontal: 13, fontSize: 15 },
  results: { marginTop: 8, gap: 6 },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#fff" },
  rowSelected: { borderColor: "#b45309", backgroundColor: "#fff7ed" },
  rowCopy: { flex: 1 },
  name: { color: "#0f172a", fontSize: 14, fontWeight: "800" },
  meta: { color: "#64748b", fontSize: 12, marginTop: 3 },
  check: { color: "#b45309", fontSize: 20, fontWeight: "900" },
  field: { marginTop: 16 },
  multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  error: { marginTop: 14, color: "#b91c1c", backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 12, fontSize: 13, fontWeight: "700" },
})
