import React, { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import { useAuthStore } from "../../store/auth"
import { useBootstrapStore } from "../../store/bootstrap"
import { hasOfficeAttendanceAccess } from "../../services/attendance-access"
import { officeAttendanceScope } from "../../services/attendance-session-guard"
import { readAttendanceInbox, markAttendanceInboxRead, type AttendanceNotice } from "../../services/attendance-inbox"
import { attendanceAccessDenied } from "../../services/attendance-requests"
import { useAutoRefresh } from "../../hooks/useAutoRefresh"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { useNavigation } from "@react-navigation/native"
export default function AttendanceInboxScreen() {
  const { t, i18n } = useTranslation(), top = useHeaderTop(), bottom = useTabBarPadding(), navigation = useNavigation()
  const agent = useAuthStore(state => state.agent), bootstrap = useBootstrapStore(state => state.data)
  const allowed = hasOfficeAttendanceAccess(bootstrap, agent)
  const [items, setItems] = useState<AttendanceNotice[]>([]), [loading, setLoading] = useState(false), [writing, setWriting] = useState<string | null>(null)
  const [error, setError] = useState(false), [denied, setDenied] = useState(false)
  const epoch = useRef(0), mounted = useRef(true), writingRef = useRef(false)
  const load = useCallback(async () => {
    if (!allowed || denied || writingRef.current) return
    const ticket = ++epoch.current; setLoading(true); setError(false)
    try { const next = await readAttendanceInbox(officeAttendanceScope()); if (ticket === epoch.current && mounted.current) setItems(next) }
    catch (failure) { if (ticket === epoch.current && mounted.current) { setItems([]); if (attendanceAccessDenied(failure)) setDenied(true); else setError(true) } }
    finally { if (ticket === epoch.current && mounted.current) setLoading(false) }
  }, [allowed, denied])
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => { mounted.current = true; epoch.current += 1; setItems([]); setDenied(false); if (allowed) void loadRef.current(); return () => { mounted.current = false; epoch.current += 1 } }, [allowed, agent?.id, agent?.organizationId])
  useAutoRefresh(() => { void load() })
  async function markRead(id: string) {
    if (!allowed || denied || writingRef.current) return
    writingRef.current = true; setWriting(id); setError(false)
    const ticket = ++epoch.current
    try { const scope = officeAttendanceScope(); await markAttendanceInboxRead(scope, id); if (ticket !== epoch.current || !mounted.current) return; const next = await readAttendanceInbox(scope); if (ticket === epoch.current && mounted.current) setItems(next) }
    catch (failure) { if (ticket === epoch.current && mounted.current) { setItems([]); if (attendanceAccessDenied(failure)) setDenied(true); else setError(true) } }
    finally { writingRef.current = false; if (ticket === epoch.current && mounted.current) { setWriting(null); setLoading(false) } }
  }
  return <View style={styles.screen}><View style={[styles.header, { paddingTop: top }]}><Text style={styles.title}>{t("officeAttendance.inbox")}</Text><Text style={styles.subtitle}>{t("officeAttendance.inboxHint")}</Text></View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!allowed || denied ? <Text testID="office-inbox-unavailable" style={styles.body}>{t("officeAttendance.unavailable")}</Text> : <>
        <Pressable testID="office-inbox-refresh" accessibilityRole="button" disabled={loading || writing !== null} onPress={() => void load()} style={styles.button}><Text style={styles.action}>{t("officeAttendance.refresh")}</Text></Pressable>
        {loading && <ActivityIndicator color={fieldTheme.color.primary} />}
        {error && <Text accessibilityRole="alert" style={styles.error}>{t("officeAttendance.inboxFailed")}</Text>}
        {!loading && !error && items.length === 0 && <Text style={styles.body}>{t("officeAttendance.inboxEmpty")}</Text>}
        {items.map(item => <View testID={`office-notice-${item.id}`} style={styles.card} key={item.id}>
          {!item.isRead && <Text style={styles.action}>{t("officeAttendance.unread")}</Text>}<Text style={styles.name}>{item.titleKey ? t(item.titleKey) : item.title}</Text>
          {item.body && <Text style={styles.body}>{item.bodyKey ? t(item.bodyKey) : item.body}</Text>}
          {item.explanation && <Pressable testID={`office-explain-${item.id}`} accessibilityRole="button" onPress={() => navigation.navigate("OwnExplanations" as never)} style={styles.button}><Text style={styles.action}>{t("explanations.openFromInbox")}</Text></Pressable>}
          <Text style={styles.body}>{Number.isFinite(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString(i18n.language, { timeZone: bootstrap?.timezone ?? "UTC" }) : "—"}</Text>
          {item.isRead ? <Text style={styles.body}>{t("officeAttendance.read")}</Text> : <Pressable testID={`office-read-${item.id}`} accessibilityRole="button" disabled={writing !== null} onPress={() => void markRead(item.id)} style={styles.button}><Text style={styles.action}>{t(writing === item.id ? "officeAttendance.saving" : "officeAttendance.markRead")}</Text></Pressable>}
        </View>)}
      </>}
    </ScrollView></View>
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: fieldTheme.color.canvas }, header: { backgroundColor: fieldTheme.color.primaryStrong, padding: 24, gap: 8 }, title: { fontSize: 26, fontWeight: "700", color: fieldTheme.color.onColor }, subtitle: { fontSize: 15, lineHeight: 22, color: fieldTheme.color.onColor }, content: { padding: 20, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" }, card: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 18, backgroundColor: fieldTheme.color.surface, padding: 20, gap: 12 }, name: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "600" }, body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 23 }, error: { color: fieldTheme.color.danger, fontSize: 15 }, button: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, justifyContent: "center", alignItems: "center", backgroundColor: fieldTheme.color.surface }, action: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "600" } })
