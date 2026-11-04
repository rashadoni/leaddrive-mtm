import React from "react"
import { Modal, Pressable, StyleSheet, View } from "react-native"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import { TimeText as Text } from "../attendance/ui/TimeText"
import { timeColor } from "../attendance/ui/TimeUI"
import { themed } from "../theme/fieldTheme"
import type { AttendanceBreakKind } from "../services/bootstrap"
import { attendanceBreakKindName, attendanceBreakUsage } from "../services/attendance-break-kinds"

/**
 * «Fasilə» when the company asks for the kind of a break (owner, 2026-11-04;
 * mockup docs/mtm-attendance/mockups/desk-and-breaks/2-phone.png in
 * leaddrive-v2): one tap on a kind starts the break. Where the employee spends
 * it is never recorded — only the kind and the time.
 */
export default function AttendanceBreakKindSheet(props: { visible: boolean; kinds: AttendanceBreakKind[]; busy: boolean; onChoose: (kindId: string) => void; onCancel: () => void }) {
  return <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onCancel}>
    <SafeAreaProvider><Sheet {...props} /></SafeAreaProvider>
  </Modal>
}

function Sheet({ kinds, busy, onChoose, onCancel }: Parameters<typeof AttendanceBreakKindSheet>[0]) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  return <View style={styles.scrim}>
    <Pressable style={styles.fill} accessibilityRole="button" accessibilityLabel={t("attendanceBreaks.cancel")} onPress={onCancel} />
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="attendance-break-kinds">
      <View style={styles.grab} />
      <Text accessibilityRole="header" style={styles.title}>{t("attendanceBreaks.chooseTitle")}</Text>
      {kinds.map(kind => <Pressable key={kind.id} testID={`attendance-break-kind-${kind.id}`} accessibilityRole="button" disabled={busy}
        onPress={() => onChoose(kind.id)} style={({ pressed }) => [styles.option, pressed && styles.pressed, busy && styles.disabled]}>
        <View style={styles.optionText}>
          <Text style={styles.name}>{attendanceBreakKindName(kind, t)}</Text>
          <Text style={styles.meta}>{attendanceBreakUsage(kind, t)}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>)}
      <Pressable testID="attendance-break-kind-cancel" accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <Text style={styles.cancelText}>{t("attendanceBreaks.cancel")}</Text>
      </Pressable>
    </View>
  </View>
}

const styles = themed(() => StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,20,16,0.42)" },
  fill: { flex: 1 },
  sheet: { paddingTop: 10, paddingHorizontal: 16, gap: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: timeColor.surface },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: timeColor.line, alignSelf: "center", marginBottom: 4 },
  title: { color: timeColor.ink, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  option: { minHeight: 60, borderWidth: 1.5, borderColor: timeColor.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  optionText: { flex: 1, gap: 2 },
  name: { color: timeColor.ink, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  meta: { color: timeColor.muted, fontSize: 13, lineHeight: 18 },
  chevron: { color: timeColor.muted, fontSize: 22, lineHeight: 24 },
  cancel: { minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: timeColor.line, alignItems: "center", justifyContent: "center" },
  cancelText: { color: timeColor.muted, fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
}))
