import React, { useEffect, useRef, useState } from "react"
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import { managerApi } from "../../services/manager-api"
import { notify } from "../../services/app-feedback"
import { giveTaskFailure, laterDays, taskText, toGivenTask, type GiveTaskFailure } from "../../services/manager-task"
import { gpsDateKey } from "../../services/gps-history"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { useBootstrapStore } from "../../store/bootstrap"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

/**
 * «Дать задачу» from the employee's card (owner, 2026-10-20: «чтоб была
 * возможность создавать задачи менеджерам через приложение»; «в приложении
 * ты облегчил правильно»). Three things and «Отправить»: whom — the card's
 * employee, what, and the day. The same task as the panel's; the agent gets
 * the same pop-up. Whether it can reach his phone is said before sending.
 */

type DueMode = "today" | "tomorrow" | "none" | "date"

const DUE_MODES: Array<{ mode: DueMode; key: string }> = [
  { mode: "today", key: "managerTask.dueToday" },
  { mode: "tomorrow", key: "managerTask.dueTomorrow" },
  { mode: "none", key: "managerTask.dueNone" },
  { mode: "date", key: "managerTask.dueDate" },
]

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase()).join("")
}

export default function ManagerGiveTaskSheet({
  visible,
  agentId,
  agentName,
  pushReady,
  onClose,
}: {
  visible: boolean
  agentId: string
  agentName: string
  /** From the team list; unknown from an older server. */
  pushReady?: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const timezone = useBootstrapStore((state) => state.data?.timezone)
  const [title, setTitle] = useState("")
  const [mode, setMode] = useState<DueMode>("tomorrow")
  const [day, setDay] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<GiveTaskFailure | "writeWhat" | "chooseDay" | null>(null)
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!visible) return
    setTitle("")
    setMode("tomorrow")
    setDay(null)
    setError(null)
  }, [visible])

  const todayKey = gpsDateKey(new Date(), timezone)
  const days = laterDays(todayKey)

  const send = async () => {
    if (sendingRef.current) return
    const text = taskText(title)
    if (!text) { setError("writeWhat"); return }
    if (mode === "date" && !day) { setError("chooseDay"); return }
    sendingRef.current = true
    setSending(true)
    setError(null)
    try {
      const answer = toGivenTask(await managerApi.giveTask(agentId, text, mode === "date" ? day! : mode))
      const reached = answer.pushReady ?? pushReady
      notify({
        tone: "success",
        title: t("managerTask.sent"),
        message: reached === false ? t("managerTask.sentNoPush") : reached ? t("managerTask.sentPush") : undefined,
      })
      onClose()
    } catch (failure) {
      setError(giveTaskFailure(failure))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel={t("managerTask.close")} onPress={onClose} testID="manager-task-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + fieldTheme.space.lg }]} testID="manager-task-sheet">
          <View style={styles.grab} />
          <Text style={styles.title}>{t("managerTask.title")}</Text>
          <View style={styles.who}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(agentName)}</Text></View>
            <Text style={styles.whoName} numberOfLines={1}>{agentName}</Text>
          </View>

          <Text style={styles.label}>{t("managerTask.what")}</Text>
          <TextInput
            value={title}
            onChangeText={(value) => { setTitle(value); setError(null) }}
            placeholder={t("managerTask.whatPlaceholder")}
            placeholderTextColor={fieldTheme.color.inkMuted}
            maxLength={200}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => { void send() }}
            style={styles.input}
            testID="manager-task-title"
          />

          <Text style={styles.label}>{t("managerTask.due")}</Text>
          <View style={styles.chips}>
            {DUE_MODES.map((item) => (
              <Pressable
                key={item.mode}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === item.mode }}
                onPress={() => { setMode(item.mode); setError(null) }}
                style={({ pressed }) => [styles.chip, mode === item.mode && styles.chipOn, pressed && styles.pressed]}
                testID={`manager-task-due-${item.mode}`}
              >
                <Text style={[styles.chipText, mode === item.mode && styles.chipTextOn]}>{t(item.key)}</Text>
              </Pressable>
            ))}
          </View>
          {mode === "date" ? (
            <View style={styles.days} testID="manager-task-days">
              {days.map((key) => {
                const date = new Date(`${key}T12:00:00.000Z`)
                const chosen = day === key
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={formatLocalizedDate(date, i18n.language, { weekday: "long", day: "numeric", month: "long" })}
                    onPress={() => { setDay(key); setError(null) }}
                    style={({ pressed }) => [styles.dayCell, chosen && styles.chipOn, pressed && styles.pressed]}
                    testID={`manager-task-day-${key}`}
                  >
                    <Text style={[styles.dayWeek, chosen && styles.chipTextOn]}>{formatLocalizedDate(date, i18n.language, { weekday: "short" })}</Text>
                    <Text style={[styles.dayNumber, chosen && styles.chipTextOn]}>{date.getUTCDate()}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {pushReady != null ? (
            <View style={styles.reach} testID="manager-task-reach">
              <View style={[styles.dot, pushReady ? styles.dotOk : styles.dotOff]} />
              <Text style={[styles.reachText, pushReady ? styles.reachOk : styles.reachOff]}>{t(pushReady ? "managerTask.reachYes" : "managerTask.reachNo")}</Text>
            </View>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite" testID="manager-task-error">
              {t(error === "writeWhat" || error === "chooseDay" ? `managerTask.${error}` : `managerTask.errors.${error}`)}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: sending }}
            disabled={sending}
            onPress={() => { void send() }}
            style={({ pressed }) => [styles.send, sending && styles.sending, pressed && styles.pressed]}
            testID="manager-task-send"
          >
            <Text style={styles.sendText}>{t(sending ? "managerTask.sending" : "managerTask.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: fieldTheme.color.scrim },
  sheet: {
    backgroundColor: fieldTheme.color.surface,
    borderTopLeftRadius: fieldTheme.radius.lg,
    borderTopRightRadius: fieldTheme.radius.lg,
    paddingHorizontal: fieldTheme.space.lg,
    paddingTop: fieldTheme.space.sm,
  },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: fieldTheme.color.border, marginBottom: fieldTheme.space.md },
  title: { color: fieldTheme.color.ink, fontSize: 20, fontWeight: "900" },
  who: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, alignSelf: "flex-start", maxWidth: "100%", marginTop: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: fieldTheme.space.md },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: fieldTheme.color.surfaceStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  whoName: { flexShrink: 1, color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  label: { color: fieldTheme.color.inkMuted, fontSize: 13, fontWeight: "800", marginTop: fieldTheme.space.md, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md, color: fieldTheme.color.ink, fontSize: 15, backgroundColor: fieldTheme.color.surface },
  chips: { flexDirection: "row", gap: 6 },
  chip: { flexGrow: 1, minHeight: LAYOUT_TOUCH_TARGETS.compact, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surface },
  chipOn: { borderWidth: 2, borderColor: fieldTheme.color.primaryStrong },
  chipText: { color: fieldTheme.color.ink, fontSize: 13.5, fontWeight: "700" },
  chipTextOn: { color: fieldTheme.color.primaryStrong, fontWeight: "900" },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: fieldTheme.space.sm },
  dayCell: { width: "12.5%", flexGrow: 1, minHeight: 50, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surface },
  dayWeek: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  dayNumber: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  reach: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: fieldTheme.space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: fieldTheme.color.success },
  dotOff: { backgroundColor: fieldTheme.color.amber },
  reachText: { flexShrink: 1, fontSize: 13, fontWeight: "700" },
  reachOk: { color: fieldTheme.color.success },
  reachOff: { color: fieldTheme.color.amber },
  error: { color: fieldTheme.color.danger, fontSize: 13.5, fontWeight: "700", marginTop: fieldTheme.space.md },
  send: { marginTop: fieldTheme.space.md, minHeight: 52, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primaryStrong, alignItems: "center", justifyContent: "center" },
  sending: { opacity: 0.6 },
  sendText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "900" },
  pressed: { opacity: 0.72 },
}))
