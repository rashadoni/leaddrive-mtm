import React, { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { toContactDetail, type ContactDetail, type ContactWorkplace } from "../../services/contact-detail"
import { readOfflineContactDetail } from "../../services/offline-reads"
import { useAuthStore } from "../../store/auth"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import ContactEditModal, { type ContactEditFields } from "../../components/ContactEditModal"
import ContactWorkplaceModal, { type WorkplaceFields } from "../../components/ContactWorkplaceModal"
import ContactDuplicateModal from "../../components/ContactDuplicateModal"
import NotesModal from "../../components/NotesModal"
import FeedbackToast from "../../components/FeedbackToast"

const TYPE_KEY: Record<string, string> = { DOCTOR: "contacts.typeDoctor", PHARMACIST: "contacts.typePharmacist", OTHER: "contacts.typeOther" }
const OBJECT_TYPE_KEY: Record<string, string> = { PHARMACY: "organizations.objectPharmacy", CLINIC: "organizations.objectClinic", STORE: "organizations.objectStore", OTHER: "organizations.objectOther" }
type Section = "overview" | "workplaces" | "requests" | "history"

function operationKey(kind: string): string {
  return `contact-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function ContactDetailScreen() {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = width >= 600
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "ContactDetail">>()
  const headerTop = useHeaderTop()
  const agent = useAuthStore((state) => state.agent)
  const { id, name } = route.params

  const [detail, setDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [offlineVersion, setOfflineVersion] = useState<string | null>(null)
  const [section, setSection] = useState<Section>("overview")
  const [editVisible, setEditVisible] = useState(false)
  const [workplaceVisible, setWorkplaceVisible] = useState(false)
  const [workplace, setWorkplace] = useState<ContactWorkplace | null>(null)
  const [duplicateVisible, setDuplicateVisible] = useState(false)
  const [endWorkplace, setEndWorkplace] = useState<ContactWorkplace | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })

  const fetchDetail = useCallback(async () => {
    try {
      const res = await api.getContact(id)
      if (res.success && res.data?.contact) {
        setDetail(toContactDetail(res.data.contact, res.data))
        setOffline(false)
        setOfflineVersion(null)
      }
    } catch (error: any) {
      if (error.message === "SESSION_EXPIRED") return
      const cached = await readOfflineContactDetail(agent?.organizationId, agent?.id, id)
      if (cached) {
        setDetail(toContactDetail(cached.record))
        setOfflineVersion(cached.version)
      }
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [agent?.id, agent?.organizationId, id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const agentRequest = Boolean(detail?.canRequestChanges && !detail?.canManage)
  const canChange = Boolean(detail && !offline && (detail.canManage || detail.canRequestChanges))
  const title = detail?.name || name || ""
  const subtitle = detail ? detail.specialty || (detail.type ? t(TYPE_KEY[detail.type] ?? "contacts.typeOther") : "") : ""
  const pendingCount = detail?.changeRequests.filter((request) => ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"].includes(request.status)).length ?? 0

  const saveContact = async (fields: ContactEditFields, reason: string) => {
    if (!detail) return
    setBusy(true)
    try {
      const response = detail.canManage
        ? await api.updateContact(detail.id, fields)
        : await api.submitContactChange(detail.id, {
            idempotencyKey: operationKey("fields"),
            reason,
            expectedContactUpdatedAt: detail.updatedAt,
            kind: "CONTACT_UPDATE",
            payload: fields,
          })
      if (response?.success) {
        setEditVisible(false)
        setToast({ visible: true, type: "success", title: t(detail.canManage ? "contacts.saved" : "contacts.requestSubmitted") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const saveWorkplace = async (fields: WorkplaceFields, reason: string) => {
    if (!detail) return
    setBusy(true)
    try {
      const response = detail.canManage
        ? await api.upsertContactWorkplace(detail.id, fields)
        : await api.submitContactChange(detail.id, {
            idempotencyKey: operationKey("workplace"),
            reason,
            expectedContactUpdatedAt: detail.updatedAt,
            kind: "WORKPLACE_UPSERT",
            payload: fields,
          })
      if (response?.success) {
        setWorkplaceVisible(false)
        setWorkplace(null)
        setToast({ visible: true, type: "success", title: t(detail.canManage ? "contacts.workplaceSaved" : "contacts.requestSubmitted") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const confirmEndWorkplace = async (reason: string) => {
    if (!detail || !endWorkplace) return
    const target = endWorkplace
    setEndWorkplace(null)
    setBusy(true)
    try {
      const response = detail.canManage
        ? await api.endContactWorkplace(detail.id, target.id)
        : await api.submitContactChange(detail.id, {
            idempotencyKey: operationKey("workplace-end"),
            reason,
            expectedContactUpdatedAt: detail.updatedAt,
            kind: "WORKPLACE_END",
            payload: { workplaceId: target.id, endedOn: new Date().toISOString().slice(0, 10), ...(target.updatedAt ? { expectedWorkplaceUpdatedAt: target.updatedAt } : {}) },
          })
      if (response?.success) {
        setToast({ visible: true, type: "success", title: t(detail.canManage ? "contacts.workplaceEnded" : "contacts.requestSubmitted") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const markDuplicate = async (targetContactId: string, reason: string) => {
    if (!detail) return
    setBusy(true)
    try {
      const response = detail.canManage
        ? await api.updateContact(detail.id, { status: "DUPLICATE", duplicateOfContactId: targetContactId })
        : await api.submitContactChange(detail.id, {
            idempotencyKey: operationKey("duplicate"),
            reason,
            expectedContactUpdatedAt: detail.updatedAt,
            kind: "DUPLICATE_REPORT",
            payload: { targetContactId },
          })
      if (response?.success) {
        setDuplicateVisible(false)
        setToast({ visible: true, type: "success", title: t(detail.canManage ? "contacts.duplicateMarked" : "contacts.requestSubmitted") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const open = (url: string) => Linking.openURL(url).catch(() => {})
  const quickPhone = detail?.mobilePhone || detail?.phone || detail?.workPhone

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
          <View style={styles.avatar}><Text style={styles.avatarText}>{title.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</Text></View>
          <View style={styles.headerMain}><Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>{!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}</View>
          {detail?.category && <View style={styles.categoryBadge}><Text style={styles.categoryText}>{detail.category}</Text></View>}
        </View>
        {detail && (
          <View style={styles.quickActions}>
            {!!quickPhone && <QuickAction icon="call" label={t("contacts.call")} onPress={() => open(`tel:${quickPhone}`)} />}
            {!!detail.email && <QuickAction icon="mail" label={t("contacts.emailAction")} onPress={() => open(`mailto:${detail.email}`)} />}
            {!!detail.whatsappPhone && <QuickAction icon="logo-whatsapp" label="WhatsApp" onPress={() => open(`https://wa.me/${detail.whatsappPhone!.replace(/\D/g, "")}`)} />}
            {canChange && <QuickAction icon="create" label={agentRequest ? t("contacts.requestChange") : t("common.change")} onPress={() => setEditVisible(true)} emphasized />}
            {canChange && detail.status !== "DUPLICATE" && detail.status !== "MERGED" && <QuickAction icon="git-compare-outline" label={t("contacts.reportDuplicate")} onPress={() => setDuplicateVisible(true)} />}
          </View>
        )}
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color="#6C63FF" /></View> : (
        <>
          <View style={styles.tabs}>
            {(["overview", "workplaces", "requests", "history"] as Section[]).map((key) => (
              <Pressable key={key} onPress={() => setSection(key)} style={[styles.tab, section === key && styles.tabActive]}>
                <Text style={[styles.tabText, section === key && styles.tabTextActive]}>{t(`contacts.tab_${key}`)}{key === "requests" && pendingCount > 0 ? ` (${pendingCount})` : ""}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView contentContainerStyle={[styles.scroll, tablet && styles.scrollTablet]} keyboardShouldPersistTaps="handled">
            {offline && <View style={styles.offlineBanner}><Text style={styles.offlineDot}>●</Text><Text style={styles.offlineBannerText}>{t("contacts.detailOfflineCached")}{offlineVersion ? ` · ${new Date(offlineVersion).toLocaleString(i18n.language)}` : ""}</Text></View>}
            {detail && section === "overview" && <Overview detail={detail} tablet={tablet} t={t} />}
            {detail && section === "workplaces" && (
              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>{t("contacts.detailWorkplaces")} · {detail.workplaces.length}</Text>{canChange && <Pressable style={styles.addBtn} onPress={() => { setWorkplace(null); setWorkplaceVisible(true) }}><Text style={styles.addBtnText}>＋ {t("contacts.addWorkplace")}</Text></Pressable>}</View>
                {detail.workplaces.length === 0 ? <Text style={styles.emptyRow}>{t("contacts.detailNoWorkplaces")}</Text> : detail.workplaces.map((item) => (
                  <View key={item.id} style={styles.workplaceRow}>
                    <Pressable style={styles.workplaceMain} disabled={!item.customerId} onPress={() => item.customerId && navigation.navigate("OrganizationDetail", { id: item.customerId, name: item.name })}>
                      <View style={styles.workplaceTitleRow}><Text style={styles.rowName}>{item.name}</Text>{item.isPrimary && <Text style={styles.primaryPill}>{t("contacts.primary")}</Text>}{item.endedOn && <Text style={styles.endedPill}>{t("contacts.ended")}</Text>}</View>
                      <Text style={styles.rowSub}>{[item.jobTitle, item.department, item.room ? `${t("contacts.room")} ${item.room}` : ""].filter(Boolean).join(" · ") || (item.objectType ? t(OBJECT_TYPE_KEY[item.objectType] ?? "organizations.objectOther") : "")}</Text>
                      <Text style={styles.rowSub}>{[item.city, item.address, item.phone].filter(Boolean).join(" · ")}</Text>
                      <Text style={styles.dateMeta}>{[item.startedOn, item.endedOn].filter(Boolean).join(" → ")}</Text>
                    </Pressable>
                    {canChange && !item.endedOn && <View style={styles.rowActions}><Pressable onPress={() => { setWorkplace(item); setWorkplaceVisible(true) }} style={styles.iconBtn}><Icon name="create-outline" size={20} color="#4f46e5" /></Pressable><Pressable onPress={() => setEndWorkplace(item)} style={styles.iconBtn}><Icon name="stop-circle-outline" size={20} color="#b45309" /></Pressable></View>}
                  </View>
                ))}
              </View>
            )}
            {detail && section === "requests" && <Requests detail={detail} t={t} />}
            {detail && section === "history" && <History detail={detail} t={t} locale={i18n.language} />}
            {!detail && offline && <View style={styles.card}><Text style={styles.emptyRow}>{t("contacts.detailError")}</Text></View>}
          </ScrollView>
        </>
      )}

      {detail && <ContactEditModal visible={editVisible} detail={detail} agentRequest={agentRequest} busy={busy} onCancel={() => setEditVisible(false)} onSubmit={saveContact} />}
      {detail && <ContactWorkplaceModal visible={workplaceVisible} workplace={workplace} agentRequest={agentRequest} busy={busy} onCancel={() => { setWorkplaceVisible(false); setWorkplace(null) }} onSubmit={saveWorkplace} />}
      {detail && <ContactDuplicateModal visible={duplicateVisible} currentContactId={detail.id} agentRequest={agentRequest} busy={busy} onCancel={() => setDuplicateVisible(false)} onSubmit={markDuplicate} />}
      <NotesModal visible={endWorkplace !== null} title={t("contacts.endWorkplaceTitle")} message={t("contacts.endWorkplaceMessage")} onCancel={() => setEndWorkplace(null)} onSubmit={confirmEndWorkplace} />
      <FeedbackToast visible={toast.visible} type={toast.type} title={toast.title} onDismiss={() => setToast((state) => ({ ...state, visible: false }))} />
    </View>
  )
}

