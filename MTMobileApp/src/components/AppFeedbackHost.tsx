import React, { useCallback, useEffect, useRef } from "react"
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import { useStore } from "zustand"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme } from "../theme/fieldTheme"
import {
  answerChoice,
  appFeedbackStore,
  dismissChoice,
  dismissNotice,
  markNoticeShown,
  noticeRemainingMs,
  type AppChoice,
} from "../services/app-feedback"
import { FEEDBACK_TONE_COLORS } from "./feedback-tone"
import {
  APP_CHOICE_BUTTON_MIN_HEIGHT,
  APP_CHOICE_MAX_WIDTH,
  appChoiceLayout,
  choiceButtonLook,
  noticeFrame,
  orderChoiceButtons,
} from "./app-choice-layout"

/**
 * Draws `notify()` and `ask()` from `services/app-feedback` for every screen.
 * Mounted once, at the app root after the navigator (`runtime/AndroidApp.tsx`),
 * so tabs, stack screens and the logged-out screens all share it without
 * wiring a toast and a sheet of their own.
 */
export default function AppFeedbackHost() {
  return (
    <>
      <AppNoticeLayer />
      <AppChoiceSheet />
    </>
  )
}

/**
 * The notice card. The host mounts one over the app window. A sheet or a
 * full-screen modal of the app is its own Android window and covers that one:
 * a modal that reports while it is open mounts another `<AppNoticeLayer />`
 * inside its own content (the route tab's phone sheet, the organization
 * explorer's sheets), and every layer shows the same notice on the same clock
 * — the one underneath is hidden. A modal without a layer does not use
 * `notify()` while open: the camera says a failed shot inline, and the
 * screens ask a failed signature save in a sheet above the pad.
 */
