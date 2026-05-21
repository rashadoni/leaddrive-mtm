import React, { useEffect, useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { useCartStore } from "../../store/cart"
import { useHeaderTop, useTabBarPadding } from "../../hooks/useTabBarHeight"
import type { RootStackParamList } from "../../navigation/AppNavigator"

interface SkuCategory {
  id: string
  name: string
  code?: string | null
}

interface Sku {
  id: string
  name: string
  code: string
  brand?: string | null
  unit: string
  basePrice: number
  currency: string
  thumbnailUrl?: string | null
  imageUrl?: string | null
  category?: { id: string; name: string } | null
  stockLevels?: { quantity: number }[]
}

const ALL_ID = "__all__"

export default function SkuCatalogScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const headerTop = useHeaderTop()
  const tabBarPadding = useTabBarPadding()

  const [categories, setCategories] = useState<SkuCategory[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<string>(ALL_ID)

  const cartItems = useCartStore((s) => s.items)
  const addItem = useCartStore((s) => s.addItem)
  const setQty = useCartStore((s) => s.setQty)
  const getItemCount = useCartStore((s) => s.getItemCount)
  const cartCount = getItemCount()

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // M1-4d.race — sequence guard against debounced-fetch race condition.
  // Fast typer can land an older fetch response over a newer one because
  // requests are not cancelled, just their pending timeouts cleared. Each
  // fetchSkus call increments this ref; on response, we check that our
  // request is still the latest before applying state. Stale responses
  // are silently discarded.
  const fetchSeqRef = useRef(0)

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.getSkuCategories()
      if (res.success) setCategories(res.data?.categories || [])
    } catch {}
  }, [])

  const fetchSkus = useCallback(async (catId?: string, q?: string) => {
    const mySeq = ++fetchSeqRef.current
    setLoading(true)
    try {
      const res = await api.getSkus({
        categoryId: catId && catId !== ALL_ID ? catId : undefined,
        search: q && q.trim().length > 0 ? q.trim() : undefined,
        isActive: true,
      })
      // M1-4d.race: discard if a newer fetch superseded us mid-flight.
      if (mySeq !== fetchSeqRef.current) return
      if (res.success) setSkus(res.data?.skus || [])
    } catch {
      if (mySeq !== fetchSeqRef.current) return
      setSkus([])
    } finally {
      if (mySeq === fetchSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
    fetchSkus()
    // M1-4d.race: on unmount, bump seq so any still-in-flight fetches
    // discard their responses (avoids "setState on unmounted component").
    return () => {
      fetchSeqRef.current++
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [])

  const onCategoryPress = (id: string) => {
    setActiveCategory(id)
    fetchSkus(id, search)
  }

  const onSearchChange = (text: string) => {
    setSearch(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      fetchSkus(activeCategory, text)
    }, 400)
  }

  const getCartQty = (skuId: string) =>
    cartItems.find((i) => i.skuId === skuId)?.qty ?? 0

  const handleAdd = (sku: Sku) => {
    addItem({
      skuId: sku.id,
      name: sku.name,
      unit: sku.unit,
      price: sku.basePrice,
      thumbnailUrl: sku.thumbnailUrl,
    })
  }

  const handleIncrement = (sku: Sku) => {
    const current = getCartQty(sku.id)
    if (current === 0) {
      handleAdd(sku)
    } else {
      setQty(sku.id, current + 1)
    }
  }

  const handleDecrement = (sku: Sku) => {
    const current = getCartQty(sku.id)
    setQty(sku.id, current - 1)
  }

  const renderSku = ({ item }: { item: Sku }) => {
    const qty = getCartQty(item.id)
    const totalStock = (item.stockLevels || []).reduce((s, l) => s + l.quantity, 0)

    return (
      <View style={styles.skuCard}>
        {/* Thumbnail */}
        <View style={styles.thumbWrap}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbPlaceholderText}>
                {item.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          {totalStock > 0 && totalStock < 20 && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockText}>{totalStock}</Text>
            </View>
          )}
        </View>

        <View style={styles.skuInfo}>
          {item.brand && <Text style={styles.skuBrand}>{item.brand}</Text>}
          <Text style={styles.skuName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.skuCode}>{item.code} · {item.unit}</Text>
          <Text style={styles.skuPrice}>
            {Number(item.basePrice).toFixed(2)} {item.currency}
          </Text>
        </View>

        {/* Qty controls */}
        <View style={styles.qtyControls}>
          {qty === 0 ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => handleAdd(item)}>
              <Icon name="add" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => handleDecrement(item)}>
                <Icon name="remove" size={16} color="#6C63FF" />
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{qty}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => handleIncrement(item)}>
                <Icon name="add" size={16} color="#6C63FF" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("sku.title")}</Text>

          {/* Cart icon */}
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={() => navigation.navigate("Cart")}
          >
            <Icon name="cart-outline" size={24} color="#fff" />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : String(cartCount)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Icon name="search-outline" size={16} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("sku.searchPlaceholder")}
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={onSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catScrollContent}
      >
        {[{ id: ALL_ID, name: t("sku.all") }, ...categories].map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catPill, activeCategory === cat.id && styles.catPillActive]}
            onPress={() => onCategoryPress(cat.id)}
          >
            <Text style={[styles.catPillText, activeCategory === cat.id && styles.catPillTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* SKU list */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      ) : (
        <FlatList
          data={skus}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding + 16 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>{t("sku.emptyTitle")}</Text>
              <Text style={styles.emptyHint}>{t("sku.emptyHint")}</Text>
            </View>
          }
          renderItem={renderSku}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* Go-to-cart FAB when cart is not empty */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartFab}
          onPress={() => navigation.navigate("Cart")}
        >
          <Icon name="cart" size={20} color="#fff" />
          <Text style={styles.cartFabText}>
            {t("sku.goToCart")} ({cartCount})
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const PURPLE = "#6C63FF"

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    backgroundColor: PURPLE,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "800" },
  cartBtn: { padding: 4, position: "relative" },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -6,
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    height: 40,
  },

  // Categories
  catScroll: { maxHeight: 48, marginTop: 8 },
  catScrollContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  catPillActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  catPillText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  catPillTextActive: { color: "#fff" },

  // Loading
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#94a3b8", fontSize: 13 },

  // Empty
  empty: { padding: 48, alignItems: "center" },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0B0B1E", marginBottom: 4 },
  emptyHint: { fontSize: 13, color: "#94a3b8", textAlign: "center" },

  // SKU card
  skuCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  thumbWrap: { position: "relative", marginRight: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
  },
  thumbPlaceholderText: { fontSize: 16, fontWeight: "800", color: PURPLE },
  lowStockBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  lowStockText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  skuInfo: { flex: 1 },
  skuBrand: { fontSize: 10, fontWeight: "600", color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  skuName: { fontSize: 14, fontWeight: "700", color: "#0B0B1E", lineHeight: 19 },
  skuCode: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  skuPrice: { fontSize: 14, fontWeight: "800", color: "#22c55e", marginTop: 4 },

  // Qty controls
  qtyControls: { marginLeft: 10, alignItems: "center" },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0f0ff",
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  qtyNum: { fontSize: 14, fontWeight: "800", color: PURPLE, minWidth: 22, textAlign: "center" },

  // Cart FAB
  cartFab: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    height: 52,
    backgroundColor: PURPLE,
    borderRadius: 26,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  cartFabText: { color: "#fff", fontSize: 15, fontWeight: "800" },
})
