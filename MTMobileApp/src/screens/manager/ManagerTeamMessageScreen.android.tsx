import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { managerApi } from "../../services/manager-api"
import {
  newTeamMessageId,
  recipientInitials,
  TEAM_MESSAGE_MAX_LENGTH,
  teamMessageFailure,
  teamMessageRequest,
  toTeamRecipients,
  type TeamMessageFailure,
  type TeamMessageRecipient,
  type TeamMessageTarget,
} from "../../services/team-message"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

const FAILURE_COPY: Record<Exclude<TeamMessageFailure, "session">, string> = {
  offline: "teamMessage.errorOffline",
  notInTeam: "teamMessage.errorNotInTeam",
  noRecipients: "teamMessage.errorNoRecipients",
  empty: "teamMessage.errorEmpty",
  notEnabled: "teamMessage.errorNotEnabled",
  noRight: "teamMessage.errorNoRight",
  failed: "teamMessage.errorFailed",
}

/** A failure the same message may simply be sent again after. */
const RETRYABLE = new Set<TeamMessageFailure>(["offline", "failed"])

/**
 * «Komandaya yaz» — the manager writes to the whole team or to one employee
 * (owner-approved mockup, 2026-10-17). The team is whatever the server lists:
 * the phone never names a recipient of its own. A message that did not go
 * keeps its text and is sent again under the same id, so a lost answer does
 * not turn into a second message on the employees' phones.
 */
