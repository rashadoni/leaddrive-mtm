import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import { useTranslation } from "react-i18next"

export interface TaskEditFields {
  title: string
  description: string | null
  priority: string
}

interface Props {
  visible: boolean
  initial: TaskEditFields
  saving?: boolean
  onCancel: () => void
  onSave: (fields: TaskEditFields) => void
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const
const PRIORITY_KEY: Record<string, string> = {
  LOW: "task.priorityLow",
  MEDIUM: "task.priorityMedium",
  HIGH: "task.priorityHigh",
  URGENT: "task.priorityUrgent",
}

function priorityColor(p: string): string {
  switch (p) {
    case "HIGH":
    case "URGENT":
      return "#ef4444"
    case "MEDIUM":
      return "#f59e0b"
    default:
      return "#22c55e"
  }
}

export default function EditTaskModal({ visible, initial, saving, onCancel, onSave }: Props) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? "")
  const [priority, setPriority] = useState(initial.priority)

  // Re-seed the form whenever it re-opens for a (possibly different) task.
  useEffect(() => {
    if (visible) {
      setTitle(initial.title)
      setDescription(initial.description ?? "")
      setPriority(initial.priority)
    }
  }, [visible, initial])

  const trimmedTitle = title.trim()
  const canSave = trimmedTitle.length > 0 && !saving

  const handleSave = () => {
    if (!canSave) return
    onSave({ title: trimmedTitle, description: description.trim() ? description.trim() : null, priority })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>{t("task.editTitle")}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
            <Text style={styles.label}>{t("task.labelTitle")}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t("task.labelTitle")}
              placeholderTextColor="#94a3b8"
              maxLength={200}
            />

            <Text style={styles.label}>{t("task.labelDescription")}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder={t("task.labelDescription")}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={5000}
            />

            <Text style={styles.label}>{t("task.fieldPriority")}</Text>
            <View style={styles.chips}>
              {PRIORITIES.map((p) => {
                const active = priority === p
                const c = priorityColor(p)
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, active && { backgroundColor: c + "15", borderColor: c }]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[styles.chipText, active && { color: c }]}>{t(PRIORITY_KEY[p])}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} onPress={handleSave} disabled={!canSave}>
              <Text style={styles.saveText}>{saving ? t("task.saving") : t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(11,11,30,0.5)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: "#fff", borderRadius: 18, padding: 20, maxHeight: "85%" },
  heading: { fontSize: 18, fontWeight: "800", color: "#0B0B1E", marginBottom: 12 },
  body: { flexGrow: 0 },
  label: { fontSize: 12, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#0B0B1E" },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: "700", color: "#64748b" },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f5f9" },
  cancelText: { fontSize: 14, fontWeight: "700", color: "#64748b" },
  saveBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#6C63FF" },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
})
