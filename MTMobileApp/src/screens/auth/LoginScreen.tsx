import React, { useEffect, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../../store/auth"
import { api, REVOKED_REASON } from "../../services/api"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

interface Props {
  serverDomain: string
  companyName: string
  onSwitchServer: () => void
}

export default function LoginScreen({ serverDomain, companyName, onSwitchServer }: Props) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = useAuthStore((state) => state.login)
  const revokedReason = useAuthStore((state) => state.revokedReason)
  const clearRevokedReason = useAuthStore((state) => state.clearRevokedReason)

  useEffect(() => {
    api.getSavedCredentials().then((credentials) => {
      if (!credentials) return
      setEmail(credentials.email)
      // Passwords are never persisted. Only the email convenience field is
      // restored; every new session still requires the user's password.
      setPassword("")
      setRememberMe(true)
    }).catch(() => {})
  }, [])

  const handleLogin = async () => {
    if (loading) return
    if (!email.trim() || !password) {
      setError(t("auth.validationMissing"))
      return
    }

    clearRevokedReason()
    setError(null)
    setLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      await login(normalizedEmail, password)
      if (rememberMe) await api.saveCredentials(normalizedEmail)
      else await api.clearCredentials()
    } catch (e: any) {
      console.warn("[LoginScreen] login failed:", e?.message ?? e)
      setError(t("auth.invalidCredentialsHelp"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.shell, tablet && styles.shellTablet]}>
          <View style={[styles.intro, tablet && styles.introTablet]}>
            <View style={[styles.brandRow, tablet && styles.brandRowTablet]}>
              <View style={[styles.brandMark, tablet && styles.brandMarkTablet]}>
                <Icon name="navigate" size={tablet ? 30 : 22} color={fieldTheme.color.onColor} />
              </View>
              <Text style={styles.brand}>LeadDrive Field</Text>
            </View>
            {tablet ? <Text style={styles.introTitle}>{t("auth.welcomeTitle")}</Text> : null}
            {tablet ? <Text style={styles.introBody}>{t("auth.welcomeBody")}</Text> : null}

            {tablet ? (
            <View style={styles.steps}>
              <View style={styles.step}>
                <View style={[styles.stepNumber, styles.stepNumberDone]}>
                  <Icon name="checkmark" size={18} color={fieldTheme.color.primaryStrong} />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitleMuted}>{t("server.stepCompany")}</Text>
                  <Text style={styles.stepBody} numberOfLines={2}>{companyName || serverDomain}</Text>
                </View>
              </View>
              <View style={[styles.step, styles.stepActive]}>
                <View style={[styles.stepNumber, styles.stepNumberActive]}>
                  <Text style={styles.stepNumberTextActive}>2</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{t("server.stepAccount")}</Text>
                  <Text style={styles.stepBody}>{t("server.stepAccountBody")}</Text>
                </View>
              </View>
            </View>
            ) : null}
          </View>

          <View style={[styles.formPanel, tablet && styles.formPanelTablet]}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>{t("auth.stepProgress")}</Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressValue} />
              </View>
            </View>

            <View style={styles.companyCard}>
              <View style={styles.companyIcon}>
                <Icon name="business" size={21} color={fieldTheme.color.primary} />
              </View>
              <View style={styles.companyCopy}>
                <Text style={styles.companyCaption}>{t("auth.selectedCompany")}</Text>
                <Text style={styles.companyName} numberOfLines={1}>{companyName || serverDomain}</Text>
                <Text style={styles.companyDomain} numberOfLines={1}>{serverDomain}</Text>
              </View>
              <Pressable
                testID="switch-tenant"
                accessibilityRole="button"
                accessibilityLabel={t("auth.changeCompany")}
                onPress={onSwitchServer}
                style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}
              >
                <Icon name="swap-horizontal" size={18} color={fieldTheme.color.primary} />
                <Text style={styles.changeText}>{t("common.change")}</Text>
              </Pressable>
            </View>

            <Text style={styles.formTitle}>{t("auth.accountTitle")}</Text>
            <Text style={styles.formBody}>{t("auth.accountHelp")}</Text>

            {revokedReason === REVOKED_REASON && (
              <View style={styles.revokedBanner} accessibilityLiveRegion="polite">
                <Icon name="lock-closed" size={21} color={fieldTheme.color.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("auth.accessRevokedTitle")}</Text>
                  <Text style={styles.errorText}>{t("auth.accessRevokedBody")}</Text>
                </View>
              </View>
            )}

            <Text style={styles.label}>{t("auth.email")}</Text>
            <View style={[styles.inputWrap, error && !email.trim() && styles.inputWrapError]}>
              <Icon name="mail-outline" size={21} color={fieldTheme.color.inkMuted} />
              <TextInput
                testID="login-email"
                style={styles.input}
                value={email}
                onChangeText={(value) => {
                  setEmail(value)
                  if (error) setError(null)
                }}
                placeholder="agent@company.com"
                placeholderTextColor="#81928B"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                autoComplete="email"
                autoFocus
                returnKeyType="next"
                editable={!loading}
                accessibilityLabel={t("auth.email")}
              />
            </View>

            <Text style={styles.label}>{t("auth.password")}</Text>
            <View style={[styles.inputWrap, error && !password && styles.inputWrapError]}>
              <Icon name="key-outline" size={21} color={fieldTheme.color.inkMuted} />
              <TextInput
                testID="login-password"
                style={styles.input}
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  if (error) setError(null)
                }}
                placeholder={t("auth.passwordPlaceholder")}
                placeholderTextColor="#81928B"
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                returnKeyType="go"
                editable={!loading}
                onSubmitEditing={() => { handleLogin().catch(() => {}) }}
                accessibilityLabel={t("auth.password")}
              />
              <Pressable
                testID="toggle-password"
                accessibilityRole="button"
                accessibilityLabel={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                accessibilityState={{ expanded: showPassword }}
                onPress={() => setShowPassword((current) => !current)}
                style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
              >
                <Icon
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={23}
                  color={fieldTheme.color.inkMuted}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              accessibilityLabel={t("auth.rememberMe")}
              onPress={() => setRememberMe((current) => !current)}
              style={({ pressed }) => [styles.rememberRow, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Icon name="checkmark" size={17} color={fieldTheme.color.onColor} />}
              </View>
              <View style={styles.rememberCopy}>
                <Text style={styles.rememberText}>{t("auth.rememberMe")}</Text>
                <Text style={styles.rememberHint}>{t("auth.rememberHint")}</Text>
              </View>
            </Pressable>

            {error && (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={21} color={fieldTheme.color.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("auth.loginFailedTitle")}</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </View>
            )}

            <Pressable
              testID="login-submit"
              accessibilityRole="button"
              accessibilityLabel={t("auth.signIn")}
              accessibilityState={{ disabled: loading }}
              onPress={() => { handleLogin().catch(() => {}) }}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                loading && styles.disabled,
                pressed && !loading && styles.primaryPressed,
              ]}
            >
              {loading ? (
                <>
                  <ActivityIndicator color={fieldTheme.color.onColor} />
                  <Text style={styles.primaryText}>{t("auth.signingIn")}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.primaryText}>{t("auth.signIn")}</Text>
                  <Icon name="arrow-forward" size={21} color={fieldTheme.color.onColor} />
                </>
              )}
            </Pressable>

            <Text style={styles.helpText}>{t("auth.loginHelp")}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: fieldTheme.space.lg,
    paddingVertical: fieldTheme.space.xl,
  },
  shell: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    overflow: "hidden",
  },
  shellTablet: { flexDirection: "row", minHeight: 670 },
  intro: { padding: fieldTheme.space.lg, backgroundColor: fieldTheme.color.primaryStrong },
  introTablet: { width: "39%", padding: fieldTheme.space.xxl, justifyContent: "center" },
  brandMarkTablet: { width: 58, height: 58, borderRadius: 18, marginBottom: fieldTheme.space.md },
  brandRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md },
  brandRowTablet: { flexDirection: "column", alignItems: "flex-start", gap: 0 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primary,
  },
  brand: { color: fieldTheme.color.onColor, fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
  introTitle: { color: fieldTheme.color.onColor, fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: fieldTheme.space.xl },
  introBody: { color: "#D8E9E2", fontSize: 16, lineHeight: 23, marginTop: fieldTheme.space.sm },
  steps: { gap: fieldTheme.space.md, marginTop: fieldTheme.space.xl },
  step: { flexDirection: "row", alignItems: "flex-start", opacity: 0.8 },
  stepActive: { opacity: 1 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#7E9F94",
  },
  stepNumberDone: { backgroundColor: fieldTheme.color.onColor, borderColor: fieldTheme.color.onColor },
  stepNumberActive: { backgroundColor: fieldTheme.color.coral, borderColor: fieldTheme.color.coral },
  stepNumberTextActive: { color: fieldTheme.color.onColor, fontWeight: "900" },
  stepCopy: { flex: 1, marginLeft: fieldTheme.space.md },
  stepTitle: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "800" },
  stepTitleMuted: { color: "#D8E9E2", fontSize: 15, fontWeight: "700" },
  stepBody: { color: "#BAD0C7", fontSize: 13, lineHeight: 18, marginTop: 2 },
  formPanel: { padding: fieldTheme.space.xl },
  formPanelTablet: { flex: 1, padding: 40, justifyContent: "center" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginBottom: fieldTheme.space.lg },
  progressText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "800" },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden" },
  progressValue: { width: "100%", height: "100%", backgroundColor: fieldTheme.color.primary, borderRadius: 3 },
  companyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    backgroundColor: fieldTheme.color.primarySoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    marginBottom: fieldTheme.space.xl,
  },
  companyIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surface },
  companyCopy: { flex: 1 },
  companyCaption: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  companyName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900", marginTop: 1 },
  companyDomain: { color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: 1 },
  changeButton: {
    minHeight: LAYOUT_TOUCH_TARGETS.compact,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: fieldTheme.space.sm,
    borderRadius: fieldTheme.radius.sm,
  },
  changeText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  formTitle: { color: fieldTheme.color.ink, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  formBody: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, marginTop: fieldTheme.space.sm, marginBottom: fieldTheme.space.lg },
  label: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800", marginTop: fieldTheme.space.md, marginBottom: fieldTheme.space.sm },
  inputWrap: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.border,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: fieldTheme.space.lg,
  },
  inputWrapError: { borderColor: fieldTheme.color.danger },
  input: { flex: 1, minHeight: 54, paddingHorizontal: fieldTheme.space.md, color: fieldTheme.color.ink, fontSize: 16 },
  eyeButton: { minWidth: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  rememberRow: { minHeight: 54, flexDirection: "row", alignItems: "center", marginTop: fieldTheme.space.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: fieldTheme.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  rememberCopy: { flex: 1, marginLeft: fieldTheme.space.md },
  rememberText: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  rememberHint: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  revokedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
    backgroundColor: fieldTheme.color.dangerSoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    marginBottom: fieldTheme.space.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
    backgroundColor: fieldTheme.color.dangerSoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    marginTop: fieldTheme.space.md,
  },
  errorCopy: { flex: 1 },
  errorTitle: { color: fieldTheme.color.danger, fontSize: 14, fontWeight: "900" },
  errorText: { color: "#762A2A", fontSize: 13, lineHeight: 18, marginTop: 2 },
  primaryButton: {
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.coral,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.lg,
    paddingHorizontal: fieldTheme.space.lg,
  },
  primaryPressed: { backgroundColor: "#842F1E", transform: [{ scale: 0.99 }] },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  helpText: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: fieldTheme.space.md },
  pressed: { opacity: 0.72 },
})
