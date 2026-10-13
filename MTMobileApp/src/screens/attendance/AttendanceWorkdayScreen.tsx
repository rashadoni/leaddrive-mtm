import AttendanceLocationConsentCard from "../../components/AttendanceLocationConsentCard"
import AttendanceMarkRecoveryCard from '../../components/AttendanceMarkRecoveryCard'
import { useAttendanceMarkRecovery } from '../../hooks/useAttendanceMarkRecovery'
import { canReturnToWorkday, returnToClosedWorkday } from '../../services/workday-return'
import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { useWorkdayStore, workdayKey } from "../../store/workday"
import { hasOfficeAttendanceAccess } from "../../services/attendance-access"
import { changeAttendanceWorkday, refreshAttendanceSession } from "../../services/attendance-session"
import { officeAttendanceScope, guardOfficeAttendance } from "../../services/attendance-session-guard"
import { allOutboxOperations, type OutboxOperation } from "../../services/outbox"
import { ask } from "../../services/app-feedback"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"

function dateKey(timezone: string | null) {
  try { const parts = new Intl.DateTimeFormat("en", { timeZone: timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}` } catch { return "" }
}
export default function AttendanceWorkdayScreen() {
  const { t, i18n } = useTranslation(), navigation = useNavigation()
  const top = useHeaderTop(), bottom = useTabBarPadding()
  const agent = useAuthStore(state => state.agent), bootstrap = useBootstrapStore(state => state.data)
  const active = useWorkdayStore(state => state.activeWorkday), finished = useWorkdayStore(state => state.finishedWorkday)
  const hydrated = useWorkdayStore(state => state.hydrated)
  const [operations, setOperations] = useState<OutboxOperation[]>([])
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState(false)
  const [returnRefusal, setReturnRefusal] = useState<{ key: string; workdayId: string; reason: 'notToday' | 'locked' } | null>(null)
  const recovery = useAttendanceMarkRecovery()
  const mounted = useRef(true), busyRef = useRef(false)
  const key = workdayKey(agent?.organizationId, agent?.id), allowed = hasOfficeAttendanceAccess(bootstrap, agent)
  const current = active?.key === key ? active : null
  const pending = current?.syncState === "START_PENDING" || current?.syncState === "FINISH_PENDING" || operations.some(item => item.status === "pending")
  const conflict = operations.some(item => item.status === "conflict" && current
    && (item.data.id === current.workdayId || item.data.workdayId === current.workdayId))
  const completed = !current && (bootstrap?.workday?.status === "COMPLETED" && bootstrap.workday.workDate?.slice(0, 10) === dateKey(bootstrap.timezone))
  const refused = returnRefusal?.key === key && returnRefusal.workdayId === bootstrap?.workday?.id ? returnRefusal.reason : null
  const returnable = completed && canReturnToWorkday(bootstrap?.policies) && !refused
  const open = current?.syncState === "CONFIRMED"
  const paused = open && current.paused
  const loadQueue = useCallback(async () => {
    const scope = officeAttendanceScope()
    const items = await allOutboxOperations(); guardOfficeAttendance(scope)
    if (mounted.current) setOperations(items.filter(item => item.entity === "workdays"))
  }, [])
  const refresh = useCallback(async () => {
    if (busyRef.current) return
    setRefreshing(true)
    try { await refreshAttendanceSession(); await loadQueue(); if (mounted.current) setError(false) }
    catch { if (mounted.current) setError(true) }
    finally { if (mounted.current) setRefreshing(false) }
  }, [loadQueue])
  useAutoRefresh(() => { void refresh() })
  useEffect(() => { mounted.current = true; if (allowed) void loadQueue().catch(() => {}); else setOperations([]); return () => { mounted.current = false } }, [allowed, key, loadQueue])
  async function change(action: "start" | "end" | "pause" | "resume") {
    if (busyRef.current || !allowed || !hydrated || pending || conflict || completed || recovery.operation) return
    const scope = officeAttendanceScope()
    busyRef.current = true; setBusy(true); setError(false)
    try {
      if (action === "end") {
        const confirmed = await ask({ title: t("officeAttendance.finishTitle"), message: t("officeAttendance.finishBody"), buttons: [{ text: t("officeAttendance.keepOpen"), value: false, style: "cancel" }, { text: t("officeAttendance.finish"), value: true }], dismissValue: false })
        if (!confirmed || !mounted.current) return
      }
      guardOfficeAttendance(scope)
      await changeAttendanceWorkday(action)
      if (!mounted.current) return
      await loadQueue()
      await refreshAttendanceSession()
      if (!mounted.current) return
      await loadQueue()
    } catch { if (mounted.current) setError(true) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  async function returnToWork() {
    if (busyRef.current || !allowed || !hydrated || !returnable || pending || !bootstrap?.workday?.id) return
    const scope = officeAttendanceScope(), workdayId = bootstrap.workday.id
    const guard = () => { guardOfficeAttendance(scope); if (!mounted.current) throw new Error('ATTENDANCE_SCREEN_CLOSED') }
    busyRef.current = true; setBusy(true); setError(false)
    try {
      const outcome = await returnToClosedWorkday(scope, workdayId, guard); guard()
      if (outcome === 'notToday' || outcome === 'locked') setReturnRefusal({ key: scope, workdayId, reason: outcome })
      await refreshAttendanceSession(); guard(); await loadQueue()
    } catch { if (mounted.current) setError(true) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  function time(value?: string) {
    if (!value) return "—"
    try { return new Date(value).toLocaleString(i18n.language, { timeZone: bootstrap?.timezone ?? "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) } catch { return "—" }
  }
  const state = pending ? "waiting" : paused ? "paused" : open ? "running" : completed ? "completed" : "notStarted"
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: top }]}><Text style={styles.brand}>{t("officeAttendance.myAttendance")}</Text><Text style={styles.title}>{t("officeAttendance.workday")}</Text></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {!allowed ? <Text testID="office-workday-unavailable" style={styles.muted}>{t("officeAttendance.unavailable")}</Text> : <>
        <View style={styles.card}>
          <Text style={styles.status}>{t(`officeAttendance.${state}`)}</Text>
          <Text style={styles.name}>{agent?.name}</Text>
          <Text style={styles.clock}>{time(completed ? bootstrap?.workday?.completedAt ?? (finished?.key === key ? finished.finishedAt : undefined) : current?.startedAt)}</Text>
          <Text style={styles.muted}>{t(completed ? "officeAttendance.finishedAt" : "officeAttendance.startedAt")}</Text>
          {paused && <Text style={styles.muted}>{t("officeAttendance.pausedAt", { time: time(current?.pausedAt) })}</Text>}
          {pending && <Text testID="office-workday-pending" style={styles.notice}>{t("officeAttendance.pendingHint")}</Text>}
          {conflict && <Text testID="office-workday-conflict" style={styles.error}>{t("officeAttendance.conflict")}</Text>}
          {error && <Text accessibilityRole="alert" style={styles.error}>{t("officeAttendance.failed")}</Text>}
          {returnable && <Text style={styles.muted}>{t('officeAttendance.returnHint')}</Text>}
          {refused && <Text accessibilityRole="alert" style={styles.error}>{t(refused === 'locked' ? 'officeAttendance.returnLocked' : 'officeAttendance.returnNotToday')}</Text>}
          {busy && <ActivityIndicator color={fieldTheme.color.primary} />}
          <View style={styles.actions}>
            {open && <Pressable testID="office-workday-break" accessibilityRole="button" disabled={busy || pending || conflict} onPress={() => void change(paused ? "resume" : "pause")} style={[styles.button, styles.secondary, (busy || pending || conflict) && styles.disabled]}><Text style={styles.secondaryText}>{t(paused ? "officeAttendance.resume" : "officeAttendance.pause")}</Text></Pressable>}
            {!completed && !recovery.operation && <Pressable testID="office-workday-action" accessibilityRole="button" disabled={busy || !hydrated || pending || conflict} onPress={() => void change(open ? "end" : "start")} style={[styles.button, (busy || !hydrated || pending || conflict) && styles.disabled]}><Text style={styles.buttonText}>{t(open ? "officeAttendance.finish" : "officeAttendance.start")}</Text></Pressable>}
            {returnable && <Pressable testID="office-workday-return" accessibilityRole="button" disabled={busy || !hydrated || pending} onPress={() => void returnToWork()} style={[styles.button, (busy || !hydrated || pending) && styles.disabled]}><Text style={styles.buttonText}>{t('officeAttendance.returnToWork')}</Text></Pressable>}
          </View>
          <Text style={styles.muted}>{t("officeAttendance.closeHint")}</Text>
        </View>
        <AttendanceMarkRecoveryCard operation={recovery.operation} refresh={async () => { await refresh(); await recovery.reload() }} />
        <Text style={styles.muted}>{t("officeAttendance.noTracking")}</Text>
        <AttendanceLocationConsentCard />
        {bootstrap?.policies.agentPermissions?.attendanceRequests === true && <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => navigation.navigate("OwnRequests" as never)}><Text style={styles.secondaryText}>{t("attendanceRequests.title")}</Text></Pressable>}
        <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => navigation.navigate("OwnInbox" as never)}><Text style={styles.secondaryText}>{t("officeAttendance.inbox")}</Text></Pressable>
        <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => navigation.navigate("OwnProfile" as never)}><Text style={styles.secondaryText}>{t("officeAttendance.profile")}</Text></Pressable>
      </>}
    </ScrollView>
  </View>
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas }, header: { backgroundColor: fieldTheme.color.primaryStrong, padding: 24, gap: 8 }, brand: { color: fieldTheme.color.onColor, fontSize: 13 }, title: { color: fieldTheme.color.onColor, fontSize: 27, fontWeight: "700" }, content: { padding: 20, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 22, padding: 22, gap: 16 }, status: { color: fieldTheme.color.primary, fontSize: 15, fontWeight: "700" }, name: { fontSize: 20, color: fieldTheme.color.ink, fontWeight: "600" }, clock: { fontSize: 27, fontWeight: "700", color: fieldTheme.color.primaryStrong }, muted: { fontSize: 15, lineHeight: 23, color: fieldTheme.color.inkMuted }, notice: { color: fieldTheme.color.amber, lineHeight: 22 }, error: { color: fieldTheme.color.danger, lineHeight: 22 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, button: { minHeight: 50, padding: 14, justifyContent: "center", alignItems: "center", backgroundColor: fieldTheme.color.primaryStrong, borderRadius: 12, flexGrow: 1 }, buttonText: { color: fieldTheme.color.onColor, fontSize: 16, fontWeight: "700", textAlign: "center" }, secondary: { backgroundColor: fieldTheme.color.surface, borderColor: fieldTheme.color.border, borderWidth: 1 }, secondaryText: { color: fieldTheme.color.primaryStrong, fontSize: 16, fontWeight: "600", textAlign: "center" }, disabled: { opacity: 0.45 },
})
