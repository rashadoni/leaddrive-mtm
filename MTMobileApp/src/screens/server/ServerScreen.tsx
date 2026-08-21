import React, { useMemo, useState } from "react"
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
import { api } from "../../services/api"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

interface Props {
  onServerSelected: (domain: string, companyName: string) => void
}

export default function ServerScreen({ onServerSelected }: Props) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedInput = input.trim().toLowerCase()
  const destination = useMemo(() => {
    if (!normalizedInput) return null
    return normalizedInput.includes(".") || normalizedInput.includes(":")
      ? normalizedInput
      : `${normalizedInput}.leaddrivecrm.org`
  }, [normalizedInput])

  const handleConnect = async () => {
    if (!normalizedInput || loading) {
      if (!normalizedInput) setError(t("server.validationMissing"))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.pingServer(normalizedInput)
      if (!result.success) {
        console.warn("[ServerScreen] ping failed:", result.error)
        setError(t("server.serverNotFoundHelp"))
        return
      }

      await api.setServer(result.domain)
      onServerSelected(result.domain, result.name || normalizedInput)
    } catch (e: any) {
      console.warn("[ServerScreen] connect error:", e?.message ?? e)
      setError(t("server.couldNotConnectHelp"))
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
            <View style={styles.brandMark}>
              <Icon name="navigate" size={30} color={fieldTheme.color.onColor} />
            </View>
            <Text style={styles.brand}>LeadDrive Field</Text>
            <Text style={styles.introTitle}>{t("server.welcomeTitle")}</Text>
            <Text style={styles.introBody}>{t("server.welcomeBody")}</Text>

            <View style={styles.steps} accessibilityLabel={t("server.stepsAccessibility")}>
              <View style={[styles.step, styles.stepActive]}>
                <View style={[styles.stepNumber, styles.stepNumberActive]}>
                  <Text style={styles.stepNumberTextActive}>1</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{t("server.stepCompany")}</Text>
                  <Text style={styles.stepBody}>{t("server.stepCompanyBody")}</Text>
                </View>
              </View>
              <View style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitleMuted}>{t("server.stepAccount")}</Text>
                  <Text style={styles.stepBody}>{t("server.stepAccountBody")}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.formPanel, tablet && styles.formPanelTablet]}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>{t("server.stepProgress")}</Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressValue} />
              </View>
            </View>

            <Text style={styles.formTitle}>{t("server.companyTitle")}</Text>
            <Text style={styles.formBody}>{t("server.companyHelp")}</Text>

            <Text style={styles.label}>{t("server.companyLabel")}</Text>
            <View style={[styles.inputWrap, error && styles.inputWrapError]}>
              <Icon name="business-outline" size={21} color={fieldTheme.color.inkMuted} />
              <TextInput
                testID="tenant-input"
                style={styles.input}
                value={input}
                onChangeText={(value) => {
                  setInput(value)
                  if (error) setError(null)
                }}
                placeholder={t("server.companyPlaceholder")}
                placeholderTextColor="#81928B"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                editable={!loading}
                onSubmitEditing={() => { handleConnect().catch(() => {}) }}
                accessibilityLabel={t("server.companyLabel")}
              />
              {input.length > 0 && !loading && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.clear")}
                  hitSlop={8}
                  onPress={() => {
                    setInput("")
                    setError(null)
                  }}
                  style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
                >
                  <Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} />
                </Pressable>
              )}
            </View>

            {destination ? (
              <View style={styles.destination}>
                <Icon name="checkmark-circle" size={18} color={fieldTheme.color.success} />
                <Text style={styles.destinationText} numberOfLines={2}>
                  {t("server.willConnectTemplate", { domain: destination })}
                </Text>
              </View>
            ) : (
              <Text style={styles.hint}>{t("server.enterCompanyHint")}</Text>
            )}

            {error && (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={21} color={fieldTheme.color.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("server.connectionFailedTitle")}</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </View>
            )}

            <Pressable
              testID="tenant-continue"
              accessibilityRole="button"
              accessibilityLabel={t("server.connectButton")}
              accessibilityState={{ disabled: loading }}
              style={({ pressed }) => [
                styles.primaryButton,
                loading && styles.disabled,
                pressed && !loading && styles.primaryPressed,
              ]}
              onPress={() => { handleConnect().catch(() => {}) }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <ActivityIndicator color={fieldTheme.color.onColor} />
                  <Text style={styles.primaryText}>{t("server.connecting")}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.primaryText}>{t("server.connectButton")}</Text>
                  <Icon name="arrow-forward" size={21} color={fieldTheme.color.onColor} />
                </>
              )}
            </Pressable>

            <View style={styles.safetyHint}>
              <Icon name="shield-checkmark-outline" size={20} color={fieldTheme.color.primary} />
              <Text style={styles.safetyText}>{t("server.safetyHint")}</Text>
            </View>
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
  shellTablet: { flexDirection: "row", minHeight: 620 },
  intro: { padding: fieldTheme.space.xl, backgroundColor: fieldTheme.color.primaryStrong },
  introTablet: { width: "43%", padding: fieldTheme.space.xxl, justifyContent: "center" },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primary,
    marginBottom: fieldTheme.space.md,
  },
  brand: { color: fieldTheme.color.onColor, fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
  introTitle: { color: fieldTheme.color.onColor, fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: fieldTheme.space.xl },
  introBody: { color: "#D8E9E2", fontSize: 16, lineHeight: 23, marginTop: fieldTheme.space.sm },
  steps: { gap: fieldTheme.space.md, marginTop: fieldTheme.space.xl },
  step: { flexDirection: "row", alignItems: "flex-start", opacity: 0.76 },
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
  stepNumberActive: { backgroundColor: fieldTheme.color.onColor, borderColor: fieldTheme.color.onColor },
  stepNumberText: { color: fieldTheme.color.onColor, fontWeight: "800" },
  stepNumberTextActive: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  stepCopy: { flex: 1, marginLeft: fieldTheme.space.md },
  stepTitle: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "800" },
  stepTitleMuted: { color: "#D8E9E2", fontSize: 15, fontWeight: "700" },
  stepBody: { color: "#BAD0C7", fontSize: 13, lineHeight: 18, marginTop: 2 },
  formPanel: { padding: fieldTheme.space.xl },
  formPanelTablet: { flex: 1, padding: 44, justifyContent: "center" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginBottom: fieldTheme.space.xl },
  progressText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "800" },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: fieldTheme.color.surfaceStrong, overflow: "hidden" },
  progressValue: { width: "50%", height: "100%", backgroundColor: fieldTheme.color.primary, borderRadius: 3 },
  formTitle: { color: fieldTheme.color.ink, fontSize: 27, lineHeight: 33, fontWeight: "900" },
  formBody: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, marginTop: fieldTheme.space.sm, marginBottom: fieldTheme.space.xl },
  label: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800", marginBottom: fieldTheme.space.sm },
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
  clearButton: { minWidth: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  hint: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.sm },
  destination: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  destinationText: { flex: 1, color: fieldTheme.color.success, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
    backgroundColor: fieldTheme.color.dangerSoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    marginTop: fieldTheme.space.lg,
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
    marginTop: fieldTheme.space.xl,
    paddingHorizontal: fieldTheme.space.lg,
  },
  primaryPressed: { backgroundColor: "#842F1E", transform: [{ scale: 0.99 }] },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  safetyHint: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.lg },
  safetyText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72 },
})
