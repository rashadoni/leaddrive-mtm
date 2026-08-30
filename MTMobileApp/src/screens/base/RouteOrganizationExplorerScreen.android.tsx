import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { api } from "../../services/api"
import { readOfflineOrganizations } from "../../services/offline-reads"
import {
  toRouteOrganizationListItem,
  type RouteOrganizationListItem,
} from "../../services/route-organization-list"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    scope: "Показаны только точки, доступные для вашего маршрута. Назначения команды и коммерческие данные доступны в отдельных продуктах.",
    loading: "Загружаем доступные точки…",
    empty: "Доступных точек пока нет.",
    emptySearch: "По этому запросу ничего не найдено.",
    error: "Не удалось загрузить точки.",
  },
  az: {
    scope: "Yalnız marşrutunuz üçün əlçatan nöqtələr göstərilir. Komanda təyinatları və kommersiya məlumatları ayrıca məhsullardadır.",
    loading: "Əlçatan nöqtələr yüklənir…",
    empty: "Hələ əlçatan nöqtə yoxdur.",
    emptySearch: "Bu sorğu üzrə nəticə tapılmadı.",
    error: "Nöqtələri yükləmək alınmadı.",
  },
  en: {
    scope: "Only locations available to your route are shown. Team assignments and commercial data live in separate products.",
    loading: "Loading available locations…",
    empty: "There are no available locations yet.",
    emptySearch: "No locations match this search.",
    error: "We could not load locations.",
  },
} as const

const TYPE_LABEL: Record<string, string> = {
  PHARMACY: "organizations.objectPharmacy",
  CLINIC: "organizations.objectClinic",
  STORE: "organizations.objectStore",
  OTHER: "organizations.objectOther",
}

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function categoryTone(category?: string): { color: string; backgroundColor: string } {
  if (category === "A") return { color: fieldTheme.color.success, backgroundColor: fieldTheme.color.successSoft }
  if (category === "B") return { color: fieldTheme.color.blue, backgroundColor: fieldTheme.color.blueSoft }
  if (category === "C") return { color: fieldTheme.color.amber, backgroundColor: fieldTheme.color.amberSoft }
  return { color: fieldTheme.color.inkMuted, backgroundColor: fieldTheme.color.surfaceStrong }
}

