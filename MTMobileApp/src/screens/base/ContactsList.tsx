import React, { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  FlatList,
  TextInput,
  RefreshControl,
  StyleSheet,
} from "react-native"
import { useTranslation } from "react-i18next"
import { api } from "../../services/api"
import { toContactListItem, type ContactListItem } from "../../services/contact-list"
import { useTabBarPadding } from "../../hooks/useTabBarHeight"

const TYPE_KEY: Record<string, string> = {
  DOCTOR: "contacts.typeDoctor",
  PHARMACIST: "contacts.typePharmacist",
  OTHER: "contacts.typeOther",
}

function categoryColor(category?: string): string {
  switch (category) {
    case "A": return "#22c55e"
    case "B": return "#3b82f6"
    case "C": return "#f59e0b"
    default: return "#94a3b8"
  }
}

export default function ContactsList() {
  const { t } = useTranslation()
  const tabBarPadding = useTabBarPadding()
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchContacts = useCallback(async (term: string) => {
    try {
      const res = await api.getContacts(term ? { search: term } : undefined)
      if (res.success) {
        setContacts((res.data?.contacts || []).map(toContactListItem))
        setOffline(false)
      }
    } catch (e: any) {
      // No offline cache for contacts yet (the sync-pull cache has no
      // `contacts` entity) — surface a "not available offline" note instead of
      // silently showing an empty list.
      if (e.message !== "SESSION_EXPIRED") {
        setContacts([])
        setOffline(true)
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
      <View style={styles.searchCard}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t("contacts.searchPlaceholder")}
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineDot}>●</Text>
          <Text style={styles.offlineBannerText}>{t("contacts.offlineUnavailable")}</Text>
        </View>
      )}

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" colors={["#6C63FF"]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>🧑‍⚕️</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {loading
                ? t("contacts.loading")
                : debouncedSearch
                  ? t("contacts.emptySearch")
                  : t("contacts.empty")}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardMain}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub}>
                  {item.specialty || (item.type ? t(TYPE_KEY[item.type] ?? "contacts.typeOther") : "")}
                </Text>
              </View>
              {item.category && (
                <View style={[styles.categoryBadge, { backgroundColor: categoryColor(item.category) + "18" }]}>
                  <Text style={[styles.categoryText, { color: categoryColor(item.category) }]}>{item.category}</Text>
                </View>
              )}
            </View>

            {item.workplace && <Text style={styles.cardWorkplace} numberOfLines={1}>🏢 {item.workplace}</Text>}

            <View style={styles.cardChips}>
              {item.type && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{t(TYPE_KEY[item.type] ?? "contacts.typeOther")}</Text>
                </View>
              )}
              {item.phone && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>📞 {item.phone}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#0B0B1E", paddingVertical: 10 },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
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
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardMain: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#0B0B1E" },
  cardSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  categoryBadge: { borderRadius: 8, minWidth: 26, paddingHorizontal: 8, paddingVertical: 4, alignItems: "center" },
  categoryText: { fontSize: 12, fontWeight: "800" },
  cardWorkplace: { fontSize: 12, color: "#64748b", marginTop: 8 },

  cardChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { backgroundColor: "#f8fafc", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 11, color: "#64748b", fontWeight: "500" },

  empty: { padding: 40, alignItems: "center", flex: 1, justifyContent: "center" },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0B0B1E", textAlign: "center" },
})
