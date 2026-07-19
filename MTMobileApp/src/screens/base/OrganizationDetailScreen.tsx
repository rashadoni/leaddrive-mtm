import React, { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import {
  toOrganizationDetail,
  type OrganizationDetail,
} from "../../services/organization-detail"
import { useHeaderTop } from "../../hooks/useTabBarHeight"

const OBJECT_TYPE_KEY: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

const CONTACT_TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

export default function OrganizationDetailScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const route = useRoute<RouteProp<RootStackParamList, "OrganizationDetail">>()
  const headerTop = useHeaderTop()
  const { id, name } = route.params

  const [detail, setDetail] = useState<OrganizationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.getOrganization(id)
      if (res.success && res.data?.organization) {
        setDetail(toOrganizationDetail(res.data.organization))
        setOffline(false)
      }
    } catch (e: any) {
      // No offline cache for the full detail — show the header from the list
      // params and a note. (SESSION_EXPIRED is handled by the api interceptor.)
      if (e.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const call = (phone?: string) => {
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {})
  }

  const title = detail?.name || name || ""

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerMain}>
            <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
            {detail && (
              <Text style={styles.headerSubtitle}>
                {detail.objectType ? t(OBJECT_TYPE_KEY[detail.objectType] ?? "organizations.objectOther") : ""}
                {detail.city ? `${detail.objectType ? " · " : ""}${detail.city}` : ""}
              </Text>
            )}
          </View>
          {detail?.category && (
            <View style={[styles.categoryBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Text style={styles.categoryText}>{detail.category}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6C63FF" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineDot}>●</Text>
              <Text style={styles.offlineBannerText}>{t("organizations.detailOfflineNote")}</Text>
            </View>
          )}

          {detail && (
            <>
              {/* Requisites */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("organizations.detailRequisites")}</Text>
                {detail.address ? <Field label="📍" value={`${detail.address}${detail.district ? `, ${detail.district}` : ""}`} /> : null}
                {detail.phone ? (
                  <TouchableOpacity onPress={() => call(detail.phone)} activeOpacity={0.7}>
                    <Field label="📞" value={detail.phone} link />
                  </TouchableOpacity>
                ) : null}
                {detail.code ? <Field label={t("organizations.fieldCode")} value={detail.code} /> : null}
                {detail.contactPerson ? <Field label={t("organizations.fieldContactPerson")} value={detail.contactPerson} /> : null}
                {detail.notes ? <Field label={t("organizations.fieldNotes")} value={detail.notes} /> : null}
              </View>

              {/* Contacts */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t("contacts.title")}{detail.contacts.length > 0 ? `  ·  ${detail.contacts.length}` : ""}
                </Text>
                {detail.contacts.length === 0 ? (
                  <Text style={styles.emptyRow}>{t("organizations.detailNoContacts")}</Text>
                ) : (
                  detail.contacts.map((c) => (
                    <View key={c.id || c.name} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName}>
                          {c.name}
                          {c.isPrimary ? <Text style={styles.primaryTag}>  ★</Text> : null}
                        </Text>
                        <Text style={styles.rowSub}>
                          {c.specialty || (c.type ? t(CONTACT_TYPE_KEY[c.type] ?? "contacts.typeOther") : "")}
                        </Text>
                      </View>
                      {c.phone ? (
                        <TouchableOpacity style={styles.callBtn} onPress={() => call(c.phone)} activeOpacity={0.7}>
                          <Text style={styles.callBtnText}>📞</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                )}
              </View>

              {/* Recent visits */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("organizations.detailVisits")}</Text>
                {detail.visits.length === 0 ? (
                  <Text style={styles.emptyRow}>{t("organizations.detailNoVisits")}</Text>
                ) : (
                  detail.visits.slice(0, 15).map((v) => (
                    <View key={v.id} style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName}>
                          {v.checkInAt ? new Date(v.checkInAt).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </Text>
                        <Text style={styles.rowSub}>{v.agentName || ""}{v.outcome ? `  ·  ${v.outcome}` : ""}</Text>
                      </View>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusText}>{v.status}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Field potential (SWM-04) */}
              {detail.potential && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t("potential.title")}</Text>
                  <View style={styles.potentialRow}>
                    <View style={styles.potentialStat}>
                      <Text style={styles.potentialValue}>{detail.potential.potentialValue.toLocaleString(i18n.language)}</Text>
                      <Text style={styles.potentialLabel}>{t("potential.potential")}</Text>
                    </View>
                    <View style={styles.potentialStat}>
                      <Text style={styles.potentialValue}>{detail.potential.coverageValue.toLocaleString(i18n.language)}</Text>
                      <Text style={styles.potentialLabel}>{t("potential.coverage")}</Text>
                    </View>
                    <View style={styles.potentialStat}>
                      <Text style={[styles.potentialValue, { color: "#6C63FF" }]}>{detail.potential.coveragePct}%</Text>
                      <Text style={styles.potentialLabel}>{t("potential.percent")}</Text>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}

          {!detail && offline && (
            <View style={styles.card}>
              <Text style={styles.emptyRow}>{t("organizations.detailError")}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Field({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, link && styles.fieldLink]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  backIcon: { color: "#fff", fontSize: 34, lineHeight: 34, fontWeight: "300", marginTop: -4 },
  headerMain: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerSubtitle: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 3 },
  categoryBadge: { borderRadius: 8, minWidth: 30, paddingHorizontal: 9, paddingVertical: 5, alignItems: "center" },
  categoryText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  scroll: { padding: 16, paddingBottom: 40 },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  offlineDot: { color: "#f59e0b", fontSize: 10 },
  offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: "#0B0B1E", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 },

  field: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4, paddingVertical: 3 },
  fieldLabel: { fontSize: 12, color: "#94a3b8", minWidth: 24, fontWeight: "600" },
  fieldValue: { flex: 1, fontSize: 13, color: "#334155" },
  fieldLink: { color: "#6C63FF", fontWeight: "700" },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f8fafc" },
  rowMain: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "700", color: "#0B0B1E" },
  primaryTag: { color: "#f59e0b", fontSize: 13 },
  rowSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  callBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f0f0ff", justifyContent: "center", alignItems: "center" },
  callBtnText: { fontSize: 15 },
  emptyRow: { fontSize: 13, color: "#94a3b8", paddingVertical: 6 },

  statusPill: { backgroundColor: "#f1f5f9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "700", color: "#64748b" },

  potentialRow: { flexDirection: "row", marginTop: 2 },
  potentialStat: { flex: 1, alignItems: "center" },
  potentialValue: { fontSize: 18, fontWeight: "800", color: "#0B0B1E" },
  potentialLabel: { fontSize: 10, color: "#94a3b8", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
})