/** Route Field catalog: read/search only, scoped by the server to this AGENT. */
export default function RouteOrganizationExplorerScreen() {
  const { t, i18n } = useTranslation()
  const copy = COPY[languageFor(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const tabBarPadding = useTabBarPadding()
  const agent = useAuthStore((state) => state.agent)
  const [rows, setRows] = useState<RouteOrganizationListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  const loadRows = useCallback(async (term: string, nextPage = 1, append = false) => {
    const currentRequest = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const response = await api.getOrganizations({
        search: term || undefined,
        page: nextPage,
        limit: 50,
        sort: "name",
        direction: "asc",
      }, controller.signal)
      if (currentRequest !== requestId.current) return
      if (!response?.success) throw new Error("ROUTE_ORGANIZATIONS_REQUEST_FAILED")
      const rawRows: unknown[] = Array.isArray(response?.data?.organizations) ? response.data.organizations : []
      const nextRows = rawRows.map(toRouteOrganizationListItem).filter((item) => Boolean(item.id))
      setRows((current) => append ? [...current, ...nextRows] : nextRows)
      setTotal(Number(response?.data?.total ?? nextRows.length))
      setPage(nextPage)
      setOffline(false)
      setLoadError(false)
    } catch (error: any) {
      if (currentRequest !== requestId.current || error?.name === "AbortError") return
      if (error?.message === "SESSION_EXPIRED") return
      try {
        const cached = agent
          ? await readOfflineOrganizations(agent.organizationId, agent.id, term)
          : []
        const hasOfflineSnapshot = cached.length > 0 || Boolean(
          agent && term && (await readOfflineOrganizations(agent.organizationId, agent.id, "")).length > 0,
        )
        if (currentRequest !== requestId.current) return
        const nextRows = cached.map(toRouteOrganizationListItem).filter((item) => Boolean(item.id))
        if (hasOfflineSnapshot) {
          setRows(nextRows)
          setTotal(nextRows.length)
          setPage(1)
          setOffline(true)
          setLoadError(false)
        } else {
          setRows([])
          setTotal(0)
          setOffline(false)
          setLoadError(true)
        }
      } catch {
        if (currentRequest === requestId.current) setLoadError(true)
      }
    } finally {
      if (currentRequest === requestId.current) {
        controllerRef.current = null
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    }
  }, [agent])

  useEffect(() => {
    void loadRows(debouncedSearch)
  }, [debouncedSearch, loadRows])

  useEffect(() => () => {
    requestId.current += 1
    controllerRef.current?.abort()
  }, [])

  const refresh = () => {
    setRefreshing(true)
    void loadRows(debouncedSearch)
  }

  const loadMore = () => {
    if (loading || loadingMore || offline || rows.length >= total) return
    void loadRows(debouncedSearch, page + 1, true)
  }

  return (
    <View style={styles.root}>
      <View style={styles.topArea}>
        <View style={styles.scopeNote} accessibilityLiveRegion="polite">
          <Icon name="shield-checkmark-outline" size={19} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.scopeText}>{copy.scope}</Text>
        </View>
        <View style={styles.searchBox}>
          <Icon name="search" size={21} color={fieldTheme.color.inkMuted} />
          <TextInput
            testID="route-organizations-search"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("organizations.searchPlaceholder")}
            placeholderTextColor={fieldTheme.color.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t("organizations.searchPlaceholder")}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.clear")}
              onPress={() => setSearch("")}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} />
            </Pressable>
          ) : null}
        </View>
        {offline ? (
          <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
            <Icon name="cloud-offline-outline" size={18} color={fieldTheme.color.amber} />
            <Text style={styles.offlineText}>{t("common.offlineCached")}</Text>
          </View>
        ) : null}
      </View>

      <FlatList
        key={tablet ? "route-organizations-tablet" : "route-organizations-phone"}
        data={rows}
        numColumns={tablet ? 2 : 1}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarPadding }]}
        columnWrapperStyle={tablet ? styles.tabletRow : undefined}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={
          <View style={styles.resultHeader}>
            <Text style={styles.resultCount}>{t("organizations.totalTemplate", { n: total })}</Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={fieldTheme.color.primary} style={styles.footerLoader} /> : null}
        ListEmptyComponent={
          <View style={styles.empty} accessibilityLiveRegion="polite">
            {loading ? <ActivityIndicator size="large" color={fieldTheme.color.primary} /> : <Icon name={loadError ? "cloud-offline-outline" : "business-outline"} size={34} color={loadError ? fieldTheme.color.amber : fieldTheme.color.primary} />}
            <Text style={styles.emptyTitle}>{loading ? copy.loading : loadError ? copy.error : debouncedSearch ? copy.emptySearch : copy.empty}</Text>
            {loadError ? (
              <Pressable accessibilityRole="button" onPress={refresh} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                <Icon name="refresh" size={18} color={fieldTheme.color.onColor} />
                <Text style={styles.retryText}>{t("common.retry")}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const tone = categoryTone(item.category)
          const typeLabel = item.objectType ? t(TYPE_LABEL[item.objectType] ?? "organizations.objectOther") : t("organizations.objectOther")
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${typeLabel}`}
              accessibilityHint={t("common.openDetails")}
              onPress={() => navigation.navigate("OrganizationDetail", { id: item.id, name: item.name })}
              style={({ pressed }) => [styles.card, tablet && styles.cardTablet, pressed && styles.pressed]}
            >
              <View style={styles.cardHeading}>
                <View style={styles.iconWrap}><Icon name="business-outline" size={21} color={fieldTheme.color.primaryStrong} /></View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.cardType} numberOfLines={1}>{typeLabel}{item.code ? ` · ${item.code}` : ""}</Text>
                </View>
                {item.category ? <View style={[styles.category, { backgroundColor: tone.backgroundColor }]}><Text style={[styles.categoryText, { color: tone.color }]}>{item.category}</Text></View> : null}
              </View>
              {item.address ? <View style={styles.detailRow}><Icon name="location-outline" size={16} color={fieldTheme.color.inkMuted} /><Text style={styles.detailText} numberOfLines={1}>{item.address}</Text></View> : null}
              {item.phone ? <View style={styles.detailRow}><Icon name="call-outline" size={16} color={fieldTheme.color.inkMuted} /><Text style={styles.detailText} numberOfLines={1}>{item.phone}</Text></View> : null}
              {typeof item.contactsCount === "number" ? <Text style={styles.countText}>{t("organizations.contactsTemplate", { n: item.contactsCount })}</Text> : null}
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  topArea: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, paddingBottom: fieldTheme.space.sm },
  scopeNote: { flexDirection: "row", gap: fieldTheme.space.sm, alignItems: "flex-start", padding: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  scopeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  searchBox: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  searchInput: { flex: 1, minHeight: 48, paddingVertical: 0, color: fieldTheme.color.ink, fontSize: 15 },
  clearButton: { width: LAYOUT_TOUCH_TARGETS.compact, height: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  offlineBanner: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft },
  offlineText: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "800" },
  listContent: { flexGrow: 1, gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md },
  tabletRow: { gap: fieldTheme.space.sm },
  resultHeader: { paddingTop: fieldTheme.space.xs },
  resultCount: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "800" },
  card: { gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  cardTablet: { flex: 1, minWidth: 0 },
  cardHeading: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm },
  iconWrap: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: fieldTheme.color.primarySoft },
  cardCopy: { flex: 1, gap: 2 },
  cardName: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 20, fontWeight: "900" },
  cardType: { color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  category: { minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: fieldTheme.radius.pill },
  categoryText: { fontSize: 12, fontWeight: "900" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.xs },
  detailText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  countText: { color: fieldTheme.color.primaryStrong, fontSize: 11, fontWeight: "900" },
  footerLoader: { marginVertical: fieldTheme.space.md },
  empty: { flex: 1, minHeight: 240, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.xl },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 15, lineHeight: 21, fontWeight: "800", textAlign: "center" },
  retryButton: { minHeight: LAYOUT_TOUCH_TARGETS.compact, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.72 },
})
