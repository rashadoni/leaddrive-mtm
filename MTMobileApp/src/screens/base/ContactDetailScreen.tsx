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
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { toContactDetail, type ContactDetail } from "../../services/contact-detail"
import { useHeaderTop } from "../../hooks/useTabBarHeight"

const TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

const OBJECT_TYPE_KEY: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

export default function ContactDetailScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "ContactDetail">>()
  const headerTop = useHeaderTop()
  const { id, name } = route.params

  const [detail, setDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.getContact(id)
      if (res.success && res.data?.contact) {
        setDetail(toContactDetail(res.data.contact))
        setOffline(false)
      }
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const open = (url: string) => Linking.openURL(url).catch(() => {})

  const title = detail?.name || name || ""
  const subtitle = detail
    ? detail.specialty || (detail.type ? t(TYPE_KEY[detail.type] ?? "contacts.typeOther") : "")
    : ""

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerMain}>
            <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
            {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
          {detail?.category && (
            <View style={styles.categoryBadge}>
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
              <Text style={styles.offlineBannerText}>{t("contacts.detailOfflineNote")}</Text>
            </View>
          )}

          {detail && (
            <>
              {/* Contact info */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("contacts.detailInfo")}</Text>
                {detail.phone ? (
                  <TouchableOpacity onPress={() => open(`tel:${detail.phone}`)} activeOpacity={0.7}>
                    <Field label="📞" value={detail.phone} link />
                  </TouchableOpacity>
                ) : null}
                {detail.email ? (
                  <TouchableOpacity onPress={() => open(`mailto:${detail.email}`)} activeOpacity={0.7}>
                    <Field label="✉️" value={detail.email} link />
                  </TouchableOpacity>
                ) : null}
                {detail.type ? <Field label={t("contacts.fieldType")} value={t(TYPE_KEY[detail.type] ?? "contacts.typeOther")} /> : null}
                {detail.externalCode ? <Field label={t("contacts.fieldCode")} value={detail.externalCode} /> : null}
                {detail.notes ? <Field label={t("contacts.fieldNotes")} value={detail.notes} /> : null}
                {!detail.phone && !detail.email && !detail.externalCode && !detail.notes && !detail.type && (
                  <Text style={styles.emptyRow}>—</Text>
                )}
              </View>

              {/* Workplaces */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t("contacts.detailWorkplaces")}{detail.workplaces.length > 0 ? `  ·  ${detail.workplaces.length}` : ""}
                </Text>
                {detail.workplaces.length === 0 ? (
                  <Text style={styles.emptyRow}>{t("contacts.detailNoWorkplaces")}</Text>
                ) : (
                  detail.workplaces.map((w) => (
                    <TouchableOpacity
                      key={w.customerId || w.name}
                      style={styles.row}
                      activeOpacity={0.7}
                      disabled={!w.customerId}
                      onPress={() => w.customerId && navigation.navigate("OrganizationDetail", { id: w.customerId, name: w.name })}
                    >
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName}>
                          {w.name}
                          {w.isPrimary ? <Text style={styles.primaryTag}>  ★</Text> : null}
                        </Text>
                        <Text style={styles.rowSub}>
                          {w.position || (w.objectType ? t(OBJECT_TYPE_KEY[w.objectType] ?? "organizations.objectOther") : "")}
                          {w.city ? `${(w.position || w.objectType) ? " · " : ""}${w.city}` : ""}
                        </Text>
                      </View>
                      {w.customerId ? <Text style={styles.chevron}>›</Text> : null}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </>
          )}

          {!detail && offline && (
            <View style={styles.card}>
              <Text style={styles.emptyRow}>{t("contacts.detailError")}</Text>
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
  categoryBadge: { borderRadius: 8, minWidth: 30, paddingHorizontal: 9, paddingVertical: 5, alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)" },
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
  fieldLabel: { fontSize: 12, color: "#94a3b8", minWidth: 40, fontWeight: "600" },
  fieldValue: { flex: 1, fontSize: 13, color: "#334155" },
  fieldLink: { color: "#6C63FF", fontWeight: "700" },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f8fafc" },
  rowMain: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "700", color: "#0B0B1E" },
  primaryTag: { color: "#f59e0b", fontSize: 13 },
  rowSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  chevron: { fontSize: 22, color: "#cbd5e1", fontWeight: "300" },
  emptyRow: { fontSize: 13, color: "#94a3b8", paddingVertical: 6 },
})
