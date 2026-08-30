import React, { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"
import { commercialApi } from "../../services/commercial-api"
import { managerApi } from "../../services/manager-api"
import { toContactListItem, type ContactListItem } from "../../services/contact-list"
import {
  makeContactTransferIdempotencyKey,
  toContactTransferPreview,
  toTransferAgents,
  type ContactTransferPreview,
  type TransferAgent,
} from "../../services/contact-transfer"

type Navigation = NativeStackNavigationProp<RootStackParamList>

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export default function ContactTransferScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Navigation>()
  const headerTop = useHeaderTop()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const [agents, setAgents] = useState<TransferAgent[]>([])
  const [sourceId, setSourceId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey())
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<ContactTransferPreview | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [busy, setBusy] = useState<"preview" | "execute" | null>(null)
  const [error, setError] = useState("")
  const [successCount, setSuccessCount] = useState<number | null>(null)

  const clearReview = () => {
    setPreview(null)
    setIdempotencyKey("")
    setSuccessCount(null)
    setError("")
  }

  useEffect(() => {
    managerApi.getTeam(undefined, true)
      .then((response) => setAgents(toTransferAgents(response?.data)))
      .catch(() => setError(t("contactTransfer.loadError")))
      .finally(() => setLoadingAgents(false))
  }, [t])

  useEffect(() => {
    if (!sourceId) {
      setContacts([])
      setTotal(0)
      return
    }
    const timer = setTimeout(() => {
      setLoadingContacts(true)
      commercialApi.getContacts({ ownerAgentId: sourceId, search: search.trim() || undefined, limit: 200 })
        .then((response) => {
          setContacts((response?.data?.contacts ?? []).map(toContactListItem))
          setTotal(Number(response?.data?.total ?? 0))
        })
        .catch(() => setError(t("contactTransfer.loadError")))
        .finally(() => setLoadingContacts(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, sourceId, t])

  const targetAgents = useMemo(
    () => agents.filter((agent) => agent.id !== sourceId && agent.status === "ACTIVE"),
    [agents, sourceId],
  )
  const selectedIds = useMemo(() => [...selected], [selected])
  const canPreview = selected.size > 0 && !!sourceId && !!targetId && validDate(effectiveFrom) && !busy
  const canExecute = !!preview && !!idempotencyKey && preview.summary.transferable > 0 && reason.trim().length >= 3 && !busy

  const selectSource = (id: string) => {
    setSourceId(id)
    setTargetId("")
    setSelected(new Set())
    setSearch("")
    clearReview()
  }

  const toggleContact = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    clearReview()
  }

  const review = async () => {
    if (!canPreview) return
    setBusy("preview")
    setError("")
    try {
      const response = await managerApi.previewContactTransfer({
        contactIds: selectedIds,
        sourceAgentId: sourceId,
        targetAgentId: targetId,
        effectiveFrom,
      })
      setPreview(toContactTransferPreview(response?.data))
      setIdempotencyKey(makeContactTransferIdempotencyKey())
    } catch {
      setError(t("contactTransfer.previewError"))
    } finally {
      setBusy(null)
    }
  }

  const execute = async () => {
    if (!canExecute || !preview) return
    setBusy("execute")
    setError("")
    try {
      const response = await managerApi.executeContactTransfer({
        contactIds: selectedIds,
        sourceAgentId: sourceId,
        targetAgentId: targetId,
        effectiveFrom,
        previewToken: preview.previewToken,
        idempotencyKey,
        reason: reason.trim(),
      })
      const transferred = Number(response?.data?.summary?.transferred ?? preview.summary.transferable)
      setSuccessCount(transferred)
      setSelected(new Set())
      setPreview(null)
      setIdempotencyKey("")
      setContacts((current) => current.filter((contact) => !selected.has(contact.id)))
      setTotal((current) => Math.max(0, current - transferred))
    } catch (caught: any) {
      if (caught?.code === "MTM_CONTACT_TRANSFER_STALE_PREVIEW") {
        setPreview(null)
        setIdempotencyKey("")
        setError(t("contactTransfer.staleError"))
      } else {
        setError(t("contactTransfer.executeError"))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("contactTransfer.back")} style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={22} color={fieldTheme.color.onColor} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t("contactTransfer.eyebrow")}</Text>
            <Text style={styles.title}>{t("contactTransfer.title")}</Text>
            <Text style={styles.subtitle}>{t("contactTransfer.subtitle")}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} keyboardShouldPersistTaps="handled">
        {error ? <MessageBand icon="alert-circle" tone="danger" text={error} /> : null}
        {successCount !== null ? <MessageBand icon="checkmark-circle" tone="success" text={t("contactTransfer.success", { count: successCount })} /> : null}

        <View style={[styles.workspace, tablet && styles.workspaceTablet]}>
          <View style={styles.leftColumn}>
            <SectionHeader number="01" title={t("contactTransfer.sourceTitle")} body={t("contactTransfer.sourceBody")} />
            {loadingAgents ? <ActivityIndicator color={fieldTheme.color.primary} /> : agents.length === 0 ? (
              <EmptyLine text={t("contactTransfer.noAgents")} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRail}>
                {agents.map((agent) => (
                  <AgentPill key={agent.id} agent={agent} selected={sourceId === agent.id} onPress={() => selectSource(agent.id)} />
                ))}
              </ScrollView>
            )}

            <View style={styles.sectionDivider} />
            <SectionHeader number="02" title={t("contactTransfer.contactsTitle")} body={t("contactTransfer.contactsBody")} />
            {sourceId ? (
              <>
                <View style={styles.searchRow}>
                  <View style={styles.searchBox}>
                    <Icon name="search" size={18} color={fieldTheme.color.inkMuted} />
                    <TextInput
                      value={search}
                      onChangeText={(value) => { setSearch(value); clearReview() }}
                      placeholder={t("contactTransfer.searchPlaceholder")}
                      placeholderTextColor={fieldTheme.color.inkMuted}
                      style={styles.searchInput}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.secondaryButton}
                    onPress={() => {
                      const allSelected = contacts.length > 0 && contacts.every((contact) => selected.has(contact.id))
                      setSelected(allSelected ? new Set() : new Set(contacts.map((contact) => contact.id)))
                      clearReview()
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {contacts.length > 0 && contacts.every((contact) => selected.has(contact.id))
                        ? t("contactTransfer.clearLoaded")
                        : t("contactTransfer.selectLoaded")}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.scopeCaption}>{t("contactTransfer.scopeCaption", { selected: selected.size, loaded: contacts.length, total })}</Text>
                {loadingContacts ? <ActivityIndicator color={fieldTheme.color.primary} style={styles.listLoader} /> : contacts.length === 0 ? (
                  <EmptyLine text={t("contactTransfer.noContacts")} />
                ) : (
                  <View style={styles.contactList}>
                    {contacts.map((contact) => (
                      <ContactRow key={contact.id} contact={contact} selected={selected.has(contact.id)} onPress={() => toggleContact(contact.id)} />
                    ))}
                  </View>
                )}
              </>
            ) : <EmptyLine text={t("contactTransfer.chooseSourceFirst")} />}
          </View>

          <View style={styles.rightColumn}>
            <SectionHeader number="03" title={t("contactTransfer.targetTitle")} body={t("contactTransfer.targetBody")} />
            {sourceId ? (
              targetAgents.length > 0 ? (
                <View style={styles.targetList}>
                  {targetAgents.map((agent) => (
                    <AgentPill key={agent.id} agent={agent} selected={targetId === agent.id} onPress={() => { setTargetId(agent.id); clearReview() }} wide />
                  ))}
                </View>
              ) : <EmptyLine text={t("contactTransfer.noTargetAgents")} />
            ) : <EmptyLine text={t("contactTransfer.chooseSourceFirst")} />}

            <View style={styles.formGrid}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("contactTransfer.effectiveFrom")}</Text>
                <TextInput
                  value={effectiveFrom}
                  onChangeText={(value) => { setEffectiveFrom(value); clearReview() }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={fieldTheme.color.inkMuted}
                  style={[styles.input, !validDate(effectiveFrom) && styles.inputInvalid]}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("contactTransfer.reason")}</Text>
                <TextInput
                  value={reason}
                  onChangeText={(value) => { setReason(value); setSuccessCount(null) }}
                  placeholder={t("contactTransfer.reasonPlaceholder")}
                  placeholderTextColor={fieldTheme.color.inkMuted}
                  style={[styles.input, styles.reasonInput]}
                  multiline
                  maxLength={1000}
                />
              </View>
            </View>

            <Pressable accessibilityRole="button" disabled={!canPreview} style={[styles.reviewButton, !canPreview && styles.buttonDisabled]} onPress={review}>
              {busy === "preview" ? <ActivityIndicator color={fieldTheme.color.onColor} /> : <Icon name="scan" size={19} color={fieldTheme.color.onColor} />}
              <Text style={styles.reviewButtonText}>{t("contactTransfer.review")}</Text>
            </Pressable>

            {preview ? (
              <View style={styles.previewArea}>
                <View style={styles.previewHeadingRow}>
                  <View>
                    <Text style={styles.previewEyebrow}>{t("contactTransfer.previewEyebrow")}</Text>
                    <Text style={styles.previewTitle}>{t("contactTransfer.previewTitle")}</Text>
                  </View>
                  <View style={styles.readyBadge}><Text style={styles.readyBadgeText}>{t("contactTransfer.ready")}</Text></View>
                </View>
                <View style={styles.statsRow}>
                  <Stat value={preview.summary.transferable} label={t("contactTransfer.transferable")} tone="success" />
                  <Stat value={preview.summary.excluded} label={t("contactTransfer.excluded")} tone="amber" />
                  <Stat value={preview.summary.openVisitConflicts + preview.summary.routePlanConflicts} label={t("contactTransfer.conflicts")} tone="danger" />
                </View>
                {preview.warnings.includes("SOURCE_AGENT_INACTIVE") ? (
                  <MessageBand icon="information-circle" tone="amber" text={t("contactTransfer.sourceInactiveWarning")} />
                ) : null}
                {preview.rows.filter((row) => !row.transferable).map((row) => (
                  <View key={row.contactId} style={styles.excludedRow}>
                    <Text style={styles.excludedName}>{row.displayName || row.contactId}</Text>
                    <Text style={styles.excludedReason}>{row.issues.map((issue) => t(`contactTransfer.issue.${issue}`)).join(" · ")}</Text>
                  </View>
                ))}
                <Pressable accessibilityRole="button" disabled={!canExecute} style={[styles.executeButton, !canExecute && styles.buttonDisabled]} onPress={execute}>
                  {busy === "execute" ? <ActivityIndicator color={fieldTheme.color.onColor} /> : <Icon name="swap-horizontal" size={20} color={fieldTheme.color.onColor} />}
                  <Text style={styles.executeButtonText}>{t("contactTransfer.execute", { count: preview.summary.transferable })}</Text>
                </Pressable>
                {reason.trim().length < 3 ? <Text style={styles.reasonHelp}>{t("contactTransfer.reasonRequired")}</Text> : null}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function SectionHeader({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNumber}>{number}</Text>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionBody}>{body}</Text>
      </View>
    </View>
  )
}

function AgentPill({ agent, selected, onPress, wide = false }: { agent: TransferAgent; selected: boolean; onPress: () => void; wide?: boolean }) {
  const inactive = agent.status !== "ACTIVE"
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.agentPill, wide && styles.agentPillWide, selected && styles.agentPillSelected]}>
      <View style={[styles.agentInitial, inactive && styles.agentInitialInactive, selected && styles.agentInitialSelected]}>
        <Text style={[styles.agentInitialText, selected && styles.agentInitialTextSelected]}>{agent.name.trim().charAt(0).toUpperCase() || "A"}</Text>
      </View>
      <View style={styles.agentPillCopy}>
        <Text style={[styles.agentPillName, selected && styles.agentPillNameSelected]} numberOfLines={1}>{agent.name}</Text>
        <Text style={[styles.agentPillStatus, selected && styles.agentPillStatusSelected]}>{inactive ? agent.status : "ACTIVE"}</Text>
      </View>
      {selected ? <Icon name="checkmark-circle" size={20} color={fieldTheme.color.primary} /> : null}
    </Pressable>
  )
}