export default function ManagerTeamMessageScreen() {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headerTop = useHeaderTop()
  const tablet = isTabletWidth(width)
  const [recipients, setRecipients] = useState<TeamMessageRecipient[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading")
  const [mode, setMode] = useState<"TEAM" | "AGENT">("TEAM")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<TeamMessageFailure | null>(null)
  const [sent, setSent] = useState<{ count: number; name: string | null; text: string } | null>(null)
  const messageId = useRef(newTeamMessageId())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const loadTeam = useCallback(async () => {
    setLoadState("loading")
    try {
      const response = await managerApi.getMessageRecipients()
      if (!alive.current) return
      const team = toTeamRecipients(response)
      setRecipients(team)
      setSelectedId((current) => (current && team.some((agent) => agent.id === current) ? current : null))
      setLoadState("ready")
    } catch {
      if (alive.current) setLoadState("failed")
    }
  }, [])

  useEffect(() => { loadTeam().catch(() => {}) }, [loadTeam])

  // Another text or another recipient is another message.
  const changeMessage = <T,>(apply: (value: T) => void) => (value: T) => {
    messageId.current = newTeamMessageId()
    setFailure(null)
    apply(value)
  }
  const onText = changeMessage(setText)
  const onMode = changeMessage(setMode)
  const onSelect = changeMessage(setSelectedId)

  const selected = mode === "AGENT" ? recipients.find((agent) => agent.id === selectedId) ?? null : null
  const target: TeamMessageTarget | null = mode === "TEAM"
    ? (recipients.length > 0 ? { to: "TEAM" } : null)
    : selected ? { to: "AGENT", agentId: selected.id } : null
  const request = teamMessageRequest(target, text, messageId.current)

  const send = async () => {
    if (!request || sending) return
    setSending(true)
    setFailure(null)
    try {
      const response = await managerApi.sendTeamMessage(request)
      if (!alive.current) return
      const count = Number.isInteger(response?.data?.recipientCount) ? response.data.recipientCount : (mode === "TEAM" ? recipients.length : 1)
      setSent({ count, name: selected?.name ?? null, text: request.body })
    } catch (error) {
      if (!alive.current) return
      const reason = teamMessageFailure(error)
      setFailure(reason)
      if (reason === "notInTeam" || reason === "noRecipients") loadTeam().catch(() => {})
    } finally {
      if (alive.current) setSending(false)
    }
  }

  const writeAgain = () => {
    messageId.current = newTeamMessageId()
    setText("")
    setFailure(null)
    setSent(null)
  }

  const failureText = failure && failure !== "session" ? t(FAILURE_COPY[failure]) : null
  const retry = failure !== null && RETRYABLE.has(failure)
  const sendLabel = sending
    ? t("teamMessage.sending")
    : retry
      ? t("teamMessage.retry")
      : mode === "AGENT" && !selected
        ? t("teamMessage.chooseEmployee")
        : !text.trim()
          ? t("teamMessage.writeFirst")
          : mode === "TEAM"
            ? t("teamMessage.sendTeam", { count: recipients.length })
            : t("teamMessage.sendOne", { name: selected?.name ?? "" })

  // Android 16 draws the app edge-to-edge and no longer shrinks the window for
  // the keyboard: on the S23 (2026-10-18) «Göndər» stood under it while the
  // manager typed. "padding" lifts the footer by exactly the part the keyboard
  // covers, as NotesModal does.
  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <LightScreenStatusBar />
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("teamMessage.back")} onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={22} color={fieldTheme.color.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{t("teamMessage.title")}</Text>
      </View>

      {sent ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]}>
            <View style={styles.sentCard} testID="team-message-sent">
              <View style={styles.sentIcon}><Icon name="checkmark" size={40} color={fieldTheme.color.success} /></View>
              <Text style={styles.sentTitle}>{t("teamMessage.sentTitle")}</Text>
              <Text style={styles.sentBody}>
                {sent.name ? t("teamMessage.sentOne", { name: sent.name }) : t("teamMessage.sentTeam", { count: sent.count })}
              </Text>
              <Text style={styles.sentQuote}>{sent.text}</Text>
            </View>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.lg) }]}>
            <Pressable accessibilityRole="button" testID="team-message-back-to-team" onPress={() => navigation.goBack()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{t("teamMessage.backToTeam")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" testID="team-message-write-again" onPress={writeAgain} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{t("teamMessage.writeAgain")}</Text>
            </Pressable>
          </View>
        </>
      ) : loadState !== "ready" || recipients.length === 0 ? (
        <View style={styles.state}>
          {loadState === "loading" ? (
            <>
              <ActivityIndicator color={fieldTheme.color.primary} />
              <Text style={styles.stateText}>{t("teamMessage.loading")}</Text>
            </>
          ) : loadState === "failed" ? (
            <>
              <Icon name="cloud-offline-outline" size={34} color={fieldTheme.color.amber} />
              <Text style={styles.stateText}>{t("teamMessage.loadFailed")}</Text>
              <Pressable accessibilityRole="button" onPress={() => { loadTeam().catch(() => {}) }} style={({ pressed }) => [styles.reload, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>{t("teamMessage.reload")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Icon name="people-outline" size={36} color={fieldTheme.color.primary} />
              <Text style={styles.stateText}>{t("teamMessage.errorNoRecipients")}</Text>
            </>
          )}
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{t("teamMessage.to")}</Text>
            <View style={styles.segment}>
              {(["TEAM", "AGENT"] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === option }}
                  testID={option === "TEAM" ? "team-message-to-team" : "team-message-to-one"}
                  onPress={() => { if (mode !== option) onMode(option) }}
                  style={({ pressed }) => [styles.segmentOption, mode === option && styles.segmentOptionOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.segmentText, mode === option && styles.segmentTextOn]} numberOfLines={2}>
                    {option === "TEAM" ? t("teamMessage.wholeTeam", { count: recipients.length }) : t("teamMessage.oneEmployee")}
                  </Text>
                </Pressable>
              ))}
            </View>
            {mode === "TEAM" ? (
              <Text style={styles.who} numberOfLines={3}>{recipients.map((agent) => agent.name).join(", ")}</Text>
            ) : (
              <View style={styles.list}>
                {recipients.map((agent, index) => {
                  const on = agent.id === selectedId
                  return (
                    <Pressable
                      key={agent.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={agent.name}
                      onPress={() => { if (!on) onSelect(agent.id) }}
                      style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, on && styles.rowOn, pressed && styles.pressed]}
                    >
                      <View style={styles.avatar}><Text style={styles.avatarText}>{recipientInitials(agent.name)}</Text></View>
                      <Text style={styles.rowName} numberOfLines={1}>{agent.name}</Text>
                      <View style={[styles.radio, on && styles.radioOn]} />
                    </Pressable>
                  )
                })}
              </View>
            )}

            {failureText ? (
              <View style={styles.error} accessibilityLiveRegion="polite" testID="team-message-error">
                <Icon name={failure === "offline" ? "cloud-offline-outline" : "alert-circle-outline"} size={22} color={fieldTheme.color.danger} />
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>{t("teamMessage.notSentTitle")}</Text>
                  <Text style={styles.errorBody}>{failureText}</Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.label, styles.labelSpaced]}>{t("teamMessage.message")}</Text>
            <TextInput
              testID="team-message-body"
              value={text}
              onChangeText={onText}
              multiline
              maxLength={TEAM_MESSAGE_MAX_LENGTH}
              placeholder={t("teamMessage.placeholder")}
              placeholderTextColor={fieldTheme.color.inkMuted}
              style={[styles.input, text.trim() ? styles.inputFilled : null]}
            />
            <Text style={styles.counter}>{t("teamMessage.counter", { count: text.length, max: TEAM_MESSAGE_MAX_LENGTH })}</Text>
            <View style={styles.note}>
              <Icon name="notifications-outline" size={18} color={fieldTheme.color.inkMuted} />
              <Text style={styles.noteText}>{t("teamMessage.pushNote")}</Text>
            </View>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, fieldTheme.space.lg) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !request || sending, busy: sending }}
              testID="team-message-send"
              disabled={!request || sending}
              onPress={() => { send().catch(() => {}) }}
              style={({ pressed }) => [styles.primary, (!request || sending) && styles.primaryDisabled, pressed && styles.pressed]}
            >
              {sending
                ? <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
                : <Icon name={retry ? "refresh" : "send"} size={19} color={fieldTheme.color.onColor} />}
              <Text style={styles.primaryText} numberOfLines={1}>{sendLabel}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.sm, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong },
  title: { flex: 1, color: fieldTheme.color.ink, fontSize: 21, lineHeight: 27, fontWeight: "900" },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  contentTablet: { padding: fieldTheme.space.xl },
  label: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "900", marginHorizontal: 4, marginBottom: fieldTheme.space.sm },
  labelSpaced: { marginTop: fieldTheme.space.lg },
  segment: { flexDirection: "row", gap: fieldTheme.space.sm },
  segmentOption: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: fieldTheme.space.sm, borderRadius: 14, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  segmentOptionOn: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  segmentText: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900", textAlign: "center" },
  segmentTextOn: { color: fieldTheme.color.primaryStrong },
  who: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.sm, marginHorizontal: 4 },
  list: { marginTop: fieldTheme.space.md, overflow: "hidden", borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  rowDivider: { borderTopWidth: 1, borderTopColor: fieldTheme.color.surfaceStrong },
  rowOn: { backgroundColor: fieldTheme.color.primarySoft },
  avatar: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: fieldTheme.color.surfaceStrong },
  avatarText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  rowName: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: fieldTheme.color.border },
  radioOn: { borderWidth: 7, borderColor: fieldTheme.color.primary },
  error: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: 14, borderWidth: 1, borderColor: fieldTheme.color.danger, backgroundColor: fieldTheme.color.dangerSoft },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: fieldTheme.color.danger, fontSize: 14, fontWeight: "900" },
  errorBody: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18 },
  input: { minHeight: 150, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 2, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface, color: fieldTheme.color.ink, fontSize: 16, lineHeight: 23, textAlignVertical: "top" },
  inputFilled: { borderColor: fieldTheme.color.primary },
  counter: { alignSelf: "flex-end", color: fieldTheme.color.inkMuted, fontSize: 12, marginTop: fieldTheme.space.xs, marginHorizontal: 4 },
  note: { flexDirection: "row", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm, marginHorizontal: 4 },
  noteText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12.5, lineHeight: 17 },
  footer: { gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.canvas },
  primary: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: fieldTheme.space.md, borderRadius: 14, backgroundColor: fieldTheme.color.primary },
  primaryDisabled: { backgroundColor: fieldTheme.color.surfaceStrong },
  primaryText: { flexShrink: 1, color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  secondary: { minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 2, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 16, fontWeight: "900" },
  sentCard: { alignItems: "center", marginTop: fieldTheme.space.xxl, padding: fieldTheme.space.xl, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  sentIcon: { width: 74, height: 74, alignItems: "center", justifyContent: "center", borderRadius: 37, marginBottom: fieldTheme.space.md, backgroundColor: fieldTheme.color.successSoft },
  sentTitle: { color: fieldTheme.color.ink, fontSize: 24, fontWeight: "900" },
  sentBody: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 21, marginTop: fieldTheme.space.sm, textAlign: "center" },
  sentQuote: { alignSelf: "stretch", marginTop: fieldTheme.space.lg, padding: fieldTheme.space.md, borderRadius: 12, backgroundColor: fieldTheme.color.canvas, color: fieldTheme.color.ink, fontSize: 14, lineHeight: 20 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, padding: fieldTheme.space.xl },
  stateText: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  reload: { minHeight: 44, justifyContent: "center", paddingHorizontal: fieldTheme.space.lg, borderRadius: 14, backgroundColor: fieldTheme.color.primary },
  pressed: { opacity: 0.78 },
}))
