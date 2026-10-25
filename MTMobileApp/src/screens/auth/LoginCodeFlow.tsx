import { TimeText as Text } from "../../attendance/ui/TimeText"
import React, { useEffect, useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { useAuthStore } from "../../store/auth"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

/**
 * Signing in with a code from WhatsApp (owner, 2026-10-15: «чтоб через
 * WhatsApp приходил OTP-пароль, чтоб сами назначали, а кадровик не занимался
 * этой рутиной»). Three steps: the number the company has for you → the six
 * digits LeadDrive sends to that WhatsApp → your own password, after which the
 * phone is signed in exactly as the password form signs it in. The same way
 * serves «I forgot my password».
 *
 * Two doors to it (owner, 2026-10-17, on the old screen where the WhatsApp
 * button sat below the fold: «регистрация или вход… если забыл пароль, то
 * через OTP вход и дальше новый пароль с повтором»): the «Первый вход» tab,
 * where the number is all that is asked, and «Забыли пароль?» under the
 * password field. Called «first sign-in», not «registration»: the company
 * creates the employee; a number it does not know gets no code.
 */

export type LoginCodePurpose = "first" | "reset"

type Step = "phone" | "code" | "password"

/** White text on WhatsApp's own green fails contrast; this darker one passes. */
const WHATSAPP_BUTTON = "#157A3C"
const CODE_LENGTH = 6

/** The server's refusal codes, said in words. Anything else is «no connection». */
const ERROR_TEXT: Record<string, string> = {
  MTM_LOGIN_CODE_UNAVAILABLE: "auth.codeUnavailable",
  MTM_LOGIN_CODE_TOO_MANY: "auth.codeTooMany",
  MTM_LOGIN_CODE_BUSY: "auth.codeTooMany",
  MTM_LOGIN_CODE_NO_COMPANY: "auth.codeNoCompany",
  MTM_COMPANY_NOT_FOUND: "auth.codeNoCompany",
  MTM_LOGIN_CODE_SEND_FAILED: "auth.codeSendFailed",
  MTM_LOGIN_CODE_INVALID: "auth.codeInvalid",
  MTM_LOGIN_CODE_EXPIRED: "auth.codeExpired",
  MTM_LOGIN_CODE_LOCKED: "auth.codeLocked",
  MTM_PASSWORD_WEAK: "auth.passwordWeak",
  TENANT_CAPABILITY_DISABLED: "auth.codeAppDisabled",
}

function errorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code]
  // 401 on the password step: the quarter of an hour is over, or the code
  // was already spent on another phone.
  if ((error as Error | null)?.message === "SESSION_EXPIRED") return "auth.setupExpired"
  return "auth.codeNetwork"
}

/** «+994 50 ••• 45 67»: enough to recognise one's number on screen. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  if (digits.length < 10) return value.trim()
  const subscriber = digits.length - 9
  return `+${digits.slice(0, subscriber)} ${digits.slice(subscriber, subscriber + 2)} ••• ${digits.slice(-4, -2)} ${digits.slice(-2)}`
}

/** «1:00», «0:45». */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * The server's password policy (12 characters, an upper- and a lower-case
 * letter, a digit and a symbol, no spaces), shown as rules that tick as they
 * are met. Case is read by changing case, not by Unicode classes, so it holds
 * for Azerbaijani and Cyrillic letters on any JavaScript engine. The server
 * stays the judge.
 */
export function passwordRules(password: string, repeat: string) {
  const chars = Array.from(password)
  const length = chars.length >= 12 && !/\s/.test(password)
  const cases = password !== password.toLowerCase() && password !== password.toUpperCase()
  const digit = /[0-9]/.test(password)
  const symbol = chars.some((char) => !/[0-9\s]/.test(char) && char.toLowerCase() === char.toUpperCase())
  const match = password.length > 0 && password === repeat
  return { length, cases, digitSymbol: digit && symbol, match, ok: length && cases && digit && symbol && match }
}