function Overview({ detail, tablet, t }: { detail: ContactDetail; tablet: boolean; t: (key: string) => string }) {
  const address = [detail.postalCode, detail.addressRegion, detail.addressLocality, detail.addressDistrict, detail.addressStreet].filter(Boolean).join(", ")
  return (
    <View style={[styles.overviewGrid, tablet && styles.overviewGridTablet]}>
      <View style={[styles.card, tablet && styles.halfCard]}><Text style={styles.cardTitle}>{t("contacts.sectionPersonal")}</Text><Field label={t("contacts.fieldLastName")} value={detail.lastName} /><Field label={t("contacts.fieldFirstName")} value={detail.firstName} /><Field label={t("contacts.fieldMiddleName")} value={detail.middleName} /><Field label={t("contacts.fieldBirthDate")} value={detail.birthDate} /><Field label={t("contacts.fieldGender")} value={detail.gender} /><Field label={t("contacts.fieldType")} value={detail.type ? t(TYPE_KEY[detail.type] ?? "contacts.typeOther") : undefined} /><Field label={t("contacts.fieldSpecialty")} value={detail.specialty} /><Field label={t("contacts.fieldQualification")} value={detail.qualificationCategory} /><Field label={t("contacts.fieldProfile")} value={detail.profile} /><Field label={t("contacts.fieldProductCategory")} value={detail.productCategory} /></View>
      <View style={[styles.card, tablet && styles.halfCard]}><Text style={styles.cardTitle}>{t("contacts.sectionCommunication")}</Text><Field label={t("contacts.fieldWorkPhone")} value={detail.workPhone} /><Field label={t("contacts.fieldHomePhone")} value={detail.homePhone} /><Field label={t("contacts.fieldMobilePhone")} value={detail.mobilePhone || detail.phone} /><Field label={t("contacts.fieldViber")} value={detail.viberPhone} /><Field label={t("contacts.fieldWhatsapp")} value={detail.whatsappPhone} /><Field label={t("contacts.fieldTelegram")} value={detail.telegramPhone || detail.messengerPhone} /><Field label={t("contacts.fieldEmail")} value={detail.email} /></View>
      <View style={[styles.card, tablet && styles.halfCard]}><Text style={styles.cardTitle}>{t("contacts.sectionHomeAddress")}</Text><Field label={t("contacts.fieldAddress")} value={address} /><Field label={t("contacts.fieldNotes")} value={detail.notes} /></View>
      <View style={[styles.card, tablet && styles.halfCard]}><Text style={styles.cardTitle}>{t("contacts.sectionDataQuality")}</Text><Field label={t("contacts.fieldStatus")} value={detail.status} /><Field label={t("contacts.fieldVerification")} value={detail.verificationStatus} /><Field label={t("contacts.fieldConsent")} value={detail.consentStatus} /><Field label={t("contacts.fieldPreference")} value={detail.contactPreference} /><Field label={t("contacts.fieldSource")} value={detail.source} /><Field label={t("contacts.fieldCode")} value={detail.externalCode} /><Field label={t("contacts.fieldDuplicateOf")} value={detail.duplicateOfName || detail.duplicateOfContactId} /></View>
      {detail.potential && <View style={[styles.card, styles.potentialCard]}><Text style={styles.cardTitle}>{t("potential.title")}</Text><View style={styles.potentialRow}><Stat value={detail.potential.potentialValue} label={t("potential.potential")} /><Stat value={detail.potential.coverageValue} label={t("potential.coverage")} /><Stat value={`${detail.potential.coveragePct}%`} label={t("potential.percent")} accent /></View></View>}
    </View>
  )
}

