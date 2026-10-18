import React, { useEffect, useState } from "react"
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import { formatLocalizedDate } from "../lib/format-localized-date"
import { attendanceUuid, type AttendanceInput } from "../services/attendance-contract"
import { staleVisitDayDate } from "../services/stale-visit"
import {
  clockFieldText,
  nextDayKey,
  normalizeClock,
  companyClock,
  staleWorkdayCorrection,
  staleWorkdayEarliestFinish,
  staleWorkdayFinishRequest,
  type StaleWorkdayCorrection,
} from "../services/stale-workday"
import { fieldTheme } from "../theme/fieldTheme"

/**
 * «Günü bağla» on «Bu gün» for a day left open since an earlier date: one
 * field, the finish time. The day and its start are known; the reason is a
 * fixed sentence the manager reads. «Göndər» queues the time-correction
 * request; the day closes when the manager approves it.
 *
 * Built like NotesModal: its own Android window, not translucent, so the
 * platform lifts the sheet above the keyboard, with a KeyboardAvoidingView
 * for Android 16, which no longer does.
 */
export default function StaleWorkdayCloseSheet(props: {
  visible: boolean
  correction: StaleWorkdayCorrection
  timezone?: string | null
  /** The day's latest mark (bootstrap): the finish cannot precede it. */
  lastMarkAt?: string | null
  sending: boolean
  failed: boolean
  onCancel: () => void
  onSend: (input: AttendanceInput) => void
}) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
      <SafeAreaProvider>
        <CloseSheetCard {...props} />
      </SafeAreaProvider>
    </Modal>
  )
}

