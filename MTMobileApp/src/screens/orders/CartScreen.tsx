import React, { useState } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useTranslation } from "react-i18next"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import { Sentry } from "../../services/sentry"
import { api } from "../../services/api"
import { useCartStore } from "../../store/cart"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import type { RootStackParamList } from "../../navigation/AppNavigator"

export default function CartScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const headerTop = useHeaderTop()

  const items = useCartStore((s) => s.items)
  const customerId = useCartStore((s) => s.customerId)
  const customerName = useCartStore((s) => s.customerName)
  const notes = useCartStore((s) => s.notes)
  const setQty = useCartStore((s) => s.setQty)
  const removeItem = useCartStore((s) => s.removeItem)
  const setNotes = useCartStore((s) => s.setNotes)
  const clearCart = useCartStore((s) => s.clearCart)
  const getTotal = useCartStore((s) => s.getTotal)

  const [submitting, setSubmitting] = useState(false)

  const total = getTotal()

  const handleRemove = (skuId: string, name: string) => {
    Alert.alert(
      t("cart.removeTitle"),
      t("cart.removeMessage", { name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.ok"), style: "destructive", onPress: () => removeItem(skuId) },
      ]
    )
  }

  const handlePlaceOrder = async () => {
    if (!customerId) {
      Alert.alert(t("cart.noCustomerTitle"), t("cart.noCustomerMessage"))
      return
    }
    if (items.length === 0) {
      Alert.alert(t("cart.emptyTitle"), t("cart.emptyMessage"))
      return
    }

    setSubmitting(true)
    try {
      const res = await api.createOrderWithSkuItems({
        customerId,
        // Server schema (`OrderItem` in src/lib/mtm-validators.ts):
        //   { productId?: cuid, name?: string, price: number, qty: number }
        // Mobile uses `skuId` internally (M1-4 SKU catalog) but the order
        // route lives over the legacy `mtm_orders.items` jsonb which has
        // its own shape — we send `name + price + qty` (server-side
        // totalAmount recomputes from these).
        items: items.map((it) => ({
          name: it.name,
          price: it.price,
          qty: it.qty,
        })),
        notes: notes.trim() || undefined,
      })

      if (res.success) {
        // Reset items + notes; preserve customer binding so the agent
        // can stack a second order at the same visit. Customer binding
        // is wiped on check-out via VisitScreen.resetCart().
        clearCart()
        Alert.alert(
          t("cart.successTitle"),
          t("cart.successMessage", { total: total.toFixed(2) }),
          [{ text: t("common.ok"), onPress: () => navigation.navigate("Main") }]
        )
      } else {
        Alert.alert(t("common.error"), res.error || t("cart.submitFailed"))
      }
    } catch (e: any) {
      // Surface to Sentry with feature tag so order-placement failures
      // are queryable. Matches the inline-tags convention used by
      // src/db/database.ts:28 (the existing capture site in this repo).
      const err = e instanceof Error ? e : new Error(String(e))
      Sentry.captureException(err, { tags: { feature: "place-order" } })
      Alert.alert(t("common.error"), e?.message || t("cart.submitFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("cart.title")}</Text>
          {items.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() =>
                Alert.alert(t("cart.clearTitle"), t("cart.clearMessage"), [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("common.ok"), style: "destructive", onPress: clearCart },
                ])
              }
            >
              <Text style={styles.clearText}>{t("cart.clear")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Customer badge */}
        {customerName ? (
          <View style={styles.customerBadge}>
            <Icon name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.customerBadgeText}>{customerName}</Text>
          </View>
        ) : (
          <View style={styles.customerBadge}>
            <Icon name="alert-circle-outline" size={14} color="#fbbf24" />
            <Text style={[styles.customerBadgeText, { color: "#fbbf24" }]}>
              {t("cart.noCustomer")}
            </Text>
          </View>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>{t("cart.emptyTitle")}</Text>
          <Text style={styles.emptyHint}>{t("cart.emptyHint")}</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.browseBtnText}>{t("cart.browseCatalog")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => i.skuId}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              <View style={styles.notesWrap}>
                <Text style={styles.notesLabel}>{t("cart.notes")}</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder={t("cart.notesPlaceholder")}
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.itemCard}>
                <View style={styles.itemThumb}>
                  <Text style={styles.itemThumbText}>
                    {item.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.itemUnit}>{item.unit}</Text>
                  <Text style={styles.itemUnitPrice}>
                    {Number(item.price).toFixed(2)} AZN/{item.unit}
                  </Text>
                </View>

                <View style={styles.itemRight}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setQty(item.skuId, item.qty - 1)}
                    >
                      <Icon name="remove" size={14} color="#6C63FF" />
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setQty(item.skuId, item.qty + 1)}
                    >
                      <Icon name="add" size={14} color="#6C63FF" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.itemLineTotal}>
                    {(item.price * item.qty).toFixed(2)} AZN
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemove(item.skuId, item.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />

          {/* Footer total + submit */}
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("cart.total")}</Text>
              <Text style={styles.totalValue}>{total.toFixed(2)} AZN</Text>
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handlePlaceOrder}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Icon name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>{t("cart.placeOrder")}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
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
    marginBottom: 10,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "800" },
  clearBtn: { padding: 4 },
  clearText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },

  customerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  customerBadgeText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },

  // Empty
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#0B0B1E", marginBottom: 6 },
  emptyHint: { fontSize: 13, color: "#94a3b8", textAlign: "center", marginBottom: 24 },
  browseBtn: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  browseBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // List
  listContent: { padding: 16 },

  // Item card
  itemCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f0f0ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  itemThumbText: { fontSize: 13, fontWeight: "800", color: PURPLE },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: "700", color: "#0B0B1E", lineHeight: 18 },
  itemUnit: { fontSize: 10, color: "#94a3b8", marginTop: 1 },
  itemUnitPrice: { fontSize: 11, color: "#64748b", marginTop: 2 },

  itemRight: { alignItems: "flex-end", gap: 6 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0f0ff",
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  qtyNum: { fontSize: 13, fontWeight: "800", color: PURPLE, minWidth: 20, textAlign: "center" },
  itemLineTotal: { fontSize: 13, fontWeight: "700", color: "#0B0B1E" },

  // Notes
  notesWrap: { marginTop: 16 },
  notesLabel: { fontSize: 13, fontWeight: "600", color: "#64748b", marginBottom: 6 },
  notesInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    fontSize: 13,
    color: "#0B0B1E",
    textAlignVertical: "top",
    minHeight: 72,
  },

  // Footer
  footer: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    alignItems: "center",
  },
  totalLabel: { fontSize: 15, fontWeight: "600", color: "#64748b" },
  totalValue: { fontSize: 22, fontWeight: "900", color: "#0B0B1E" },
  submitBtn: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    height: 52,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
})
