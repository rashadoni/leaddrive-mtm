import React, { useState, useEffect } from "react"
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
import { useAuthStore } from "../../store/auth"
import { api } from "../../services/api"

interface Props {
  serverDomain: string
  companyName: string
  onSwitchServer: () => void
}

export default function LoginScreen({ serverDomain, companyName, onSwitchServer }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const revokedReason = useAuthStore((s) => s.revokedReason)
  const clearRevokedReason = useAuthStore((s) => s.clearRevokedReason)

  // Load saved credentials
  useEffect(() => {
    api.getSavedCredentials().then((creds) => {
      if (creds) {
        setEmail(creds.email)
        setPassword(creds.password)
        setRememberMe(true)
      }
    })
  }, [])

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t("common.error"), t("auth.validationMissing"))
      return
    }

    // Clear the revoked banner when the user makes a new login attempt
    clearRevokedReason()

    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)

      // Save credentials if "Remember me" is checked
      if (rememberMe) {
        await api.saveCredentials(email.trim().toLowerCase(), password)
      } else {
        await api.clearCredentials()
      }
    } catch (e: any) {
      // Backend errors come back in English; using e.message directly
      // would mix EN error text inside an AZ/RU UI. Always show the
      // localized "invalid credentials" line; backend detail goes to
      // Sentry / console for ops triage.
      console.warn("[LoginScreen] login failed:", e?.message ?? e)
      Alert.alert(t("auth.loginFailedTitle"), t("auth.invalidCredentials"))
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
          <Text style={styles.subtitle}>{companyName}</Text>
        </View>

        {/* Access revoked banner — shown after a mid-session 401 (fired agent, suspended org) */}
        {revokedReason === "REVOKED" && (
          <View style={styles.revokedBanner}>
            <Text style={styles.revokedTitle}>{t("auth.accessRevokedTitle")}</Text>
            <Text style={styles.revokedBody}>{t("auth.accessRevokedBody")}</Text>
          </View>
        )}

        {/* Server badge */}
        <TouchableOpacity style={styles.serverBadge} onPress={onSwitchServer}>
          <Text style={styles.serverText}>{serverDomain}</Text>
          <Text style={styles.serverChange}>{t("common.change")}</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <Text style={styles.label}>{t("auth.email")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="agent@company.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>{t("auth.password")}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.passwordPlaceholder")}
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Remember me */}
          <TouchableOpacity
            style={styles.rememberRow}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.rememberText}>{t("auth.rememberMe")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.signIn")}</Text>
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
    marginBottom: 16,
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
  serverBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f0f0ff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  serverText: {
    fontSize: 12,
    color: "#6C63FF",
    fontWeight: "600",
  },
  serverChange: {
    fontSize: 11,
    color: "#94a3b8",
    textDecorationLine: "underline",
  },
  form: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#F4F5F9",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0B0B1E",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyeButton: {
    padding: 10,
  },
  eyeText: {
    fontSize: 20,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  rememberText: {
    fontSize: 13,
    color: "#64748b",
  },
  button: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
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
  revokedBanner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  revokedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B91C1C",
    marginBottom: 2,
  },
  revokedBody: {
    fontSize: 12,
    color: "#7F1D1D",
    lineHeight: 16,
  },
})
