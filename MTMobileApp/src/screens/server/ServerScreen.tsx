import React, { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native"
import { useTranslation } from "react-i18next"
import { api } from "../../services/api"

interface Props {
  onServerSelected: (domain: string, companyName: string) => void
}

export default function ServerScreen({ onServerSelected }: Props) {
  const { t } = useTranslation()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    const value = input.trim().toLowerCase()
    if (!value) {
      Alert.alert(t("common.error"), t("server.validationMissing"))
      return
    }

    setLoading(true)
    try {
      const result = await api.pingServer(value)
      if (result.success) {
        await api.setServer(result.domain)
        onServerSelected(result.domain, result.name || value)
      } else {
        // Backend error string is EN; show localized "server not found"
        // and log the raw error for ops.
        console.warn("[ServerScreen] ping failed:", result.error)
        Alert.alert(t("server.connectionFailedTitle"), t("server.serverNotFound"))
      }
    } catch (e: any) {
      console.warn("[ServerScreen] connect error:", e?.message ?? e)
      Alert.alert(t("common.error"), t("server.couldNotConnect"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.card}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>R&F</Text>
          </View>
          <Text style={styles.title}>Route & Field</Text>
          <Text style={styles.subtitle}>{t("server.subtitle")}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{t("server.companyLabel")}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={t("server.companyPlaceholder")}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleConnect}
            />
          </View>
          <Text style={styles.hint}>
            {input.trim().includes(".") || input.trim().includes(":")
              ? t("server.willConnectTemplate", { domain: input.trim().toLowerCase() })
              : input.trim()
              ? t("server.willConnectTemplate", { domain: `${input.trim().toLowerCase()}.leaddrivecrm.org` })
              : t("server.enterCompanyHint")}
          </Text>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("server.connectButton")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Powered by LeadDrive CRM</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F5F9",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#6C63FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logoText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0B0B1E",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#F4F5F9",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0B0B1E",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hint: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 6,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 24,
  },
})
