import React, { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { fieldTheme, themed } from "../theme/fieldTheme"
import { previousVisitNoteByline, readPreviousVisitNote } from "../services/previous-visit-note"

/**
 * «Заметка с прошлого визита» on a route stop and inside the visit: one line
 * folded, the whole note on a tap, folded again on the next (owner's mockup,
 * 2026-11-13: «легко открывающимся и закрывающимся»).
 */
export default function PreviousNoteStrip({ note: raw, testID = "previous-note" }: { note: unknown; testID?: string }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const note = readPreviousVisitNote(raw)
  if (!note) return null
  const byline = previousVisitNoteByline(note, i18n.language)
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${t("previousNote.title")}, ${byline}. ${note.text}`}
      accessibilityHint={t(open ? "previousNote.hide" : "previousNote.show")}
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Icon name="document-text-outline" size={15} color={fieldTheme.color.amber} />
        <Text style={styles.title} numberOfLines={1}>{t("previousNote.title")} · {byline}</Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={fieldTheme.color.amber} />
      </View>
      <Text testID={`${testID}-text`} style={styles.text} numberOfLines={open ? undefined : 1}>{note.text}</Text>
    </Pressable>
  )
}

const styles = themed(() => StyleSheet.create({
  strip: {
    marginTop: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
    paddingVertical: fieldTheme.space.xs,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.amberSoft,
    gap: 2,
    minHeight: 44,
    justifyContent: "center",
  },
  head: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs },
  title: { flex: 1, color: fieldTheme.color.amber, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  text: { color: fieldTheme.color.ink, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.82 },
}))
