import React, { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { toVisitWorkspace, type VisitWorkspace, type VisitRequirement } from "../../services/visit-workspace"
import { useHeaderTop } from "../../hooks/useTabBarHeight"

function actionLabel(t: (k: string) => string, key: string): string {
  const map: Record<string, string> = {
    PHOTO: "visitWorkspace.actionPhoto",
    PRESENTATION: "visitWorkspace.actionPresentation",
    STOCK_CHECK: "visitWorkspace.actionStockCheck",
    VISIT_NOTE: "visitWorkspace.actionVisitNote",
    CHECKLIST: "visitWorkspace.actionChecklist",
    FEEDBACK: "visitWorkspace.actionFeedback",
    NEXT_ACTION: "visitWorkspace.actionNextAction",
  }
  return map[key] ? t(map[key]) : key
}

function reqIcon(r: VisitRequirement): { icon: string; color: string } {
  if (r.done) return { icon: "●", color: "#22c55e" }
  if (r.waived) return { icon: "◐", color: "#f59e0b" }
  return { icon: "○", color: "#cbd5e1" }
}

export default function VisitWorkspaceScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, "VisitWorkspace">>()
  const headerTop = useHeaderTop()
  const { visitId, name } = route.params

  const [data, setData] = useState<VisitWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await api.getVisitWorkspace(visitId)
      if (res.success && res.data?.visit) {
        setData(toVisitWorkspace(res.data.visit))
        setOffline(false)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [visitId])

  useEffect(() => {
    fetchWorkspace()
  }, [fetchWorkspace])

  const fmtTime = (iso?: string) =>
    iso ? new Date(iso).toLocaleString(i18n.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"

  const title = data?.customer.name || name || ""

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerMain}>
            <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
            {data && (
              <Text style={styles.headerSubtitle}>
                {data.contact?.name ? `${data.contact.name} · ` : ""}{data.status}
              </Text>
            )}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6C63FF" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineDot}>●</Text>
              <Text style={styles.offlineBannerText}>{t("visitWorkspace.offlineNote")}</Text>
            </View>
          )}

          {data ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("visitWorkspace.sectionTime")}</Text>
                <Field label={t("visitWorkspace.fieldCheckIn")} value={fmtTime(data.checkInAt)} />
                <Field label={t("visitWorkspace.fieldCheckOut")} value={fmtTime(data.checkOutAt)} />
                {data.duration != null && <Field label={t("visitWorkspace.fieldDuration")} value={t("visitWorkspace.minutesTemplate", { n: data.duration })} />}
              </View>

              {(data.outcome || data.potential || data.resultNotes || data.notes) && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t("visitWorkspace.sectionResult")}</Text>
                  {data.outcome && <Field label={t("visitWorkspace.fieldOutcome")} value={data.outcome} />}
                  {data.potential && <Field label={t("visitWorkspace.fieldPotential")} value={data.potential} />}
                  {data.resultNotes && <Field label={t("visitWorkspace.fieldNotes")} value={data.resultNotes} />}
                  {data.notes && !data.resultNotes && <Field label={t("visitWorkspace.fieldNotes")} value={data.notes} />}
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t("visitWorkspace.sectionRequirements")}{data.requirements.length > 0 ? `  ·  ${data.requirements.length}` : ""}
                </Text>
                {data.requirements.length === 0 ? (
                  <Text style={styles.emptyRow}>{t("visitWorkspace.noRequirements")}</Text>
                ) : (
                  data.requirements.map((r) => {
                    const ic = reqIcon(r)
                    return (
                      <View key={r.actionKey} style={styles.row}>
                        <Text style={[styles.reqDot, { color: ic.color }]}>{ic.icon}</Text>
                        <Text style={styles.rowName}>{actionLabel(t, r.actionKey)}</Text>
                        <Text style={styles.reqMode}>{r.mode === "REQUIRED" ? t("visitWorkspace.reqRequired") : t("visitWorkspace.reqOptional")}</Text>
                      </View>
                    )
                  })
                )}
              </View>

              {data.tasks.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t("visitWorkspace.sectionTasks")}</Text>
                  {data.tasks.map((task) => (
                    <View key={task.id} style={styles.row}>
                      <Text style={styles.rowName}>{task.title}</Text>
                      <View style={styles.statusPill}><Text style={styles.statusText}>{task.status}</Text></View>
                    </View>
                  ))}
                </View>
              )}

              {data.photosCount > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t("visitWorkspace.photosTemplate", { n: data.photosCount })}</Text>
                </View>
              )}
            </>
          ) : (
            offline && (
              <View style={styles.card}>
                <Text style={styles.emptyRow}>{t("visitWorkspace.error")}</Text>
              </View>
            )
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: { backgroundColor: "#6C63FF", paddingBottom: 20, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  backIcon: { color: "#fff", fontSize: 34, lineHeight: 34, fontWeight: "300", marginTop: -4 },
  headerMain: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerSubtitle: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 3 },

  scroll: { padding: 16, paddingBottom: 40 },

  offlineBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa",
  },
  offlineDot: { color: "#f59e0b", fontSize: 10 },
  offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "600" },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#f1f5f9" },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#0B0B1E", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 },

  field: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4, paddingVertical: 3 },
  fieldLabel: { fontSize: 12, color: "#94a3b8", minWidth: 96, fontWeight: "600" },
  fieldValue: { flex: 1, fontSize: 13, color: "#334155" },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#f8fafc" },
  reqDot: { fontSize: 14 },
  rowName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0B0B1E" },
  reqMode: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },
  emptyRow: { fontSize: 13, color: "#94a3b8", paddingVertical: 6 },
  statusPill: { backgroundColor: "#f1f5f9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
})
