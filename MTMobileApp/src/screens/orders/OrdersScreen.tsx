import React, { useEffect, useState, useCallback } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import { api } from "../../services/api"
import { useTabBarPadding, useHeaderTop } from "../../hooks/useTabBarHeight"
import type { RootStackParamList } from "../../navigation/AppNavigator"

// F-43: server validator (mtm-validators OrderItem) uses `name`, not
// `product`. Mobile previously read `it.product` which never existed
// in stored items (Zod strip'd it on write); fallback kept for any
// legacy in-flight rows where someone hand-crafted a stored row.
interface OrderItem { name?: string; product?: string; qty: number; price: number }

interface Order {
  id: string
  orderNumber: string
  status: string
  totalAmount: number
  items: OrderItem[]
  notes?: string
  createdAt: string
  customer?: { name: string }
  agent?: { name: string }
}

const STATUS_TABS = ["DRAFT", "CONFIRMED", "DELIVERED"]
const TAB_LABEL_KEY: Record<string, string> = {
  DRAFT: "order.tabDraft",
  CONFIRMED: "order.tabConfirmed",
  DELIVERED: "order.tabDelivered",
}
const STATUS_LABEL_KEY: Record<string, string> = {
  DRAFT: "order.statusDraft",
  CONFIRMED: "order.statusConfirmed",
  DELIVERED: "order.statusDelivered",
  CANCELLED: "order.statusCancelled",
}
const EMPTY_KEY: Record<string, string> = {
  DRAFT: "order.emptyDraft",
  CONFIRMED: "order.emptyConfirmed",
  DELIVERED: "order.emptyDelivered",
}

export default function OrdersScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const tabBarPadding = useTabBarPadding()
  const headerTop = useHeaderTop()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("DRAFT")

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.getOrders()
      if (res.success) setOrders(res.data?.orders || [])
    } catch (e: any) {
      if (e.message !== "SESSION_EXPIRED") console.warn("Failed to fetch orders:", e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const filtered = orders.filter((o) => o.status === activeTab)
  const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0)
  const avgOrder = orders.length > 0 ? totalRevenue / orders.length : 0

  const statusColor = (s: string) => {
    switch (s) {
      case "CONFIRMED": return "#3b82f6"
      case "DELIVERED": return "#22c55e"
      case "CANCELLED": return "#ef4444"
      default: return "#f59e0b"
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>{t("order.title")}</Text>
            <Text style={styles.headerSubtitle}>{t("order.totalTemplate", { n: orders.length })}</Text>
          </View>
          {totalRevenue > 0 && (
            <View style={styles.revenueBadge}>
              <Text style={styles.revenueNum}>${totalRevenue.toFixed(0)}</Text>
              <Text style={styles.revenueLabel}>{t("order.revenueLabel")}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{orders.length}</Text>
          <Text style={styles.statLabel}>{t("order.statOrders")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={[styles.statItem, { flex: 1.5 }]}>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>${totalRevenue.toFixed(0)}</Text>
          <Text style={styles.statLabel}>{t("order.statRevenue")}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#6C63FF" }]}>${avgOrder.toFixed(0)}</Text>
          <Text style={styles.statLabel}>{t("order.statAverage")}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab).length
          const isActive = activeTab === tab
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t(TAB_LABEL_KEY[tab])}
              </Text>
              <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarPadding + 72 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders() }} tintColor="#6C63FF" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>🛒</Text>
            </View>
            <Text style={styles.emptyTitle}>{loading ? t("common.loading") : t("order.emptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>
              {!loading ? t(EMPTY_KEY[activeTab]) : ""}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                {item.customer && <Text style={styles.customerName}>{item.customer.name}</Text>}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "18" }]}>
                <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                  {STATUS_LABEL_KEY[item.status] ? t(STATUS_LABEL_KEY[item.status]) : item.status}
                </Text>
              </View>
            </View>

            {/* Items */}
            <View style={styles.itemsList}>
              {(item.items || []).slice(0, 3).map((it, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.name || it.product || t("order.itemFallback")}</Text>
                  <Text style={styles.itemQty}>x{it.qty}</Text>
                  <Text style={styles.itemPrice}>${(it.qty * it.price).toFixed(0)}</Text>
                </View>
              ))}
              {(item.items || []).length > 3 && (
                <Text style={styles.moreItems}>{t("order.moreItemsTemplate", { n: item.items.length - 3 })}</Text>
              )}
            </View>

            <View style={styles.orderFooter}>
              <Text style={styles.totalAmount}>${(item.totalAmount || 0).toFixed(2)}</Text>
              <Text style={styles.orderDate}>
                {new Date(item.createdAt).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
              </Text>
            </View>
          </View>
        )}
      />

      {/* New Order FAB — must be AFTER FlatList so it sits on top in Android's touch dispatch */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("SkuCatalog")}
      >
        <Icon name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    backgroundColor: "#6C63FF",
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  headerSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  revenueBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
  },
  revenueNum: { color: "#fff", fontSize: 18, fontWeight: "800" },
  revenueLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase" },

  // Stats
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -14,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: "#0B0B1E" },
  statLabel: { fontSize: 9, color: "#94a3b8", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: "#f1f5f9" },

  // Tabs
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    gap: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  tabActive: { backgroundColor: "#6C63FF", borderColor: "#6C63FF" },
  tabText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  tabTextActive: { color: "#fff" },
  tabCount: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  tabCountText: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  tabCountTextActive: { color: "#fff" },

  // Empty
  empty: { padding: 40, alignItems: "center" },
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
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#0B0B1E", marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: "#94a3b8" },

  // Order cards
  orderCard: {
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
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  orderNumber: { fontSize: 15, fontWeight: "700", color: "#0B0B1E" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "700" },
  customerName: { fontSize: 12, color: "#64748b", marginTop: 3 },

  itemsList: { borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 10, marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 12, color: "#334155" },
  itemQty: { fontSize: 11, color: "#94a3b8", marginHorizontal: 8 },
  itemPrice: { fontSize: 12, fontWeight: "600", color: "#0B0B1E", width: 50, textAlign: "right" },
  moreItems: { fontSize: 11, color: "#94a3b8", fontStyle: "italic", marginTop: 3 },

  orderFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 10,
  },
  totalAmount: { fontSize: 18, fontWeight: "800", color: "#6C63FF" },
  orderDate: { fontSize: 11, color: "#94a3b8" },

  // New Order FAB
  fab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#6C63FF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6C63FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
})