function CloseSheetCard({
  visible,
  correction,
  timezone,
  lastMarkAt,
  sending,
  failed,
  onCancel,
  onSend,
}: Parameters<typeof StaleWorkdayCloseSheet>[0]) {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState("")
  const [error, setError] = useState<"format" | "future" | null>(null)
  useEffect(() => { if (visible) { setText(""); setError(null) } }, [visible])

  const dayLabel = (day: string) => formatLocalizedDate(staleVisitDayDate(day), i18n.language, { day: "numeric", month: "long" })
  const finish = normalizeClock(text)
  // The day's latest mark, shown when it has one after its start. A finish
  // before it is fine: those marks stay in the day's history, not in its time.
  const lastMark = lastMarkAt && Number.isFinite(Date.parse(lastMarkAt)) ? new Date(lastMarkAt) : null
  const lastMarkDay = lastMark ? staleWorkdayCorrection(lastMark.toISOString(), timezone).workDate : null
  const lastMarkLabel = lastMark && lastMarkDay
    ? lastMarkDay === correction.workDate ? companyClock(lastMark, timezone) : `${dayLabel(lastMarkDay)}, ${companyClock(lastMark, timezone)}`
    : null
  const earliest = staleWorkdayEarliestFinish(lastMarkAt, timezone)
  const showsLastMark = earliest !== null && (earliest.day !== correction.workDate || earliest.clock > correction.startTime)
  const finishDay = finish === null ? null : finish <= correction.startTime ? nextDayKey(correction.workDate) : correction.workDate
  const lateMarksLeftOut = earliest !== null && finish !== null && finishDay !== null
    && (finishDay < earliest.day || (finishDay === earliest.day && finish < earliest.clock))
  const afterMidnight = finish !== null && finish <= correction.startTime
  const send = () => {
    const result = staleWorkdayFinishRequest(
      correction, text, new Date(), timezone, attendanceUuid(), t("attendanceRequests.staleWorkdayReason"), lastMarkAt,
    )
    if (!result.ok) { setError(result.error); return }
    onSend(result.input)
  }
  const message = error === "format"
    ? t("todayV2.staleSheetInvalid")
    : error === "future"
      ? t("todayV2.staleSheetFuture")
      : failed ? t("todayV2.staleSheetFailed") : null

  return (
    <KeyboardAvoidingView style={styles.scrim} behavior="padding">
      <Pressable style={styles.fill} accessibilityLabel={t("common.cancel")} onPress={onCancel} />
      <View testID="today-stale-close-sheet" style={[styles.sheet, { paddingBottom: insets.bottom + fieldTheme.space.lg }]}>
        <Text style={styles.title}>{t("todayV2.staleSheetTitle", { date: dayLabel(correction.workDate) })}</Text>
        <Text style={styles.meta}>{t("todayV2.staleSheetStart", { time: correction.startTime })}</Text>
        {showsLastMark ? (
          <Text testID="today-stale-last-mark" style={styles.meta}>{t("todayV2.staleSheetLastMark", { time: lastMarkLabel ?? "" })}</Text>
        ) : null}
        <Text style={styles.question}>{t("todayV2.staleSheetQuestion")}</Text>
        <TextInput
          testID="today-stale-finish"
          accessibilityLabel={t("todayV2.staleSheetQuestion")}
          value={text}
          onChangeText={(value) => { setText(clockFieldText(value)); setError(null) }}
          placeholder="18:30"
          placeholderTextColor={fieldTheme.color.inkMuted}
          keyboardType="number-pad"
          maxLength={5}
          autoFocus
          editable={!sending}
          onSubmitEditing={send}
          style={[styles.field, error !== null && styles.fieldError]}
        />
        {afterMidnight ? (
          <Text style={styles.meta}>{t("todayV2.staleSheetNextDay", { date: dayLabel(nextDayKey(correction.workDate)) })}</Text>
        ) : null}
        {lateMarksLeftOut && !message ? (
          <Text testID="today-stale-late-marks" style={styles.note}>{t("todayV2.staleSheetLateMarksNote")}</Text>
        ) : null}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <Text style={styles.hint}>{t("todayV2.staleSheetHint")}</Text>
        <View style={styles.actions}>
          <Pressable
            testID="today-stale-close-cancel"
            accessibilityRole="button"
            disabled={sending}
            onPress={onCancel}
            style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            testID="today-stale-close-send"
            accessibilityRole="button"
            accessibilityState={{ disabled: sending }}
            disabled={sending}
            onPress={send}
            style={({ pressed }) => [styles.button, styles.sendButton, pressed && styles.pressed, sending && styles.disabled]}
          >
            <Text style={styles.sendText}>{t("todayV2.staleSheetSend")}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: fieldTheme.color.scrim,
  },
  fill: {
    flex: 1,
  },
  sheet: {
    paddingTop: fieldTheme.space.xl,
    paddingHorizontal: fieldTheme.space.xl,
    gap: fieldTheme.space.sm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: fieldTheme.color.surface,
  },
  title: {
    color: fieldTheme.color.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
  },
  meta: {
    color: fieldTheme.color.inkMuted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  question: {
    marginTop: fieldTheme.space.sm,
    color: fieldTheme.color.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  field: {
    minHeight: 64,
    paddingHorizontal: fieldTheme.space.lg,
    borderWidth: 2,
    borderColor: fieldTheme.color.primary,
    borderRadius: 14,
    backgroundColor: fieldTheme.color.canvas,
    color: fieldTheme.color.ink,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
  },
  fieldError: {
    borderColor: fieldTheme.color.danger,
  },
  error: {
    color: fieldTheme.color.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  note: {
    color: fieldTheme.color.amber,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  hint: {
    color: fieldTheme.color.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.sm,
  },
  button: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.pill,
  },
  cancel: {
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    backgroundColor: fieldTheme.color.surface,
  },
  cancelText: {
    color: fieldTheme.color.primaryStrong,
    fontSize: 16,
    fontWeight: "800",
  },
  sendButton: {
    backgroundColor: fieldTheme.color.danger,
  },
  sendText: {
    color: fieldTheme.color.onColor,
    fontSize: 16,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
})
