import { TimeText as Text } from "../../attendance/ui/TimeText"
import AttendanceDisclosure from "../../components/AttendanceDisclosure"
import TimeDateField from "../../attendance/ui/TimeDateField"
import { TimeHeader, TimeFilters, timeColor, timeStyles, useTimePresentation } from "../../attendance/ui/TimeUI"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { mayUseOwnAttendanceRequests } from "../../services/attendance-access"
import { getOfflineScope } from "../../services/offline-scope"
import { ATTENDANCE_KINDS, attendanceDate, attendanceErrorKey, attendanceNeedsHours, attendanceUuid, validAttendanceInput, type AttendanceDocument, type AttendanceInput, type AttendanceKind, type AttendanceQuota, type AttendanceRequest } from "../../services/attendance-contract"
import { attendanceAccessDenied, attendanceGuard, attendanceQueued, attendanceScope, cachedAttendanceRequests, clearAttendanceCache, discardAttendanceDraftDocuments, keepAttendanceDocument, loadAttendanceQuota, loadAttendanceRequests, queueAttendanceCancellation, queueAttendanceRequest } from "../../services/attendance-requests"
import { retryOutboxConflict, type OutboxOperation } from "../../services/outbox"
import { runMobileSync } from "../../services/sync-engine"
import { ask } from "../../services/app-feedback"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { attendanceCorrectionDraft, type AttendanceCorrectionIntent } from '../../services/attendance-correction-intent'

