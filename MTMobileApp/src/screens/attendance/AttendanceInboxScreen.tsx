import { TimeHeader, TimeAction, TimeFilters, TimeEmpty, timeColor, timeStyles, useTimePresentation } from "../../attendance/ui/TimeUI"
import LightScreenStatusBar from "../../components/LightScreenStatusBar"
import { formatLocalizedDate } from "../../lib/format-localized-date"
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
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { attendanceUuid } from "../../services/attendance-contract"
import type { OwnAttendanceParamList } from "../../navigation/attendance-routes"
import { useNavigation, type NavigationProp } from "@react-navigation/native"
export default function AttendanceInboxScreen() {
  const rhythm = useTimePresentation()
  const [filter, setFilter] = useState<"all" | "unread">("all"), [expanded, setExpanded] = useState<string | null>(null)
  const { t, i18n } = useTranslation(), top = useHeaderTop(), bottom = useTabBarPadding(), navigation = useNavigation<NavigationProp<OwnAttendanceParamList>>()
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
  useEffect(() => { mounted.current = true; epoch.current += 1; setItems([]); setDenied(false); setFilter("all"); setExpanded(null); if (allowed) void loadRef.current(); return () => { mounted.current = false; epoch.current += 1 } }, [allowed, agent?.id, agent?.organizationId])
  useAutoRefresh(() => { void load() })
  async function markRead(id: string) {
    if (!allowed || denied || writingRef.current) return
    writingRef.current = true; setWriting(id); setError(false)
    const ticket = ++epoch.current
    try { const scope = officeAttendanceScope(); await markAttendanceInboxRead(scope, id); if (ticket !== epoch.current || !mounted.current) return; const next = await readAttendanceInbox(scope); if (ticket === epoch.current && mounted.current) setItems(next) }
    catch (failure) { if (ticket === epoch.current && mounted.current) { setItems([]); if (attendanceAccessDenied(failure)) setDenied(true); else setError(true) } }
    finally { writingRef.current = false; if (ticket === epoch.current && mounted.current) { setWriting(null); setLoading(false) } }
  }
  const groupedDay = (createdAt: string) => {
    const date = new Date(createdAt)
    if (!Number.isFinite(date.getTime())) return null
    const parts = new Intl.DateTimeFormat("en", { timeZone: bootstrap?.timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
    return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}-${parts.find(part => part.type === "day")!.value}`
  }
  const shown = items.filter(item => filter === "all" || !item.isRead).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
  if (rhythm) return <View style={timeStyles.screen}>
    <LightScreenStatusBar />
    <View style={[timeStyles.content, { paddingTop: top }]}><TimeHeader title={t("attendanceCompact.tabs.inbox")} /></View>
    <ScrollView contentContainerStyle={[timeStyles.content, { paddingBottom: bottom }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {!allowed || denied ? <Text testID="office-inbox-unavailable" style={timeStyles.body}>{t("officeAttendance.unavailable")}</Text> : <>
        <TimeFilters testID="inbox-filter" value={filter} onChange={setFilter} options={[
          { value: "all", label: t("attendanceRhythm.allNotices") }, { value: "unread", label: t("attendanceRhythm.unread"), count: items.filter(item => !item.isRead).length },
        ]} />
        <TimeAction testID="office-inbox-refresh" icon="refresh-outline" label={t("officeAttendance.refresh")} disabled={loading || writing !== null} onPress={() => void load()} />
        {loading && <ActivityIndicator color={timeColor.accent} />}
        {error && <Text accessibilityRole="alert" style={rhythmStyles.error}>{t("officeAttendance.inboxFailed")}</Text>}
        {!loading && !error && !shown.length && <TimeEmpty icon="mail-open-outline" title={t(filter === "unread" ? "attendanceRhythm.noUnread" : "officeAttendance.inboxEmpty")} />}
        {shown.map((item, index) => {
          const date = groupedDay(item.createdAt), previous = index ? groupedDay(shown[index - 1].createdAt) : undefined
          const title = item.titleKey ? t(item.titleKey) : item.title, body = item.bodyKey ? t(item.bodyKey) : item.body
          const isOpen = expanded === item.id
          return <View key={item.id}>
            {(index === 0 || previous !== date) && <Text accessibilityRole="header" style={rhythmStyles.date}>{date ? formatLocalizedDate(date, i18n.language, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : t("attendanceRhythm.unknownDate")}</Text>}
            <View testID={`office-notice-${item.id}`} style={rhythmStyles.notice}>
              <Pressable testID={`office-notice-open-${item.id}`} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setExpanded(isOpen ? null : item.id)} style={({ pressed }) => [rhythmStyles.noticeHeading, pressed && timeStyles.pressed]}>
                <View style={rhythmStyles.noticeCopy}>
                  {!item.isRead && <Text style={rhythmStyles.unread}>{t("officeAttendance.unread")}</Text>}
                  <Text style={[rhythmStyles.name, item.isRead && rhythmStyles.readName]}>{title}</Text>
                  {!isOpen && body ? <Text numberOfLines={2} style={timeStyles.caption}>{body}</Text> : null}
                  <Text style={timeStyles.caption}>{date ? new Date(item.createdAt).toLocaleTimeString(i18n.language, { timeZone: bootstrap?.timezone ?? "UTC", hour: "2-digit", minute: "2-digit" }) : "—"} · {t(isOpen ? "attendanceRhythm.collapse" : "attendanceRhythm.details")}</Text>
                </View>
              </Pressable>
              {isOpen && <View style={rhythmStyles.detail}>
                {body ? <Text style={timeStyles.body}>{body}</Text> : null}
                {item.explanation && <TimeAction testID={`office-explain-${item.id}`} icon="chatbox-ellipses-outline" label={t("explanations.openFromInbox")} onPress={() => navigation.navigate("OwnExplanations", { answerIntent: attendanceUuid() })} />}
                {item.isRead ? <Text style={timeStyles.caption}>{t("officeAttendance.read")}</Text> : <TimeAction testID={`office-read-${item.id}`} icon="checkmark-outline" disabled={writing !== null}
                  label={t(writing === item.id ? "officeAttendance.saving" : "officeAttendance.markRead")} onPress={() => void markRead(item.id)} />}
              </View>}
            </View>
          </View>
        })}
      </>}
    </ScrollView>
  </View>
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
const styles = themed(() => StyleSheet.create({ screen: { flex: 1, backgroundColor: fieldTheme.color.canvas }, header: { backgroundColor: fieldTheme.color.primaryStrong, padding: 24, gap: 8 }, title: { fontSize: 26, fontWeight: "700", color: fieldTheme.color.onColor }, subtitle: { fontSize: 15, lineHeight: 22, color: fieldTheme.color.onColor }, content: { padding: 20, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" }, card: { borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: 18, backgroundColor: fieldTheme.color.surface, padding: 20, gap: 12 }, name: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "600" }, body: { color: fieldTheme.color.inkMuted, fontSize: 15, lineHeight: 23 }, error: { color: fieldTheme.color.danger, fontSize: 15 }, button: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: fieldTheme.color.border, justifyContent: "center", alignItems: "center", backgroundColor: fieldTheme.color.surface }, action: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "600" } }))

const rhythmStyles = themed(() => StyleSheet.create({
  date: { color: timeColor.muted, fontSize: 13, lineHeight: 20, fontWeight: '700', paddingTop: 24, paddingBottom: 8 },
  notice: { borderBottomWidth: 1, borderColor: timeColor.line }, noticeHeading: { minHeight: 64, paddingVertical: 16 }, noticeCopy: { gap: 8 },
  name: { fontSize: 19, lineHeight: 26, color: timeColor.ink, fontWeight: '700' }, readName: { fontWeight: '500' },
  unread: { fontSize: 13, lineHeight: 19, color: timeColor.blue, fontWeight: '700' }, detail: { gap: 12, paddingBottom: 16 }, error: { color: timeColor.danger, fontSize: 15, lineHeight: 22 },
}))
