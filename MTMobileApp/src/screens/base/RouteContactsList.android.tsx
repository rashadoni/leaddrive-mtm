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
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { toRouteContactListItem, type RouteContactListItem } from "../../services/route-contact-list"
import { useTabBarPadding } from "../../hooks/useTabBarHeight"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

type Language = "ru" | "az" | "en"

const COPY = {
  ru: {
    scope: "Показаны только активные контакты и места работы, доступные для вашего маршрута.",
    loading: "Загружаем доступные контакты…",
    empty: "Доступных контактов пока нет.",
    emptySearch: "По этому запросу ничего не найдено.",
    error: "Не удалось загрузить контакты.",
  },
  az: {
    scope: "Yalnız marşrutunuz üçün əlçatan aktiv kontaktlar və iş yerləri göstərilir.",
    loading: "Əlçatan kontaktlar yüklənir…",
    empty: "Hələ əlçatan kontakt yoxdur.",
    emptySearch: "Bu sorğu üzrə nəticə tapılmadı.",
    error: "Kontaktları yükləmək alınmadı.",
  },
  en: {
    scope: "Only active contacts and workplaces available to your route are shown.",
    loading: "Loading available contacts…",
    empty: "There are no available contacts yet.",
    emptySearch: "No contacts match this search.",
    error: "We could not load contacts.",
  },
} as const

const TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

function languageFor(value: string): Language {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function categoryColors(category?: string): { strong: string; soft: string } {
  if (category === "A") return { strong: fieldTheme.color.success, soft: fieldTheme.color.successSoft }
  if (category === "B") return { strong: fieldTheme.color.blue, soft: fieldTheme.color.blueSoft }
  if (category === "C") return { strong: fieldTheme.color.amber, soft: fieldTheme.color.amberSoft }
  return { strong: fieldTheme.color.inkMuted, soft: fieldTheme.color.surfaceStrong }
}

function mergeUnique(current: RouteContactListItem[], next: RouteContactListItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of next) byId.set(item.id, item)
  return [...byId.values()]
}

