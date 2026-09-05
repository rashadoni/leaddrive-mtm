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
import { commercialApi } from "../services/commercial-api"
import { fieldTheme } from "../theme/fieldTheme"
import { isTabletWidth } from "../theme/layoutBreakpoints"

type Formula = { id: string; version: string; name: string; status: string; signedAt?: string }

export interface DoctorAssessmentFields {
  clientAssessmentId: string
  formulaId: string
  office?: string | null
  patientsPerMonth?: number | null
  bedCount?: number | null
  isKol: boolean
  kolLevel?: string | null
  profile?: string | null
  psychotype?: string | null
  granularCategory?: string | null
  actualScore?: number | null
  targetScore?: number | null
  periodStart: string
  periodEnd?: string | null
  source: string
  provenance: Record<string, unknown>
}

const initial = () => ({
  office: "",
  patientsPerMonth: "",
  bedCount: "",
  isKol: false,
  kolLevel: "",
  profile: "",
  psychotype: "",
  granularCategory: "",
  actualScore: "",
  targetScore: "",
  periodStart: new Date().toISOString().slice(0, 7) + "-01",
  periodEnd: "",
  source: "MANAGER_INTERVIEW",
  evidence: "",
})

function numberOrNull(value: string): number | null {
  return value.trim() ? Number(value) : null
}

