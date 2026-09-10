import React, { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { commercialApi } from "../../services/commercial-api"
import { toContactDetail, type BrandPotential, type ContactDetail, type ContactWorkplace, type DoctorAssessment } from "../../services/contact-detail"
import { readOfflineContactDetail } from "../../services/offline-reads"
import { useAuthStore } from "../../store/auth"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import ContactEditModal, { type ContactEditFields } from "../../components/ContactEditModal"
import ContactWorkplaceModal, { type WorkplaceFields } from "../../components/ContactWorkplaceModal"
import ContactDuplicateModal from "../../components/ContactDuplicateModal"
import NotesModal from "../../components/NotesModal"
import FeedbackToast from "../../components/FeedbackToast"
import DoctorAssessmentModal, { type DoctorAssessmentFields } from "../../components/DoctorAssessmentModal"
import BrandPotentialModal, { type BrandPotentialFields } from "../../components/BrandPotentialModal"
import { queueBrandPotentialCreate, queueBrandPotentialEnd } from "../../services/brand-potential-outbox"
import { runMobileSync } from "../../services/sync-engine"
import { fieldTheme } from "../../theme/fieldTheme"
import { CACHED_VIEW_NOTICE_KEYS, cachedViewNotice } from "../../lib/cached-view-notice"
import { useSyncStatusStore } from "../../store/sync-status"
import { buildContactSnapshot, selectContactPrimaryAction, type ContactPrimaryAction, type ContactPrimaryActionKind } from "./contact-detail-state"
import { upper } from "../../lib/upper"

const TYPE_KEY: Record<string, string> = { DOCTOR: "contacts.typeDoctor", PHARMACIST: "contacts.typePharmacist", OTHER: "contacts.typeOther" }
const OBJECT_TYPE_KEY: Record<string, string> = { PHARMACY: "organizations.objectPharmacy", CLINIC: "organizations.objectClinic", STORE: "organizations.objectStore", OTHER: "organizations.objectOther" }
type Section = "summary" | "overview" | "scoring" | "brands" | "workplaces" | "requests" | "history"

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
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [offline, setOffline] = useState(false)
  const online = useSyncStatusStore((state) => state.online)
  // Two facts, not one: the request failed, and the radio is or is not on.
  const notice = cachedViewNotice({ online, requestFailed: offline })
  const [offlineVersion, setOfflineVersion] = useState<string | null>(null)
  const [section, setSection] = useState<Section>("summary")
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [manageExpanded, setManageExpanded] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [workplaceVisible, setWorkplaceVisible] = useState(false)
  const [workplace, setWorkplace] = useState<ContactWorkplace | null>(null)
  const [duplicateVisible, setDuplicateVisible] = useState(false)
  const [assessmentVisible, setAssessmentVisible] = useState(false)
  const [potentialVisible, setPotentialVisible] = useState(false)
  const [potentialPrevious, setPotentialPrevious] = useState<BrandPotential | null>(null)
  const [potentialDecision, setPotentialDecision] = useState<{ potential: BrandPotential; decision: "VERIFIED" | "REJECTED" } | null>(null)
  const [endPotential, setEndPotential] = useState<BrandPotential | null>(null)
  const [assessmentDecision, setAssessmentDecision] = useState<{ assessment: DoctorAssessment; decision: "VERIFIED" | "REJECTED" } | null>(null)
  const [endWorkplace, setEndWorkplace] = useState<ContactWorkplace | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; title: string }>({ visible: false, type: "success", title: "" })

  const fetchDetail = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const res = await commercialApi.getContact(id)
      if (res.success && res.data?.contact) {
        setDetail(toContactDetail(res.data.contact, res.data))
        setOffline(false)
        setOfflineVersion(null)
        setLoadError(false)
      } else {
        setLoadError(true)
        setOffline(true)
      }
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      const cached = await readOfflineContactDetail(agent?.organizationId, agent?.id, id)
      if (cached) {
        const role = String(agent?.role ?? "").toUpperCase()
        setDetail(toContactDetail(cached.record, {
          eligibleBrandPotentialVisits: cached.eligibleVisits,
          capabilities: {
            canRecordBrandPotential: role === "AGENT",
            canReviewBrandPotential: ["ADMIN", "MANAGER", "SUPERVISOR"].includes(role),
            brandPotentialPerAgent: true,
          },
        }))
        setOfflineVersion(cached.version)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
      setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [agent?.id, agent?.organizationId, agent?.role, id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const agentRequest = Boolean(detail?.canRequestChanges && !detail?.canManage)
  const canChange = Boolean(detail && !offline && (detail.canManage || detail.canRequestChanges))
  const title = detail?.name || name || ""
  const subtitle = detail ? detail.specialty || (detail.type ? t(TYPE_KEY[detail.type] ?? "contacts.typeOther") : "") : ""
  const saveContact = async (fields: ContactEditFields, reason: string) => {
    if (!detail) return
    setBusy(true)
    try {
      const response = detail.canManage
        ? await commercialApi.updateContact(detail.id, fields)
        : await commercialApi.submitContactChange(detail.id, {
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
        ? await commercialApi.upsertContactWorkplace(detail.id, fields)
        : await commercialApi.submitContactChange(detail.id, {
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
        ? await commercialApi.endContactWorkplace(detail.id, target.id)
        : await commercialApi.submitContactChange(detail.id, {
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
        ? await commercialApi.updateContact(detail.id, { status: "DUPLICATE", duplicateOfContactId: targetContactId })
        : await commercialApi.submitContactChange(detail.id, {
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

  const saveAssessment = async (fields: DoctorAssessmentFields) => {
    if (!detail) return
    setBusy(true)
    try {
      const response = await commercialApi.createDoctorAssessment(detail.id, fields)
      if (response?.success) {
        setAssessmentVisible(false)
        setSection("scoring")
        setToast({ visible: true, type: "success", title: t("contacts.scoringSaved") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const decideAssessment = async (comment: string) => {
    if (!assessmentDecision) return
    const target = assessmentDecision
    setAssessmentDecision(null)
    setBusy(true)
    try {
      const response = await commercialApi.decideDoctorAssessment(target.assessment.id, target.decision, comment)
      if (response?.success) {
        setToast({ visible: true, type: "success", title: t(target.decision === "VERIFIED" ? "contacts.scoringVerified" : "contacts.scoringRejected") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const savePotential = async (fields: BrandPotentialFields) => {
    if (!detail) return
    setBusy(true)
    try {
      const isAgent = String(agent?.role ?? "").toUpperCase() === "AGENT"
      if (!isAgent) {
        const response = await commercialApi.createBrandPotential(detail.id, fields)
        if (!response?.success) return
        setPotentialVisible(false)
        setPotentialPrevious(null)
        setSection("brands")
        setToast({ visible: true, type: "success", title: t("potential.saved") })
        await fetchDetail()
        return
      }

      await queueBrandPotentialCreate(detail.id, fields)
      const evidenceById = new Map(detail.brandPotentialEligibleVisits.map((visit) => [visit.id, visit]))
      const optimistic: BrandPotential = {
        id: fields.clientPotentialId,
        clientPotentialId: fields.clientPotentialId,
        brandExternalId: fields.brandExternalId,
        brandName: fields.brandName,
        productExternalId: fields.productExternalId ?? undefined,
        productName: fields.productName ?? undefined,
        categoryLabel: fields.categoryLabel ?? undefined,
        potentialValue: fields.potentialValue,
        coverageValue: fields.coverageValue,
        coveragePct: fields.potentialValue > 0 ? Math.round((fields.coverageValue / fields.potentialValue) * 1000) / 10 : 0,
        periodStart: fields.periodStart,
        periodEnd: fields.periodEnd ?? undefined,
        source: fields.source,
        status: "PENDING",
        supersedesPotentialId: fields.supersedesPotentialId ?? undefined,
        agentId: agent?.id,
        agentName: agent?.name,
        enteredByName: agent?.name,
        createdAt: new Date().toISOString(),
        evidenceVisits: fields.evidenceVisitIds.map((visitId) => evidenceById.get(visitId) ?? { id: visitId }),
      }
      setDetail((current) => current ? { ...current, brandPotentials: [optimistic, ...current.brandPotentials] } : current)
      setPotentialVisible(false)
      setPotentialPrevious(null)
      setSection("brands")
      setToast({ visible: true, type: "success", title: t("potential.queued") })
      runMobileSync().then(async (result) => {
        if (result.success && result.conflicted === 0) {
          await fetchDetail()
          setToast({ visible: true, type: "success", title: t("potential.saved") })
        } else if (result.conflicted > 0) {
          setToast({ visible: true, type: "error", title: t("potential.syncConflict") })
        }
      }).catch(() => undefined)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const decidePotential = async (comment: string) => {
    if (!potentialDecision) return
    const target = potentialDecision
    setPotentialDecision(null)
    setBusy(true)
    try {
      const response = await commercialApi.decideBrandPotential(target.potential.id, target.decision, comment)
      if (response?.success) {
        setToast({ visible: true, type: "success", title: t(target.decision === "VERIFIED" ? "potential.verified" : "potential.rejected") })
        await fetchDetail()
      }
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const confirmEndPotential = async (reason: string) => {
    if (!endPotential) return
    const target = endPotential
    setEndPotential(null)
    setBusy(true)
    try {
      const periodEnd = new Date().toISOString().slice(0, 10)
      const isAgent = String(agent?.role ?? "").toUpperCase() === "AGENT"
      if (!isAgent) {
        const response = await commercialApi.endBrandPotential(target.id, periodEnd, reason)
        if (!response?.success) return
        setToast({ visible: true, type: "success", title: t("potential.periodEnded") })
        await fetchDetail()
        return
      }
      await queueBrandPotentialEnd(target.id, periodEnd, reason)
      setDetail((current) => current ? {
        ...current,
        brandPotentials: current.brandPotentials.map((item) => item.id === target.id
          ? { ...item, status: "ENDED", periodEnd, reviewComment: reason, closedAt: new Date().toISOString() }
          : item),
      } : current)
      setToast({ visible: true, type: "success", title: t("potential.queued") })
      runMobileSync().then(async (result) => {
        if (result.success && result.conflicted === 0) {
          await fetchDetail()
          setToast({ visible: true, type: "success", title: t("potential.periodEnded") })
        } else if (result.conflicted > 0) {
          setToast({ visible: true, type: "error", title: t("potential.syncConflict") })
        }
      }).catch(() => undefined)
    } catch (error: any) {
      if (error?.message !== "SESSION_EXPIRED") setToast({ visible: true, type: "error", title: error?.message || t("common.error") })
    } finally { setBusy(false) }
  }

  const open = (url: string) => Linking.openURL(url).catch(() => {})
  const quickPhone = detail?.mobilePhone || detail?.phone || detail?.workPhone
  const snapshot = detail ? buildContactSnapshot(detail) : null
  const primaryAction: ContactPrimaryAction = detail ? selectContactPrimaryAction(detail, canChange) : { kind: "none" }

  const runPrimaryAction = () => {
    if (!detail) return
    if (primaryAction.kind === "call" && primaryAction.value) open(`tel:${primaryAction.value}`)
    else if (primaryAction.kind === "whatsapp" && primaryAction.value) open(`https://wa.me/${primaryAction.value.replace(/\D/g, "")}`)
    else if (primaryAction.kind === "email" && primaryAction.value) open(`mailto:${primaryAction.value}`)
    else if (primaryAction.kind === "workplace" && primaryAction.workplace) navigation.navigate("OrganizationDetail", { id: primaryAction.workplace.customerId, name: primaryAction.workplace.name })
    else if (primaryAction.kind === "edit") setEditVisible(true)
    else setSection("overview")
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("baseHub.back")} style={styles.backBtn} onPress={() => navigation.goBack()}><Icon name="arrow-back" size={22} color={fieldTheme.color.onColor} /><Text style={styles.backText}>{t("baseHub.back")}</Text></Pressable>
          <View style={styles.avatar}><Text style={styles.avatarText}>{upper(title.split(" ").slice(0, 2).map((part) => part[0] ?? "").join(""))}</Text></View>
          <View style={styles.headerMain}><Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>{!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}</View>
          {detail?.category && <View style={styles.categoryBadge}><Text style={styles.categoryText}>{detail.category}</Text></View>}
        </View>
      </View>

      {loading ? <LoadingState t={t} /> : loadError && !detail ? <ErrorState t={t} retrying={refreshing} onRetry={() => fetchDetail(true)} /> : (
        <ScrollView contentContainerStyle={[styles.scroll, tablet && styles.scrollTablet]} keyboardShouldPersistTaps="handled">
          {offline && <OfflineBanner version={offlineVersion} locale={i18n.language} retrying={refreshing} t={t} noticeKey={CACHED_VIEW_NOTICE_KEYS[notice === "none" ? "stale" : notice]} onRetry={() => fetchDetail(true)} />}

          {detail && section === "summary" && snapshot && (
            <FriendlySummary
              detail={detail}
              snapshot={snapshot}
              tablet={tablet}
              primaryAction={primaryAction.kind}
              onPrimary={runPrimaryAction}
              onCall={quickPhone ? () => open(`tel:${quickPhone}`) : undefined}
              onEmail={detail.email ? () => open(`mailto:${detail.email}`) : undefined}
              onWhatsapp={detail.whatsappPhone ? () => open(`https://wa.me/${detail.whatsappPhone!.replace(/\D/g, "")}`) : undefined}
              onSection={setSection}
              detailsExpanded={detailsExpanded}
              onToggleDetails={() => setDetailsExpanded((value) => !value)}
              manageExpanded={manageExpanded}
              onToggleManage={() => setManageExpanded((value) => !value)}
              canChange={canChange}
              agentRequest={agentRequest}
              offline={offline}
              onEdit={() => setEditVisible(true)}
              onDuplicate={() => setDuplicateVisible(true)}
              onAddWorkplace={() => { setWorkplace(null); setWorkplaceVisible(true) }}
              onAddAssessment={() => setAssessmentVisible(true)}
              onAddPotential={() => { setPotentialPrevious(null); setPotentialVisible(true) }}
              t={t}
            />
          )}

          {detail && section !== "summary" && (
            <SectionReturn title={t(`contacts.tab_${section}`)} onBack={() => setSection("summary")} t={t} />
          )}
          {detail && section === "overview" && <Overview detail={detail} tablet={tablet} t={t} />}
          {detail && section === "scoring" && <Scoring detail={detail} offline={offline} tablet={tablet} locale={i18n.language} t={t} onAdd={() => setAssessmentVisible(true)} onDecision={(assessment, decision) => setAssessmentDecision({ assessment, decision })} />}
          {detail && section === "brands" && <BrandPotentials detail={detail} offline={offline} tablet={tablet} locale={i18n.language} t={t} onAdd={(previous) => { setPotentialPrevious(previous ?? null); setPotentialVisible(true) }} onDecision={(potential, decision) => setPotentialDecision({ potential, decision })} onEnd={setEndPotential} onVisit={(visitId, visitName) => navigation.navigate("VisitWorkspace", { visitId, name: visitName })} />}
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
        </ScrollView>
      )}

      {detail && <ContactEditModal visible={editVisible} detail={detail} agentRequest={agentRequest} busy={busy} onCancel={() => setEditVisible(false)} onSubmit={saveContact} />}
      {detail && <ContactWorkplaceModal visible={workplaceVisible} workplace={workplace} agentRequest={agentRequest} busy={busy} onCancel={() => { setWorkplaceVisible(false); setWorkplace(null) }} onSubmit={saveWorkplace} />}
      {detail && <ContactDuplicateModal visible={duplicateVisible} currentContactId={detail.id} agentRequest={agentRequest} busy={busy} onCancel={() => setDuplicateVisible(false)} onSubmit={markDuplicate} />}
      {detail && <DoctorAssessmentModal visible={assessmentVisible} busy={busy} onCancel={() => setAssessmentVisible(false)} onSubmit={saveAssessment} />}
      {detail && <BrandPotentialModal visible={potentialVisible} busy={busy} previous={potentialPrevious} eligibleVisits={detail.brandPotentialEligibleVisits} onCancel={() => { setPotentialVisible(false); setPotentialPrevious(null) }} onSubmit={savePotential} />}
      <NotesModal visible={endWorkplace !== null} title={t("contacts.endWorkplaceTitle")} message={t("contacts.endWorkplaceMessage")} onCancel={() => setEndWorkplace(null)} onSubmit={confirmEndWorkplace} />
      <NotesModal visible={assessmentDecision !== null} title={t(assessmentDecision?.decision === "REJECTED" ? "contacts.scoringRejectTitle" : "contacts.scoringVerifyTitle")} message={t("contacts.scoringDecisionMessage")} onCancel={() => setAssessmentDecision(null)} onSubmit={decideAssessment} />
      <NotesModal visible={potentialDecision !== null} title={t(potentialDecision?.decision === "REJECTED" ? "potential.rejectTitle" : "potential.verifyTitle")} message={t("potential.decisionMessage")} onCancel={() => setPotentialDecision(null)} onSubmit={decidePotential} />
      <NotesModal visible={endPotential !== null} title={t("potential.endTitle")} message={t("potential.endMessage")} onCancel={() => setEndPotential(null)} onSubmit={confirmEndPotential} />
      <FeedbackToast visible={toast.visible} type={toast.type} title={toast.title} onDismiss={() => setToast((state) => ({ ...state, visible: false }))} />
    </View>
  )
}

function LoadingState({ t }: { t: (key: string) => string }) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator size="large" color={fieldTheme.color.primary} />
      <Text style={styles.stateTitle}>{t("contacts.friendlyLoadingTitle")}</Text>
      <Text style={styles.stateBody}>{t("contacts.friendlyLoadingBody")}</Text>
    </View>
  )
}

function ErrorState({ t, retrying, onRetry }: { t: (key: string) => string; retrying: boolean; onRetry: () => void }) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}><Icon name="cloud-offline-outline" size={30} color={fieldTheme.color.coral} /></View>
      <Text style={styles.stateTitle}>{t("contacts.detailError")}</Text>
      <Text style={styles.stateBody}>{t("contacts.friendlyErrorBody")}</Text>
      <Pressable disabled={retrying} onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed, retrying && styles.disabled]}>
        {retrying ? <ActivityIndicator color={fieldTheme.color.onColor} /> : <Icon name="refresh" size={19} color={fieldTheme.color.onColor} />}
        <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  )
}

function OfflineBanner({ version, locale, retrying, t, noticeKey, onRetry }: { version: string | null; locale: string; retrying: boolean; t: (key: string) => string; noticeKey: string; onRetry: () => void }) {
  return (
    <View style={styles.offlineBanner}>
      <View style={styles.offlineCopy}>
        <Icon name="cloud-offline-outline" size={20} color={fieldTheme.color.amber} />
        <View style={styles.offlineTextGroup}>
          <Text style={styles.offlineTitle}>{t("contacts.friendlyOfflineTitle")}</Text>
          <Text style={styles.offlineBannerText}>{t(noticeKey)}{version ? ` · ${new Date(version).toLocaleString(locale)}` : ""}</Text>
        </View>
      </View>
      <Pressable disabled={retrying} onPress={onRetry} style={styles.offlineRetry}>
        {retrying ? <ActivityIndicator size="small" color={fieldTheme.color.amber} /> : <Icon name="refresh" size={18} color={fieldTheme.color.amber} />}
        <Text style={styles.offlineRetryText}>{t("common.retry")}</Text>
      </Pressable>
    </View>
  )
}

function SectionReturn({ title, onBack, t }: { title: string; onBack: () => void; t: (key: string) => string }) {
  return (
    <View style={styles.sectionReturn}>
      <Pressable onPress={onBack} style={styles.sectionBack}>
        <Icon name="arrow-back" size={19} color={fieldTheme.color.primary} />
        <Text style={styles.sectionBackText}>{t("contacts.friendlyBackToSummary")}</Text>
      </Pressable>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  )
}

function FriendlySummary({
  detail,
  snapshot,
  tablet,
  primaryAction,
  onPrimary,
  onCall,
  onEmail,
  onWhatsapp,
  onSection,
  detailsExpanded,
  onToggleDetails,
  manageExpanded,
  onToggleManage,
  canChange,
  agentRequest,
  offline,
  onEdit,
  onDuplicate,
  onAddWorkplace,
  onAddAssessment,
  onAddPotential,
  t,
}: {
  detail: ContactDetail
  snapshot: ReturnType<typeof buildContactSnapshot>
  tablet: boolean
  primaryAction: ContactPrimaryActionKind
  onPrimary: () => void
  onCall?: () => void
  onEmail?: () => void
  onWhatsapp?: () => void
  onSection: (section: Section) => void
  detailsExpanded: boolean
  onToggleDetails: () => void
  manageExpanded: boolean
  onToggleManage: () => void
  canChange: boolean
  agentRequest: boolean
  offline: boolean
  onEdit: () => void
  onDuplicate: () => void
  onAddWorkplace: () => void
  onAddAssessment: () => void
  onAddPotential: () => void
  t: (key: string, options?: any) => string
}) {
  const address = [snapshot.primaryWorkplace?.city, snapshot.primaryWorkplace?.address].filter(Boolean).join(", ")
  const currentAssessment = detail.doctorAssessments[0]
  const managementAvailable = detail.canManage || detail.canRequestChanges || detail.canRecordBrandPotential
  const hasSecondaryContact = Boolean(
    (onCall && primaryAction !== "call")
    || (onWhatsapp && primaryAction !== "whatsapp")
    || (onEmail && primaryAction !== "email"),
  )
  const primaryIcon: Record<ContactPrimaryActionKind, string> = {
    call: "call",
    whatsapp: "logo-whatsapp",
    email: "mail",
    workplace: "business",
    edit: "create",
    none: "person-circle",
  }

  return (
    <View style={styles.friendlyStack}>
      <View style={[styles.summaryTop, tablet && styles.summaryTopTablet]}>
        <View style={[styles.identityCard, tablet && styles.summaryColumn]}>
          <Text style={styles.eyebrow}>{t("contacts.friendlyAtGlance")}</Text>
          <Text style={styles.identityName}>{detail.name}</Text>
          <View style={styles.identityPills}>
            {!!detail.type && <SummaryPill icon="person-outline" text={t(TYPE_KEY[detail.type] ?? "contacts.typeOther")} />}
            {!!detail.specialty && <SummaryPill icon="medical-outline" text={detail.specialty} />}
            {!!detail.category && <SummaryPill icon="star-outline" text={detail.category} />}
          </View>
          <View style={styles.workplaceSummary}>
            <View style={styles.summaryIcon}><Icon name="business-outline" size={21} color={fieldTheme.color.primary} /></View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>{t("contacts.friendlyMainWorkplace")}</Text>
              <Text style={styles.summaryValue}>{snapshot.primaryWorkplace?.name || t("contacts.friendlyNoWorkplace")}</Text>
              {!!address && <Text style={styles.summaryHint}>{address}</Text>}
            </View>
          </View>
        </View>

        <View style={[styles.nextCard, tablet && styles.summaryColumn]}>
          <Text style={styles.nextEyebrow}>{t("contacts.friendlyNextStep")}</Text>
          <Text style={styles.nextTitle}>{t(`contacts.primary_${primaryAction}`)}</Text>
          <Text style={styles.nextBody}>{t(`contacts.primary_${primaryAction}Body`)}</Text>
          <Pressable onPress={onPrimary} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Icon name={primaryIcon[primaryAction]} size={21} color={fieldTheme.color.onColor} />
            <Text style={styles.primaryButtonText}>{t(`contacts.primary_${primaryAction}`)}</Text>
            <Icon name="arrow-forward" size={19} color={fieldTheme.color.onColor} />
          </Pressable>
        </View>
      </View>

      {hasSecondaryContact && (
        <View style={styles.contactNowCard}>
          <View style={styles.cardHeading}>
            <View style={styles.cardHeadingIcon}><Icon name="chatbubbles-outline" size={20} color={fieldTheme.color.primary} /></View>
            <View style={styles.cardHeadingCopy}><Text style={styles.cardHeadingTitle}>{t("contacts.friendlyContactNow")}</Text><Text style={styles.cardHeadingBody}>{t("contacts.friendlyContactNowBody")}</Text></View>
          </View>
          <View style={styles.contactActions}>
            {onCall && primaryAction !== "call" && <ContactAction icon="call-outline" label={t("contacts.call")} onPress={onCall} />}
            {onWhatsapp && primaryAction !== "whatsapp" && <ContactAction icon="logo-whatsapp" label="WhatsApp" onPress={onWhatsapp} />}
            {onEmail && primaryAction !== "email" && <ContactAction icon="mail-outline" label={t("contacts.emailAction")} onPress={onEmail} />}
          </View>
        </View>
      )}

      <View style={styles.focusHeader}>
        <Text style={styles.focusTitle}>{t("contacts.friendlyWorkTitle")}</Text>
        <Text style={styles.focusBody}>{t("contacts.friendlyWorkBody")}</Text>
      </View>

      <Pressable onPress={() => onSection("brands")} style={({ pressed }) => [styles.brandSummaryCard, pressed && styles.pressed]}>
        <View style={styles.sectionCardTop}>
          <View style={[styles.sectionCardIcon, styles.violetIcon]}><Icon name="ribbon-outline" size={23} color={fieldTheme.color.violet} /></View>
          <View style={styles.sectionCardCopy}>
            <Text style={styles.sectionCardTitle}>{t("contacts.tab_brands")}</Text>
            <Text style={styles.sectionCardBody}>{snapshot.activeBrands > 0 ? t("contacts.friendlyBrandCount", { count: snapshot.activeBrands }) : t("contacts.friendlyBrandEmpty")}</Text>
          </View>
          {snapshot.pendingBrands > 0 && <Text style={styles.pendingBadge}>{t("contacts.friendlyPending", { count: snapshot.pendingBrands })}</Text>}
          <Icon name="chevron-forward" size={21} color={fieldTheme.color.inkMuted} />
        </View>
        <View style={styles.summaryMetrics}>
          <SummaryMetric label={t("potential.potential")} value={snapshot.activeBrands > 0 ? snapshot.activePotentialValue : "—"} />
          <SummaryMetric label={t("potential.coverage")} value={snapshot.activeBrands > 0 ? snapshot.activeCoverageValue : "—"} />
          <SummaryMetric label={t("potential.percent")} value={snapshot.activeBrands > 0 ? `${snapshot.activeCoveragePct}%` : "—"} accent />
        </View>
      </Pressable>

      <View style={[styles.sectionCards, tablet && styles.sectionCardsTablet]}>
        <SummarySectionCard
          icon="analytics-outline"
          title={t("contacts.tab_scoring")}
          value={snapshot.currentScore == null ? "—" : String(snapshot.currentScore)}
          hint={currentAssessment ? t("contacts.friendlyCurrentScore") : t("contacts.friendlyScoreEmpty")}
          onPress={() => onSection("scoring")}
          tablet={tablet}
        />
        <SummarySectionCard
          icon="business-outline"
          title={t("contacts.tab_workplaces")}
          value={String(snapshot.activeWorkplaces)}
          hint={snapshot.primaryWorkplace?.name || t("contacts.friendlyNoWorkplace")}
          onPress={() => onSection("workplaces")}
          tablet={tablet}
        />
      </View>

      <Disclosure
        icon="folder-open-outline"
        title={t("contacts.friendlyMoreDetails")}
        body={t("contacts.friendlyMoreDetailsBody")}
        expanded={detailsExpanded}
        onPress={onToggleDetails}
      >
        <NavigateRow icon="person-outline" title={t("contacts.tab_overview")} body={t("contacts.friendlyOverviewBody")} onPress={() => onSection("overview")} />
        <NavigateRow icon="shield-checkmark-outline" title={t("contacts.tab_requests")} body={pendingCountText(snapshot.pendingChanges, t)} badge={snapshot.pendingChanges || undefined} onPress={() => onSection("requests")} />
        <NavigateRow icon="time-outline" title={t("contacts.tab_history")} body={t("contacts.friendlyHistoryCount", { count: detail.history.length })} onPress={() => onSection("history")} />
      </Disclosure>

      {managementAvailable && (
        <Disclosure
          icon="settings-outline"
          title={t("contacts.friendlyManage")}
          body={offline ? t("contacts.friendlyManageOffline") : t("contacts.friendlyManageBody")}
          expanded={manageExpanded}
          onPress={onToggleManage}
          muted
        >
          <View style={styles.manageGrid}>
            {offline && !detail.canRecordBrandPotential && <Text style={styles.manageOfflineNote}>{t("contacts.friendlyManageOffline")}</Text>}
            {canChange && <ManageAction icon="create-outline" label={agentRequest ? t("contacts.requestChange") : t("common.change")} onPress={onEdit} />}
            {canChange && detail.status !== "DUPLICATE" && detail.status !== "MERGED" && <ManageAction icon="git-compare-outline" label={t("contacts.reportDuplicate")} onPress={onDuplicate} />}
            {canChange && <ManageAction icon="business-outline" label={t("contacts.addWorkplace")} onPress={onAddWorkplace} />}
            {detail.canManage && !offline && <ManageAction icon="analytics-outline" label={t("contacts.scoringNew")} onPress={onAddAssessment} />}
            {detail.canRecordBrandPotential && <ManageAction icon="ribbon-outline" label={t("potential.add")} onPress={onAddPotential} />}
          </View>
        </Disclosure>
      )}
    </View>
  )
}

function pendingCountText(count: number, t: (key: string, options?: any) => string) {
  return count > 0 ? t("contacts.friendlyPendingChanges", { count }) : t("contacts.noChangeRequests")
}

function SummaryPill({ icon, text }: { icon: string; text: string }) {
  return <View style={styles.summaryPill}><Icon name={icon} size={15} color={fieldTheme.color.primary} /><Text style={styles.summaryPillText}>{text}</Text></View>
}

function ContactAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.contactAction, pressed && styles.pressed]}><Icon name={icon} size={20} color={fieldTheme.color.primary} /><Text style={styles.contactActionText}>{label}</Text></Pressable>
}

function SummaryMetric({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return <View style={styles.summaryMetric}><Text style={[styles.summaryMetricValue, accent && styles.summaryMetricValueAccent]}>{typeof value === "number" ? value.toLocaleString() : value}</Text><Text style={styles.summaryMetricLabel}>{label}</Text></View>
}

function SummarySectionCard({ icon, title, value, hint, onPress, tablet }: { icon: string; title: string; value: string; hint: string; onPress: () => void; tablet: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.summarySectionCard, tablet && styles.summarySectionCardTablet, pressed && styles.pressed]}>
      <View style={styles.sectionCardIcon}><Icon name={icon} size={22} color={fieldTheme.color.primary} /></View>
      <View style={styles.sectionCardCopy}><Text style={styles.sectionCardTitle}>{title}</Text><Text style={styles.sectionCardBody} numberOfLines={2}>{hint}</Text></View>
      <Text style={styles.sectionCardValue}>{value}</Text>
      <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
    </Pressable>
  )
}

function Disclosure({ icon, title, body, expanded, onPress, muted, children }: { icon: string; title: string; body: string; expanded: boolean; onPress: () => void; muted?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.disclosure, muted && styles.disclosureMuted]}>
      <Pressable onPress={onPress} accessibilityState={{ expanded }} style={styles.disclosureHeader}>
        <View style={[styles.disclosureIcon, muted && styles.disclosureIconMuted]}><Icon name={icon} size={21} color={muted ? fieldTheme.color.inkMuted : fieldTheme.color.primary} /></View>
        <View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>{title}</Text><Text style={styles.disclosureBody}>{body}</Text></View>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={22} color={fieldTheme.color.inkMuted} />
      </Pressable>
      {expanded && <View style={styles.disclosureContent}>{children}</View>}
    </View>
  )
}

function NavigateRow({ icon, title, body, badge, onPress }: { icon: string; title: string; body: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.navigateRow, pressed && styles.pressed]}>
      <Icon name={icon} size={21} color={fieldTheme.color.primary} />
      <View style={styles.navigateCopy}><Text style={styles.navigateTitle}>{title}</Text><Text style={styles.navigateBody}>{body}</Text></View>
      {!!badge && <Text style={styles.rowBadge}>{badge}</Text>}
      <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
    </Pressable>
  )
}

function ManageAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.manageAction, pressed && styles.pressed]}><Icon name={icon} size={21} color={fieldTheme.color.primary} /><Text style={styles.manageActionText}>{label}</Text></Pressable>
}

function Scoring({
  detail,
  offline,
  tablet,
  locale,
  t,
  onAdd,
  onDecision,
}: {
  detail: ContactDetail
  offline: boolean
  tablet: boolean
  locale: string
  t: (key: string) => string
  onAdd: () => void
  onDecision: (assessment: DoctorAssessment, decision: "VERIFIED" | "REJECTED") => void
}) {
  const current = detail.doctorAssessments[0]
  return (
    <View style={styles.scoringStack}>
      <View style={styles.scoreHero}>
        <View style={styles.scoreHeroCopy}>
          <Text style={styles.scoreEyebrow}>{t("contacts.scoringTitle")}</Text>
          <Text style={styles.scoreHeroTitle}>{current ? t("contacts.scoringCurrent") : t("contacts.scoringEmptyTitle")}</Text>
          <Text style={styles.scoreHeroBody}>{current ? `${current.formulaName || t("contacts.scoringFormula")} · ${current.formulaVersion}` : t("contacts.scoringEmptyBody")}</Text>
        </View>
        {current ? <View style={styles.scoreRing}><Text style={styles.scoreRingValue}>{current.actualScore ?? "—"}</Text><Text style={styles.scoreRingLabel}>{t("contacts.scoringActual")}</Text></View> : <View style={styles.scoreEmptyIcon}><Icon name="analytics-outline" size={28} color="#08705A" /></View>}
        {detail.canManage && !offline && <Pressable style={styles.scoreAdd} onPress={onAdd}><Icon name="add" size={19} color="#F8FCFA" /><Text style={styles.scoreAddText}>{t("contacts.scoringNew")}</Text></Pressable>}
      </View>

      {detail.doctorAssessments.length === 0 ? <View style={styles.card}><Text style={styles.emptyRow}>{t("contacts.scoringNoHistory")}</Text></View> : detail.doctorAssessments.map((assessment, index) => (
        <View key={assessment.id} style={[styles.assessment, tablet && styles.assessmentTablet]}>
          <View style={styles.assessmentTop}>
            <View style={[styles.statusBadge, assessment.status === "VERIFIED" ? styles.statusVerified : assessment.status === "REJECTED" ? styles.statusRejected : styles.statusPending]}><Text style={styles.statusText}>{t(`contacts.scoringStatus_${assessment.status}`)}</Text></View>
            <Text style={styles.assessmentPeriod}>{assessment.periodStart}{assessment.periodEnd ? ` → ${assessment.periodEnd}` : ""}</Text>
            {index === 0 && <Text style={styles.currentPill}>{t("contacts.scoringLatest")}</Text>}
          </View>
          <View style={styles.assessmentMetrics}>
            <Metric label={t("contacts.scoringActual")} value={assessment.actualScore} strong />
            <Metric label={t("contacts.scoringTarget")} value={assessment.targetScore} />
            <Metric label={t("contacts.scoringPatients")} value={assessment.patientsPerMonth} />
            <Metric label={t("contacts.scoringBeds")} value={assessment.bedCount} />
          </View>
          <View style={styles.assessmentFacts}>
            <Fact icon="medical-outline" value={[assessment.granularCategory, assessment.profile, assessment.psychotype].filter(Boolean).join(" · ")} />
            <Fact icon="location-outline" value={assessment.office} />
            <Fact icon="star-outline" value={assessment.isKol ? `${t("contacts.scoringKol")}${assessment.kolLevel ? ` · ${assessment.kolLevel}` : ""}` : undefined} />
            <Fact icon="shield-checkmark-outline" value={`${assessment.formulaName || t("contacts.scoringFormula")} ${assessment.formulaVersion} · ${assessment.source}`} />
          </View>
          {!!assessment.reviewComment && <Text style={styles.reviewComment}>{assessment.reviewComment}</Text>}
          <Text style={styles.assessmentMeta}>{[assessment.enteredByName, assessment.createdAt ? new Date(assessment.createdAt).toLocaleString(locale) : "", assessment.reviewedByName].filter(Boolean).join(" · ")}</Text>
          {detail.canManage && !offline && assessment.status === "PENDING" && <View style={styles.reviewActions}>
            <Pressable style={styles.rejectButton} onPress={() => onDecision(assessment, "REJECTED")}><Text style={styles.rejectButtonText}>{t("contacts.scoringReject")}</Text></Pressable>
            <Pressable style={styles.verifyButton} onPress={() => onDecision(assessment, "VERIFIED")}><Icon name="checkmark" size={18} color="#F8FCFA" /><Text style={styles.verifyButtonText}>{t("contacts.scoringVerify")}</Text></Pressable>
          </View>}
        </View>
      ))}
    </View>
  )
}

function BrandPotentials({
  detail,
  offline,
  tablet,
  locale,
  t,
  onAdd,
  onDecision,
  onEnd,
  onVisit,
}: {
  detail: ContactDetail
  offline: boolean
  tablet: boolean
  locale: string
  t: (key: string) => string
  onAdd: (previous?: BrandPotential) => void
  onDecision: (potential: BrandPotential, decision: "VERIFIED" | "REJECTED") => void
  onEnd: (potential: BrandPotential) => void
  onVisit: (visitId: string, visitName?: string) => void
}) {
  const active = detail.brandPotentials.filter((item) => !["ENDED", "REJECTED"].includes(item.status))
  const totalPotential = active.reduce((sum, item) => sum + item.potentialValue, 0)
  const totalCoverage = active.reduce((sum, item) => sum + item.coverageValue, 0)
  const totalPct = totalPotential > 0 ? Math.round((totalCoverage / totalPotential) * 1000) / 10 : 0
  return (
    <View style={styles.brandStack}>
      <View style={styles.brandHero}>
        <View style={styles.brandHeroCopy}>
          <Text style={styles.brandEyebrow}>{t("potential.workflow")}</Text>
          <Text style={styles.brandHeroTitle}>{t("potential.title")}</Text>
          <Text style={styles.brandHeroBody}>{detail.brandPotentialPerAgent ? t("potential.perAgentOn") : t("potential.perAgentOff")}</Text>
        </View>
        <View style={styles.brandHeroMetrics}>
          <Metric label={t("potential.potential")} value={totalPotential} />
          <Metric label={t("potential.coverage")} value={totalCoverage} />
          <Metric label={t("potential.percent")} value={`${totalPct}%`} strong />
        </View>
        {detail.canRecordBrandPotential && <Pressable style={styles.scoreAdd} onPress={() => onAdd()}><Icon name="add" size={19} color="#F8FCFA" /><Text style={styles.scoreAddText}>{t("potential.add")}</Text></Pressable>}
      </View>

      {detail.brandPotentials.length === 0 ? <View style={styles.card}><Text style={styles.emptyRow}>{t("potential.empty")}</Text></View> : (
        <View style={[styles.brandGrid, tablet && styles.brandGridTablet]}>
          {detail.brandPotentials.map((item) => {
            const clampedPct = Math.max(0, Math.min(item.coveragePct, 100))
            return (
              <View key={item.id} style={[styles.brandCard, tablet && styles.brandCardTablet]}>
                <View style={styles.brandTop}>
                  <View style={styles.brandMark}><Text style={styles.brandMarkText}>{upper(item.brandName.slice(0, 2))}</Text></View>
                  <View style={styles.brandIdentity}><Text style={styles.brandName}>{item.brandName || item.brandExternalId}</Text><Text style={styles.brandProduct}>{item.productName || item.productExternalId || item.brandExternalId}</Text></View>
                  <View style={[styles.statusBadge, item.status === "VERIFIED" ? styles.statusVerified : item.status === "REJECTED" ? styles.statusRejected : item.status === "ENDED" ? styles.statusEnded : styles.statusPending]}><Text style={styles.statusText}>{t(`potential.status_${item.status}`)}</Text></View>
                </View>
                <View style={styles.brandNumbers}><Metric label={t("potential.potential")} value={item.potentialValue} /><Metric label={t("potential.coverage")} value={item.coverageValue} /><Metric label={t("potential.percent")} value={`${item.coveragePct}%`} strong /></View>
                <View style={styles.coverageTrack}><View style={[styles.coverageFill, { width: `${clampedPct}%` }]} /></View>
                <Text style={styles.brandMeta}>{[item.agentName, item.categoryLabel || item.category, `${item.periodStart}${item.periodEnd ? ` → ${item.periodEnd}` : ""}`].filter(Boolean).join(" · ")}</Text>
                <Text style={styles.brandMeta}>{[item.source, item.formulaVersion, item.enteredByName, item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : ""].filter(Boolean).join(" · ")}</Text>
                {!!item.reviewComment && <Text style={styles.reviewComment}>{item.reviewComment}</Text>}
                {item.evidenceVisits.length > 0 && <View style={styles.evidenceList}><Text style={styles.evidenceTitle}>{t("potential.evidenceVisits")}</Text>{item.evidenceVisits.map((visit) => <Pressable key={visit.id} onPress={() => onVisit(visit.id, visit.customerName)} style={styles.evidenceLink}><Icon name="navigate-circle-outline" size={18} color="#08705A" /><Text style={styles.evidenceLinkText}>{visit.customerName || t("potential.visit")} · {visit.checkInAt ? new Date(visit.checkInAt).toLocaleDateString(locale) : visit.id}</Text><Icon name="chevron-forward" size={16} color="#86978F" /></Pressable>)}</View>}
                <View style={styles.brandActions}>
                  {detail.canRecordBrandPotential && item.status !== "ENDED" && <Pressable style={styles.brandActionSecondary} onPress={() => onAdd(item)}><Text style={styles.brandActionSecondaryText}>{t("potential.newVersion")}</Text></Pressable>}
                  {detail.canRecordBrandPotential && item.status !== "ENDED" && <Pressable style={styles.brandActionSecondary} onPress={() => onEnd(item)}><Text style={styles.brandActionSecondaryText}>{t("potential.end")}</Text></Pressable>}
                  {!offline && detail.canReviewBrandPotential && item.status === "PENDING" && <><Pressable style={styles.rejectButton} onPress={() => onDecision(item, "REJECTED")}><Text style={styles.rejectButtonText}>{t("potential.reject")}</Text></Pressable><Pressable style={styles.verifyButton} onPress={() => onDecision(item, "VERIFIED")}><Icon name="checkmark" size={18} color="#F8FCFA" /><Text style={styles.verifyButtonText}>{t("potential.verify")}</Text></Pressable></>}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function Metric({ label, value, strong }: { label: string; value?: number | string; strong?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, strong && styles.metricValueStrong]}>{value ?? "—"}</Text><Text style={styles.metricLabel}>{label}</Text></View>
}

function Fact({ icon, value }: { icon: string; value?: string }) {
  if (!value) return null
  return <View style={styles.fact}><Icon name={icon} size={16} color="#5E7069" /><Text style={styles.factText}>{value}</Text></View>
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

function Field({ label, value }: { label: string; value?: string }) { if (!value) return null; return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View> }
function Stat({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) { return <View style={styles.potentialStat}><Text style={[styles.potentialValue, accent && styles.accent]}>{typeof value === "number" ? value.toLocaleString() : value}</Text><Text style={styles.potentialLabel}>{label}</Text></View> }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingBottom: 14, paddingHorizontal: fieldTheme.space.md, borderBottomLeftRadius: fieldTheme.radius.lg, borderBottomRightRadius: fieldTheme.radius.lg },
  headerRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  backBtn: { minWidth: 84, minHeight: 48, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.13)" },
  backText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "800" },
  avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  headerMain: { flex: 1, minWidth: 0 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 20, fontWeight: "900" },
  headerSubtitle: { color: "rgba(248,252,250,0.78)", fontSize: 13, marginTop: 3 },
  categoryBadge: { minWidth: 38, minHeight: 38, paddingHorizontal: 9, justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center" },
  categoryText: { color: fieldTheme.color.onColor, fontWeight: "900" },
  scroll: { padding: fieldTheme.space.md, paddingBottom: 56 },
  scrollTablet: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: fieldTheme.space.xl },
  overviewGrid: { gap: fieldTheme.space.md }, overviewGridTablet: { flexDirection: "row", flexWrap: "wrap" }, halfCard: { width: "48.8%" },
  stateCard: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl, gap: fieldTheme.space.md },
  stateIcon: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: fieldTheme.color.coralSoft },
  stateTitle: { color: fieldTheme.color.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateBody: { maxWidth: 430, color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  retryButton: { minHeight: 50, minWidth: 150, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  offlineBanner: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.sm, marginBottom: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft, borderWidth: 1, borderColor: "#E9D49A" },
  offlineCopy: { minWidth: 220, flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  offlineTextGroup: { flex: 1 },
  offlineTitle: { color: fieldTheme.color.amber, fontSize: 13, fontWeight: "900" },
  offlineBannerText: { color: fieldTheme.color.amber, fontSize: 11, lineHeight: 16, marginTop: 2 },
  offlineRetry: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.62)" },
  offlineRetryText: { color: fieldTheme.color.amber, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
  friendlyStack: { gap: fieldTheme.space.md },
  summaryTop: { gap: fieldTheme.space.md },
  summaryTopTablet: { flexDirection: "row", alignItems: "stretch" },
  summaryColumn: { flex: 1 },
  identityCard: { minHeight: 210, padding: 20, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  eyebrow: { color: fieldTheme.color.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  identityName: { color: fieldTheme.color.ink, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 7 },
  identityPills: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  summaryPill: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  summaryPillText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "800" },
  workplaceSummary: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  summaryIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: fieldTheme.color.primarySoft },
  summaryCopy: { flex: 1 },
  summaryLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  summaryValue: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900", marginTop: 2 },
  summaryHint: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  nextCard: { minHeight: 210, justifyContent: "center", padding: 20, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.primarySoft, borderWidth: 1, borderColor: "#B7DDCE" },
  nextEyebrow: { color: fieldTheme.color.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  nextTitle: { color: fieldTheme.color.ink, fontSize: 22, lineHeight: 28, fontWeight: "900", marginTop: 7 },
  nextBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  primaryButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 18, paddingHorizontal: 16, borderRadius: 15, backgroundColor: fieldTheme.color.primary },
  primaryButtonText: { flex: 1, color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900", textAlign: "center" },
  contactNowCard: { padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, gap: fieldTheme.space.md },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeadingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: fieldTheme.color.primarySoft },
  cardHeadingCopy: { flex: 1 },
  cardHeadingTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  cardHeadingBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  contactActions: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  contactAction: { minHeight: 48, minWidth: 112, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  contactActionActive: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  contactActionText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  contactActionTextActive: { color: fieldTheme.color.onColor },
  focusHeader: { paddingHorizontal: 4, marginTop: 5 },
  focusTitle: { color: fieldTheme.color.ink, fontSize: 19, fontWeight: "900" },
  focusBody: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  brandSummaryCard: { padding: fieldTheme.space.lg, borderRadius: fieldTheme.radius.lg, backgroundColor: fieldTheme.color.violetSoft, borderWidth: 1, borderColor: "#D7C8ED", gap: fieldTheme.space.md },
  sectionCardTop: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 },
  sectionCardIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.primarySoft },
  violetIcon: { backgroundColor: "rgba(255,255,255,0.7)" },
  sectionCardCopy: { flex: 1, minWidth: 0 },
  sectionCardTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  sectionCardBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  pendingBadge: { color: fieldTheme.color.amber, backgroundColor: fieldTheme.color.amberSoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  summaryMetrics: { flexDirection: "row", borderRadius: 13, backgroundColor: "rgba(255,255,255,0.72)", overflow: "hidden" },
  summaryMetric: { flex: 1, minHeight: 68, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  summaryMetricValue: { color: fieldTheme.color.ink, fontSize: 18, fontWeight: "900" },
  summaryMetricValueAccent: { color: fieldTheme.color.violet },
  summaryMetricLabel: { color: fieldTheme.color.inkMuted, fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 3 },
  sectionCards: { gap: fieldTheme.space.sm },
  sectionCardsTablet: { flexDirection: "row" },
  summarySectionCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 10, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  summarySectionCardTablet: { flex: 1 },
  sectionCardValue: { color: fieldTheme.color.primary, fontSize: 23, fontWeight: "900" },
  disclosure: { borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, overflow: "hidden" },
  disclosureMuted: { backgroundColor: "#F7FAF8" },
  disclosureHeader: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: fieldTheme.space.md, paddingVertical: 10 },
  disclosureIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: fieldTheme.color.primarySoft },
  disclosureIconMuted: { backgroundColor: fieldTheme.color.surfaceStrong },
  disclosureCopy: { flex: 1 },
  disclosureTitle: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "900" },
  disclosureBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  disclosureContent: { padding: fieldTheme.space.sm, paddingTop: 0 },
  navigateRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  navigateCopy: { flex: 1 },
  navigateTitle: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "900" },
  navigateBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  rowBadge: { minWidth: 26, textAlign: "center", color: fieldTheme.color.amber, backgroundColor: fieldTheme.color.amberSoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: "900" },
  manageGrid: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, paddingTop: fieldTheme.space.sm, borderTopWidth: 1, borderTopColor: fieldTheme.color.border },
  manageOfflineNote: { flex: 1, minWidth: 220, color: fieldTheme.color.amber, fontSize: 12, lineHeight: 18, padding: 10 },
  manageAction: { minHeight: 50, minWidth: 150, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border },
  manageActionText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900", textAlign: "center" },
  sectionReturn: { gap: 10, marginBottom: fieldTheme.space.md },
  sectionBack: { minHeight: 48, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: fieldTheme.color.primarySoft },
  sectionBackText: { color: fieldTheme.color.primary, fontSize: 13, fontWeight: "900" },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 24, fontWeight: "900" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#e9edf3" }, cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }, cardTitle: { flex: 1, fontSize: 12, fontWeight: "900", color: "#111827", letterSpacing: 0.55, marginBottom: 8 }, addBtn: { minHeight: 48, paddingHorizontal: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#ede9fe" }, addBtnText: { color: "#5b21b6", fontSize: 12, fontWeight: "900" },
  field: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f1f5f9" }, fieldLabel: { width: "42%", color: "#64748b", fontSize: 12, fontWeight: "700" }, fieldValue: { flex: 1, color: "#1e293b", fontSize: 13, fontWeight: "600" }, emptyRow: { color: "#94a3b8", fontSize: 13, paddingVertical: 8 },
  workplaceRow: { flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" }, workplaceMain: { flex: 1 }, workplaceTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }, rowName: { color: "#0f172a", fontSize: 15, fontWeight: "900" }, rowSub: { color: "#64748b", fontSize: 12, marginTop: 4 }, dateMeta: { color: "#94a3b8", fontSize: 11, marginTop: 5 }, primaryPill: { color: "#92400e", backgroundColor: "#fef3c7", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" }, endedPill: { color: "#64748b", backgroundColor: "#f1f5f9", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontWeight: "900" }, rowActions: { flexDirection: "row", gap: 5 }, iconBtn: { width: 48, height: 48, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  potentialCard: { width: "100%" }, potentialRow: { flexDirection: "row" }, potentialStat: { flex: 1, alignItems: "center" }, potentialValue: { color: "#0f172a", fontSize: 20, fontWeight: "900" }, potentialLabel: { color: "#94a3b8", fontSize: 10, marginTop: 3, textAlign: "center" }, accent: { color: "#6C63FF" },
  timelineRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f1f5f9" }, timelineDot: { width: 11, height: 11, borderRadius: 99 }, dotSuccess: { backgroundColor: "#22c55e" }, dotError: { backgroundColor: "#ef4444" }, dotPending: { backgroundColor: "#f59e0b" }, historyIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" }, timelineCopy: { flex: 1 }, timelineTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900" }, timelineMeta: { color: "#64748b", fontSize: 12, lineHeight: 17, marginTop: 3 },
  scoringStack: { gap: 14 },
  scoreHero: { minHeight: 142, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14, padding: 18, borderRadius: 20, backgroundColor: "#D9F1E8", borderWidth: 1, borderColor: "#B7DDCE" },
  scoreHeroCopy: { flex: 1, minWidth: 210 }, scoreEyebrow: { color: "#08705A", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }, scoreHeroTitle: { color: "#13231F", fontSize: 21, fontWeight: "900", marginTop: 5 }, scoreHeroBody: { color: "#5E7069", fontSize: 12, lineHeight: 18, marginTop: 5 },
  scoreRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 8, borderColor: "#08705A", alignItems: "center", justifyContent: "center", backgroundColor: "#FBFDFC" }, scoreRingValue: { color: "#055342", fontSize: 20, fontWeight: "900" }, scoreRingLabel: { color: "#5E7069", fontSize: 9, fontWeight: "800" }, scoreEmptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FBFDFC" },
  scoreAdd: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 15, borderRadius: 12, backgroundColor: "#08705A" }, scoreAddText: { color: "#F8FCFA", fontSize: 13, fontWeight: "900" },
  assessment: { padding: 16, borderRadius: 18, backgroundColor: "#FBFDFC", borderWidth: 1, borderColor: "#D6E3DC", gap: 13 }, assessmentTablet: { padding: 20 }, assessmentTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, statusBadge: { minHeight: 28, justifyContent: "center", paddingHorizontal: 10, borderRadius: 999 }, statusVerified: { backgroundColor: "#DAEFE4" }, statusRejected: { backgroundColor: "#FDE6DF" }, statusEnded: { backgroundColor: "#E8EDF2" }, statusPending: { backgroundColor: "#FAEECF" }, statusText: { color: "#13231F", fontSize: 10, fontWeight: "900" }, assessmentPeriod: { color: "#5E7069", fontSize: 12, fontWeight: "700" }, currentPill: { marginLeft: "auto", color: "#7155B7", backgroundColor: "#ECE6F7", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  assessmentMetrics: { flexDirection: "row", flexWrap: "wrap", borderRadius: 14, backgroundColor: "#F1F6F3", overflow: "hidden" }, metric: { minWidth: 120, flex: 1, paddingVertical: 13, paddingHorizontal: 10, alignItems: "center" }, metricValue: { color: "#13231F", fontSize: 18, fontWeight: "800" }, metricValueStrong: { color: "#08705A", fontSize: 23 }, metricLabel: { color: "#5E7069", fontSize: 9, fontWeight: "800", marginTop: 3, textAlign: "center" },
  assessmentFacts: { gap: 7 }, fact: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 8 }, factText: { flex: 1, color: "#33443E", fontSize: 12, lineHeight: 17 }, reviewComment: { color: "#33443E", fontSize: 12, lineHeight: 18, padding: 11, borderRadius: 10, backgroundColor: "#F1F6F3" }, assessmentMeta: { color: "#86978F", fontSize: 10 },
  reviewActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 }, rejectButton: { minHeight: 48, minWidth: 104, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: "#EDB9AD", backgroundColor: "#FBFDFC" }, rejectButtonText: { color: "#A43B25", fontSize: 13, fontWeight: "900" }, verifyButton: { minHeight: 48, minWidth: 120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, borderRadius: 11, backgroundColor: "#08705A" }, verifyButtonText: { color: "#F8FCFA", fontSize: 13, fontWeight: "900" },
  brandStack: { gap: 14 }, brandHero: { padding: 18, borderRadius: 20, backgroundColor: "#ECE6F7", borderWidth: 1, borderColor: "#D7C8ED", gap: 14 }, brandHeroCopy: { minWidth: 210 }, brandEyebrow: { color: "#7155B7", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }, brandHeroTitle: { color: "#241A38", fontSize: 22, fontWeight: "900", marginTop: 5 }, brandHeroBody: { color: "#6D607E", fontSize: 12, lineHeight: 18, marginTop: 5 }, brandHeroMetrics: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 14, overflow: "hidden" },
  brandGrid: { gap: 12 }, brandGridTablet: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" }, brandCard: { padding: 16, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", gap: 12 }, brandCardTablet: { width: "49%" }, brandTop: { flexDirection: "row", alignItems: "center", gap: 10 }, brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#ECE6F7" }, brandMarkText: { color: "#7155B7", fontSize: 13, fontWeight: "900" }, brandIdentity: { flex: 1 }, brandName: { color: "#13231F", fontSize: 16, fontWeight: "900" }, brandProduct: { color: "#64748b", fontSize: 11, marginTop: 3 }, brandNumbers: { flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 13, overflow: "hidden" }, coverageTrack: { height: 7, borderRadius: 99, backgroundColor: "#E8EDF2", overflow: "hidden" }, coverageFill: { height: "100%", borderRadius: 99, backgroundColor: "#7155B7" }, brandMeta: { color: "#64748b", fontSize: 11, lineHeight: 16 }, evidenceList: { gap: 7 }, evidenceTitle: { color: "#33443E", fontSize: 11, fontWeight: "900" }, evidenceLink: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, backgroundColor: "#F1F6F3", paddingHorizontal: 10 }, evidenceLinkText: { flex: 1, color: "#08705A", fontSize: 12, fontWeight: "800" }, brandActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }, brandActionSecondary: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D7C8ED", backgroundColor: "#FBF9FE" }, brandActionSecondaryText: { color: "#7155B7", fontSize: 12, fontWeight: "900" },
})
