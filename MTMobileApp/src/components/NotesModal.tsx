import React, { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native"

interface Props {
  visible: boolean
  title: string
  message: string
  onCancel: () => void
  onSubmit: (text: string) => void
}

export default function NotesModal({ visible, title, message, onCancel, onSubmit }: Props) {
  const [text, setText] = useState("")

  const handleSubmit = () => {
    onSubmit(text.trim())
    setText("")
  }

  const handleCancel = () => {
    setText("")
    onCancel()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Enter notes..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={3}
            autoFocus
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0B0B1E",
    marginBottom: 6,
  },
  message: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 14,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    fontSize: 14,
    color: "#0B0B1E",
    minHeight: 80,
    textAlignVertical: "top",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  cancelText: { color: "#64748b", fontSize: 14, fontWeight: "600" },
  submitBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#6C63FF",
  },
  submitText: { color: "#fff", fontSize: 14, fontWeight: "700" },
})