function Requests({ detail, t }: { detail: ContactDetail; t: (key: string) => string }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{t("contacts.changeRequests")}</Text>{detail.changeRequests.length === 0 ? <Text style={styles.emptyRow}>{t("contacts.noChangeRequests")}</Text> : detail.changeRequests.map((request) => <View key={request.id} style={styles.timelineRow}><View style={[styles.timelineDot, request.status === "APPROVED" ? styles.dotSuccess : request.status === "REJECTED" ? styles.dotError : styles.dotPending]} /><View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{request.kind.replaceAll("_", " ")} · {request.status}</Text><Text style={styles.timelineMeta}>{[request.requesterName, request.reason, request.decisionComment].filter(Boolean).join(" · ")}</Text></View></View>)}</View>
}

function History({ detail, t, locale }: { detail: ContactDetail; t: (key: string) => string; locale: string }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{t("contacts.changeHistory")}</Text>{detail.history.length === 0 ? <Text style={styles.emptyRow}>{t("contacts.noHistory")}</Text> : detail.history.map((item) => <View key={item.id} style={styles.timelineRow}><View style={styles.historyIcon}><Icon name="time-outline" size={17} color="#4f46e5" /></View><View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{item.action.replaceAll("_", " ")}</Text><Text style={styles.timelineMeta}>{[item.actorName, item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : ""].filter(Boolean).join(" · ")}</Text></View></View>)}</View>
}

