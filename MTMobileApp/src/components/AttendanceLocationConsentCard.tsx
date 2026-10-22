import { timeColor, useTimePresentation } from "../attendance/ui/TimeUI"
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { fieldTheme, themed } from '../theme/fieldTheme'
import { attendanceLocationScope, readAttendanceLocation, pendingAttendanceConsent, beginAttendanceConsent, sendAttendanceConsent } from '../services/attendance-location'
import type { OwnAttendanceLocation } from '../services/attendance-location-contract'
import type { OutboxOperation } from '../services/outbox'
import AttendanceDisclosure from './AttendanceDisclosure'

/**
 * `hideUntilEnabled`: say nothing while the company has not turned location
 * on and the person has nothing pending or given — the manager's «İş günü»
 * (owner, 2026-10-17). Without it the card explains that location is off.
 */
export default function AttendanceLocationConsentCard({ hideUntilEnabled = false, compact = false }: { hideUntilEnabled?: boolean; compact?: boolean } = {}) {
  const rhythm = useTimePresentation(), styles = rhythm ? rhythmStyles : legacyStyles
  const { t, i18n } = useTranslation()
  const agent = useAuthStore(state => state.agent), data = useBootstrapStore(state => state.data)
  const visible = data?.policies.attendanceMarkVersion === 1 && data.policies.agentPermissions?.attendanceLocation === true
  const [own, setOwn] = useState<OwnAttendanceLocation | null>(null), [pending, setPending] = useState<OutboxOperation | null>(null)
  const [open, setOpen] = useState(false), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [denied, setDenied] = useState(false)
  const epoch = useRef(0), writing = useRef(false)
  const key = `${agent?.organizationId}:${agent?.id}`
  const clear = () => { setOwn(null); setPending(null); setChecked(false); setDenied(true) }
  const load = useCallback(async () => {
    const ticket = ++epoch.current
    setBusy(true); setFailed(false); setChecked(false)
    try {
      const scope = attendanceLocationScope()
      const nextPending = await pendingAttendanceConsent(scope)
      if (ticket !== epoch.current) return
      setPending(nextPending)
      const next = await readAttendanceLocation(scope)
      if (ticket !== epoch.current) return
      setOwn(next); setDenied(false)
    } catch (error) {
      if (ticket !== epoch.current) return
      if ([401, 403, 404].includes((error as {status?: number})?.status ?? 0)) clear()
      else { setFailed(true) }
    } finally { if (ticket === epoch.current) setBusy(false) }
  }, [])
  useEffect(() => {
    setOwn(null); setPending(null); setChecked(false); setOpen(false); setDenied(false); writing.current = false
    if (visible) void load()
    return () => { epoch.current += 1 }
  }, [visible, key, load])
  async function change(accepted: boolean, retry = false) {
    if (writing.current || busy || denied || (!retry && (!own || (accepted && !checked)))) return
    const ticket = epoch.current
    writing.current = true; setBusy(true); setFailed(false); setChecked(false)
    try {
      const scope = attendanceLocationScope()
      // The durable record survives unmount/restart. Never retry with a new UUID.
      const item = retry ? pending : await beginAttendanceConsent(scope, own!, accepted)
      if (ticket !== epoch.current || !item) return
      setPending(item)
      await sendAttendanceConsent(scope, item)
      if (ticket !== epoch.current) return
      writing.current = false
      await load()
    } catch (error) {
      if (ticket !== epoch.current) return
      if ([401, 403, 404].includes((error as {status?: number})?.status ?? 0)) clear()
      else {
        setFailed(true)
        if ([400, 409, 413, 422].includes((error as {status?: number})?.status ?? 0)) setOwn(null)
        try { const item = await pendingAttendanceConsent(attendanceLocationScope()); if (ticket === epoch.current) setPending(item) } catch { /* Remain locked on unknown outcome. */ }
      }
    } finally { if (ticket === epoch.current) { writing.current = false; setBusy(false) } }
  }
  if (!visible) return null
  if (hideUntilEnabled && own?.policy?.enabled !== true && own?.consent?.accepted !== true && !pending) return null
  const locale = i18n.language.startsWith('az') ? 'az' : i18n.language.startsWith('ru') ? 'ru' : 'en'
  const awaiting = pending?.status === 'pending', conflict = pending?.status === 'conflict'
  const on = own?.maySendLocation === true && !pending && !failed
  const canAccept = own?.policy?.enabled === true && own.policy.legalReviewConfirmed === true && !on && !failed
  const summary = denied ? t('attendanceLocation.unavailable') : failed ? t('attendanceCompact.unknown') : awaiting
    ? t(pending?.data.accepted === false ? 'attendanceLocation.pendingWithdrawal' : 'attendanceLocation.pending')
    : busy && !own ? t('attendanceCompact.loading') : t(on ? 'attendanceLocation.accepted' : 'attendanceLocation.off')
  const content = <>
    {!compact && <Text style={styles.title}>{t('attendanceLocation.title')}</Text>}
    <Text style={styles.status}>{t(on ? 'attendanceLocation.accepted' : 'attendanceLocation.off')}</Text>
    <Text style={styles.copy}>{t('attendanceLocation.summary')}</Text>
    <Text style={styles.copy}>{t('attendanceLocation.noGps')}</Text>
    {busy && <ActivityIndicator color={fieldTheme.color.primary} />}
    {denied ? <Text testID="attendance-location-denied" style={styles.copy}>{t('attendanceLocation.unavailable')}</Text> : <>
      {!own?.policy?.enabled && !failed && !busy && <Text style={styles.copy}>{t('attendanceLocation.noText')}</Text>}
      {failed && <Text accessibilityRole="alert" style={styles.warning}>{t('attendanceLocation.failed')}</Text>}
      {awaiting && <Text testID="attendance-consent-pending" style={styles.warning}>{t(pending?.data.accepted === false ? 'attendanceLocation.pendingWithdrawal' : 'attendanceLocation.pending')}</Text>}
      {conflict && <Text style={styles.warning}>{t('attendanceLocation.changed')}</Text>}
      {own?.policy?.enabled && <Pressable testID="attendance-consent-disclosure" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.button}><Text style={styles.buttonText}>{t(open ? 'attendanceLocation.hideText' : 'attendanceLocation.showText')}</Text></Pressable>}
      {open && own?.policy && <>
        <Text testID="attendance-consent-text" style={styles.legal}>{own.policy.texts[locale]}</Text>
        {canAccept && !awaiting && <>
          <View style={styles.checkRow}><Switch testID="attendance-consent-check" accessibilityLabel={t('attendanceLocation.confirm')} value={checked} onValueChange={setChecked} disabled={busy} /><Text style={[styles.copy, styles.grow]}>{t('attendanceLocation.confirm')}</Text></View>
          <Pressable testID="attendance-consent-accept" accessibilityRole="button" disabled={busy || !checked} onPress={() => void change(true)} style={[styles.button, styles.primary, (busy || !checked) && styles.disabled]}><Text style={styles.white}>{t('attendanceLocation.accept')}</Text></Pressable>
        </>}
      </>}
      {own?.consent?.accepted && !awaiting && <Pressable testID="attendance-consent-revoke" accessibilityRole="button" disabled={busy} onPress={() => void change(false)} style={styles.button}><Text style={styles.buttonText}>{t('attendanceLocation.revoke')}</Text></Pressable>}
      {awaiting && <Pressable testID="attendance-consent-retry" accessibilityRole="button" disabled={busy} onPress={() => void change(false, true)} style={styles.button}><Text style={styles.buttonText}>{t('attendanceLocation.retry')}</Text></Pressable>}
      <Pressable testID="attendance-consent-refresh" accessibilityRole="button" disabled={busy || writing.current} onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>{t('attendanceLocation.refresh')}</Text></Pressable>
    </>}
  </>
  return <View testID="attendance-location-card" style={compact ? styles.inline : styles.card}>
    {compact ? <AttendanceDisclosure title={t('attendanceCompact.location')} summary={summary} icon="location-outline" controlID="attendance-location-disclosure" summaryTestID={on ? "attendance-consent-active" : undefined}
      attention={failed || awaiting || conflict} initiallyOpen={canAccept || failed || awaiting || conflict}>{content}</AttendanceDisclosure> : content}
  </View>
}
const legacyStyles = themed(() => StyleSheet.create({
  inline: { gap: 10 },
  card: { backgroundColor: fieldTheme.color.surface, borderRadius: 20, borderWidth: 1, borderColor: fieldTheme.color.border, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: fieldTheme.color.ink }, status: { fontSize: 16, fontWeight: '600', color: fieldTheme.color.primaryStrong },
  copy: { fontSize: 15, lineHeight: 23, color: fieldTheme.color.inkMuted }, legal: { fontSize: 16, lineHeight: 25, color: fieldTheme.color.ink },
  warning: { fontSize: 15, lineHeight: 23, color: fieldTheme.color.amber }, button: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 12 },
  buttonText: { fontSize: 16, color: fieldTheme.color.primaryStrong, fontWeight: '600', textAlign: 'center' }, primary: { backgroundColor: fieldTheme.color.primaryStrong }, white: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.45 }, checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, grow: { flex: 1 },
}))

const rhythmStyles = themed(() => StyleSheet.create({ ...legacyStyles, copy: { fontSize: 15, lineHeight: 23, color: timeColor.muted }, warning: { fontSize: 15, lineHeight: 23, color: timeColor.amber }, status: { color: timeColor.accent, fontSize: 16, fontWeight: '700' }, legal: { fontSize: 16, lineHeight: 25, color: timeColor.ink }, button: { minHeight: 48, padding: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: timeColor.inset }, buttonText: { color: timeColor.accent, fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' }, primary: { backgroundColor: timeColor.fill } }))
