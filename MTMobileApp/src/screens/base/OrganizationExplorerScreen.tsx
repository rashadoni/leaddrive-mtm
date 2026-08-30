import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { readOfflineOrganizations } from "../../services/offline-reads"
import {
  ORGANIZATION_COLUMNS,
  makeOrganizationAssignmentIdempotencyKey,
  normalizeFacets,
  toExplorerOrganization,
  type ExplorerOrganization,
  type OrganizationColumn,
  type OrganizationFacets,
  type OrganizationFilters,
  type OrganizationSavedView,
} from "../../services/organization-explorer"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding } from "../../hooks/useTabBarHeight"
import MobileWorkflowGuide from "../../components/MobileWorkflowGuide"

const DEFAULT_COLUMNS: OrganizationColumn[] = ["name", "type", "category", "geography", "assignedAgent", "contacts"]
const EMPTY_FACETS: OrganizationFacets = {
  region: [], administrativeDistrict: [], locality: [], cityDistrict: [], city: [],
  specialization: [], organizationKind: [], territoryCode: [], managers: [], assignableAgents: [],
}

const TYPE_LABEL: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

function todayKey(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function categoryColor(category?: string): string {
  if (category === "A") return "#16a34a"
  if (category === "B") return "#2563eb"
  if (category === "C") return "#d97706"
  return "#64748b"
}

function activeFilterCount(filters: OrganizationFilters): number {
  return Object.entries(filters).filter(([key, value]) => key !== "search" && key !== "sort" && key !== "direction" && Boolean(value)).length
}

export default function OrganizationExplorerScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tablet = width >= 768
  const tabBarPadding = useTabBarPadding()
  const agent = useAuthStore((state) => state.agent)
  const canManage = ["ADMIN", "MANAGER", "SUPERVISOR"].includes(agent?.role ?? "")

  const [rows, setRows] = useState<ExplorerOrganization[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [offlineIgnoredFilters, setOfflineIgnoredFilters] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [filters, setFilters] = useState<OrganizationFilters>({ sort: "name", direction: "asc" })
  const [search, setSearch] = useState("")
  const [columns, setColumns] = useState<OrganizationColumn[]>(DEFAULT_COLUMNS)
  const [facets, setFacets] = useState<OrganizationFacets>(EMPTY_FACETS)
  const [views, setViews] = useState<OrganizationSavedView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState("")
  const [savingView, setSavingView] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentMode, setAssignmentMode] = useState<"ASSIGN" | "UNASSIGN">("ASSIGN")
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null)
  const [effectiveFrom, setEffectiveFrom] = useState(todayKey())
  const [reason, setReason] = useState("")
  const [assignmentPreview, setAssignmentPreview] = useState<any>(null)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [assigning, setAssigning] = useState(false)
  const requestId = useRef(0)
  const requestController = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => ({ ...current, search: search.trim() || undefined })), 350)
    return () => clearTimeout(timer)
  }, [search])

  const fetchRows = useCallback(async (nextPage = 1, append = false) => {
    const currentRequestId = ++requestId.current
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const response = await api.getOrganizations({ ...filters, page: nextPage, limit: 50 }, controller.signal)
      if (currentRequestId !== requestId.current) return
      if (response.success) {
        const rawOrganizations: unknown[] = Array.isArray(response.data?.organizations) ? response.data.organizations : []
        const nextRows: ExplorerOrganization[] = rawOrganizations.map(toExplorerOrganization)
        setRows((current) => append ? [...current, ...nextRows] : nextRows)
        setTotal(Number(response.data?.total ?? nextRows.length))
        setPage(nextPage)
        setOffline(false)
        setOfflineIgnoredFilters(0)
        setLoadError(false)
        if (tablet && !append) {
          setSelectedId((current) => current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id ?? null)
        }
      } else {
        throw new Error("ORGANIZATIONS_REQUEST_FAILED")
      }
    } catch (error: any) {
      if (currentRequestId !== requestId.current || error?.name === "AbortError") return
      if (error.message !== "SESSION_EXPIRED" && agent) {
        try {
          const { assignedAgentId, assignmentState, sort, ...cacheFilters } = filters
          const [cached, allCached] = await Promise.all([
            readOfflineOrganizations(agent.organizationId, agent.id, cacheFilters),
            readOfflineOrganizations(agent.organizationId, agent.id),
          ])
          if (currentRequestId !== requestId.current) return
          if (cached.length > 0 || allCached.length > 0) {
            setRows(cached.map(toExplorerOrganization))
            setTotal(cached.length)
            setOffline(true)
            setOfflineIgnoredFilters(Number(Boolean(assignedAgentId)) + Number(Boolean(assignmentState)) + Number(Boolean(sort && sort !== "name")))
            setLoadError(false)
          } else {
            setRows([])
            setTotal(0)
            setOffline(false)
            setOfflineIgnoredFilters(0)
            setLoadError(true)
          }
        } catch {
          if (currentRequestId !== requestId.current) return
          setLoadError(true)
        }
      }
    } finally {
      if (currentRequestId === requestId.current) {
        requestController.current = null
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    }
  }, [agent, filters, tablet])

  const fetchConfiguration = useCallback(async () => {
    if (!canManage) return
    const [facetResponse, viewResponse] = await Promise.all([
      api.getOrganizationFacets().catch(() => null),
      api.getOrganizationViews().catch(() => null),
    ])
    if (facetResponse?.success) setFacets(normalizeFacets(facetResponse.data))
    if (viewResponse?.success) {
      const nextViews = (viewResponse.data?.views ?? []) as OrganizationSavedView[]
      setViews(nextViews)
      const defaultView = nextViews.find((view) => view.isDefault)
      if (defaultView) {
        const { columns: savedColumns, ...savedFilters } = defaultView.filters ?? {}
        setFilters(savedFilters)
        setSearch(savedFilters.search ?? "")
        if (savedColumns?.length) setColumns(savedColumns)
      }
    }
  }, [canManage])

  useEffect(() => { fetchConfiguration() }, [fetchConfiguration])
  useEffect(() => { fetchRows(1, false) }, [fetchRows])
  useEffect(() => () => {
    requestId.current += 1
    requestController.current?.abort()
  }, [])

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])
  const filterCount = activeFilterCount(filters)
  const visibleSelectedCount = useMemo(() => rows.reduce((count, row) => count + Number(selectedIds.has(row.id)), 0), [rows, selectedIds])
  const hiddenSelectedCount = Math.max(0, selectedIds.size - visibleSelectedCount)

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openRow = (item: ExplorerOrganization) => {
    if (selectionMode || selectedIds.size > 0) return toggleSelected(item.id)
    if (tablet) setSelectedId(item.id)
    else navigation.navigate("OrganizationDetail", { id: item.id, name: item.name })
  }

  const applyView = (view: OrganizationSavedView) => {
    const { columns: savedColumns, ...savedFilters } = view.filters ?? {}
    setFilters(savedFilters)
    setSearch(savedFilters.search ?? "")
    if (savedColumns?.length) setColumns(savedColumns)
  }

  const saveView = async () => {
    if (!viewName.trim()) return
    setSavingView(true)
    try {
      await api.createOrganizationView({ name: viewName.trim(), filters: { ...filters }, columns })
      setViewName("")
      setSaveOpen(false)
      await fetchConfiguration()
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message)
    } finally {
      setSavingView(false)
    }
  }

  const openAssignment = (mode: "ASSIGN" | "UNASSIGN") => {
    if (hiddenSelectedCount > 0 || loading) return
    setAssignmentMode(mode)
    setTargetAgentId(null)
    setEffectiveFrom(todayKey())
    setReason("")
    setAssignmentPreview(null)
    setIdempotencyKey("")
    setAssignmentOpen(true)
  }

  const previewAssignment = async () => {
    if (!reason.trim() || (assignmentMode === "ASSIGN" && !targetAgentId)) return
    setAssigning(true)
    try {
      const response = await api.previewOrganizationAssignment({
        organizationIds: [...selectedIds], mode: assignmentMode, targetAgentId,
        effectiveFrom, reason: reason.trim(),
      })
      setAssignmentPreview(response.data)
      setIdempotencyKey(makeOrganizationAssignmentIdempotencyKey())
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message)
    } finally {
      setAssigning(false)
    }
  }

  const executeAssignment = async () => {
    if (!assignmentPreview || !idempotencyKey) return
    setAssigning(true)
    try {
      await api.executeOrganizationAssignment({
        organizationIds: [...selectedIds], mode: assignmentMode, targetAgentId,
        effectiveFrom, reason: reason.trim(), previewToken: assignmentPreview.previewToken, idempotencyKey,
      })
      setAssignmentOpen(false)
      setSelectedIds(new Set())
      setSelectionMode(false)
      await Promise.all([fetchRows(1, false), fetchConfiguration()])
      Alert.alert(t("organizations.assignmentDoneTitle"), t("organizations.assignmentDoneBody"))
    } catch (error: any) {
      setAssignmentPreview(null)
      Alert.alert(t("common.error"), error.message)
    } finally {
      setAssigning(false)
    }
  }

  const renderRow = ({ item }: { item: ExplorerOrganization }) => {
    const checked = selectedIds.has(item.id)
    const active = tablet && selectedId === item.id
    return (
      <Pressable
        accessibilityRole={selectionMode || selectedIds.size > 0 ? "checkbox" : "button"}
        accessibilityState={selectionMode || selectedIds.size > 0 ? { checked } : { selected: active }}
        accessibilityLabel={item.name}
        onPress={() => openRow(item)}
        style={[styles.card, active && styles.cardActive, checked && styles.cardChecked]}
      >
        <View style={styles.cardTop}>
          {selectionMode || selectedIds.size > 0 ? <View style={[styles.checkbox, checked && styles.checkboxOn]}><Text style={styles.checkboxText}>{checked ? "✓" : ""}</Text></View> : null}
          <View style={styles.cardMain}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            {columns.includes("type") ? <Text style={styles.cardSub} numberOfLines={1}>
              {item.objectType ? t(TYPE_LABEL[item.objectType] ?? "organizations.objectOther") : t("organizations.objectOther")}
              {item.organizationKind ? ` · ${item.organizationKind}` : ""}
            </Text> : null}
          </View>
          {columns.includes("category") && item.category ? <View style={[styles.category, { backgroundColor: `${categoryColor(item.category)}18` }]}><Text style={[styles.categoryText, { color: categoryColor(item.category) }]}>{item.category}</Text></View> : null}
        </View>
        <ColumnRows item={item} columns={columns} t={t} />
      </Pressable>
    )
  }

  const list = (
    <View style={[styles.listPane, tablet && styles.tabletListPane]}>
      <View style={styles.guideWrap}>
        <MobileWorkflowGuide
          title={t("organizations.guideTitle")}
          body={t("organizations.guideBody")}
          steps={[
            { icon: "search-outline", label: t("organizations.guideSearch") },
            { icon: "checkmark-circle-outline", label: t("organizations.guideSelect") },
            { icon: "person-add-outline", label: t("organizations.guideAssign") },
          ]}
        />
      </View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("organizations.searchPlaceholder")}
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={styles.quickActions}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: filterCount > 0 }} style={[styles.quickAction, filterCount > 0 && styles.quickActionActive]} onPress={() => setFilterOpen(true)}>
          <Icon name="options-outline" size={18} color={filterCount > 0 ? "#fff" : "#0f766e"} />
          <Text style={[styles.quickActionText, filterCount > 0 && styles.quickActionTextActive]}>{t("organizations.filters")}{filterCount > 0 ? ` · ${filterCount}` : ""}</Text>
        </Pressable>
        {canManage ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectionMode }}
              style={[styles.quickAction, selectionMode && styles.quickActionActive]}
              onPress={() => {
                if (selectionMode) setSelectedIds(new Set())
                setSelectionMode((current) => !current)
              }}
            >
              <Icon name={selectionMode ? "checkmark-circle" : "checkbox-outline"} size={18} color={selectionMode ? "#fff" : "#0f766e"} />
              <Text style={[styles.quickActionText, selectionMode && styles.quickActionTextActive]}>{t(selectionMode ? "organizations.finishSelection" : "organizations.select")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.quickAction} onPress={() => setColumnsOpen(true)}>
              <Icon name="eye-outline" size={18} color="#0f766e" />
              <Text style={styles.quickActionText}>{t("organizations.viewSettings")}</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {canManage && views.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.viewBar}>
          {views.map((view) => <Pressable accessibilityRole="button" key={view.id} style={styles.viewChip} onPress={() => applyView(view)}><Text style={styles.viewChipText}>{view.name}</Text></Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel={t("organizations.saveView")} style={styles.viewAdd} onPress={() => setSaveOpen(true)}><Text style={styles.viewAddText}>＋</Text></Pressable>
        </ScrollView>
      ) : canManage ? (
        <Pressable accessibilityRole="button" style={styles.saveHint} onPress={() => setSaveOpen(true)}><Text style={styles.saveHintText}>{t("organizations.saveView")}</Text></Pressable>
      ) : null}

      {offline ? <View style={styles.offline}><Text style={styles.offlineText}>● {t("common.offlineCached")}</Text></View> : null}
      {offline && offlineIgnoredFilters > 0 ? <View style={styles.offlineFilterNotice}><Text style={styles.offlineFilterNoticeText}>{t("organizations.offlineFilterNotice", { count: offlineIgnoredFilters })}</Text></View> : null}
      {loadError ? (
        <View style={styles.loadError}>
          <Icon name="cloud-offline-outline" size={20} color="#b45309" />
          <Text style={styles.loadErrorText}>{t("organizations.loadError")}</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => fetchRows(1, false)}><Text style={styles.retryButtonText}>{t("organizations.retry")}</Text></Pressable>
        </View>
      ) : null}
      <View style={styles.resultHeader}>
        <Text style={styles.resultCount}>{t("organizations.totalTemplate", { n: total })}</Text>
        {canManage && selectionMode && selectedIds.size === 0 ? <Text style={styles.selectHint}>{t("organizations.tapToSelect")}</Text> : null}
      </View>

      {selectedIds.size > 0 ? (
        <View style={styles.selectionBar}>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionCount}>{t("organizations.selectedTemplate", { n: selectedIds.size })}</Text>
            {hiddenSelectedCount > 0 ? <Text style={styles.hiddenSelectionWarning}>{t("organizations.hiddenSelectedTemplate", { n: hiddenSelectedCount })}</Text> : null}
          </View>
          {hiddenSelectedCount > 0 ? (
            <Pressable accessibilityRole="button" style={styles.selectionActionSecondary} onPress={() => setSelectedIds(new Set(rows.filter((row) => selectedIds.has(row.id)).map((row) => row.id)))}><Text style={styles.selectionActionSecondaryText}>{t("organizations.removeHidden")}</Text></Pressable>
          ) : (
            <>
              <Pressable accessibilityRole="button" disabled={loading} style={[styles.selectionAction, loading && styles.buttonDisabled]} onPress={() => openAssignment("ASSIGN")}><Text style={styles.selectionActionText}>{t("organizations.assign")}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={loading} style={[styles.selectionActionSecondary, loading && styles.buttonDisabled]} onPress={() => openAssignment("UNASSIGN")}><Text style={styles.selectionActionSecondaryText}>{t("organizations.unassign")}</Text></Pressable>
            </>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={t("organizations.clearSelection")} style={styles.clearSelectionButton} onPress={() => setSelectedIds(new Set())}><Text style={styles.clearSelection}>×</Text></Pressable>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={[styles.listContent, { paddingBottom: tablet ? 24 : tabBarPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRows(1, false) }} colors={["#0f766e"]} />}
        onEndReached={() => { if (!loadingMore && rows.length < total) fetchRows(page + 1, true) }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loadingMore ? <ActivityIndicator color="#0f766e" style={styles.loader} /> : null}
        ListEmptyComponent={loading ? <ActivityIndicator color="#0f766e" style={styles.emptyLoader} /> : <EmptyState text={filters.search ? t("organizations.emptySearch") : t("organizations.empty")} />}
      />
    </View>
  )

  return (
    <View style={styles.container}>
      {tablet ? <View style={styles.split}>{list}<QuickDetail item={selected} onOpen={() => selected && navigation.navigate("OrganizationDetail", { id: selected.id, name: selected.name })} t={t} /></View> : list}
      <FilterSheet visible={filterOpen} tablet={tablet} filters={filters} facets={facets} onChange={setFilters} onClose={() => setFilterOpen(false)} t={t} />
      <ColumnsSheet visible={columnsOpen} columns={columns} onChange={setColumns} onClose={() => setColumnsOpen(false)} t={t} />
      <SaveViewSheet visible={saveOpen} value={viewName} saving={savingView} onChange={setViewName} onSave={saveView} onClose={() => setSaveOpen(false)} t={t} />
      <AssignmentSheet
        visible={assignmentOpen} mode={assignmentMode} facets={facets} targetAgentId={targetAgentId}
        effectiveFrom={effectiveFrom} reason={reason} preview={assignmentPreview} busy={assigning}
        onTarget={setTargetAgentId} onDate={setEffectiveFrom} onReason={(value: string) => { setReason(value); setAssignmentPreview(null) }}
        onPreview={previewAssignment} onExecute={executeAssignment} onClose={() => setAssignmentOpen(false)} t={t}
      />
    </View>
  )
}

function ColumnRows({ item, columns, t }: { item: ExplorerOrganization; columns: OrganizationColumn[]; t: (key: string, options?: any) => string }) {
  const rows: Array<{ key: OrganizationColumn; icon: string; value?: string }> = [
    { key: "geography", icon: "⌖", value: [item.region, item.administrativeDistrict, item.locality || item.city, item.cityDistrict].filter(Boolean).join(" · ") },
    { key: "territory", icon: "◇", value: item.territoryCode },
    { key: "assignedAgent", icon: "●", value: item.assignedAgents.length ? item.assignedAgents.map((agent) => agent.name).join(", ") : t("organizations.unassigned") },
    { key: "manager", icon: "◆", value: item.managingManager?.name },
    { key: "status", icon: "◉", value: item.status },
    { key: "contacts", icon: "♙", value: item.contactsCount != null ? t("organizations.contactsTemplate", { n: item.contactsCount }) : undefined },
    { key: "visits", icon: "✓", value: item.visitsCount != null ? t("organizations.visitsTemplate", { n: item.visitsCount }) : undefined },
  ]
  return <View style={styles.columnRows}>{rows.filter((row) => columns.includes(row.key) && row.value).map((row) => <Text key={row.key} style={styles.columnText} numberOfLines={1}>{row.icon}  {row.value}</Text>)}</View>
}

function QuickDetail({ item, onOpen, t }: { item: ExplorerOrganization | null; onOpen: () => void; t: (key: string, options?: any) => string }) {
  if (!item) return <View style={styles.detailPane}><EmptyState text={t("organizations.selectForDetail")} /></View>
  return (
    <ScrollView style={styles.detailPane} contentContainerStyle={styles.detailContent}>
      <View style={styles.detailHero}><Text style={styles.detailEyebrow}>{item.objectType ? t(TYPE_LABEL[item.objectType] ?? "organizations.objectOther") : ""}</Text><Text style={styles.detailTitle}>{item.name}</Text><Text style={styles.detailCode}>{item.code || item.territoryCode || ""}</Text></View>
      <DetailSection title={t("organizations.geography")} values={[
        [t("organizations.region"), item.region], [t("organizations.adminDistrict"), item.administrativeDistrict],
        [t("organizations.locality"), item.locality || item.city], [t("organizations.cityDistrict"), item.cityDistrict],
        [t("organizations.address"), item.address],
      ]} />
      <DetailSection title={t("organizations.ownership")} values={[
        [t("organizations.manager"), item.managingManager?.name],
        [t("organizations.assignedAgent"), item.assignedAgents.map((agent) => agent.name).join(", ") || t("organizations.unassigned")],
        [t("organizations.territory"), item.territoryCode],
      ]} />
      <TouchableOpacity style={styles.openButton} onPress={onOpen}><Text style={styles.openButtonText}>{t("organizations.openFullCard")}</Text></TouchableOpacity>
    </ScrollView>
  )
}

function DetailSection({ title, values }: { title: string; values: Array<[string, string | undefined]> }) {
  return <View style={styles.detailSection}><Text style={styles.detailSectionTitle}>{title}</Text>{values.filter(([, value]) => value).map(([label, value]) => <View key={label} style={styles.detailField}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>)}</View>
}

function Sheet({ visible, onClose, children, tablet = false }: { visible: boolean; onClose: () => void; children: React.ReactNode; tablet?: boolean }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><Pressable style={styles.backdrop} onPress={onClose}><Pressable style={[styles.sheet, tablet && styles.sheetTablet]} onPress={() => {}}>{children}</Pressable></Pressable></Modal>
}

function FilterSheet({ visible, tablet, filters, facets, onChange, onClose, t }: any) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const set = (key: keyof OrganizationFilters, value?: string) => onChange((current: OrganizationFilters) => ({ ...current, [key]: current[key] === value ? undefined : value }))
  const assignmentLabels = { ASSIGNED: t("organizations.assigned"), UNASSIGNED: t("organizations.unassigned") }
  const typeLabels = {
    PHARMACY: t("organizations.objectPharmacy"),
    CLINIC: t("organizations.objectClinic"),
    STORE: t("organizations.objectStore"),
    OTHER: t("organizations.objectOther"),
  }
  const statusLabels = {
    ACTIVE: t("organizations.statusActive"),
    INACTIVE: t("organizations.statusInactive"),
    PROSPECT: t("organizations.statusProspect"),
  }
  return <Sheet visible={visible} onClose={onClose} tablet={tablet}><SheetHeader title={t("organizations.filters")} onClose={onClose} />
    <ScrollView contentContainerStyle={styles.sheetScroll}>
      <Text style={styles.filterGroupTitle}>{t("organizations.mainFilters")}</Text>
      <FilterRow label={t("organizations.assignmentState")} values={["ASSIGNED", "UNASSIGNED"]} labels={assignmentLabels} selected={filters.assignmentState} onSelect={(value) => set("assignmentState", value)} />
      <FilterRow label={t("organizations.objectType")} values={["PHARMACY", "CLINIC", "STORE", "OTHER"]} labels={typeLabels} selected={filters.objectType} onSelect={(value) => set("objectType", value)} />
      <FilterRow label={t("organizations.category")} values={["A", "B", "C", "D"]} selected={filters.category} onSelect={(value) => set("category", value)} />
      <FilterRow label={t("organizations.region")} values={facets.region} selected={filters.region} onSelect={(value) => set("region", value)} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advancedOpen }} style={styles.advancedToggle} onPress={() => setAdvancedOpen((current) => !current)}>
        <View style={styles.advancedToggleIcon}><Icon name="options" size={18} color="#0f766e" /></View>
        <View style={styles.advancedToggleCopy}>
          <Text style={styles.advancedToggleTitle}>{t("organizations.advancedFilters")}</Text>
          <Text style={styles.advancedToggleBody}>{t("organizations.advancedFiltersBody")}</Text>
        </View>
        <Icon name={advancedOpen ? "chevron-up" : "chevron-down"} size={20} color="#536b69" />
      </Pressable>
      {advancedOpen ? (
        <View style={styles.advancedFilters}>
          <FilterRow label={t("organizations.status")} values={["ACTIVE", "INACTIVE", "PROSPECT"]} labels={statusLabels} selected={filters.status} onSelect={(value) => set("status", value)} />
          <FilterRow label={t("organizations.adminDistrict")} values={facets.administrativeDistrict} selected={filters.administrativeDistrict} onSelect={(value) => set("administrativeDistrict", value)} />
          <FilterRow label={t("organizations.locality")} values={facets.locality} selected={filters.locality} onSelect={(value) => set("locality", value)} />
          <FilterRow label={t("organizations.cityDistrict")} values={facets.cityDistrict} selected={filters.cityDistrict} onSelect={(value) => set("cityDistrict", value)} />
          <FilterRow label={t("organizations.specialization")} values={facets.specialization} selected={filters.specialization} onSelect={(value) => set("specialization", value)} />
          <FilterRow label={t("organizations.organizationKind")} values={facets.organizationKind} selected={filters.organizationKind} onSelect={(value) => set("organizationKind", value)} />
          <FilterRow label={t("organizations.territory")} values={facets.territoryCode} selected={filters.territoryCode} onSelect={(value) => set("territoryCode", value)} />
          <FilterRow label={t("organizations.manager")} values={facets.managers.map((manager: any) => manager.id)} labels={Object.fromEntries(facets.managers.map((manager: any) => [manager.id, manager.name]))} selected={filters.managingManagerId} onSelect={(value) => set("managingManagerId", value)} />
          <FilterRow label={t("organizations.assignedAgent")} values={facets.assignableAgents.map((agent: any) => agent.id)} labels={Object.fromEntries(facets.assignableAgents.map((agent: any) => [agent.id, agent.name]))} selected={filters.assignedAgentId} onSelect={(value) => set("assignedAgentId", value)} />
        </View>
      ) : null}
    </ScrollView>
    <View style={styles.sheetFooter}><Pressable style={styles.secondaryButton} onPress={() => onChange({ sort: "name", direction: "asc" })}><Text style={styles.secondaryButtonText}>{t("common.clear")}</Text></Pressable><Pressable style={styles.primaryButton} onPress={onClose}><Text style={styles.primaryButtonText}>{t("common.done")}</Text></Pressable></View>
  </Sheet>
}