function today(timezone: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: timezone ?? undefined, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
    return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}-${parts.find(part => part.type === "day")!.value}`
  } catch { return new Date().toISOString().slice(0, 10) }
}
function newDraft(date: string): AttendanceInput {
  return { clientRequestId: attendanceUuid(), kind: "ANNUAL_LEAVE", unit: "DAYS", startDate: date, endDate: date, reason: "", attachmentIds: [] }
}

export default function AttendanceRequestsScreen({ route }: { route?: { params?: { correction?: AttendanceCorrectionIntent } } } = {}) {
  const { t, i18n } = useTranslation()
  const rhythm = useTimePresentation(), styles = rhythm ? rhythmStyles : legacyStyles
  const [filter, setFilter] = useState<"all" | "waiting">("all"), [kindOpen, setKindOpen] = useState(false)
  const scroll = useRef<ScrollView>(null)
  const navigation = useNavigation()
  const headerTop = useHeaderTop()
  const bottom = useTabBarPadding()
  const agent = useAuthStore(state => state.agent)
  const server = useAuthStore(state => state.serverDomain)
  const bootstrap = useBootstrapStore(state => state.data)
  const admission = useBootstrapStore(state => state.routeFieldAccess)
  const allowed = mayUseOwnAttendanceRequests(bootstrap, agent, admission)
  const [draft, setDraft] = useState(() => newDraft(today(bootstrap?.timezone ?? null)))
  const [editing, setEditing] = useState(false)
  useEffect(() => { setKindOpen(false); if (rhythm) scroll.current?.scrollTo({ y: 0, animated: false }) }, [editing, rhythm])
  const [documents, setDocuments] = useState<AttendanceDocument[]>([])
  const [camera, setCamera] = useState(false)
  const [items, setItems] = useState<AttendanceRequest[]>([])
  const [queued, setQueued] = useState<OutboxOperation[]>([])
  const [quota, setQuota] = useState<AttendanceQuota | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [noticeKey, setNoticeKey] = useState<string | null>(null)
  const [suggestedCorrection, setSuggestedCorrection] = useState<AttendanceInput | null>(null)
  const consumedCorrection = useRef<string | null>(null)
  const epoch = useRef(0)
  const busyRef = useRef(false)
  const draftScope = useRef<string | null>(null)
  const draftDocuments = useRef<AttendanceDocument[]>([])
  const pendingDraftWrite = useRef<Promise<unknown> | null>(null)
  const lifecycle = useRef(0)
  const mounted = useRef(true)
  const releaseDraft = useCallback(() => {
    const abandoned = draftDocuments.current
    draftDocuments.current = []
    if (!abandoned.length) return
    // A pending/ambiguous durable write may already own the files. Wait for it,
    // then inspect all account queues under their storage lock before deleting.
    void Promise.resolve(pendingDraftWrite.current).catch(() => {}).then(() => discardAttendanceDraftDocuments(abandoned)).catch(() => {})
  }, [])
  const month = attendanceDate(draft.startDate) ? draft.startDate.slice(0, 7) : today(bootstrap?.timezone ?? null).slice(0, 7)
  const clear = useCallback(() => {
    lifecycle.current += 1; releaseDraft(); busyRef.current = false
    setBusy(false); setLoading(false); setItems([]); setQueued([]); setQuota(null); setNextCursor(null); setUpdatedAt(null); setDocuments([]); setEditing(false); setCamera(false)
    setSuggestedCorrection(null); setFilter("all"); setKindOpen(false)
  }, [releaseDraft])
  const load = useCallback(async (more = false) => {
    if (!allowed || denied) return
    let scope: string
    try { scope = attendanceScope() } catch { clear(); return }
    const ticket = ++epoch.current
    const current = () => ticket === epoch.current && getOfflineScope() === scope
    setLoading(true)
    try {
      const cache = await cachedAttendanceRequests(scope)
      if (!current()) return
      if (!more) { setItems(cache.items); setUpdatedAt(cache.updatedAt); setNextCursor(cache.nextCursor) }
      const pending = await attendanceQueued(scope)
      if (!current()) return
      setQueued(pending)
      const [list, limits] = await Promise.allSettled([
        loadAttendanceRequests(scope, more ? nextCursor ?? undefined : undefined), loadAttendanceQuota(scope, month),
      ])
      if (!current()) return
      const rejected = [list, limits].find(result => result.status === "rejected" && attendanceAccessDenied(result.reason))
      if (rejected) { clear(); setDenied(true); return }
      if (list.status === "fulfilled") {
        setItems(list.value.items); setNextCursor(list.value.nextCursor); setUpdatedAt(list.value.updatedAt); setOffline(false)
      } else setOffline(true)
      setQuota(limits.status === "fulfilled" ? limits.value : null)
      const refreshedQueue = await attendanceQueued(scope)
      if (current()) setQueued(refreshedQueue)
    } catch (error) {
      if (!current()) return
      if (attendanceAccessDenied(error)) { clear(); setDenied(true) } else setOffline(true)
    } finally { if (current()) setLoading(false) }
  }, [allowed, denied, clear, month, nextCursor])
  const loadRef = useRef(load); loadRef.current = load
  useAutoRefresh(() => { void loadRef.current() })
  useEffect(() => {
    mounted.current = true; epoch.current += 1
    clear(); setDenied(false); setErrorKey(null); setNoticeKey(null); setLoading(false)
    if (!allowed) {
      const scope = getOfflineScope()
      if (scope) void clearAttendanceCache(scope).catch(() => {})
    } else { draftScope.current = getOfflineScope(); setDraft(newDraft(today(bootstrap?.timezone ?? null))); void loadRef.current() }
    return () => { mounted.current = false; lifecycle.current += 1; epoch.current += 1; releaseDraft() }
  }, [agent?.id, agent?.organizationId, server, allowed, clear, releaseDraft, bootstrap?.timezone])
  useEffect(() => { setQuota(null); void loadRef.current() }, [month])
  const correction = route?.params?.correction
  useEffect(() => {
    if (!allowed || denied || !correction || consumedCorrection.current === correction.requestKey) return
    const input = attendanceCorrectionDraft(correction, { scope: `${agent?.organizationId}:${agent?.id}`, server, timezone: bootstrap?.timezone })
    if (!input) return
    consumedCorrection.current = correction.requestKey
    // An existing form (and its attachments) is never silently overwritten.
    if (editing || busyRef.current) { setSuggestedCorrection(input); return }
    draftScope.current = getOfflineScope(); setDraft(input); setEditing(true); setErrorKey(null); setNoticeKey(null)
  }, [correction, allowed, denied, agent?.id, agent?.organizationId, server, bootstrap?.timezone, editing])
  const change = (patch: Partial<AttendanceInput>) => { setDraft(value => ({ ...value, ...patch })); setErrorKey(null) }
  const changeKind = (kind: AttendanceKind) => {
    if (kind === draft.kind) return
    change({ kind, ...(attendanceNeedsHours(kind) ? { unit: "HOURS", endDate: draft.startDate, startTime: draft.startTime ?? "09:00", endTime: draft.endTime ?? "18:00" } : {}) })
  }
  const enter = () => { lifecycle.current += 1; releaseDraft(); draftScope.current = getOfflineScope(); setDraft(newDraft(today(bootstrap?.timezone ?? null))); setDocuments([]); setEditing(true); setErrorKey(null); setNoticeKey(null) }
  const closeDraft = async () => {
    if (busyRef.current) return
    lifecycle.current += 1; releaseDraft()
    setDocuments([]); setEditing(false); setCamera(false); setErrorKey(null)
  }
  const act = async (operation: (scope: string) => Promise<unknown>, submitted = false) => {
    if (!mounted.current || busyRef.current) return
    let scope: string
    try { scope = attendanceScope() } catch { setDenied(true); clear(); return }
    const ticket = lifecycle.current
    const current = () => mounted.current && lifecycle.current === ticket && getOfflineScope() === scope
    busyRef.current = true; setBusy(true); setErrorKey(null); setNoticeKey(null)
    try {
      await operation(scope)
      if (!current()) return
      attendanceGuard(scope)
      if (submitted) { draftDocuments.current = []; setDocuments([]); setEditing(false) }
      if (submitted) setNoticeKey("attendanceRequests.queuedNotice")
      const pending = await attendanceQueued(scope)
      if (!current()) return
      setQueued(pending)
      // The durable write is complete. A missing answer here cannot lose it.
      await runMobileSync()
      if (!current()) return
      attendanceGuard(scope)
      await loadRef.current()
    } catch (error) {
      if (!current()) return
      if (attendanceAccessDenied(error)) { clear(); setDenied(true) }
      else setErrorKey(attendanceErrorKey(error))
    } finally { if (current()) { busyRef.current = false; setBusy(false) } }
  }
  const submit = () => {
    const input = { ...draft, reason: draft.reason.trim(), attachmentIds: [] }
    if (!validAttendanceInput(input)) { setErrorKey("attendanceRequests.invalid"); return }
    const owner = draftScope.current
    void act(scope => {
      if (owner !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
      const writing = queueAttendanceRequest(scope, input, documents)
      pendingDraftWrite.current = writing
      return writing.finally(() => { if (pendingDraftWrite.current === writing) pendingDraftWrite.current = null })
    }, true)
  }
  const cancel = async (request: AttendanceRequest) => {
    const owner = getOfflineScope(), ticket = lifecycle.current
    const confirmed = await ask({ title: t("attendanceRequests.cancelTitle"), message: t("attendanceRequests.cancelBody"), tone: "warning", dismissValue: false,
      buttons: [{ text: t("attendanceRequests.keep"), value: false, style: "cancel" }, { text: t("attendanceRequests.cancel"), value: true, style: "destructive" }] })
    if (confirmed && mounted.current && lifecycle.current === ticket && getOfflineScope() === owner) await act(scope => queueAttendanceCancellation(scope, request))
  }
  const capture = async (path: string) => {
    if (busyRef.current || documents.length >= 3) return
    let scope: string
    try { scope = attendanceScope(); if (scope !== draftScope.current) return } catch { return }
    const ticket = lifecycle.current
    const current = () => mounted.current && lifecycle.current === ticket && getOfflineScope() === scope
    let captured: AttendanceDocument | undefined
    busyRef.current = true; setBusy(true)
    try {
      captured = await keepAttendanceDocument(scope, path)
      if (!current()) { await discardAttendanceDraftDocuments([captured]); return }
      attendanceGuard(scope)
      draftDocuments.current = [...draftDocuments.current, captured]
      setDocuments(draftDocuments.current)
    } catch {
      if (captured) await discardAttendanceDraftDocuments([captured]).catch(() => {})
      if (current()) setErrorKey("attendanceRequests.documentFailed")
    } finally { if (current()) { busyRef.current = false; setBusy(false) } }
  }
  const removePhoto = (document: AttendanceDocument) => {
    if (busyRef.current) return
    draftDocuments.current = draftDocuments.current.filter(row => row.clientAttachmentId !== document.clientAttachmentId)
    setDocuments(draftDocuments.current)
    void discardAttendanceDraftDocuments([document]).catch(() => {})
  }
  const button = (label: string, onPress: () => void, testID: string, primary = false, disabled = false) => (
    <Pressable key={testID} testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.primary, disabled && styles.disabled, rhythm && pressed && timeStyles.pressed]}>
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  )
  const field = (key: "startDate" | "endDate" | "startTime" | "endTime" | "reason", label: string, placeholder?: string) => rhythm && key !== "reason" ? <TimeDateField key={key} testID={`attendance-${key}`} label={label} value={draft[key] ?? ""} disabled={busy} time={key.includes("Time")}
    onChange={value => change({ [key]: value, ...(key === "startDate" && draft.unit === "HOURS" && (draft.kind !== "TIME_CORRECTION" || draft.endDate === draft.startDate) ? { endDate: value } : {}) })} /> : (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={`attendance-${key}`} accessibilityLabel={label} value={draft[key] ?? ""} placeholder={placeholder}
        placeholderTextColor={fieldTheme.color.inkMuted} editable={!busy} multiline={key === "reason"} maxLength={key === "reason" ? 1000 : key.includes("Date") ? 10 : 5}
        autoCapitalize="none" autoCorrect={false} style={[styles.input, key === "reason" && styles.reason]}
        onChangeText={value => change({ [key]: value, ...(key === "startDate" && draft.unit === "HOURS" && (draft.kind !== "TIME_CORRECTION" || draft.endDate === draft.startDate) ? { endDate: value } : {}) })} />
      {rhythm && key === "reason" && errorKey === "attendanceRequests.invalid" && draft.reason.trim().length < 3 && <Text testID="attendance-reason-error" accessibilityRole="alert" style={styles.error}>{t("attendanceRhythm.reasonRequired")}</Text>}
    </View>
  )
  const clock = (date: string) => new Date(date).toLocaleString(i18n.language, { timeZone: bootstrap?.timezone ?? "UTC" })
  const requestName = (request: AttendanceRequest) => {
    if (request.details.kind !== "HR_RECORD") return t(`attendanceRequests.kinds.${request.details.kind}`)
    const language = i18n.language.split(/[-_]/)[0]
    const locale = language === "az" || language === "en" ? language : "ru"
    const snapshot = request.details.dayKind
    return snapshot ? `${snapshot.code} · ${snapshot.names[locale]}` : t("attendanceRequests.hrRecord")
  }
  const pendingCreates = queued.filter(operation => operation.op === "create" && !items.some(item => item.clientRequestId === operation.data.clientRequestId))
  const quotaContent = <View style={styles.quota} testID="attendance-quota">
    <Text style={styles.subtitle}>{t("attendanceRequests.quotaTitle", { month })}</Text>
    <Text style={styles.body}>{quota ? t("attendanceRequests.quotaRemaining", { hours: Math.floor(quota.remainingMinutes / 60), minutes: quota.remainingMinutes % 60, count: quota.remainingRequests }) : t("attendanceRequests.quotaUnavailable")}</Text>
    <Text style={styles.caption}>{t("attendanceRequests.quotaHint")}</Text>
  </View>
  const visibleItems = rhythm && filter === "waiting" ? items.filter(item => item.status === "PENDING" || queued.some(operation => operation.op === "update" && operation.data.id === item.id)) : items
  return (
    <ScrollView ref={scroll} style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: headerTop, paddingBottom: bottom }]}>
      <LightScreenStatusBar />
      <View style={styles.content}>
        {rhythm ? <TimeHeader title={t(editing ? "attendanceRequests.new" : "attendanceCompact.tabs.requests")} action={editing
          ? button(t("attendanceRequests.closeForm"), () => { void closeDraft() }, "attendance-close-form", false, busy)
          : allowed && !denied ? button(t("attendanceRequests.new"), enter, "attendance-new", true, busy) : undefined} /> : <View style={styles.heading}>
          {button(t("attendanceRequests.back"), () => navigation.navigate("OwnWorkday" as never), "attendance-back")}
          <Text style={styles.title}>{t("attendanceRequests.title")}</Text>
        </View>}
        {!allowed || denied ? <Text testID="attendance-unavailable" style={styles.body}>{t("attendanceRequests.unavailable")}</Text> : <>
          {!rhythm && <Text style={styles.body}>{t("attendanceRequests.intro")}</Text>}
          {offline && <Text testID="attendance-offline" style={styles.notice}>{t("attendanceRequests.offline")}</Text>}
          {updatedAt && (!rhythm || !editing) && <Text style={styles.caption}>{t("attendanceRequests.updated", { date: clock(updatedAt) })}</Text>}
          {errorKey && <Text accessibilityRole="alert" style={styles.error}>{t(errorKey)}</Text>}
          {noticeKey && <Text accessibilityLiveRegion="polite" style={styles.notice}>{t(noticeKey)}</Text>}
          {rhythm && editing && queued.length > 0 && <Text testID="attendance-queue-summary" accessibilityLiveRegion="polite" style={styles.notice}>{t(queued.some(operation => operation.status === "conflict") ? "attendanceRhythm.queueNeedsAttention" : "attendanceRhythm.queueWaiting", { count: queued.length })}</Text>}
          {suggestedCorrection && <View style={styles.quota}>
            <Text style={styles.body}>{t('attendanceCorrection.existingDraft', { date: suggestedCorrection.startDate })}</Text>
            {button(t('attendanceCorrection.openAfterDraft'), () => {
              if (editing || busyRef.current || !suggestedCorrection) return
              draftScope.current = getOfflineScope(); setDraft(suggestedCorrection); setSuggestedCorrection(null); setEditing(true); setErrorKey(null)
            }, 'attendance-open-correction', false, editing || busy)}
          </View>}
          {(!rhythm || !editing) && <View style={styles.actions}>
            {!rhythm && !editing && button(t("attendanceRequests.new"), enter, "attendance-new", true, busy)}
            {button(t("attendanceRequests.refresh"), () => { void act(async () => {}) }, "attendance-refresh", false, busy || loading)}
          </View>}
          {rhythm && !editing && <TimeFilters testID="attendance-filter" value={filter} onChange={setFilter} options={[
            { value: "all", label: t("attendanceRhythm.allRequests") }, { value: "waiting", label: t("attendanceRhythm.waiting") },
          ]} />}
          {rhythm ? <AttendanceDisclosure title={t("attendanceRhythm.hourlyLimit")} icon="time-outline" controlID="attendance-quota-disclosure">{quotaContent}</AttendanceDisclosure> : quotaContent}
          {editing && <View style={styles.form} testID="attendance-form">
            {!rhythm && <Text style={styles.subtitle}>{t("attendanceRequests.new")}</Text>}
            <Text style={styles.label}>{t("attendanceRequests.kind")}</Text>
            {rhythm && <Pressable testID="attendance-change-kind" accessibilityRole="button" accessibilityState={{ expanded: kindOpen, disabled: busy }} disabled={busy} onPress={() => setKindOpen(value => !value)} style={rhythmStyles.kindControl}>
              <Text style={styles.subtitle}>{t(`attendanceRequests.kinds.${draft.kind}`)}</Text><Text style={styles.buttonText}>{t("attendanceRhythm.changeKind")}</Text>
            </Pressable>}
            {(!rhythm || kindOpen) && <View style={styles.choices}>{ATTENDANCE_KINDS.map(kind => <Pressable key={kind} testID={`attendance-kind-${kind}`} accessibilityRole="button" accessibilityState={{ selected: draft.kind === kind, disabled: busy }} disabled={busy}
              onPress={() => { changeKind(kind); setKindOpen(false) }} style={[styles.choice, draft.kind === kind && styles.selected]}><Text style={styles.choiceText}>{t(`attendanceRequests.kinds.${kind}`)}</Text></Pressable>)}</View>}
            {draft.kind === "TIME_CORRECTION" && <Text style={styles.notice}>{t("attendanceRequests.correctionHint")}</Text>}
            {!attendanceNeedsHours(draft.kind) && <View style={styles.actions}>{(["DAYS", "HOURS"] as const).map(unit => <Pressable key={unit} testID={`attendance-unit-${unit}`} accessibilityRole="button" accessibilityState={{ selected: draft.unit === unit, disabled: busy }} disabled={busy}
              style={[styles.choice, draft.unit === unit && styles.selected]} onPress={() => change({ unit, ...(unit === "HOURS" ? { endDate: draft.startDate, startTime: "09:00", endTime: "18:00" } : { startTime: undefined, endTime: undefined }) })}><Text style={styles.choiceText}>{t(`attendanceRequests.units.${unit}`)}</Text></Pressable>)}</View>}
            {!rhythm && <Text style={styles.caption}>{t("attendanceRequests.dateHint")}</Text>}
            <View style={styles.fields}>
              {field("startDate", t(draft.kind === "TIME_CORRECTION" ? "attendanceRequests.correctionStartDate" : "attendanceRequests.startDate"), "YYYY-MM-DD")}
              {(draft.unit === "DAYS" || draft.kind === "TIME_CORRECTION") && field("endDate", t(draft.kind === "TIME_CORRECTION" ? "attendanceRequests.correctionEndDate" : "attendanceRequests.endDate"), "YYYY-MM-DD")}
            </View>
            {rhythm && errorKey === "attendanceRequests.invalid" && draft.endDate < draft.startDate && <Text accessibilityRole="alert" style={styles.error}>{t("attendanceRhythm.dateOrder")}</Text>}
            {draft.kind === "TIME_CORRECTION" && <Text style={styles.caption}>{t("attendanceRequests.correctionDateHint")}</Text>}
            {draft.unit === "HOURS" && <><Text style={styles.caption}>{t("attendanceRequests.timezone", { timezone: bootstrap?.timezone ?? "—" })}</Text><View style={styles.fields}>{field("startTime", t("attendanceRequests.startTime"), "HH:mm")}{field("endTime", t("attendanceRequests.endTime"), "HH:mm")}</View></>}
            {field("reason", t("attendanceRequests.reason"))}
            <Text style={styles.label}>{t("attendanceRequests.documents")}</Text>
            <Text style={styles.caption}>{t("attendanceRequests.documentsHint")}</Text>
            {documents.map((document, index) => <View key={document.clientAttachmentId} style={styles.document}>
              <Image source={{ uri: `file://${document.path}` }} style={styles.thumbnail} accessibilityLabel={t("attendanceRequests.document", { count: index + 1 })} />
              {button(t("attendanceRequests.removeDocument", { count: index + 1 }), () => removePhoto(document), `attendance-remove-${index}`, false, busy)}
            </View>)}
            <View style={styles.actions}>
              {button(t("attendanceRequests.photo"), () => setCamera(true), "attendance-photo", false, busy || documents.length >= 3)}
              {button(t("attendanceRequests.submit"), submit, "attendance-submit", true, busy)}
              {!rhythm && button(t("attendanceRequests.closeForm"), () => { void closeDraft() }, "attendance-close-form", false, busy)}
            </View>
          </View>}
          {(busy || loading) && <ActivityIndicator accessibilityLabel={t("attendanceRequests.loading")} color={fieldTheme.color.primary} />}
          {(!rhythm || !editing) && <View testID="attendance-list" style={styles.list}>
            {pendingCreates.map(operation => <View key={operation.operationId} style={styles.item}>
              <Text style={styles.subtitle}>{t(`attendanceRequests.kinds.${operation.data.kind}`)}</Text>
              <Text style={styles.body}>{String(operation.data.startDate)} — {String(operation.data.endDate)}</Text>
              <Text style={styles.status}>{t(operation.status === "conflict" ? "attendanceRequests.needsAttention" : "attendanceRequests.waitingSync")}</Text>
              <Text style={styles.body}>{String(operation.data.reason)}</Text>
              {operation.status === "conflict" && <><Text style={styles.error}>{t(attendanceErrorKey(operation.conflict?.error))}</Text>{button(t("attendanceRequests.retry"), () => { void act(async scope => { attendanceGuard(scope); await retryOutboxConflict(operation.operationId) }) }, `attendance-retry-${operation.operationId}`, false, busy)}</>}
            </View>)}
            {visibleItems.map(request => {
              const cancellation = queued.find(operation => operation.op === "update" && operation.data.id === request.id)
              return <View key={request.id} style={styles.item} testID={`attendance-request-${request.id}`}>
                <View style={styles.itemHeading}><Text style={styles.subtitle}>{requestName(request)}</Text><Text testID={`attendance-request-status-${request.id}`} style={[styles.status, rhythm && (request.status === "REJECTED" ? rhythmStyles.rejected : request.status === "PENDING" ? rhythmStyles.waiting : rhythmStyles.decided)]}>{t(`attendanceRequests.statuses.${request.status}`)}</Text></View>
                {request.details.kind === "HR_RECORD" && <Text style={styles.caption}>{t("attendanceRequests.hrRecord")}</Text>}
                <Text style={styles.body}>{request.startDate} — {request.endDate}{request.details.unit === "HOURS" ? ` · ${request.details.startTime}–${request.details.endTime}` : ""}</Text>
                <Text testID={`attendance-request-reason-${request.id}`} style={styles.body}>{request.reason}</Text>
                <Text style={styles.caption}>{t("attendanceRequests.submitted", { date: clock(request.submittedAt) })}</Text>
                {request.details.attachmentIds.length > 0 && <Text style={styles.caption}>{t("attendanceRequests.documentCount", { count: request.details.attachmentIds.length })}</Text>}
                {request.decisionNote && <Text style={styles.reply}>{t("attendanceRequests.reply", { reply: request.decisionNote })}</Text>}
                {request.decidedAt && <Text style={styles.caption}>{t("attendanceRequests.decided", { date: clock(request.decidedAt) })}</Text>}
                {request.cancelledAt && <Text style={styles.caption}>{t("attendanceRequests.cancelled", { date: clock(request.cancelledAt) })}</Text>}
                {cancellation && <Text style={cancellation.status === "conflict" ? styles.error : styles.notice}>{t(cancellation.status === "conflict" ? attendanceErrorKey(cancellation.conflict?.error) : "attendanceRequests.cancelQueued")}</Text>}
                {request.details.kind !== "HR_RECORD" && request.status === "PENDING" && !cancellation && button(t("attendanceRequests.cancel"), () => { void cancel(request) }, `attendance-cancel-${request.id}`, false, busy)}
                {cancellation?.status === "conflict" && button(t("attendanceRequests.retry"), () => { void act(async scope => { attendanceGuard(scope); await retryOutboxConflict(cancellation.operationId) }) }, `attendance-retry-${cancellation.operationId}`, false, busy)}
              </View>
            })}
            {visibleItems.length === 0 && pendingCreates.length === 0 && !loading && <Text style={styles.empty}>{t(rhythm && filter === "waiting" ? "attendanceRhythm.noWaitingLoaded" : "attendanceRequests.empty")}</Text>}
            {nextCursor && button(t("attendanceRequests.more"), () => { void load(true) }, "attendance-more", false, loading)}
          </View>}
          <PhotoCaptureModal visible={camera} onClose={() => setCamera(false)} onPhotoTaken={path => { void capture(path) }} />
        </>}
      </View>
    </ScrollView>
  )
}

