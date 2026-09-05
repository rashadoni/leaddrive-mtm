import React, { useEffect, useState } from "react"
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
import type { BrandPotential, BrandPotentialEligibleVisit } from "../services/contact-detail"
import { fieldTheme } from "../theme/fieldTheme"
import { isTabletWidth } from "../theme/layoutBreakpoints"

export interface BrandPotentialFields {
  clientPotentialId: string
  agentId?: string | null
  brandExternalId: string
  brandName: string
  productExternalId?: string | null
  productName?: string | null
  categoryLabel?: string | null
  potentialValue: number
  coverageValue: number
  periodStart: string
  periodEnd?: string | null
  source: string
  provenance: Record<string, unknown>
  evidenceVisitIds: string[]
  supersedesPotentialId?: string | null
}

function initial(previous?: BrandPotential | null) {
  return {
    brandExternalId: previous?.brandExternalId ?? "",
    brandName: previous?.brandName ?? "",
    productExternalId: previous?.productExternalId ?? "",
    productName: previous?.productName ?? "",
    categoryLabel: previous?.categoryLabel ?? previous?.category ?? "",
    potentialValue: previous ? String(previous.potentialValue) : "",
    coverageValue: previous ? String(previous.coverageValue) : "",
    periodStart: new Date().toISOString().slice(0, 7) + "-01",
    periodEnd: "",
    source: "FIELD_INTERVIEW",
    evidenceNote: "",
  }
}

