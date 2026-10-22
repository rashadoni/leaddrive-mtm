import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { hasOfficeAttendanceAccess } from '../services/attendance-access'
import { attendanceReceiptAccount } from '../services/attendance-receipts'
import { loadOwnAttendanceMarks, type OwnAttendanceMarks } from '../services/attendance-own-marks'
import { fieldTheme, themed } from '../theme/fieldTheme'

export default function AttendanceOwnMarkDetails({ workdayId }: { workdayId?: string }) {
  const { t, i18n } = useTranslation(), auth = useAuthStore(), data = useBootstrapStore(state => state.data)
  const allowed = auth.isLoggedIn && hasOfficeAttendanceAccess(data, auth.agent)
  const identity = JSON.stringify([auth.serverDomain, auth.agent?.organizationId, auth.agent?.id, workdayId, allowed, !!data?.attendanceOffline])
  const [view, setView] = useState<{ identity: string; report: OwnAttendanceMarks | null; busy: boolean; failed: boolean }>({ identity: '', report: null, busy: false, failed: false })
  const epoch = useRef(0)
  useEffect(() => { epoch.current++; setView({ identity, report: null, busy: false, failed: false }); return () => { epoch.current++ } }, [identity])
  if (!allowed || !workdayId) return null
  const own = view.identity === identity ? view : null, report = own?.report
  const load = async () => {
    if (own?.busy || data?.attendanceOffline) return
    const account = attendanceReceiptAccount(); if (!account) return
    const ticket = ++epoch.current
    const guard = () => { if (ticket !== epoch.current) throw new Error('ATTENDANCE_SCREEN_CLOSED') }
    setView({ identity, report: null, busy: true, failed: false })
    try { const next = await loadOwnAttendanceMarks(account, workdayId, guard); guard(); setView({ identity, report: next, busy: false, failed: false }) }
    catch { if (ticket === epoch.current) setView({ identity, report: null, busy: false, failed: true }) }
  }
  const clock = (value: string) => new Date(value).toLocaleString(i18n.language, { timeZone: report?.timezone ?? 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return <View testID="attendance-mark-details" style={styles.card}>
    <Text style={styles.title}>{t('attendanceMarks.title')}</Text>
    <Text style={styles.copy}>{t('attendanceMarks.historical')}</Text>
    <Pressable testID="attendance-mark-details-load" accessibilityRole="button" disabled={!!own?.busy || !!data?.attendanceOffline} style={styles.button} onPress={() => void load()}>
      <Text style={styles.link}>{t(report ? 'attendanceMarks.refresh' : 'attendanceMarks.open')}</Text>
    </Pressable>
    {own?.busy && <ActivityIndicator />}
    {data?.attendanceOffline && <Text style={styles.copy}>{t('attendanceMarks.offline')}</Text>}
    {own?.failed && <Text accessibilityRole="alert" style={styles.copy}>{t('attendanceMarks.failed')}</Text>}
    {report && <>
      <Text style={styles.copy}>{t('attendanceMarks.updated', { time: clock(report.updatedAt) })}</Text>
      {!report.items.length && <Text style={styles.copy}>{t('attendanceMarks.empty')}</Text>}
      {report.items.map(mark => <View key={mark.eventId} style={styles.row}>
        <Text style={styles.label}>{t(`attendanceReceipts.${mark.action}`)} · {clock(mark.claimedAt)}</Text>
        <Text style={styles.copy}>{t(`attendanceMarks.${mark.location.state}`)}</Text>
        {mark.location.branchName && <Text style={styles.copy}>{mark.location.branchName}</Text>}
        {mark.location.coordinates && <Text testID="attendance-own-coordinates" style={styles.copy}>{t('attendanceMarks.coordinates', { latitude: mark.location.coordinates.latitude.toFixed(5), longitude: mark.location.coordinates.longitude.toFixed(5) })}</Text>}
        {mark.location.accuracyMeters !== null && <Text style={styles.copy}>{t('attendanceMarks.accuracy', { meters: Math.round(mark.location.accuracyMeters) })}</Text>}
        {mark.location.capturedAt && <Text style={styles.copy}>{t('attendanceMarks.captured', { time: clock(mark.location.capturedAt) })}</Text>}
        {mark.location.distanceMeters !== null && <Text style={styles.copy}>{t('attendanceMarks.distance', { meters: Math.round(mark.location.distanceMeters) })}</Text>}
        {mark.qr && <Text style={styles.copy}>{t(mark.qr.state === 'VERIFIED' ? 'attendanceQr.verified' : `attendanceQr.${mark.qr.state}`)}{mark.qr.branchName ? ` · ${mark.qr.branchName}` : ''}</Text>}
        {mark.review.openCases > 0 && <Text style={styles.copy}>{t('attendanceMarks.openCases', { count: mark.review.openCases })}</Text>}
        {mark.review.closedCases > 0 && <Text style={styles.copy}>{t('attendanceMarks.closedCases', { count: mark.review.closedCases })}</Text>}
      </View>)}
      {report.hasMore && <Text style={styles.copy}>{t('attendanceMarks.partial')}</Text>}
      <Text style={styles.copy}>{t('attendanceMarks.dispute')}</Text>
      <Pressable testID="attendance-mark-details-close" accessibilityRole="button" style={styles.button} onPress={() => { epoch.current++; setView({ identity, report: null, busy: false, failed: false }) }}><Text style={styles.link}>{t('attendanceMarks.close')}</Text></Pressable>
    </>}
  </View>
}
const styles = themed(() => StyleSheet.create({
  card: { padding: 20, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  title: { fontSize: 18, fontWeight: '700', color: fieldTheme.color.ink }, label: { fontSize: 15, fontWeight: '600', color: fieldTheme.color.ink },
  copy: { fontSize: 14, lineHeight: 21, color: fieldTheme.color.inkMuted }, row: { gap: 6, borderTopWidth: 1, borderTopColor: fieldTheme.color.border, paddingTop: 12 },
  button: { minHeight: 48, justifyContent: 'center' }, link: { fontSize: 15, fontWeight: '600', color: fieldTheme.color.primaryStrong },
}))