const legacyStyles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas }, scroll: { paddingHorizontal: 20 }, content: { width: "100%", maxWidth: 900, alignSelf: "center", gap: 16 },
  heading: { gap: 14, alignItems: "flex-start" }, title: { fontSize: 30, fontWeight: "800", color: fieldTheme.color.ink }, subtitle: { fontSize: 19, fontWeight: "700", color: fieldTheme.color.ink, flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 23, color: fieldTheme.color.ink }, caption: { fontSize: 14, lineHeight: 20, color: fieldTheme.color.inkMuted }, label: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, button: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 12, justifyContent: "center", backgroundColor: fieldTheme.color.surface },
  buttonText: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.primaryStrong }, primary: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary }, primaryText: { color: fieldTheme.color.onColor }, disabled: { opacity: 0.5 },
  quota: { padding: 18, gap: 8, backgroundColor: fieldTheme.color.primarySoft, borderRadius: 16 }, form: { gap: 16, padding: 20, backgroundColor: fieldTheme.color.surface, borderRadius: 16, borderWidth: 1, borderColor: fieldTheme.color.border },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, choice: { minHeight: 48, padding: 12, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: fieldTheme.color.border }, selected: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary }, choiceText: { fontSize: 15, color: fieldTheme.color.ink, fontWeight: "600" },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 16 }, field: { flexGrow: 1, flexBasis: 180, gap: 8 }, input: { minHeight: 50, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 10, padding: 12, fontSize: 17, color: fieldTheme.color.ink, backgroundColor: fieldTheme.color.canvas }, reason: { minHeight: 100, textAlignVertical: "top" },
  notice: { color: fieldTheme.color.amber, fontSize: 15, lineHeight: 22 }, error: { color: fieldTheme.color.danger, fontSize: 15, lineHeight: 22 }, list: { gap: 0 }, item: { paddingVertical: 22, borderBottomWidth: 1, borderColor: fieldTheme.color.border, gap: 10 }, itemHeading: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }, status: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "700" }, reply: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 23, padding: 14, backgroundColor: fieldTheme.color.surfaceStrong, borderRadius: 10 }, empty: { color: fieldTheme.color.inkMuted, fontSize: 17, lineHeight: 25, paddingVertical: 32 }, document: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" }, thumbnail: { width: 72, height: 90, borderRadius: 8 },
}))