export function AppNoticeLayer() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const notice = useStore(appFeedbackStore, (state) => state.notice)
  const shownAt = useStore(appFeedbackStore, (state) => state.noticeShownAt)
  const hasSuccessor = useStore(appFeedbackStore, (state) => state.pendingNotices.length > 0)
  // An open choice is a modal window above this one: a notice timing out
  // under its scrim would never be read, so it waits until the choice closes.
  const choiceOpen = useStore(appFeedbackStore, (state) => state.choice !== null)
  const progress = useRef(new Animated.Value(0)).current
  const drawn = useRef<number | null>(null)

  const leave = useCallback((id: number) => {
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => dismissNotice(id))
  }, [progress])

  useEffect(() => {
    if (!notice || choiceOpen) {
      drawn.current = null
      progress.setValue(0)
      return
    }
    if (drawn.current !== notice.id) {
      drawn.current = notice.id
      progress.setValue(0)
      Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    }
    // The clock lives in the store, not in this layer: a layer mounted later
    // (a sheet opening) times out with the others instead of being cut short
    // by the root layer's own earlier timer.
    const since = shownAt ?? markNoticeShown(notice.id)
    if (since === null) return
    const remaining = noticeRemainingMs({
      shownAt: since,
      now: Date.now(),
      durationMs: notice.durationMs,
      hasSuccessor,
    })
    const timer = setTimeout(() => leave(notice.id), remaining)
    return () => clearTimeout(timer)
  }, [choiceOpen, hasSuccessor, leave, notice, progress, shownAt])

  if (!notice || choiceOpen) return null

  const tone = FEEDBACK_TONE_COLORS[notice.tone]
  const frame = noticeFrame({ width, insets, gap: fieldTheme.space.md })
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] })

  return (
    <View pointerEvents="box-none" style={[styles.noticeFrame, frame]}>
      <Animated.View style={[styles.noticeMotion, { opacity: progress, transform: [{ translateY }] }]}>
        <Pressable
          testID="app-notice"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityHint={t("appFeedback.dismissNotice")}
          onPress={() => leave(notice.id)}
          style={({ pressed }) => [
            styles.notice,
            { backgroundColor: tone.background, borderColor: tone.border, borderLeftColor: tone.accent },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={tone.icon} size={26} color={tone.accent} />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            {notice.message ? <Text style={styles.noticeMessage}>{notice.message}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function AppChoiceSheet() {
  const choice = useStore(appFeedbackStore, (state) => state.choice)
  // The fade-out still draws the last choice; its buttons are inert by then,
  // because the store answers only the choice that is open.
  const last = useRef<AppChoice | null>(null)
  if (choice) last.current = choice
  const shown = choice ?? last.current

  // The modal is its own Android window drawn under the system bars, and the
  // root provider's insets describe the app window: on a phone on its side
  // the navigation bar is on the right and the root reports 0 there. The
  // provider inside measures this window (as SignaturePadModal does).
  return (
    <Modal
      visible={choice !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (choice) dismissChoice(choice.id)
      }}
    >
      <SafeAreaProvider>
        {shown ? <ChoiceCard choice={shown} /> : null}
      </SafeAreaProvider>
    </Modal>
  )
}

function ChoiceCard({ choice }: { choice: AppChoice }) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const layout = appChoiceLayout(width, height, choice.buttons.length)
  const ordered = orderChoiceButtons(choice.buttons)
  const tone = choice.tone ? FEEDBACK_TONE_COLORS[choice.tone] : null

  return (
    <View style={styles.scrim}>
      <ScrollView
        style={styles.fill}
        // The whole sheet is the page: it scrolls only when a long message
        // does not fit a 384 dp tall window, and nothing inside has a frame
        // of its own.
        contentContainerStyle={[
          styles.page,
          {
            paddingTop: insets.top + fieldTheme.space.md,
            paddingBottom: insets.bottom + fieldTheme.space.md,
            paddingLeft: insets.left + fieldTheme.space.lg,
            paddingRight: insets.right + fieldTheme.space.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* A tap on the dim around the card closes it like the back button. */}
        <Pressable
          testID="app-choice-backdrop"
          accessible={false}
          onPress={() => dismissChoice(choice.id)}
          style={[styles.backdrop, layout.short ? styles.backdropCentered : styles.backdropBottom]}
        >
          <View
            testID="app-choice"
            // Taps on the card's text stay on the card and do not close it.
            onStartShouldSetResponder={() => true}
            style={[styles.card, layout.short && styles.cardShort]}
          >
            <View style={styles.header}>
              {tone ? <Icon name={tone.icon} size={layout.short ? 24 : 28} color={tone.accent} /> : null}
              <Text accessibilityRole="header" style={[styles.title, layout.short && styles.titleShort]}>
                {choice.title}
              </Text>
            </View>
            {choice.message ? <Text style={styles.message}>{choice.message}</Text> : null}
            <View style={[styles.actions, layout.row ? styles.actionsRow : styles.actionsColumn]}>
              {ordered.map(({ button, index }, position) => {
                const look = choiceButtonLook(button.style, position === ordered.length - 1)
                return (
                  <Pressable
                    key={`${choice.id}-${index}`}
                    testID={`app-choice-button-${index}`}
                    accessibilityRole="button"
                    onPress={() => answerChoice(choice.id, index)}
                    style={({ pressed }) => [
                      styles.button,
                      layout.row && styles.buttonRow,
                      BUTTON_LOOK[look],
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.buttonText, BUTTON_TEXT[look]]}>{button.text}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  noticeFrame: { position: "absolute", alignItems: "center", zIndex: 1000, elevation: 12 },
  noticeMotion: { width: "100%", maxWidth: APP_CHOICE_MAX_WIDTH },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderLeftWidth: 5,
    elevation: 8,
    shadowColor: fieldTheme.color.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800", color: fieldTheme.color.ink },
  noticeMessage: { fontSize: 15, lineHeight: 20, color: fieldTheme.color.ink },
  // Ink at 55% (alpha 8C), like the check-out note dialog: the app's own dark.
  scrim: { flex: 1, backgroundColor: fieldTheme.color.ink + "8C" },
  fill: { flex: 1 },
  page: { flexGrow: 1 },
  backdrop: { flexGrow: 1, alignItems: "center" },
  backdropBottom: { justifyContent: "flex-end" },
  backdropCentered: { justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: APP_CHOICE_MAX_WIDTH,
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.lg,
    padding: fieldTheme.space.xl,
    gap: fieldTheme.space.sm,
  },
  cardShort: { padding: fieldTheme.space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  title: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: "800", color: fieldTheme.color.ink },
  titleShort: { fontSize: 18, lineHeight: 23 },
  message: { fontSize: 15, lineHeight: 21, color: fieldTheme.color.inkMuted },
  actions: { marginTop: fieldTheme.space.md, gap: fieldTheme.space.sm },
  actionsRow: { flexDirection: "row" },
  // Reversed: the filled action on top, the way back at the bottom.
  actionsColumn: { flexDirection: "column-reverse" },
  button: {
    minHeight: APP_CHOICE_BUTTON_MIN_HEIGHT,
    borderRadius: fieldTheme.radius.md,
    paddingHorizontal: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRow: { flex: 1 },
  buttonText: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.8 },
})

// Keyed by AppChoiceButtonLook: choiceButtonLook() picks one per button.
const BUTTON_LOOK = StyleSheet.create({
  quiet: { backgroundColor: fieldTheme.color.surfaceStrong },
  primary: { backgroundColor: fieldTheme.color.primary },
  danger: { backgroundColor: fieldTheme.color.danger },
  outline: { backgroundColor: fieldTheme.color.surface, borderWidth: 1.5, borderColor: fieldTheme.color.primary },
})

const BUTTON_TEXT = StyleSheet.create({
  quiet: { color: fieldTheme.color.ink },
  primary: { color: fieldTheme.color.onColor, fontWeight: "800" },
  danger: { color: fieldTheme.color.onColor, fontWeight: "800" },
  outline: { color: fieldTheme.color.primary },
})
