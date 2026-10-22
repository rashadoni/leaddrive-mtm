import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AttendanceReceiptRow } from '../services/attendance-receipt-contract'
import { fieldTheme, themed } from '../theme/fieldTheme'
import AttendanceDisclosure from './AttendanceDisclosure'

export default function AttendanceDeliveryReceipts({ rows, failed, timezone, compact = false }: { rows: AttendanceReceiptRow[]; failed: boolean; timezone: string | null | undefined; compact?: boolean }) {
  const { t, i18n } = useTranslation(), [expanded, setExpanded] = useState(false)
  const time = (value: string) => {
    try { return new Date(value).toLocaleString(i18n.language, { timeZone: timezone ?? 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return '—' }
  }
  if (!compact && !rows.length && !failed) return null
  const visible = [...rows].reverse().slice(0, expanded ? rows.length : 4)
  const local = rows.filter(row => row.delivery === 'LOCAL').length
  const conflicts = rows.filter(row => row.delivery === 'CONFLICT').length
  const reviews = rows.filter(row => row.review === 'PENDING_REVIEW').length
  const summary = failed ? t('attendanceCompact.unknown') : conflicts ? t('attendanceCompact.conflicts', { count: conflicts })
    : local ? t('attendanceCompact.saved', { count: local }) : rows.length ? t('attendanceCompact.received') : t('attendanceCompact.marksEmpty')
  const content = <>
    {!compact && <Text style={styles.title}>{t('attendanceReceipts.title')}</Text>}
    <Text style={styles.copy}>{t('attendanceReceipts.deviceHistory')}</Text>
    {failed && <Text accessibilityRole="alert" style={styles.warning}>{t('attendanceReceipts.loadFailed')}</Text>}
    {visible.map(row => <View key={row.operationId} testID={`attendance-receipt-${row.delivery.toLowerCase()}`} style={styles.row}>
      <Text style={styles.label}>{t(`attendanceReceipts.${row.action}`)} · {time(row.occurredAt)}</Text>
      <Text style={row.delivery === 'RECEIVED' ? styles.received : styles.warning}>{t(`attendanceReceipts.${row.delivery}`)}</Text>
      {row.receivedAt && <Text style={styles.copy}>{t('attendanceReceipts.receivedAt', { time: time(row.receivedAt) })}</Text>}
      {row.delivery === 'LOCAL' && <Text style={styles.copy}>{t('attendanceReceipts.reopenToSend')}</Text>}
      {row.delivery === 'CONFLICT' && <Text style={styles.copy}>{t('attendanceReceipts.conflictHelp')}</Text>}
      {row.review === 'PENDING_REVIEW' && <Text testID="attendance-receipt-delayed" style={styles.warning}>{t('attendanceReceipts.delayedAtDelivery')}</Text>}
    </View>)}
    {rows.length > 4 && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.button}>
      <Text style={styles.link}>{t(expanded ? 'attendanceReceipts.less' : 'attendanceReceipts.more', { count: rows.length })}</Text>
    </Pressable>}
    <Text style={styles.copy}>{t('attendanceReceipts.deliveryNotApproval')}</Text>
  </>
  return <View testID="attendance-delivery-receipts" style={compact ? styles.inline : styles.card}>
    {compact ? <>
      <AttendanceDisclosure title={t('attendanceCompact.marks')} summary={summary} icon="receipt-outline" controlID="attendance-receipts-disclosure" attention={failed || conflicts > 0 || local > 0}>
        {content}
      </AttendanceDisclosure>
      {failed && <Text accessibilityRole="alert" style={styles.warning}>{t('attendanceReceipts.loadFailed')}</Text>}
      {reviews > 0 && <Text testID="attendance-receipts-review-summary" style={styles.warning}>{t('attendanceCompact.review', { count: reviews })}</Text>}
    </> : content}
  </View>
}
const styles = themed(() => StyleSheet.create({
  card: { padding: 20, gap: 12, borderWidth: 1, borderRadius: 20, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  inline: { gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: fieldTheme.color.ink }, label: { fontSize: 15, fontWeight: '600', color: fieldTheme.color.ink },
  row: { gap: 5, paddingVertical: 10, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  copy: { fontSize: 14, lineHeight: 21, color: fieldTheme.color.inkMuted }, received: { fontSize: 15, color: fieldTheme.color.primaryStrong },
  warning: { fontSize: 14, lineHeight: 21, color: fieldTheme.color.amber }, button: { minHeight: 48, justifyContent: 'center' },
  link: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: '600' },
}))