function QuickAction({ icon, label, onPress, emphasized }: { icon: string; label: string; onPress: () => void; emphasized?: boolean }) { return <Pressable onPress={onPress} style={[styles.quickAction, emphasized && styles.quickActionStrong]}><Icon name={icon} size={18} color="#fff" /><Text style={styles.quickActionText}>{label}</Text></Pressable> }
function Field({ label, value }: { label: string; value?: string }) { if (!value) return null; return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View> }
function Stat({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) { return <View style={styles.potentialStat}><Text style={[styles.potentialValue, accent && styles.accent]}>{typeof value === "number" ? value.toLocaleString() : value}</Text><Text style={styles.potentialLabel}>{label}</Text></View> }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" }, center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { backgroundColor: "#6C63FF", paddingBottom: 15, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }, headerRow: { flexDirection: "row", alignItems: "center", gap: 10 }, backBtn: { width: 32, height: 44, justifyContent: "center", alignItems: "center" }, backIcon: { color: "#fff", fontSize: 34, fontWeight: "300" }, avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#fff", fontSize: 14, fontWeight: "900" }, headerMain: { flex: 1 }, headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" }, headerSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 13, marginTop: 3 }, categoryBadge: { minWidth: 32, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center" }, categoryText: { color: "#fff", fontWeight: "900" },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13, marginLeft: 42 }, quickAction: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" }, quickActionStrong: { backgroundColor: "#4338ca" }, quickActionText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  tabs: { flexDirection: "row", paddingHorizontal: 10, paddingTop: 10, gap: 4, backgroundColor: "#F4F5F9" }, tab: { flex: 1, minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 11 }, tabActive: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd6fe" }, tabText: { color: "#64748b", fontSize: 11, fontWeight: "800", textAlign: "center" }, tabTextActive: { color: "#5b21b6" },
  scroll: { padding: 14, paddingBottom: 50 }, scrollTablet: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: 22 }, overviewGrid: { gap: 12 }, overviewGridTablet: { flexDirection: "row", flexWrap: "wrap" }, halfCard: { width: "48.8%" },
  offlineBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 12, padding: 10, borderRadius: 10, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" }, offlineDot: { color: "#f59e0b" }, offlineBannerText: { color: "#b45309", fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e9edf3" }, cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }, cardTitle: { flex: 1, fontSize: 12, fontWeight: "900", color: "#111827", textTransform: "uppercase", letterSpacing: 0.55, marginBottom: 8 }, addBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#ede9fe" }, addBtnText: { color: "#5b21b6", fontSize: 12, fontWeight: "900" },
  field: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f1f5f9" }, fieldLabel: { width: "42%", color: "#64748b", fontSize: 12, fontWeight: "700" }, fieldValue: { flex: 1, color: "#1e293b", fontSize: 13, fontWeight: "600" }, emptyRow: { color: "#94a3b8", fontSize: 13, paddingVertical: 8 },
  workplaceRow: { flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" }, workplaceMain: { flex: 1 }, workplaceTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }, rowName: { color: "#0f172a", fontSize: 15, fontWeight: "900" }, rowSub: { color: "#64748b", fontSize: 12, marginTop: 4 }, dateMeta: { color: "#94a3b8", fontSize: 11, marginTop: 5 }, primaryPill: { color: "#92400e", backgroundColor: "#fef3c7", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" }, endedPill: { color: "#64748b", backgroundColor: "#f1f5f9", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" }, rowActions: { flexDirection: "row", gap: 5 }, iconBtn: { width: 42, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  potentialCard: { width: "100%" }, potentialRow: { flexDirection: "row" }, potentialStat: { flex: 1, alignItems: "center" }, potentialValue: { color: "#0f172a", fontSize: 20, fontWeight: "900" }, potentialLabel: { color: "#94a3b8", fontSize: 10, textTransform: "uppercase", marginTop: 3, textAlign: "center" }, accent: { color: "#6C63FF" },
  timelineRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f1f5f9" }, timelineDot: { width: 11, height: 11, borderRadius: 99 }, dotSuccess: { backgroundColor: "#22c55e" }, dotError: { backgroundColor: "#ef4444" }, dotPending: { backgroundColor: "#f59e0b" }, historyIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" }, timelineCopy: { flex: 1 }, timelineTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900" }, timelineMeta: { color: "#64748b", fontSize: 12, lineHeight: 17, marginTop: 3 },
})
