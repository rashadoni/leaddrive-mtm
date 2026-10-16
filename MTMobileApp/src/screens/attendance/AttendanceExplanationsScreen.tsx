import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { hasOfficeAttendanceAccess } from "../../services/attendance-access"
import { officeAttendanceScope } from "../../services/attendance-session-guard"
import { attendanceAccessDenied } from "../../services/attendance-requests"
import { answerAttendanceExplanation, attendanceExplanationSections, readAttendanceExplanations,
  type AttendanceExplanationKind, type AttendanceExplanations } from "../../services/attendance-explanations"
import { formatLocalizedDate } from "../../lib/format-localized-date"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"

const keyOf = (date: string, kind: AttendanceExplanationKind) => `${date}:${kind}`

/**
 * «Объяснительные» (owner, 2026-10-16, approved mockup): what HR asked to
 * explain, the late or absent days one may still explain, and what was sent.
 * Leave, sick leave or a business trip are filed as a request instead.
 */
export default function AttendanceExplanationsScreen() {
  const { t, i18n } = useTranslation(), top = useHeaderTop(), bottom = useTabBarPadding()
  const navigation = useNavigation()
  const agent = useAuthStore(state => state.agent), bootstrap = useBootstrapStore(state => state.data)
  const allowed = hasOfficeAttendanceAccess(bootstrap, agent)
  const requestsAllowed = bootstrap?.policies.agentPermissions?.attendanceRequests === true
  const [data, setData] = useState<AttendanceExplanations | null>(null), [loading, setLoading] = useState(false)
  const [error, setError] = useState(false), [denied, setDenied] = useState(false)
  const [open, setOpen] = useState<string | null>(null), [draft, setDraft] = useState(""), [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<"sent" | "failed" | "notNeeded" | "decided" | "short" | null>(null)
  const epoch = useRef(0), mounted = useRef(true)
  const load = useCallback(async () => {
    if (!allowed || denied) return
    const ticket = ++epoch.current; setLoading(true); setError(false)
    try { const next = await readAttendanceExplanations(officeAttendanceScope()); if (ticket === epoch.current && mounted.current) setData(next) }
    catch (failure) { if (ticket === epoch.current && mounted.current) { setData(null); if (attendanceAccessDenied(failure)) setDenied(true); else setError(true) } }
    finally { if (ticket === epoch.current && mounted.current) setLoading(false) }
  }, [allowed, denied])
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => { mounted.current = true; epoch.current += 1; setData(null); setDenied(false); if (allowed) void loadRef.current(); return () => { mounted.current = false; epoch.current += 1 } }, [allowed, agent?.id, agent?.organizationId])
  useAutoRefresh(() => { if (!open) void load() })

  const day = (date: string) => formatLocalizedDate(`${date}T12:00:00.000Z`, i18n.language, { day: "numeric", month: "long", timeZone: "UTC" })
  const what = (kind: AttendanceExplanationKind, date: string, minutes: number | null) => kind === "LATE"
    ? t("explanations.lateOn", { date: day(date), minutes: minutes ?? 0 }) : t("explanations.absentOn", { date: day(date) })
  function edit(date: string, kind: AttendanceExplanationKind, text: string | null) { setOpen(keyOf(date, kind)); setDraft(text ?? ""); setNotice(null) }
  async function send(date: string, kind: AttendanceExplanationKind) {
    if (saving) return
    if (draft.trim().length < 3) { setNotice("short"); return }
    setSaving(true); setNotice(null)
    try {
      await answerAttendanceExplanation(officeAttendanceScope(), { date, kind, text: draft })
      if (!mounted.current) return
      setOpen(null); setDraft(""); setNotice("sent"); await load()
    } catch (failure) {
      if (!mounted.current) return
      const code = (failure as { code?: string })?.code
      if (attendanceAccessDenied(failure)) setDenied(true)
      setNotice(code === "MTM_ATTENDANCE_EXPLANATION_NOT_NEEDED" ? "notNeeded" : code === "MTM_ATTENDANCE_EXPLANATION_DECIDED" ? "decided" : "failed")
      if (code === "MTM_ATTENDANCE_EXPLANATION_NOT_NEEDED" || code === "MTM_ATTENDANCE_EXPLANATION_DECIDED") void load()
    } finally { if (mounted.current) setSaving(false) }
  }
  const form = (date: string, kind: AttendanceExplanationKind) => open === keyOf(date, kind) ? <View style={styles.form}>
    <TextInput testID={`explanation-text-${keyOf(date, kind)}`} accessibilityLabel={t("explanations.textLabel")} value={draft} onChangeText={setDraft}
      placeholder={t("explanations.placeholder")} placeholderTextColor={fieldTheme.color.inkMuted} editable={!saving} multiline maxLength={1000} style={styles.input} />
    <View style={styles.row}>
      <Pressable testID={`explanation-send-${keyOf(date, kind)}`} accessibilityRole="button" disabled={saving} onPress={() => void send(date, kind)} style={[styles.button, styles.primary]}>
        <Text style={styles.primaryText}>{t(saving ? "explanations.sending" : "explanations.send")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setOpen(null); setDraft("") }} style={styles.button}><Text style={styles.action}>{t("explanations.cancel")}</Text></Pressable>
    </View>
  </View> : null
  const sections = data ? attendanceExplanationSections(data) : null
  return <View style={styles.screen}><View style={[styles.header, { paddingTop: top }]}><Text style={styles.title}>{t("explanations.title")}</Text><Text style={styles.subtitle}>{t("explanations.hint")}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottom }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!allowed || denied ? <Text testID="explanations-unavailable" style={styles.body}>{t("officeAttendance.unavailable")}</Text> : <>
        {loading && !data && <ActivityIndicator color={fieldTheme.color.primary} />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{t("explanations.loadFailed")}</Text>}
        {notice && <Text testID="explanations-notice" accessibilityRole={notice === "sent" ? undefined : "alert"} style={notice === "sent" ? styles.success : styles.error}>{t(`explanations.notice_${notice}`)}</Text>}
        {sections && !sections.asked.length && !sections.open.length && !sections.written.length && <Text testID="explanations-empty" style={styles.body}>{t("explanations.empty")}</Text>}
        {sections?.asked.map(item => <View testID={`explanation-asked-${keyOf(item.date, item.kind)}`} key={item.id} style={[styles.card, styles.asked]}>
          <Text style={styles.badge}>{t("explanations.askedBadge")}</Text>
          <Text style={styles.name}>{what(item.kind, item.date, item.lateMinutes)}</Text>
          <Text style={styles.body}>{t("explanations.askedBody")}</Text>
          {open === keyOf(item.date, item.kind) ? form(item.date, item.kind)
            : <Pressable testID={`explanation-write-${keyOf(item.date, item.kind)}`} accessibilityRole="button" onPress={() => edit(item.date, item.kind, null)} style={[styles.button, styles.primary]}><Text style={styles.primaryText}>{t("explanations.write")}</Text></Pressable>}
        </View>)}
        {sections?.open.length ? <Text style={styles.section}>{t("explanations.openTitle")}</Text> : null}
        {sections?.open.map(item => <View testID={`explanation-open-${keyOf(item.date, item.kind)}`} key={keyOf(item.date, item.kind)} style={styles.card}>
          <Text style={styles.name}>{what(item.kind, item.date, item.lateMinutes)}</Text>
          {open === keyOf(item.date, item.kind) ? form(item.date, item.kind)
            : <Pressable testID={`explanation-write-${keyOf(item.date, item.kind)}`} accessibilityRole="button" onPress={() => edit(item.date, item.kind, null)} style={styles.button}><Text style={styles.action}>{t("explanations.write")}</Text></Pressable>}
        </View>)}
        {sections?.written.length ? <Text style={styles.section}>{t("explanations.writtenTitle")}</Text> : null}
        {sections?.written.map(item => <View testID={`explanation-written-${keyOf(item.date, item.kind)}`} key={item.id} style={styles.card}>
          <Text style={styles.name}>{what(item.kind, item.date, item.lateMinutes)}</Text>
          <Text style={styles.body}>«{item.answer}»</Text>
          <Text style={item.status === "ACCEPTED" ? styles.success : item.status === "REJECTED" ? styles.error : styles.caption}>{t(`explanations.status_${item.status}`)}</Text>
          {item.status === "ANSWERED" ? open === keyOf(item.date, item.kind) ? form(item.date, item.kind)
            : <Pressable testID={`explanation-edit-${keyOf(item.date, item.kind)}`} accessibilityRole="button" onPress={() => edit(item.date, item.kind, item.answer)} style={styles.button}><Text style={styles.action}>{t("explanations.edit")}</Text></Pressable> : null}
        </View>)}
        {requestsAllowed ? <View style={styles.card}><Text style={styles.body}>{t("explanations.otherReason")}</Text>
          <Pressable testID="explanations-file-request" accessibilityRole="button" onPress={() => navigation.navigate("OwnRequests" as never)} style={styles.button}><Text style={styles.action}>{t("explanations.fileRequest")}</Text></Pressable></View> : null}
      </>}
    </ScrollView></View>
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas }, header: { backgroundColor: fieldTheme.color.primaryStrong, padding: 24, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", color: fieldTheme.color.onColor }, subtitle: { fontSize: 15, lineHeight: 22, color: fieldTheme.color.onColor },
  content: { padding: 20, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 18, backgroundColor: fieldTheme.color.surface, padding: 20, gap: 12 },
  asked: { borderColor: fieldTheme.color.primary, borderWidth: 2 }, badge: { color: fieldTheme.color.primaryStrong, fontSize: 14, fontWeight: "700" },
  section: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "700", marginTop: 4 },
  name: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "600" }, body: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 23 },
  caption: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20 }, error: { color: fieldTheme.color.danger, fontSize: 15 }, success: { color: fieldTheme.color.success, fontSize: 15, fontWeight: "600" },
  form: { gap: 12 }, row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  input: { minHeight: 96, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 12, padding: 12, fontSize: 16, color: fieldTheme.color.ink, textAlignVertical: "top" },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, justifyContent: "center", alignItems: "center", backgroundColor: fieldTheme.color.surface },
  primary: { backgroundColor: fieldTheme.color.primaryStrong, borderColor: fieldTheme.color.primaryStrong }, primaryText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "700" },
  action: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "600" },
})