export default function LoginCodeFlow({ initialPhone, onCancel, purpose = "reset" }: {
  initialPhone: string
  onCancel: () => void
  /** «first»: inside the «Первый вход» tab, whose tabs are the way back. */
  purpose?: LoginCodePurpose
}) {
  const { t, i18n } = useTranslation()
  const loginWithCode = useAuthStore((state) => state.loginWithCode)
  const [step, setStep] = useState<Step>("phone")
  const [phone, setPhone] = useState(initialPhone.trim() || "+994 ")
  const [code, setCode] = useState("")
  const [challengeId, setChallengeId] = useState<string | undefined>()
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [setup, setSetup] = useState<{ token: string; name: string; organizationName: string } | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const language = ["az", "ru", "en"].includes((i18n?.language ?? "az").split("-")[0]) ? (i18n.language ?? "az").split("-")[0] : "az"

  // The «send again» countdown ticks only while the code step is open.
  useEffect(() => {
    if (step !== "code") return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000))
  const rules = passwordRules(password, repeat)

  async function sendCode() {
    if (busy) return
    if (phone.replace(/\D/g, "").length < 9) { setError("auth.codePhoneMissing"); return }
    setBusy(true); setError(null)
    try {
      const answer = await api.requestLoginCode(phone.trim(), language)
      setChallengeId(answer.challengeId)
      setResendAt(Date.now() + answer.resendAfterSeconds * 1000)
      setNow(Date.now())
      setCode("")
      setStep("code")
    } catch (e) {
      setError(errorKey(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode() {
    if (busy) return
    if (code.length !== CODE_LENGTH) { setError("auth.codeInvalid"); return }
    setBusy(true); setError(null)
    try {
      const proof = await api.verifyLoginCode(phone.trim(), code, challengeId)
      setSetup({ token: proof.setupToken, name: proof.name, organizationName: proof.organizationName })
      setStep("password")
    } catch (e) {
      setError(errorKey(e))
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    if (busy || !setup) return
    if (!rules.ok) { setError("auth.passwordWeak"); return }
    setBusy(true); setError(null)
    try {
      await loginWithCode(setup.token, password)
    } catch (e) {
      const key = errorKey(e)
      if (key === "auth.setupExpired") { setSetup(null); setPassword(""); setRepeat(""); setChallengeId(undefined); setStep("phone") }
      setError(key)
    } finally {
      setBusy(false)
    }
  }

  const errorBox = error ? (
    <View style={styles.errorBox} accessibilityLiveRegion="polite" testID="login-code-error">
      <Icon name="alert-circle" size={21} color={fieldTheme.color.danger} />
      <Text style={styles.errorText}>{t(error)}</Text>
    </View>
  ) : null

  const primary = (testID: string, label: string, busyLabel: string, onPress: () => void) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && !busy && styles.primaryPressed]}
    >
      {busy ? <ActivityIndicator color={fieldTheme.color.onColor} /> : null}
      <Text style={styles.primaryText}>{busy ? busyLabel : label}</Text>
    </Pressable>
  )

  // Back to where the person came from. On the first tab the tabs above lead
  // out, so «Назад» returns to the number, and on the number step there is none.
  const goBack = purpose === "first" ? () => { setStep("phone"); setChallengeId(undefined); setSetup(null); setPassword(""); setRepeat(""); setError(null) } : onCancel
  const back = purpose === "first" && step === "phone" ? null : (
    <Pressable testID="login-code-cancel" accessibilityRole="button" onPress={goBack} disabled={busy} style={[styles.link, styles.back]}>
      <Icon name="arrow-back" size={17} color={fieldTheme.color.primary} />
      <Text style={styles.linkText}>{t(purpose === "first" ? "auth.codeBack" : "auth.codeBackToPassword")}</Text>
    </Pressable>
  )

  return (
    <View testID={`login-code-step-${step}`}>
      {back}
      {step === "phone" && (
        <>
          {purpose === "reset" ? <Text style={styles.title}>{t("auth.resetTitle")}</Text> : null}
          <Text style={[styles.body, purpose === "first" && styles.bodyFirst]}>{t(purpose === "first" ? "auth.firstBody" : "auth.resetBody")}</Text>
          <Text style={styles.label}>{t("auth.codePhoneLabel")}</Text>
          <View style={styles.inputWrap}>
            <Icon name="call-outline" size={21} color={fieldTheme.color.inkMuted} />
            <TextInput
              testID="login-code-phone"
              style={styles.input}
              value={phone}
              onChangeText={(value) => { setPhone(value); setChallengeId(undefined); if (error) setError(null) }}
              placeholder="+994 50 123 45 67"
              placeholderTextColor="#81928B"
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
              editable={!busy}
              returnKeyType="send"
              onSubmitEditing={() => { sendCode().catch(() => {}) }}
              accessibilityLabel={t("auth.codePhoneLabel")}
            />
          </View>
          {errorBox}
          <Pressable
            testID="login-code-send"
            accessibilityRole="button"
            accessibilityLabel={t("auth.codeStart")}
            accessibilityState={{ disabled: busy }}
            onPress={() => { sendCode().catch(() => {}) }}
            disabled={busy}
            style={({ pressed }) => [styles.whatsappButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.whatsappMark}><Icon name="logo-whatsapp" size={18} color={WHATSAPP_BUTTON} /></View>}
            <Text style={styles.primaryText}>{busy ? t("auth.codeSending") : t("auth.codeStart")}</Text>
          </Pressable>
          <Text style={[styles.muted, styles.centered]}>{t("auth.firstHint")}</Text>
        </>
      )}

      {step === "code" && (
        <>
          <Text style={styles.title}>{t("auth.codeEnterTitle")}</Text>
          <Text style={styles.body}>{t("auth.codeEnterBody", { phone: maskPhone(phone) })}</Text>
          <TextInput
            testID="login-code-input"
            style={styles.codeInput}
            value={code}
            onChangeText={(value) => { setCode(value.replace(/\D/g, "").slice(0, CODE_LENGTH)); if (error) setError(null) }}
            placeholder="••••••"
            placeholderTextColor="#B5C2BC"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={CODE_LENGTH}
            autoFocus
            editable={!busy}
            onSubmitEditing={() => { confirmCode().catch(() => {}) }}
            accessibilityLabel={t("auth.codeEnterTitle")}
          />
          <View style={styles.linkRow}>
            {waitSeconds > 0 ? (
              <Text style={styles.muted} testID="login-code-wait">{t("auth.codeResendIn", { time: clock(waitSeconds) })}</Text>
            ) : (
              <Pressable testID="login-code-resend" accessibilityRole="button" onPress={() => { sendCode().catch(() => {}) }} disabled={busy} style={styles.link}>
                <Text style={styles.linkText}>{t("auth.codeResend")}</Text>
              </Pressable>
            )}
            <Pressable testID="login-code-change-phone" accessibilityRole="button" onPress={() => { setStep("phone"); setChallengeId(undefined); setError(null) }} disabled={busy} style={styles.link}>
              <Text style={styles.linkText}>{t("auth.codeChangePhone")}</Text>
            </Pressable>
          </View>
          {errorBox}
          {primary("login-code-confirm", t("auth.codeConfirm"), t("auth.codeConfirming"), () => { confirmCode().catch(() => {}) })}
        </>
      )}

      {step === "password" && setup && (
        <>
          <Text style={styles.title}>{t("auth.newPasswordTitle")}</Text>
          <Text style={styles.body}>{t("auth.newPasswordBody", { name: setup.name || setup.organizationName })}</Text>
          {setup.token.startsWith("lds3.") ? <Text style={styles.body}>{t("auth.commonPasswordBody")}</Text> : null}
          {(["newPassword", "repeatPassword"] as const).map((field) => (
            <View key={field}>
              <Text style={styles.label}>{t(`auth.${field}`)}</Text>
              <View style={styles.inputWrap}>
                <Icon name="key-outline" size={21} color={fieldTheme.color.inkMuted} />
                <TextInput
                  testID={`login-code-${field}`}
                  style={styles.input}
                  value={field === "newPassword" ? password : repeat}
                  onChangeText={(value) => { (field === "newPassword" ? setPassword : setRepeat)(value); if (error) setError(null) }}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  autoFocus={field === "newPassword"}
                  editable={!busy}
                  accessibilityLabel={t(`auth.${field}`)}
                />
                {field === "newPassword" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(showPassword ? "auth.hidePassword" : "auth.showPassword")}
                    onPress={() => setShowPassword((current) => !current)}
                    style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
                  >
                    <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={23} color={fieldTheme.color.inkMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          <View style={styles.rules} testID="login-code-rules">
            {([["length", "auth.ruleLength"], ["cases", "auth.ruleCases"], ["digitSymbol", "auth.ruleDigitSymbol"], ["match", "auth.ruleMatch"]] as const).map(([rule, key]) => (
              <View key={rule} style={styles.rule}>
                <Icon name={rules[rule] ? "checkmark-circle" : "ellipse-outline"} size={17} color={rules[rule] ? fieldTheme.color.success : fieldTheme.color.inkMuted} />
                <Text style={[styles.ruleText, rules[rule] && styles.ruleMet]}>{t(key)}</Text>
              </View>
            ))}
          </View>
          {errorBox}
          {primary("login-code-save", t("auth.savePassword"), t("auth.savingPassword"), () => { savePassword().catch(() => {}) })}
          <Text style={styles.muted}>{t("auth.passwordPrivate")}</Text>
        </>
      )}

    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  // The WhatsApp mark is white in both palettes.
  whatsappMark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  whatsappButton: {
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: WHATSAPP_BUTTON,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.lg,
    paddingHorizontal: fieldTheme.space.lg,
  },
  bodyFirst: { marginTop: 0 },
  centered: { textAlign: "center", marginTop: fieldTheme.space.md },
  back: { alignSelf: "flex-start", marginBottom: fieldTheme.space.xs },
  title: { color: fieldTheme.color.ink, fontSize: 25, lineHeight: 31, fontWeight: "900" },
  body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 22, marginTop: fieldTheme.space.sm, marginBottom: fieldTheme.space.md },
  label: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800", marginTop: fieldTheme.space.md, marginBottom: fieldTheme.space.sm },
  inputWrap: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.border,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: fieldTheme.space.lg,
  },
  input: { flex: 1, minHeight: 54, paddingHorizontal: fieldTheme.space.md, color: fieldTheme.color.ink, fontSize: 16 },
  codeInput: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.primary,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surface,
    color: fieldTheme.color.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 14,
    textAlign: "center",
  },
  eyeButton: { minWidth: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  linkRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  link: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { color: fieldTheme.color.primary, fontSize: 14, fontWeight: "800" },
  muted: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.sm },
  rules: { gap: 6, marginTop: fieldTheme.space.md },
  rule: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: { color: fieldTheme.color.inkMuted, fontSize: 13 },
  ruleMet: { color: fieldTheme.color.success, fontWeight: "700" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: fieldTheme.space.sm,
    backgroundColor: fieldTheme.color.dangerSoft,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.md,
    marginTop: fieldTheme.space.md,
  },
  errorText: { flex: 1, color: fieldTheme.color.onDangerSoft, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.lg,
    paddingHorizontal: fieldTheme.space.lg,
  },
  primaryPressed: { backgroundColor: fieldTheme.color.primaryStrong, transform: [{ scale: 0.99 }] },
  primaryText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.72 },
}))