/** Route Field catalog: v2-only, read/search only, and server-scoped to this AGENT. */
export default function RouteContactsList() {
  const { t, i18n } = useTranslation()
  const copy = COPY[languageFor(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const tabBarPadding = useTabBarPadding()
  const [rows, setRows] = useState<RouteContactListItem[]>([])
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [nextPage, setNextPage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  const loadRows = useCallback(async (term: string, page: string | null = null, append = false) => {
    const currentRequest = ++requestId.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    if (append) setLoadingMore(true)
    else {
      setLoading(true)
      setRows([])
      setNextPage(null)
    }

    try {
      const response = await api.getRouteContacts({
        search: term || undefined,
        page: page || undefined,
        limit: 25,
      }, controller.signal)
      if (currentRequest !== requestId.current) return
      if (!response?.success) throw new Error("ROUTE_CONTACTS_REQUEST_FAILED")
      const rawRows: unknown[] = Array.isArray(response?.data?.contacts) ? response.data.contacts : []
      const nextRows = rawRows.map(toRouteContactListItem).filter((item) => Boolean(item.id))
      setRows((current) => append ? mergeUnique(current, nextRows) : nextRows)
      setNextPage(typeof response?.data?.nextPage === "string" ? response.data.nextPage : null)
      setLoadError(false)
    } catch (error: any) {
      if (currentRequest !== requestId.current || error?.name === "AbortError") return
      if (error?.message === "SESSION_EXPIRED") return
      if (!append) {
        setRows([])
        setNextPage(null)
      }
      setLoadError(true)
    } finally {
      if (currentRequest === requestId.current) {
        controllerRef.current = null
        setLoading(false)
        setLoadingMore(false)
        setRefreshing(false)
      }
    }
  }, [])

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
    if (loading || loadingMore || !nextPage) return
    void loadRows(debouncedSearch, nextPage, true)
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
            testID="route-contacts-search"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("contacts.searchPlaceholder")}
            placeholderTextColor={fieldTheme.color.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t("contacts.searchPlaceholder")}
          />
          {search ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.clear")} onPress={() => setSearch("")} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        key={tablet ? "route-contacts-tablet" : "route-contacts-phone"}
        data={rows}
        numColumns={tablet ? 2 : 1}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarPadding }]}
        columnWrapperStyle={tablet ? styles.tabletRow : undefined}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[fieldTheme.color.primary]} tintColor={fieldTheme.color.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={fieldTheme.color.primary} style={styles.footerLoader} /> : null}
        ListEmptyComponent={
          <View style={styles.empty} accessibilityLiveRegion="polite">
            {loading ? <ActivityIndicator size="large" color={fieldTheme.color.primary} /> : <Icon name={loadError ? "cloud-offline-outline" : "people-outline"} size={34} color={loadError ? fieldTheme.color.amber : fieldTheme.color.primary} />}
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
          const category = categoryColors(item.category)
          const typeLabel = item.type ? t(TYPE_KEY[item.type] ?? "contacts.typeOther") : t("contacts.typeOther")
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${item.specialty || typeLabel}`}
              accessibilityHint={t("common.openDetails")}
              onPress={() => navigation.navigate("ContactDetail", { id: item.id, name: item.name })}
              style={({ pressed }) => [styles.card, tablet && styles.cardTablet, pressed && styles.pressed]}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.name.trim().charAt(0).toUpperCase() || "?"}</Text></View>
              <View style={styles.cardContent}>
                <View style={styles.nameRow}>
                  <View style={styles.nameCopy}>
                    <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>{item.specialty || typeLabel}</Text>
                  </View>
                  {item.category ? <View style={[styles.categoryBadge, { backgroundColor: category.soft }]}><Text style={[styles.categoryText, { color: category.strong }]}>{item.category}</Text></View> : null}
                </View>
                {item.workplace ? <View style={styles.detailRow}><Icon name="business-outline" size={16} color={fieldTheme.color.inkMuted} /><Text style={styles.detailText} numberOfLines={1}>{item.workplace}</Text></View> : null}
                {item.phone ? <View style={styles.detailRow}><Icon name="call-outline" size={16} color={fieldTheme.color.inkMuted} /><Text style={styles.detailText} numberOfLines={1}>{item.phone}</Text></View> : null}
                <View style={styles.cardFooter}><View style={styles.typeChip}><Text style={styles.typeText}>{typeLabel}</Text></View><Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} /></View>
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  topArea: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg, gap: fieldTheme.space.md },
  scopeNote: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primarySoft },
  scopeText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  searchBox: { minHeight: 54, flexDirection: "row", alignItems: "center", backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.md, paddingLeft: fieldTheme.space.lg, borderWidth: 1, borderColor: fieldTheme.color.border },
  searchInput: { flex: 1, minHeight: 52, fontSize: 15, color: fieldTheme.color.ink, paddingHorizontal: fieldTheme.space.md },
  clearButton: { minWidth: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  listContent: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, flexGrow: 1 },
  tabletRow: { gap: fieldTheme.space.md },
  card: { minHeight: 132, flexDirection: "row", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.lg, marginBottom: fieldTheme.space.md, borderWidth: 1, borderColor: fieldTheme.color.border },
  cardTablet: { flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  avatarText: { color: fieldTheme.color.primaryStrong, fontSize: 19, fontWeight: "900" },
  cardContent: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm },
  nameCopy: { flex: 1 },
  cardName: { fontSize: 16, lineHeight: 21, fontWeight: "900", color: fieldTheme.color.ink },
  cardSub: { fontSize: 13, color: fieldTheme.color.inkMuted, marginTop: 2 },
  categoryBadge: { borderRadius: 9, minWidth: 30, paddingHorizontal: 9, paddingVertical: 5, alignItems: "center" },
  categoryText: { fontSize: 12, fontWeight: "900" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  detailText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: fieldTheme.space.md },
  typeChip: { backgroundColor: fieldTheme.color.surfaceStrong, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm, paddingVertical: 4 },
  typeText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  empty: { flexGrow: 1, minHeight: 280, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md, paddingHorizontal: fieldTheme.space.xl },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 23, fontWeight: "900", textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, minHeight: 44, paddingHorizontal: fieldTheme.space.lg, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontWeight: "900" },
  footerLoader: { marginVertical: fieldTheme.space.lg },
  pressed: { opacity: 0.72 },
})
