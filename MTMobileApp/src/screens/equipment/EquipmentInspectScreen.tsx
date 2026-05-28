import React, { useState } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, ActivityIndicator,
} from "react-native"
import { useTranslation } from "react-i18next"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"
import { useEquipmentStore, EquipmentCondition } from "../../store/equipment"
import { RootStackParamList } from "../../navigation/AppNavigator"

const CONDITIONS: EquipmentCondition[] = ["GOOD", "DAMAGED", "NEEDS_REPAIR", "MISSING"]

const CONDITION_COLOR: Record<EquipmentCondition, string> = {
  GOOD: "#22c55e", DAMAGED: "#f97316", NEEDS_REPAIR: "#ef4444", MISSING: "#94a3b8",
}

type NavProp = NativeStackNavigationProp<RootStackParamList, "EquipmentInspect">

export default function EquipmentInspectScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NavProp>()
  const route = useRoute<RouteProp<RootStackParamList, "EquipmentInspect">>()
  const { equipmentId, serialNumber, model, condition: initialCondition, visitId } = route.params

  const [condition, setCondition] = useState<EquipmentCondition>(initialCondition)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { submitInspection, lastInspectionId, error } = useEquipmentStore()

  const handleSubmit = async () => {
    setSubmitting(true)
    await submitInspection({
      equipmentId,
      conditionBefore: initialCondition,
      conditionAfter: condition,
      notes: notes.trim() || undefined,
      visitId,
    })
    setSubmitting(false)
    const store = useEquipmentStore.getState()
    if (!store.error) {
      navigation.goBack()
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("equipment.inspect.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("equipment.serialNumber")}</Text>
          <Text style={styles.infoValue}>{serialNumber}</Text>
          {model ? (
            <>
              <Text style={styles.infoLabel}>{t("equipment.model")}</Text>
              <Text style={styles.infoValue}>{model}</Text>
            </>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>{t("equipment.inspect.conditionLabel")}</Text>
        <View style={styles.conditionGrid}>
          {CONDITIONS.map((c) => {
            const selected = condition === c
            const color = CONDITION_COLOR[c]
            return (
              <TouchableOpacity
                key={c}
                style={[styles.conditionBtn, selected && { borderColor: color, backgroundColor: color + "18" }]}
                onPress={() => setCondition(c)}
                activeOpacity={0.8}
              >
                <View style={[styles.conditionIndicator, { backgroundColor: selected ? color : "#e2e8f0" }]} />
                <Text style={[styles.conditionBtnText, selected && { color, fontWeight: "700" }]}>
                  {t(`equipment.condition.${c}` as any)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder={t("equipment.inspect.notesPlaceholder")}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholderTextColor="#94a3b8"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t("equipment.inspect.submit")}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.repairBtn}
          onPress={() =>
            navigation.navigate("RepairRequest", {
              equipmentId,
              serialNumber,
              visitId,
            })
          }
          activeOpacity={0.85}
        >
          <Icon name="construct-outline" size={18} color="#ef4444" />
          <Text style={styles.repairBtnText}>{t("equipment.repair.title")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  body: { padding: 16, gap: 12 },
  infoCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  infoLabel: { fontSize: 11, color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 15, color: "#1e293b", fontWeight: "600", marginBottom: 6 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#64748b", marginTop: 4 },
  conditionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  conditionBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#fff", gap: 8 },
  conditionIndicator: { width: 10, height: 10, borderRadius: 5 },
  conditionBtnText: { fontSize: 13, color: "#64748b" },
  notesInput: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 12, fontSize: 14, color: "#1e293b", minHeight: 80, textAlignVertical: "top" },
  submitBtn: { backgroundColor: "#6C63FF", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { backgroundColor: "#a5b4fc" },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  repairBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#fecaca", backgroundColor: "#fff4f4" },
  repairBtnText: { color: "#ef4444", fontWeight: "600", fontSize: 14 },
  errorText: { color: "#ef4444", textAlign: "center", fontSize: 13 },
})