function ContactRow({ contact, selected, onPress }: { contact: ContactListItem; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.contactRow, selected && styles.contactRowSelected]}>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Icon name="checkmark" size={16} color={fieldTheme.color.onColor} /> : null}</View>
      <View style={styles.contactCopy}>
        <Text style={styles.contactName}>{contact.name}</Text>
        <Text style={styles.contactMeta} numberOfLines={1}>{[contact.specialty, contact.workplace].filter(Boolean).join(" · ")}</Text>
      </View>
      {contact.category ? <Text style={styles.contactCategory}>{contact.category}</Text> : null}
    </Pressable>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <View style={styles.emptyLine}><Icon name="ellipse-outline" size={17} color={fieldTheme.color.inkMuted} /><Text style={styles.emptyText}>{text}</Text></View>
}

function MessageBand({ icon, tone, text }: { icon: string; tone: "success" | "amber" | "danger"; text: string }) {
  const palette = tone === "success"
    ? { bg: fieldTheme.color.successSoft, ink: fieldTheme.color.success }
    : tone === "amber"
      ? { bg: fieldTheme.color.amberSoft, ink: fieldTheme.color.amber }
      : { bg: fieldTheme.color.dangerSoft, ink: fieldTheme.color.danger }
  return <View style={[styles.messageBand, { backgroundColor: palette.bg }]}><Icon name={icon} size={19} color={palette.ink} /><Text style={[styles.messageText, { color: palette.ink }]}>{text}</Text></View>
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "success" | "amber" | "danger" }) {
  const color = tone === "success" ? fieldTheme.color.success : tone === "amber" ? fieldTheme.color.amber : fieldTheme.color.danger
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingHorizontal: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xl },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, maxWidth: 1180 },
  backButton: { width: 48, height: 48, borderRadius: fieldTheme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,252,250,0.12)" },
  headerCopy: { flex: 1, gap: fieldTheme.space.xs },
  eyebrow: { color: "#A8DDCB", fontSize: 11, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { color: fieldTheme.color.onColor, fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  subtitle: { color: "#D6EAE2", fontSize: 14, lineHeight: 20, maxWidth: 700 },
  content: { padding: fieldTheme.space.lg, gap: fieldTheme.space.md, paddingBottom: 80 },
  contentTablet: { padding: fieldTheme.space.xl, maxWidth: 1240, alignSelf: "center", width: "100%" },
  workspace: { gap: fieldTheme.space.xl },
  workspaceTablet: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.xl },
  leftColumn: { flex: 1.25, gap: fieldTheme.space.md, minWidth: 0 },
  rightColumn: { flex: 0.9, gap: fieldTheme.space.md, minWidth: 0, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, padding: fieldTheme.space.lg },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  sectionNumber: { color: fieldTheme.color.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1, paddingTop: 4 },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 19, fontWeight: "800" },
  sectionBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  sectionDivider: { height: 1, backgroundColor: fieldTheme.color.border, marginVertical: fieldTheme.space.sm },
  pillRail: { gap: fieldTheme.space.sm, paddingVertical: fieldTheme.space.xs },
  agentPill: { minHeight: 56, minWidth: 168, maxWidth: 230, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  agentPillWide: { width: "100%", maxWidth: undefined },
  agentPillSelected: { backgroundColor: fieldTheme.color.primarySoft, borderColor: fieldTheme.color.primary },
  agentInitial: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.blueSoft },
  agentInitialInactive: { backgroundColor: fieldTheme.color.surfaceStrong },
  agentInitialSelected: { backgroundColor: fieldTheme.color.primary },
  agentInitialText: { color: fieldTheme.color.blue, fontWeight: "900", fontSize: 15 },
  agentInitialTextSelected: { color: fieldTheme.color.onColor },
  agentPillCopy: { flex: 1, gap: 2, minWidth: 0 },
  agentPillName: { color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800" },
  agentPillNameSelected: { color: fieldTheme.color.primaryStrong },
  agentPillStatus: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  agentPillStatusSelected: { color: fieldTheme.color.primary },
  targetList: { gap: fieldTheme.space.sm },
  searchRow: { flexDirection: "row", gap: fieldTheme.space.sm, alignItems: "center" },
  searchBox: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surface, paddingHorizontal: fieldTheme.space.md },
  searchInput: { flex: 1, color: fieldTheme.color.ink, fontSize: 15, paddingVertical: fieldTheme.space.sm },
  secondaryButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.surface },
  secondaryButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "800", textAlign: "center" },
  scopeCaption: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  listLoader: { marginVertical: fieldTheme.space.xl },
  contactList: { gap: fieldTheme.space.sm },
  contactRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md },
  contactRowSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: fieldTheme.color.border, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surface },
  checkboxSelected: { backgroundColor: fieldTheme.color.primary, borderColor: fieldTheme.color.primary },
  contactCopy: { flex: 1, gap: 2, minWidth: 0 },
  contactName: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  contactMeta: { color: fieldTheme.color.inkMuted, fontSize: 12 },
  contactCategory: { minWidth: 28, textAlign: "center", color: fieldTheme.color.blue, fontWeight: "900", backgroundColor: fieldTheme.color.blueSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: fieldTheme.radius.pill },
  formGrid: { gap: fieldTheme.space.md, marginTop: fieldTheme.space.sm },
  fieldGroup: { gap: fieldTheme.space.xs },
  label: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas, color: fieldTheme.color.ink, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm, fontSize: 15 },
  inputInvalid: { borderColor: fieldTheme.color.danger, backgroundColor: fieldTheme.color.dangerSoft },
  reasonInput: { minHeight: 76, textAlignVertical: "top" },
  reviewButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, backgroundColor: fieldTheme.color.primary, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.lg },
  reviewButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  buttonDisabled: { opacity: 0.42 },
  previewArea: { gap: fieldTheme.space.md, paddingTop: fieldTheme.space.sm },
  previewHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: fieldTheme.space.md },
  previewEyebrow: { color: fieldTheme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  previewTitle: { color: fieldTheme.color.ink, fontSize: 20, fontWeight: "900" },
  readyBadge: { backgroundColor: fieldTheme.color.successSoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.md, paddingVertical: 6 },
  readyBadgeText: { color: fieldTheme.color.success, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  statsRow: { flexDirection: "row", gap: fieldTheme.space.sm },
  stat: { flex: 1, minHeight: 72, justifyContent: "center", gap: 2, backgroundColor: fieldTheme.color.canvas, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md },
  statValue: { fontSize: 23, fontWeight: "900" },
  statLabel: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "700" },
  excludedRow: { gap: 3, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.sm, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.amberSoft },
  excludedName: { color: fieldTheme.color.ink, fontSize: 13, fontWeight: "800" },
  excludedReason: { color: fieldTheme.color.amber, fontSize: 11, lineHeight: 16 },
  executeButton: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.coral, paddingHorizontal: fieldTheme.space.lg },
  executeButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  reasonHelp: { color: fieldTheme.color.inkMuted, fontSize: 11, textAlign: "center" },
  emptyLine: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  emptyText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  messageBand: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, paddingHorizontal: fieldTheme.space.md, paddingVertical: fieldTheme.space.sm },
  messageText: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 },
})
