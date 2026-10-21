import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { OutboxOperation } from '../services/outbox'
import { attendanceMarkRejection, canReplaceAttendanceMark } from '../services/attendance-mark-recovery'
import { useWorkdayStore } from '../store/workday'
import { fieldTheme, themed } from '../theme/fieldTheme'

export default function AttendanceMarkRecoveryCard({ operation, refresh, installationBlocked = false, dependentEvents = false }: { dependentEvents?: boolean; installationBlocked?: boolean; operation: OutboxOperation | null; refresh: () => Promise<unknown> }) {
  const { t } = useTranslation(), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false)
  const writing = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const reason = operation && attendanceMarkRejection(operation)
  if (!operation || !reason) return null
  const replace = !dependentEvents && canReplaceAttendanceMark(operation)
  const awaitingInstallation = installationBlocked && (reason === 'installation' || reason === 'app')
  async function retry() {
    if (!operation || !replace || awaitingInstallation || writing.current) return
    writing.current = true; setBusy(true); setFailed(false)
    try { await useWorkdayStore.getState().retryAttendanceMark(operation.scopeKey, operation.operationId); if (mounted.current) await refresh() }
    catch { if (mounted.current) setFailed(true) }
    finally { writing.current = false; if (mounted.current) setBusy(false) }
  }
  return <View testID="attendance-mark-recovery" style={styles.card}>
    <Text style={styles.title}>{t(`attendanceLocation.${reason}Title`)}</Text>
    <Text style={styles.copy}>{t(`attendanceLocation.${reason}Body`)}</Text>
    <Text style={styles.copy}>{t(dependentEvents ? 'officeAttendance.dependentConflict' : awaitingInstallation ? 'attendanceInstallation.waitForApproval' : replace ? 'attendanceLocation.retryTime' : 'attendanceLocation.unknownReceipt')}</Text>
    {failed && <Text accessibilityRole="alert" style={styles.warning}>{t('attendanceLocation.retryFailed')}</Text>}
    {busy && <ActivityIndicator color={fieldTheme.color.primary} />}
    {replace && !awaitingInstallation && <Pressable testID="attendance-mark-retry" accessibilityRole="button" disabled={busy} onPress={() => void retry()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{t('attendanceLocation.retryMark')}</Text></Pressable>}
  </View>
}
const styles = themed(() => StyleSheet.create({
  card: { backgroundColor: fieldTheme.color.surface, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: fieldTheme.color.ink }, copy: { fontSize: 15, lineHeight: 23, color: fieldTheme.color.inkMuted },
  warning: { fontSize: 15, lineHeight: 23, color: fieldTheme.color.amber }, button: { minHeight: 50, padding: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: fieldTheme.color.primaryStrong },
  buttonText: { fontSize: 16, color: fieldTheme.color.onColor, fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.45 },
}))
