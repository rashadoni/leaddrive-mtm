import React, { useState } from "react"
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from "react-native"
import { useTranslation } from "react-i18next"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"
import { useEquipmentStore, RepairPriority } from "../../store/equipment"
import { RootStackParamList } from "../../navigation/AppNavigator"

const PRIORITIES: Array<{ key: RepairPriority; label: string; color: string }> = [
  { key: "LOW", label: "Low", color: "#22c55e" },
  { key: "NORMAL", label: "Normal", color: "#6C63FF" },
  { key: "HIGH", label: "High", color: "#f97316" },
  { key: "URGENT", label: "Urgent", color: "#ef4444" },
]

type NavProp = NativeStackNavigationProp<RootStackParamList, "RepairRequest">

export default function RepairRequestScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NavProp>()
  const route = useRoute<RouteProp<RootStackParamList, "RepairRequest">>()
  const { equipmentId, serialNumber, visitId } = route.params

  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<RepairPriority>("NORMAL")
  const [submitting, setSubmitting] = useState(false)

  const { submitRepairRequest } = useEquipmentStore()

  const handleSubmit = async () => {
    if (!description.trim()) return
    setSubmitting(true)
    await submitRepairRequest({ equipmentId, description: description.trim(), priority, visitId })
    setSubmitting(false)
    const store = useEquipmentStore.getState()
    if (!store.error) {
      Alert.alert("", t("equipment.repair.successToast"), [
        { text: "OK", onPress: () => navigation.popToTop() },
      ])
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("equipment.repair.title")}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("equipment.serialNumber")}</Text>
          <Text style={styles.infoValue}>{serialNumber}</Text>
        </View>

        <Text style={styles.sectionLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((p) => {
            const selected = priority === p.key
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.priorityBtn, selected && { borderColor: p.color, backgroundColor: p.color + "18" }]}
                onPress={() => setPriority(p.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.priorityBtnText, selected && { color: p.color, fontWeight: "700" }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.sectionLabel}>Description</Text>
        <TextInput
          style={styles.descInput}
          placeholder={t("equipment.repair.descPlaceholder")}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholderTextColor="#94a3b8"
          autoFocus
        />

        {useEquipmentStore((s) => s.error) ? (
          <Text style={styles.errorText}>{useEquipmentStore.getState().error}</Text>
        ) : null}

        <TouchableOpacity
          style={[styles.submitBtn, (!description.trim() || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!description.trim() || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>{t("equipment.repair.submit")}</Text>
          )}
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
  infoCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 4 },
  infoLabel: { fontSize: 11, color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 15, color: "#1e293b", fontWeight: "600" },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  priorityRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  priorityBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#e2e8f0", backgroundColor: "#fff" },
  priorityBtnText: { fontSize: 13, color: "#64748b" },
  descInput: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 12, fontSize: 14, color: "#1e293b", minHeight: 100, textAlignVertical: "top" },
  submitBtn: { backgroundColor: "#ef4444", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  submitBtnDisabled: { backgroundColor: "#fca5a5" },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  errorText: { color: "#ef4444", textAlign: "center", fontSize: 13 },
})
