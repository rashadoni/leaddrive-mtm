import React from "react"
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from "react-native"
import { useTranslation } from "react-i18next"
import { upperInitial } from "../lib/upper"

export interface PickableAgent {
  id: string
  name: string
  role?: string
}

interface Props {
  visible: boolean
  title: string
  agents: PickableAgent[]
  loading?: boolean
  busy?: boolean
  onCancel: () => void
  onPick: (agentId: string) => void
}

export default function AgentPickerModal({ visible, title, agents, loading, busy, onCancel, onPick }: Props) {
  const { t } = useTranslation()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>{title}</Text>
          {loading ? (
            <View style={styles.center}><ActivityIndicator color="#6C63FF" /></View>
          ) : agents.length === 0 ? (
            <Text style={styles.empty}>{t("bulk.noAgents")}</Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {agents.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.row, busy && styles.rowBusy]}
                  disabled={busy}
                  onPress={() => onPick(a.id)}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{upperInitial(a.name)}</Text></View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{a.name}</Text>
                    {a.role ? <Text style={styles.rowRole}>{a.role}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(11,11,30,0.5)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: "#fff", borderRadius: 18, padding: 20, maxHeight: "80%" },
  heading: { fontSize: 18, fontWeight: "800", color: "#0B0B1E", marginBottom: 12 },
  center: { padding: 24, alignItems: "center" },
  empty: { fontSize: 14, color: "#94a3b8", paddingVertical: 20, textAlign: "center" },
  list: { flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBusy: { opacity: 0.5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#6C63FF", fontSize: 16, fontWeight: "800" },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "700", color: "#0B0B1E" },
  rowRole: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  cancelBtn: { alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f5f9", marginTop: 12 },
  cancelText: { fontSize: 14, fontWeight: "700", color: "#64748b" },
})
