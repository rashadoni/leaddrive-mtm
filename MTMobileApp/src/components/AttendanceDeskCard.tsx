import React, { useCallback, useEffect, useState } from "react"
import { View } from "react-native"
import { useTranslation } from "react-i18next"
import { TimeText as Text } from "../attendance/ui/TimeText"
import { TimeAction, timeStyles } from "../attendance/ui/TimeUI"
import AttendanceQrScanner from "./AttendanceQrScanner"
import { attendanceQrAvailable, guardAttendanceQr } from "../services/attendance-qr"
import { officeAttendanceScope } from "../services/attendance-session-guard"
import { attendanceDeskRefusal, pairAttendanceDesk, readAttendanceDesks, revokeAttendanceDesk, type AttendanceDesk } from "../services/attendance-desks"
import { ask } from "../services/app-feedback"

/**
 * «Профиль → Рабочее место» (owner, 2026-11-04; leaddrive-v2 mockup
 * desk-and-breaks/2-phone.png): scan the QR your computer shows, and it becomes
 * your workplace — the branch code and your break buttons appear on it. Your
 * computers are listed here and can be taken off. Shown only where branch QR is on.
 */
export default function AttendanceDeskCard() {
  const { t } = useTranslation()
  const [scope] = useState(() => { try { return officeAttendanceScope() } catch { return null } })
  const [scanning, setScanning] = useState(false), [desks, setDesks] = useState<AttendanceDesk[] | null>(null)
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null), [busy, setBusy] = useState(false)
  // Branch QR off (or the account gone): no workplace to connect.
  const available = !!scope && (() => { try { return attendanceQrAvailable() } catch { return false } })()
  const load = useCallback(async () => { if (scope && available) setDesks(await readAttendanceDesks(scope).catch(() => null)) }, [scope, available])
  useEffect(() => { void load() }, [load])
  if (!available || !scope) return null
  async function revoke(desk: AttendanceDesk) {
    const confirmed = await ask({ title: t("attendanceDesks.revokeTitle"), message: t("attendanceDesks.revokeBody", { branch: desk.branchName }), tone: "warning", dismissValue: false,
      buttons: [{ text: t("attendanceDesks.keep"), value: false, style: "cancel" }, { text: t("attendanceDesks.revoke"), value: true, style: "destructive" }] })
    if (!confirmed) return
    setBusy(true)
    try { await revokeAttendanceDesk(scope!, desk.id); await load() } catch { setMessage({ tone: "error", text: t("attendanceDesks.failed") }) } finally { setBusy(false) }
  }
  return <View style={timeStyles.section} testID="attendance-desk-card">
    <Text style={timeStyles.sectionTitle}>{t("attendanceDesks.title")}</Text>
    <Text style={timeStyles.caption}>{t("attendanceDesks.hint")}</Text>
    {desks?.map(desk => <View key={desk.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }} testID="attendance-desk">
      <Text style={[timeStyles.body, { flex: 1 }]}>{t("attendanceDesks.item", { branch: desk.branchName })}</Text>
      <TimeAction label={t("attendanceDesks.revoke")} icon="close-circle-outline" onPress={() => { void revoke(desk) }} disabled={busy} />
    </View>)}
    {message && <Text accessibilityRole={message.tone === "error" ? "alert" : undefined} style={timeStyles.body} testID="attendance-desk-message">{message.text}</Text>}
    <TimeAction label={t("attendanceDesks.connect")} icon="desktop-outline" onPress={() => { setMessage(null); setScanning(true) }} disabled={busy} testID="attendance-desk-connect" />
    <AttendanceQrScanner visible={scanning} scope={scope} action="DESK" onClose={() => setScanning(false)} onConfirm={async token => {
      guardAttendanceQr(scope)
      try {
        const paired = await pairAttendanceDesk(scope, token)
        setMessage({ tone: "ok", text: t("attendanceDesks.connected", { branch: paired.branchName }) })
        setTimeout(() => { void load() }, 6000)
      } catch (error) {
        setMessage({ tone: "error", text: t(`attendanceDesks.refused_${attendanceDeskRefusal(error)}`) })
      }
    }} />
  </View>
}
