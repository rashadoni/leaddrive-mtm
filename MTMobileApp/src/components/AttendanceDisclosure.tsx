import { timeColor, useTimePresentation } from "../attendance/ui/TimeUI"
import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from 'react-native-vector-icons/Ionicons'
import { fieldTheme, themed } from '../theme/fieldTheme'

/** Keep status visible while details remain a deliberate, accessible action. */
export default function AttendanceDisclosure({ title, summary, icon, controlID, summaryTestID, children, initiallyOpen = false, attention = false }: {
  title: string; summary?: string; icon: string; controlID: string; summaryTestID?: string; children: React.ReactNode
  initiallyOpen?: boolean; attention?: boolean
}) {
  const rhythm = useTimePresentation(), styles = rhythm ? rhythmStyles : legacyStyles
  const [expanded, setExpanded] = useState(initiallyOpen)
  useEffect(() => { setExpanded(initiallyOpen) }, [initiallyOpen])
  return <View style={styles.section}>
    <Pressable testID={controlID} accessibilityRole="button" accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name={icon} size={21} color={attention ? (rhythm ? timeColor.amber : fieldTheme.color.amber) : (rhythm ? timeColor.accent : fieldTheme.color.primaryStrong)} />
      <View style={styles.copy}><Text style={styles.title}>{title}</Text>
        {summary ? <Text testID={summaryTestID} style={[styles.summary, attention && styles.attention]}>{summary}</Text> : null}</View>
      <Icon testID={`${controlID}-${expanded ? 'expanded' : 'collapsed'}`} name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={fieldTheme.color.inkMuted} />
    </Pressable>
    {expanded && <View testID={`${controlID}-content`} style={styles.content}>{children}</View>}
  </View>
}
const legacyStyles = themed(() => StyleSheet.create({
  section: { borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border },
  row: { minHeight: 56, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { backgroundColor: fieldTheme.color.surfaceStrong }, copy: { flex: 1, gap: 3 },
  title: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: '600' },
  summary: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19 },
  attention: { color: fieldTheme.color.amber }, content: { paddingBottom: 12, gap: 12 },
}))

const rhythmStyles = themed(() => StyleSheet.create({ ...legacyStyles, section: { borderBottomWidth: 1, borderBottomColor: timeColor.line }, title: { color: timeColor.ink, fontSize: 16, lineHeight: 23, fontWeight: '600' }, summary: { color: timeColor.muted, fontSize: 14, lineHeight: 21 }, attention: { color: timeColor.amber }, pressed: { backgroundColor: timeColor.inset } }))
