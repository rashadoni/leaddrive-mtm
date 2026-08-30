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
import { commercialApi } from "../../services/commercial-api"
import { toContactListItem, type ContactListItem } from "../../services/contact-list"
import { readOfflineContacts } from "../../services/offline-reads"
import { useAuthStore } from "../../store/auth"
import { useTabBarPadding } from "../../hooks/useTabBarHeight"
import MobileWorkflowGuide from "../../components/MobileWorkflowGuide"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth, LAYOUT_TOUCH_TARGETS } from "../../theme/layoutBreakpoints"

const TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

function categoryColors(category?: string): { strong: string; soft: string } {
  switch (category) {
    case "A": return { strong: fieldTheme.color.success, soft: fieldTheme.color.successSoft }
    case "B": return { strong: fieldTheme.color.blue, soft: fieldTheme.color.blueSoft }
    case "C": return { strong: fieldTheme.color.amber, soft: fieldTheme.color.amberSoft }
    default: return { strong: fieldTheme.color.inkMuted, soft: fieldTheme.color.surfaceStrong }
  }
}

export default function ContactsList() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const tabBarPadding = useTabBarPadding()
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const lastLoadedTermRef = useRef<string | null>(null)
  const hasLoadedTermRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchContacts = useCallback(async (term: string) => {
    try {
      const response = await commercialApi.getContacts(term ? { search: term } : undefined)
      if (response.success) {
        setContacts((response.data?.contacts || []).map(toContactListItem))
        lastLoadedTermRef.current = term
        hasLoadedTermRef.current = true
        setOffline(false)
        setLoadError(false)
      } else {
        throw new Error("CONTACTS_LOAD_FAILED")
      }
    } catch (error: any) {
      if (error.message !== "SESSION_EXPIRED") {
        const agent = useAuthStore.getState().agent
        let cached: ContactListItem[] = []
        let cacheAvailable = false
        if (agent) {
          try {
            cached = await readOfflineContacts(agent.organizationId, agent.id, term)
            cacheAvailable = cached.length > 0
            if (!cacheAvailable && term) {
              cacheAvailable = (await readOfflineContacts(agent.organizationId, agent.id, "")).length > 0
            }
          } catch {}
        }
        const sameInMemoryQuery = hasLoadedTermRef.current && lastLoadedTermRef.current === term
        if (cached.length > 0 || (cacheAvailable && term)) {
          setContacts(cached)
          lastLoadedTermRef.current = term
          hasLoadedTermRef.current = true
        } else if (!sameInMemoryQuery) {
          setContacts([])
        }
        setOffline(true)
        setLoadError(!cacheAvailable && !sameInMemoryQuery)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchContacts(debouncedSearch)
  }, [debouncedSearch, fetchContacts])

  const onRefresh = () => {
    setRefreshing(true)
    fetchContacts(debouncedSearch)
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.searchArea}>
        <View style={styles.searchBox}>
          <Icon name="search" size={21} color={fieldTheme.color.inkMuted} />
          <TextInput
            testID="contacts-search"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("contacts.searchPlaceholder")}
            placeholderTextColor="#81928B"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("contacts.searchPlaceholder")}
          />
          {search.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.clear")}
              onPress={() => setSearch("")}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Icon name="close-circle" size={22} color={fieldTheme.color.inkMuted} />
            </Pressable>
          )}
        </View>

        {offline && !loadError && (
          <View style={styles.offlineBanner} accessibilityLiveRegion="polite">
            <Icon name="cloud-offline-outline" size={19} color={fieldTheme.color.amber} />
            <Text style={styles.offlineBannerText}>{t("common.offlineCached")}</Text>
          </View>
        )}
      </View>

      <View style={styles.guideWrap}>
        <MobileWorkflowGuide
          title={t("contacts.guideTitle")}
          body={t("contacts.guideBody")}
          steps={[
            { icon: "search-outline", label: t("contacts.guideSearch") },
            { icon: "business-outline", label: t("contacts.guideWorkplace") },
            { icon: "open-outline", label: t("contacts.guideOpen") },
          ]}
        />
      </View>

      <FlatList
        key={tablet ? "contacts-tablet" : "contacts-phone"}
        data={contacts}
        numColumns={tablet ? 2 : 1}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: tabBarPadding }]}
        columnWrapperStyle={tablet ? styles.tabletRow : undefined}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={fieldTheme.color.primary}
            colors={[fieldTheme.color.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty} accessibilityLiveRegion="polite">
            <View style={styles.emptyIconWrap}>
              {loading ? (
                <ActivityIndicator color={fieldTheme.color.primary} />
              ) : (
                <Icon
                  name={loadError ? "alert-circle-outline" : debouncedSearch ? "search-outline" : "people-outline"}
                  size={31}
                  color={loadError ? fieldTheme.color.danger : fieldTheme.color.primary}
                />
              )}
            </View>
            <Text style={styles.emptyTitle}>
              {loading
                ? t("contacts.loading")
                : loadError
                  ? t("contacts.loadError")
                  : debouncedSearch
                  ? t("contacts.emptySearch")
                  : t("contacts.empty")}
            </Text>
            {loadError ? (
              <>
                <Text style={styles.emptyBody}>{t("contacts.loadErrorBody")}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.retry")}
                  onPress={onRefresh}
                  style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                >
                  <Icon name="refresh" size={19} color={fieldTheme.color.onColor} />
                  <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
                </Pressable>
              </>
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
              style={({ pressed }) => [styles.card, tablet && styles.cardTablet, pressed && styles.cardPressed]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name?.trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>

              <View style={styles.cardContent}>
                <View style={styles.nameRow}>
                  <View style={styles.nameCopy}>
                    <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>{item.specialty || typeLabel}</Text>
                  </View>
                  {item.category && (
                    <View style={[styles.categoryBadge, { backgroundColor: category.soft }]}>
                      <Text style={[styles.categoryText, { color: category.strong }]}>{item.category}</Text>
                    </View>
                  )}
                </View>

                {item.workplace && (
                  <View style={styles.detailRow}>
                    <Icon name="business-outline" size={16} color={fieldTheme.color.inkMuted} />
                    <Text style={styles.detailText} numberOfLines={1}>{item.workplace}</Text>
                  </View>
                )}
                {item.phone && (
                  <View style={styles.detailRow}>
                    <Icon name="call-outline" size={16} color={fieldTheme.color.inkMuted} />
                    <Text style={styles.detailText} numberOfLines={1}>{item.phone}</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <View style={styles.typeChip}>
                    <Text style={styles.typeText}>{typeLabel}</Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color={fieldTheme.color.inkMuted} />
                </View>
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  searchArea: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.lg },
  guideWrap: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md },
  searchBox: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    paddingLeft: fieldTheme.space.lg,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  searchInput: { flex: 1, minHeight: 52, fontSize: 15, color: fieldTheme.color.ink, paddingHorizontal: fieldTheme.space.md },
  clearButton: { minWidth: LAYOUT_TOUCH_TARGETS.compact, minHeight: LAYOUT_TOUCH_TARGETS.compact, alignItems: "center", justifyContent: "center" },
  offlineBanner: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    marginTop: fieldTheme.space.md,
    paddingHorizontal: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.amberSoft,
    borderWidth: 1,
    borderColor: "#EED49B",
  },
  offlineBannerText: { flex: 1, color: fieldTheme.color.amber, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  listContent: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: fieldTheme.space.lg, paddingTop: fieldTheme.space.md, flexGrow: 1 },
  tabletRow: { gap: fieldTheme.space.md },
  card: {
    minHeight: 132,
    flexDirection: "row",
    gap: fieldTheme.space.md,
    backgroundColor: fieldTheme.color.surface,
    borderRadius: fieldTheme.radius.md,
    padding: fieldTheme.space.lg,
    marginBottom: fieldTheme.space.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  cardTablet: { flex: 1 },
  cardPressed: { backgroundColor: fieldTheme.color.surfaceStrong, transform: [{ scale: 0.995 }] },
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
  empty: { padding: 44, alignItems: "center", flex: 1, justifyContent: "center" },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 22, backgroundColor: fieldTheme.color.primarySoft, justifyContent: "center", alignItems: "center", marginBottom: fieldTheme.space.lg },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", color: fieldTheme.color.ink, textAlign: "center" },
  emptyBody: { maxWidth: 380, marginTop: fieldTheme.space.sm, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary, paddingHorizontal: fieldTheme.space.xl, marginTop: fieldTheme.space.lg },
  retryButtonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.72 },
})