export default function BrandPotentialModal({
  visible,
  busy,
  previous,
  eligibleVisits,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  busy: boolean
  previous?: BrandPotential | null
  eligibleVisits: BrandPotentialEligibleVisit[]
  onCancel: () => void
  onSubmit: (fields: BrandPotentialFields) => void
}) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const [values, setValues] = useState(() => initial(previous))
  const [selectedVisits, setSelectedVisits] = useState<string[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    if (!visible) return
    setValues(initial(previous))
    setSelectedVisits(previous?.evidenceVisits.map((visit) => visit.id) ?? [])
    setError("")
  }, [previous, visible])

  const update = (key: keyof ReturnType<typeof initial>, value: string) => setValues((state) => ({ ...state, [key]: value }))
  const toggleVisit = (visitId: string) => setSelectedVisits((ids) => ids.includes(visitId) ? ids.filter((id) => id !== visitId) : [...ids, visitId])

  const submit = () => {
    if (!values.brandExternalId.trim() || !values.brandName.trim()) return setError(t("potential.validationBrand"))
    const potentialValue = Number(values.potentialValue)
    const coverageValue = Number(values.coverageValue)
    if (![potentialValue, coverageValue].every((value) => Number.isFinite(value) && value >= 0)) return setError(t("potential.validationNumber"))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.periodStart) || (values.periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(values.periodEnd))) return setError(t("contacts.validationDate"))
    if (values.periodEnd && values.periodStart > values.periodEnd) return setError(t("potential.validationPeriod"))
    if (values.evidenceNote.trim().length < 3) return setError(t("potential.validationEvidence"))
    setError("")
    onSubmit({
      clientPotentialId: `mobile-potential-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      agentId: previous?.agentId ?? null,
      brandExternalId: values.brandExternalId.trim(),
      brandName: values.brandName.trim(),
      productExternalId: values.productExternalId.trim() || null,
      productName: values.productName.trim() || null,
      categoryLabel: values.categoryLabel.trim() || null,
      potentialValue,
      coverageValue,
      periodStart: values.periodStart,
      periodEnd: values.periodEnd || null,
      source: values.source.trim() || "FIELD_INTERVIEW",
      provenance: { note: values.evidenceNote.trim(), capturedBy: "MOBILE_FIELD", capturedAt: new Date().toISOString() },
      evidenceVisitIds: selectedVisits,
      supersedesPotentialId: previous?.id ?? null,
    })
  }

  const fields: Array<{ key: keyof ReturnType<typeof initial>; label: string; numeric?: boolean; wide?: boolean; placeholder?: string }> = [
    { key: "brandName", label: t("potential.brandName") },
    { key: "brandExternalId", label: t("potential.brandId") },
    { key: "productName", label: t("potential.productName") },
    { key: "productExternalId", label: t("potential.productId") },
    { key: "categoryLabel", label: t("potential.category"), placeholder: "B2" },
    { key: "potentialValue", label: t("potential.potential"), numeric: true },
    { key: "coverageValue", label: t("potential.coverage"), numeric: true },
    { key: "periodStart", label: t("potential.periodStart"), placeholder: "YYYY-MM-DD" },
    { key: "periodEnd", label: t("potential.periodEnd"), placeholder: "YYYY-MM-DD" },
    { key: "source", label: t("potential.source") },
    { key: "evidenceNote", label: t("potential.evidenceNote"), wide: true },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerAction}><Text style={styles.cancel}>{t("common.cancel")}</Text></Pressable>
          <View style={styles.headerCopy}><Text style={styles.title}>{previous ? t("potential.newVersion") : t("potential.add")}</Text><Text style={styles.subtitle}>{t("potential.appendOnly")}</Text></View>
          <Pressable disabled={busy} onPress={submit} style={[styles.save, busy && styles.disabled]}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("common.save")}</Text>}</Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}><Text style={styles.heroEyebrow}>{t("potential.workflow")}</Text><Text style={styles.heroTitle}>{t("potential.heroTitle")}</Text><Text style={styles.heroBody}>{t("potential.heroBody")}</Text></View>
          <View style={[styles.grid, tablet && styles.gridTablet]}>
            {fields.map((field) => <View key={field.key} style={[styles.field, tablet && !field.wide && styles.fieldTablet]}><Text style={styles.label}>{field.label}</Text><TextInput value={values[field.key]} onChangeText={(value) => update(field.key, value)} keyboardType={field.numeric ? "decimal-pad" : "default"} multiline={field.wide} style={[styles.input, field.wide && styles.multiline]} placeholder={field.placeholder ?? "—"} placeholderTextColor="#94a3b8" /></View>)}
          </View>
          <View style={styles.evidencePanel}>
            <Text style={styles.sectionTitle}>{t("potential.evidenceVisits")}</Text>
            <Text style={styles.sectionHint}>{t("potential.evidenceVisitsHint")}</Text>
            {eligibleVisits.length === 0 ? <Text style={styles.empty}>{t("potential.noEvidenceVisits")}</Text> : eligibleVisits.map((visit) => {
              const selected = selectedVisits.includes(visit.id)
              return <Pressable key={visit.id} onPress={() => toggleVisit(visit.id)} style={[styles.visit, selected && styles.visitSelected]}><View style={[styles.checkbox, selected && styles.checkboxSelected]}><Text style={styles.check}>{selected ? "✓" : ""}</Text></View><View style={styles.visitCopy}><Text style={styles.visitTitle}>{visit.customerName || t("potential.visit")}</Text><Text style={styles.visitMeta}>{visit.checkInAt ? new Date(visit.checkInAt).toLocaleString(i18n.language) : visit.id}</Text></View></Pressable>
            })}
          </View>
          {!!error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { minHeight: 84, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  headerAction: { minWidth: 72, minHeight: 48, justifyContent: "center" }, cancel: { color: "#64748b", fontSize: 14, fontWeight: "700" },
  headerCopy: { flex: 1, alignItems: "center" }, title: { color: "#13231F", fontSize: 18, fontWeight: "900" }, subtitle: { color: "#64748b", fontSize: 11, textAlign: "center", marginTop: 3 },
  save: { minWidth: 86, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#08705A" }, saveText: { color: "#fff", fontSize: 14, fontWeight: "900" }, disabled: { opacity: 0.5 },
  content: { width: "100%", maxWidth: 960, alignSelf: "center", padding: 18, paddingBottom: 80, gap: 16 }, contentTablet: { paddingHorizontal: 32, paddingTop: 24 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: "#D9F1E8", borderWidth: 1, borderColor: "#B7DDCE" }, heroEyebrow: { color: "#08705A", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 }, heroTitle: { color: "#13231F", fontSize: 20, fontWeight: "900", marginTop: 5 }, heroBody: { color: "#5E7069", fontSize: 12, lineHeight: 18, marginTop: 5 },
  grid: { gap: 13 }, gridTablet: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }, field: { width: "100%" }, fieldTablet: { width: "48.8%" }, label: { color: "#5E7069", fontSize: 12, fontWeight: "800", marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D6E3DC", borderRadius: 12, backgroundColor: "#fff", color: "#13231F", paddingHorizontal: 13, fontSize: 15 }, multiline: { minHeight: 88, paddingTop: 13, textAlignVertical: "top" },
  evidencePanel: { padding: 16, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0" }, sectionTitle: { color: "#13231F", fontSize: 14, fontWeight: "900" }, sectionHint: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 3, marginBottom: 10 }, empty: { color: "#94a3b8", fontSize: 13, paddingVertical: 8 },
  visit: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", marginTop: 8 }, visitSelected: { borderColor: "#08705A", backgroundColor: "#F1F6F3" }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: "#08705A", backgroundColor: "#08705A" }, check: { color: "#fff", fontSize: 14, fontWeight: "900" }, visitCopy: { flex: 1 }, visitTitle: { color: "#13231F", fontSize: 13, fontWeight: "800" }, visitMeta: { color: "#64748b", fontSize: 11, marginTop: 3 },
  error: { borderRadius: 12, borderWidth: 1, borderColor: "#EDB9AD", backgroundColor: "#FDE6DF", padding: 13 }, errorText: { color: "#A43B25", fontSize: 13, fontWeight: "800" },
})