export default function DoctorAssessmentModal({
  visible,
  busy,
  onCancel,
  onSubmit,
}: {
  visible: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (fields: DoctorAssessmentFields) => void
}) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const [values, setValues] = useState(initial)
  const [formulas, setFormulas] = useState<Formula[]>([])
  const [loadingFormula, setLoadingFormula] = useState(false)
  const [error, setError] = useState("")
  const activeFormula = useMemo(() => formulas.find((formula) => formula.status === "ACTIVE" && formula.signedAt), [formulas])

  useEffect(() => {
    if (!visible) return
    setValues(initial())
    setError("")
    setLoadingFormula(true)
    commercialApi.getDoctorScoringFormulas()
      .then((response: any) => setFormulas(Array.isArray(response?.data?.formulas) ? response.data.formulas : []))
      .catch(() => setFormulas([]))
      .finally(() => setLoadingFormula(false))
  }, [visible])

  const update = (key: keyof ReturnType<typeof initial>, value: string | boolean) => {
    setValues((state) => ({ ...state, [key]: value }))
  }

  const submit = () => {
    if (!activeFormula) return setError(t("contacts.scoringNoActiveFormula"))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.periodStart) || (values.periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(values.periodEnd))) {
      return setError(t("contacts.validationDate"))
    }
    if (values.periodEnd && values.periodStart > values.periodEnd) return setError(t("contacts.scoringValidationPeriod"))
    const numeric = [values.patientsPerMonth, values.bedCount, values.actualScore, values.targetScore]
    if (numeric.some((value) => value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0))) return setError(t("contacts.scoringValidationNumber"))
    if (values.isKol && values.kolLevel.trim().length === 0) return setError(t("contacts.scoringValidationKol"))
    if (values.evidence.trim().length < 3) return setError(t("contacts.scoringValidationEvidence"))
    setError("")
    onSubmit({
      clientAssessmentId: `mobile-score-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      formulaId: activeFormula.id,
      office: values.office.trim() || null,
      patientsPerMonth: numberOrNull(values.patientsPerMonth),
      bedCount: numberOrNull(values.bedCount),
      isKol: values.isKol,
      kolLevel: values.isKol ? values.kolLevel.trim() : null,
      profile: values.profile.trim() || null,
      psychotype: values.psychotype.trim() || null,
      granularCategory: values.granularCategory.trim() || null,
      actualScore: numberOrNull(values.actualScore),
      targetScore: numberOrNull(values.targetScore),
      periodStart: values.periodStart,
      periodEnd: values.periodEnd || null,
      source: values.source.trim(),
      provenance: { evidence: values.evidence.trim(), capturedBy: "MOBILE_MANAGER", capturedAt: new Date().toISOString() },
    })
  }

  const fields: Array<{ key: keyof ReturnType<typeof initial>; label: string; numeric?: boolean; placeholder?: string }> = [
    { key: "office", label: t("contacts.scoringOffice") },
    { key: "patientsPerMonth", label: t("contacts.scoringPatients"), numeric: true },
    { key: "bedCount", label: t("contacts.scoringBeds"), numeric: true },
    { key: "profile", label: t("contacts.fieldProfile") },
    { key: "psychotype", label: t("contacts.scoringPsychotype") },
    { key: "granularCategory", label: t("contacts.scoringCategory"), placeholder: "B2" },
    { key: "actualScore", label: t("contacts.scoringActual"), numeric: true },
    { key: "targetScore", label: t("contacts.scoringTarget"), numeric: true },
    { key: "periodStart", label: t("contacts.scoringPeriodStart"), placeholder: "YYYY-MM-DD" },
    { key: "periodEnd", label: t("contacts.scoringPeriodEnd"), placeholder: "YYYY-MM-DD" },
    { key: "source", label: t("contacts.scoringSource") },
    { key: "evidence", label: t("contacts.scoringEvidence") },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} style={styles.headerAction}><Text style={styles.cancel}>{t("common.cancel")}</Text></Pressable>
          <View style={styles.headerCopy}><Text style={styles.title}>{t("contacts.scoringNew")}</Text><Text style={styles.subtitle}>{t("contacts.scoringAppendOnly")}</Text></View>
          <Pressable disabled={busy || loadingFormula} onPress={submit} style={[styles.save, (busy || loadingFormula) && styles.disabled]}>{busy ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} /> : <Text style={styles.saveText}>{t("common.save")}</Text>}</Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
          <View style={styles.formulaPanel}>
            <View style={styles.formulaIcon}><Text style={styles.formulaIconText}>ƒ</Text></View>
            <View style={styles.formulaCopy}>
              <Text style={styles.eyebrow}>{t("contacts.scoringSignedFormula")}</Text>
              {loadingFormula ? <ActivityIndicator size="small" color={fieldTheme.color.primary} /> : activeFormula
                ? <><Text style={styles.formulaName}>{activeFormula.name}</Text><Text style={styles.formulaMeta}>{activeFormula.version} · {t("contacts.scoringServerCalculated")}</Text></>
                : <Text style={styles.formulaMissing}>{t("contacts.scoringNoActiveFormula")}</Text>}
            </View>
          </View>
          <View style={[styles.fieldGrid, tablet && styles.fieldGridTablet]}>
            {fields.map((field) => (
              <View key={field.key} style={[styles.field, tablet && styles.fieldTablet, field.key === "evidence" && styles.fieldWide]}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  value={String(values[field.key])}
                  onChangeText={(value) => update(field.key, value)}
                  keyboardType={field.numeric ? "decimal-pad" : "default"}
                  multiline={field.key === "evidence"}
                  style={[styles.input, field.key === "evidence" && styles.multiline]}
                  placeholder={field.placeholder ?? "—"}
                  placeholderTextColor="#86978F"
                />
              </View>
            ))}
          </View>
          <View style={styles.kolBlock}>
            <Pressable onPress={() => update("isKol", !values.isKol)} style={[styles.kolToggle, values.isKol && styles.kolToggleSelected]}>
              <Text style={[styles.kolToggleText, values.isKol && styles.kolToggleTextSelected]}>{values.isKol ? "✓ " : ""}{t("contacts.scoringKol")}</Text>
            </Pressable>
            {values.isKol && <View style={styles.kolLevel}><Text style={styles.label}>{t("contacts.scoringKolLevel")}</Text><TextInput value={values.kolLevel} onChangeText={(value) => update("kolLevel", value)} style={styles.input} placeholder={t("contacts.scoringKolPlaceholder")} placeholderTextColor="#86978F" /></View>}
          </View>
          {!!error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { minHeight: 84, paddingHorizontal: fieldTheme.space.lg, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  headerAction: { minWidth: 72, minHeight: 48, justifyContent: "center" },
  cancel: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "700" },
  headerCopy: { flex: 1, alignItems: "center" },
  title: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  subtitle: { color: fieldTheme.color.inkMuted, fontSize: 11, marginTop: 3, textAlign: "center" },
  save: { minWidth: 86, minHeight: 48, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.md },
  saveText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  content: { width: "100%", maxWidth: 940, alignSelf: "center", padding: fieldTheme.space.lg, paddingBottom: 80, gap: fieldTheme.space.lg },
  contentTablet: { paddingHorizontal: fieldTheme.space.xxl, paddingTop: fieldTheme.space.xl },
  formulaPanel: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: "#B7DDCE" },
  formulaIcon: { width: 48, height: 48, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primary },
  formulaIconText: { color: fieldTheme.color.onColor, fontSize: 25, fontWeight: "900" },
  formulaCopy: { flex: 1 },
  eyebrow: { color: fieldTheme.color.primaryStrong, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  formulaName: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900", marginTop: 4 },
  formulaMeta: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 3 },
  formulaMissing: { color: fieldTheme.color.coral, fontSize: 13, fontWeight: "800", marginTop: 4 },
  fieldGrid: { gap: fieldTheme.space.md },
  fieldGridTablet: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  field: { width: "100%" },
  fieldTablet: { width: "48.8%" },
  fieldWide: { width: "100%" },
  label: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800", marginBottom: fieldTheme.space.sm },
  input: { minHeight: 48, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.surface, color: fieldTheme.color.ink, paddingHorizontal: fieldTheme.space.md, fontSize: 15 },
  multiline: { minHeight: 92, paddingTop: fieldTheme.space.md, textAlignVertical: "top" },
  kolBlock: { gap: fieldTheme.space.md },
  kolToggle: { minHeight: 48, borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, justifyContent: "center", paddingHorizontal: fieldTheme.space.lg },
  kolToggleSelected: { borderColor: fieldTheme.color.violet, backgroundColor: fieldTheme.color.violetSoft },
  kolToggleText: { color: fieldTheme.color.inkMuted, fontSize: 14, fontWeight: "800" },
  kolToggleTextSelected: { color: fieldTheme.color.violet },
  kolLevel: { width: "100%" },
  error: { borderRadius: fieldTheme.radius.sm, borderWidth: 1, borderColor: "#EDB9AD", backgroundColor: fieldTheme.color.coralSoft, padding: fieldTheme.space.md },
  errorText: { color: fieldTheme.color.coral, fontSize: 13, fontWeight: "800" },
})
