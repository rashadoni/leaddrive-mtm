import React, { useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import { fieldTheme } from "../theme/fieldTheme"
import { NOTES_ACTION_MIN_HEIGHT, notesModalLayout } from "./notes-modal-layout"

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

  // The modal is its own Android window, and it is deliberately NOT translucent
  // (unlike SignaturePadModal, which has no text field to type into). React
  // Native gives every modal window adjustResize, and for a non-translucent one
  // its content view fits the system windows, keyboard included: the platform
  // itself shrinks the dialog above the keyboard. `navigationBarTranslucent`
  // makes the window edge-to-edge, where Android no longer resizes it, and the
  // buttons would then depend on keyboard events reaching a separate window —
  // not checked on the Galaxy S23 on its side (2026-09-14). The provider inside
  // still measures this window, so nothing is padded twice or left under a bar.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <SafeAreaProvider>
        <NotesCard
          title={title}
          message={message}
          text={text}
          onChangeText={setText}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      </SafeAreaProvider>
    </Modal>
  )
}

interface CardProps {
  title: string
  message: string
  text: string
  onChangeText: (text: string) => void
  onCancel: () => void
  onSubmit: () => void
}

function NotesCard({ title, message, text, onChangeText, onCancel, onSubmit }: CardProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const layout = notesModalLayout(width, height)
  const pageRef = useRef<ScrollView>(null)
  const focused = useRef(false)
  const pageHeight = useRef(0)

  // The buttons sit below the field. When the keyboard takes the bottom of a
  // phone on its side, the page gets shorter and the field keeps focus — scroll
  // to the end so «Təsdiq et» is on screen without the agent hunting for it.
  const keepActionsInView = () => {
    requestAnimationFrame(() => pageRef.current?.scrollToEnd({ animated: true }))
  }

  const handlePageLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height
    if (focused.current && next < pageHeight.current) keepActionsInView()
    pageHeight.current = next
  }

  // A second path on Android, where behavior used to be `undefined`: "padding"
  // pads only by the part of the keyboard that still overlaps this view. When
  // the system has already shrunk the window, that is zero; the old card simply
  // stood taller than the room left and had no page to scroll.
  return (
    <KeyboardAvoidingView style={styles.scrim} behavior="padding">
      <ScrollView
        ref={pageRef}
        style={styles.fill}
        // The whole card is the page and scrolls only when it is taller than
        // the room left; the field itself never gets a frame of its own.
        contentContainerStyle={[
          styles.page,
          {
            paddingTop: insets.top + fieldTheme.space.md,
            paddingBottom: insets.bottom + fieldTheme.space.md,
            paddingLeft: insets.left + fieldTheme.space.lg,
            paddingRight: insets.right + fieldTheme.space.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onLayout={handlePageLayout}
        onContentSizeChange={() => {
          if (focused.current) keepActionsInView()
        }}
      >
        <View style={[styles.card, layout.short && styles.cardShort]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.message, layout.short && styles.messageShort]}>{message}</Text>
          {/* One tree for both layouts: switching the style, not the nesting,
              keeps the field mounted and the keyboard open on rotation. */}
          <View style={[styles.body, layout.inline && styles.bodyInline]}>
            <TextInput
              style={[styles.input, { minHeight: layout.inputMinHeight }, layout.inline && styles.inputInline]}
              value={text}
              onChangeText={onChangeText}
              placeholder={t("notesModal.placeholder")}
              placeholderTextColor={fieldTheme.color.inkMuted}
              accessibilityLabel={t("notesModal.placeholder")}
              multiline
              autoFocus
              // On a phone on its side Android's keyboards may otherwise open
              // their own full-screen editor (the landscape default) and hide
              // the whole dialog, «Təsdiq et» included, while the agent types.
              disableFullscreenUI
              onFocus={() => {
                focused.current = true
              }}
              onBlur={() => {
                focused.current = false
              }}
            />
            <View style={[styles.actions, layout.inline && styles.actionsInline]}>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                style={({ pressed }) => [styles.button, styles.cancelButton, layout.inline && styles.buttonInline, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>{t("notesModal.cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onSubmit}
                style={({ pressed }) => [styles.button, styles.submitButton, layout.inline && styles.buttonInline, pressed && styles.pressed]}
              >
                <Text style={styles.submitText}>{t("notesModal.submit")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  // Ink at 55% (alpha 8C): a dim of the app's own dark, not a neutral black,
  // built from the token so it follows fieldTheme if ink changes.
  scrim: { flex: 1, backgroundColor: fieldTheme.color.ink + "8C" },
  fill: { flex: 1 },
  page: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.lg,
    padding: fieldTheme.space.xl,
  },
  cardShort: { padding: fieldTheme.space.lg },
  title: { fontSize: 20, fontWeight: "800", color: fieldTheme.color.ink, marginBottom: fieldTheme.space.xs },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: fieldTheme.color.inkMuted,
    marginBottom: fieldTheme.space.lg,
  },
  messageShort: { marginBottom: fieldTheme.space.sm },
  body: { gap: fieldTheme.space.md },
  bodyInline: { flexDirection: "row", alignItems: "flex-end", gap: fieldTheme.space.sm },
  input: {
    backgroundColor: fieldTheme.color.canvas,
    borderRadius: fieldTheme.radius.sm,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
    paddingHorizontal: fieldTheme.space.md,
    paddingVertical: fieldTheme.space.sm,
    fontSize: 16,
    color: fieldTheme.color.ink,
    textAlignVertical: "top",
  },
  inputInline: { flex: 1 },
  actions: { flexDirection: "row", gap: fieldTheme.space.sm },
  actionsInline: { flexShrink: 0 },
  button: {
    minHeight: NOTES_ACTION_MIN_HEIGHT,
    borderRadius: fieldTheme.radius.md,
    paddingHorizontal: fieldTheme.space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInline: { flex: 0 },
  // Cancel is the way back, so it is quiet: a soft green fill, dark text.
  cancelButton: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  cancelText: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "700" },
  submitButton: { flex: 1.5, backgroundColor: fieldTheme.color.primary },
  submitText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.8 },
})