function FilterRow({ label, values, labels = {}, selected, onSelect }: { label: string; values: string[]; labels?: Record<string, string>; selected?: string; onSelect: (value: string) => void }) {
  if (!values.length) return null
  return <View style={styles.filterRow}><Text style={styles.filterLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{values.map((value) => {
    const checked = selected === value
    const valueLabel = labels[value] ?? value
    return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${label}: ${valueLabel}`} key={value} style={[styles.pill, checked && styles.pillOn]} onPress={() => onSelect(value)}><Text style={[styles.pillText, checked && styles.pillTextOn]}>{valueLabel}</Text></Pressable>
  })}</ScrollView></View>
}

function ColumnsSheet({ visible, columns, onChange, onClose, t }: any) {
  const toggle = (column: OrganizationColumn) => onChange((current: OrganizationColumn[]) => current.includes(column) ? (current.length > 1 ? current.filter((item) => item !== column) : current) : [...current, column])
  return <Sheet visible={visible} onClose={onClose}><SheetHeader title={t("organizations.columns")} onClose={onClose} /><View style={styles.columnGrid}>{ORGANIZATION_COLUMNS.map((column) => {
    const checked = columns.includes(column)
    return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} key={column} style={[styles.columnChoice, checked && styles.columnChoiceOn]} onPress={() => toggle(column)}><Text style={[styles.columnChoiceText, checked && styles.columnChoiceTextOn]}>{checked ? "✓ " : ""}{t(`organizations.column_${column}`)}</Text></Pressable>
  })}</View><View style={styles.sheetFooter}><Pressable style={styles.primaryButton} onPress={onClose}><Text style={styles.primaryButtonText}>{t("common.done")}</Text></Pressable></View></Sheet>
}

function SaveViewSheet({ visible, value, saving, onChange, onSave, onClose, t }: any) {
  return <Sheet visible={visible} onClose={onClose}><SheetHeader title={t("organizations.saveView")} onClose={onClose} /><View style={styles.formBody}><Text style={styles.inputLabel}>{t("organizations.viewName")}</Text><TextInput value={value} onChangeText={onChange} style={styles.input} placeholder={t("organizations.viewNamePlaceholder")} placeholderTextColor="#94a3b8" /></View><View style={styles.sheetFooter}><Pressable style={[styles.primaryButton, (!value.trim() || saving) && styles.buttonDisabled]} disabled={!value.trim() || saving} onPress={onSave}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("common.save")}</Text>}</Pressable></View></Sheet>
}

function AssignmentSheet({ visible, mode, facets, targetAgentId, effectiveFrom, reason, preview, busy, onTarget, onDate, onReason, onPreview, onExecute, onClose, t }: any) {
  return <Sheet visible={visible} onClose={onClose}><SheetHeader title={mode === "ASSIGN" ? t("organizations.assignTitle") : t("organizations.unassignTitle")} onClose={onClose} /><ScrollView contentContainerStyle={styles.sheetScroll}>
    {mode === "ASSIGN" ? <FilterRow label={t("organizations.targetAgent")} values={facets.assignableAgents.map((agent: any) => agent.id)} labels={Object.fromEntries(facets.assignableAgents.map((agent: any) => [agent.id, agent.name]))} selected={targetAgentId ?? undefined} onSelect={onTarget} /> : null}
    <Text style={styles.inputLabel}>{t("organizations.effectiveFrom")}</Text><TextInput value={effectiveFrom} onChangeText={onDate} style={styles.input} placeholder="YYYY-MM-DD" />
    <Text style={styles.inputLabel}>{t("organizations.reason")}</Text><TextInput value={reason} onChangeText={onReason} style={[styles.input, styles.reasonInput]} multiline placeholder={t("organizations.reasonPlaceholder")} placeholderTextColor="#94a3b8" />
    {preview ? <View style={styles.previewCard}><Text style={styles.previewTitle}>{t("organizations.previewTitle")}</Text><View style={styles.previewStats}><PreviewStat value={preview.summary?.selected ?? 0} label={t("organizations.previewSelected")} /><PreviewStat value={preview.summary?.assignable ?? 0} label={t("organizations.previewReady")} good /><PreviewStat value={preview.summary?.excluded ?? 0} label={t("organizations.previewExcluded")} /></View>{preview.rows?.filter((row: any) => !row.assignable).slice(0, 5).map((row: any) => <Text key={row.organizationId} style={styles.issueText}>• {row.name ?? row.organizationId}: {row.issues.join(", ")}</Text>)}</View> : null}
  </ScrollView><View style={styles.sheetFooter}>{preview ? <Pressable style={[styles.primaryButton, busy && styles.buttonDisabled]} disabled={busy} onPress={onExecute}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("organizations.confirmAssignment")}</Text>}</Pressable> : <Pressable style={[styles.primaryButton, busy && styles.buttonDisabled]} disabled={busy} onPress={onPreview}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t("organizations.buildPreview")}</Text>}</Pressable>}</View></Sheet>
}

function PreviewStat({ value, label, good }: { value: number; label: string; good?: boolean }) { return <View style={styles.previewStat}><Text style={[styles.previewValue, good && styles.previewValueGood]}>{value}</Text><Text style={styles.previewLabel}>{label}</Text></View> }
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) { return <View style={styles.sheetHeader}><View><Text style={styles.sheetEyebrow}>LEADDRIVE MTM</Text><Text style={styles.sheetTitle}>{title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={title} style={styles.sheetClose} onPress={onClose}><Text style={styles.sheetCloseText}>×</Text></Pressable></View> }
function EmptyState({ text }: { text: string }) { return <View style={styles.empty}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌂</Text></View><Text style={styles.emptyText}>{text}</Text></View> }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7f7" }, split: { flex: 1, flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  listPane: { flex: 1 }, tabletListPane: { flex: 1, minWidth: 0, borderRadius: 22, overflow: "hidden", backgroundColor: "#f7f9f9", borderWidth: 1, borderColor: "#dce7e5" },
  guideWrap: { paddingHorizontal: 14, paddingTop: 12 },
  toolbar: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }, searchBox: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#dce7e5", paddingHorizontal: 12 }, searchIcon: { color: "#0f766e", fontSize: 20, marginRight: 7 }, searchInput: { flex: 1, minHeight: 48, fontSize: 14, color: "#102a2a" },
  quickActions: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  quickAction: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: "#cbe1dd", backgroundColor: "#fff" },
  quickActionActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  quickActionText: { color: "#0f766e", fontSize: 12, fontWeight: "800", textAlign: "center" },
  quickActionTextActive: { color: "#fff" },
  iconButton: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#e7f2f0", borderWidth: 1, borderColor: "#cbe1dd" }, iconButtonActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" }, iconButtonText: { color: "#0f766e", fontWeight: "800", fontSize: 15 }, iconButtonTextActive: { color: "#fff" },
  viewBar: { paddingHorizontal: 14, gap: 8, paddingBottom: 8 }, viewChip: { minHeight: 48, justifyContent: "center", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#cbe1dd" }, viewChipText: { color: "#285a56", fontSize: 12, fontWeight: "700" }, viewAdd: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#0f766e" }, viewAddText: { color: "#fff", fontSize: 18 }, saveHint: { minHeight: 48, justifyContent: "center", marginHorizontal: 14, marginBottom: 8, alignSelf: "flex-start" }, saveHintText: { color: "#0f766e", fontSize: 12, fontWeight: "700" },
  offline: { marginHorizontal: 14, padding: 8, borderRadius: 10, backgroundColor: "#fff7ed" }, offlineText: { color: "#b45309", fontSize: 12, fontWeight: "700" },
  offlineFilterNotice: { marginHorizontal: 14, marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" }, offlineFilterNoticeText: { color: "#92400e", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  loadError: { minHeight: 52, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa" },
  loadErrorText: { flex: 1, color: "#92400e", fontSize: 12, fontWeight: "700" },
  retryButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#fff" },
  retryButtonText: { color: "#0f766e", fontSize: 12, fontWeight: "900" },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 7 }, resultCount: { color: "#536b69", fontSize: 12, fontWeight: "700" }, selectHint: { color: "#0f766e", fontSize: 11, fontWeight: "700" },
  selectionBar: { marginHorizontal: 12, marginBottom: 8, padding: 8, borderRadius: 14, backgroundColor: "#123c38", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }, selectionCopy: { flex: 1, minWidth: 118 }, selectionCount: { color: "#fff", fontSize: 12, fontWeight: "800" }, hiddenSelectionWarning: { color: "#fcd34d", fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 2 }, selectionAction: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: "#38b2a4" }, selectionActionText: { color: "#fff", fontSize: 11, fontWeight: "800" }, selectionActionSecondary: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: "#fff" }, selectionActionSecondaryText: { color: "#123c38", fontSize: 11, fontWeight: "800" }, clearSelectionButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, clearSelection: { color: "#fff", fontSize: 22 },
  listContent: { paddingHorizontal: 12, flexGrow: 1 }, card: { backgroundColor: "#fff", marginBottom: 9, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e4eceb" }, cardActive: { borderColor: "#0f766e", borderWidth: 2, backgroundColor: "#f4fbfa" }, cardChecked: { borderColor: "#38b2a4", backgroundColor: "#effcf9" }, cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#9bb3b0", alignItems: "center", justifyContent: "center" }, checkboxOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" }, checkboxText: { color: "#fff", fontWeight: "900" }, cardMain: { flex: 1 }, cardName: { color: "#102a2a", fontSize: 15, fontWeight: "800" }, cardSub: { color: "#66807d", fontSize: 12, marginTop: 3 }, category: { paddingHorizontal: 9, paddingVertical: 5, minWidth: 31, borderRadius: 9, alignItems: "center" }, categoryText: { fontWeight: "900", fontSize: 12 }, columnRows: { gap: 5, marginTop: 10 }, columnText: { color: "#536b69", fontSize: 12 },
  loader: { padding: 16 }, emptyLoader: { marginTop: 80 }, empty: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", padding: 32 }, emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#dff3ef" }, emptyIconText: { color: "#0f766e", fontSize: 28, fontWeight: "900" }, emptyText: { marginTop: 14, color: "#536b69", fontSize: 14, fontWeight: "700", textAlign: "center" },
  detailPane: { flex: 1, minWidth: 0, backgroundColor: "#fff", borderRadius: 22, borderWidth: 1, borderColor: "#dce7e5" }, detailContent: { padding: 20 }, detailHero: { padding: 20, borderRadius: 18, backgroundColor: "#123c38", marginBottom: 14 }, detailEyebrow: { color: "#7dd3c7", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, detailTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 8 }, detailCode: { color: "#b9d7d3", fontSize: 12, marginTop: 6 }, detailSection: { padding: 16, borderRadius: 16, backgroundColor: "#f5f9f8", marginBottom: 12 }, detailSectionTitle: { color: "#0f766e", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }, detailField: { flexDirection: "row", paddingVertical: 6, gap: 12 }, detailLabel: { width: 120, color: "#718987", fontSize: 12 }, detailValue: { flex: 1, color: "#173a37", fontSize: 13, fontWeight: "700" }, openButton: { height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#0f766e" }, openButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "rgba(5,24,22,0.42)", justifyContent: "flex-end" }, sheet: { maxHeight: "88%", backgroundColor: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: "hidden" }, sheetTablet: { width: 520, maxHeight: "92%", alignSelf: "flex-end", borderTopLeftRadius: 26, borderTopRightRadius: 0 }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e6eeed" }, sheetEyebrow: { color: "#38a89c", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, sheetTitle: { color: "#102a2a", fontSize: 20, fontWeight: "900", marginTop: 3 }, sheetClose: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#edf5f3", alignItems: "center", justifyContent: "center" }, sheetCloseText: { fontSize: 25, color: "#536b69", marginTop: -2 }, sheetScroll: { padding: 18 }, sheetFooter: { flexDirection: "row", justifyContent: "flex-end", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: "#e6eeed" },
  filterGroupTitle: { color: "#102a2a", fontSize: 15, fontWeight: "900", marginBottom: 14 },
  filterRow: { marginBottom: 17 }, filterLabel: { color: "#365c58", fontSize: 12, fontWeight: "800", marginBottom: 8 }, pills: { gap: 7 }, pill: { minHeight: 48, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: "#cddfdd", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#f9fbfb" }, pillOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" }, pillText: { color: "#496d69", fontSize: 12, fontWeight: "700" }, pillTextOn: { color: "#fff" },
  advancedToggle: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#cbe1dd", backgroundColor: "#f3f9f7", marginBottom: 14 },
  advancedToggleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  advancedToggleCopy: { flex: 1, gap: 2 },
  advancedToggleTitle: { color: "#173a37", fontSize: 13, fontWeight: "900" },
  advancedToggleBody: { color: "#66807d", fontSize: 11, lineHeight: 15 },
  advancedFilters: { paddingTop: 4 },
  primaryButton: { minWidth: 130, minHeight: 48, paddingHorizontal: 18, borderRadius: 13, backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" }, primaryButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" }, secondaryButton: { minWidth: 100, minHeight: 48, paddingHorizontal: 18, borderRadius: 13, backgroundColor: "#edf5f3", alignItems: "center", justifyContent: "center" }, secondaryButtonText: { color: "#245a55", fontSize: 13, fontWeight: "800" }, buttonDisabled: { opacity: 0.45 }, formBody: { padding: 20 }, inputLabel: { color: "#365c58", fontSize: 12, fontWeight: "800", marginBottom: 7, marginTop: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: "#cddfdd", borderRadius: 12, paddingHorizontal: 13, color: "#102a2a", backgroundColor: "#fbfdfd" }, reasonInput: { minHeight: 88, textAlignVertical: "top", paddingTop: 12 },
  columnGrid: { padding: 18, flexDirection: "row", flexWrap: "wrap", gap: 9 }, columnChoice: { width: "48%", minHeight: 48, justifyContent: "center", padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "#dce7e5", backgroundColor: "#f8fbfa" }, columnChoiceOn: { borderColor: "#0f766e", backgroundColor: "#e8f6f3" }, columnChoiceText: { color: "#5c7471", fontSize: 12, fontWeight: "700" }, columnChoiceTextOn: { color: "#0f766e" },
  previewCard: { marginTop: 18, padding: 15, borderRadius: 16, backgroundColor: "#edf8f6", borderWidth: 1, borderColor: "#c7e5e0" }, previewTitle: { color: "#123c38", fontSize: 14, fontWeight: "900" }, previewStats: { flexDirection: "row", gap: 8, marginTop: 12 }, previewStat: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#fff" }, previewValue: { color: "#b45309", fontSize: 22, fontWeight: "900" }, previewValueGood: { color: "#0f766e" }, previewLabel: { color: "#718987", fontSize: 10, marginTop: 2 }, issueText: { color: "#9a3412", fontSize: 11, marginTop: 8 },
})