const rhythmStyles = themed(() => StyleSheet.create({
  ...legacyStyles,
  screen: { ...timeStyles.screen }, scroll: { paddingHorizontal: 20 }, content: { ...timeStyles.content, paddingHorizontal: 0, gap: 16 },
  title: { ...timeStyles.title }, subtitle: { ...timeStyles.sectionTitle, flexShrink: 1 }, body: { ...timeStyles.body }, caption: { ...timeStyles.caption },
  label: { color: timeColor.muted, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  button: { ...timeStyles.action }, buttonText: { ...timeStyles.actionText }, primary: { ...timeStyles.primary }, primaryText: { ...timeStyles.primaryText },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quota: { gap: 8, padding: 0 }, form: { gap: 24, paddingVertical: 8 },
  kindControl: { backgroundColor: timeColor.soft, padding: 16, borderRadius: 20, gap: 8, minHeight: 64 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: timeColor.line, backgroundColor: timeColor.surface },
  selected: { backgroundColor: timeColor.soft, borderColor: timeColor.accent }, choiceText: { color: timeColor.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  input: { minHeight: 56, borderWidth: 1, borderColor: timeColor.line, borderRadius: 16, padding: 16, fontSize: 16, lineHeight: 24, color: timeColor.ink, backgroundColor: timeColor.surface },
  notice: { color: timeColor.amber, fontSize: 15, lineHeight: 22 }, error: { color: timeColor.danger, fontSize: 15, lineHeight: 22 },
  item: { paddingVertical: 24, borderBottomWidth: 1, borderColor: timeColor.line, gap: 8 }, status: { ...timeStyles.badge },
  rejected: { color: timeColor.danger, backgroundColor: timeColor.dangerSoft }, waiting: { color: timeColor.amber, backgroundColor: timeColor.amberSoft }, decided: { color: timeColor.accent, backgroundColor: timeColor.soft },
  reply: { ...timeStyles.body, padding: 16, borderRadius: 16, backgroundColor: timeColor.inset }, empty: { ...timeStyles.caption, paddingVertical: 32 },
}))
