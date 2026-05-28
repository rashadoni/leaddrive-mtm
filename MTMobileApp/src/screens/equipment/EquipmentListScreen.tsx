import React, { useEffect, useCallback } from "react"
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native"
import { useTranslation } from "react-i18next"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import Icon from "react-native-vector-icons/Ionicons"
import { useEquipmentStore, EquipmentItem, EquipmentCondition } from "../../store/equipment"
import { RootStackParamList } from "../../navigation/AppNavigator"

const CONDITION_COLOR: Record<EquipmentCondition, string> = {
  GOOD: "#22c55e",
  DAMAGED: "#f97316",
  NEEDS_REPAIR: "#ef4444",
  MISSING: "#94a3b8",
}

const CONDITION_ICON: Record<EquipmentCondition, string> = {
  GOOD: "checkmark-circle",
  DAMAGED: "warning",
  NEEDS_REPAIR: "construct",
  MISSING: "help-circle",
}

type NavProp = NativeStackNavigationProp<RootStackParamList, "EquipmentList">

export default function EquipmentListScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NavProp>()
  const route = useRoute<RouteProp<RootStackParamList, "EquipmentList">>()
  const { customerId, visitId } = route.params

  const { items, loading, error, fetchEquipment } = useEquipmentStore()

  useEffect(() => {
    fetchEquipment(customerId)
  }, [customerId])

  const renderItem = useCallback(
    ({ item }: { item: EquipmentItem }) => {
      const color = CONDITION_COLOR[item.condition] ?? "#94a3b8"
      const icon = CONDITION_ICON[item.condition] ?? "help-circle"
      const openRequests = item._count?.repairRequests ?? 0
      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            navigation.navigate("EquipmentInspect", {
              equipmentId: item.id,
              serialNumber: item.serialNumber,
              model: item.model ?? "",
              condition: item.condition,
              visitId,
            })
          }
          activeOpacity={0.75}
        >
          <View style={[styles.conditionDot, { backgroundColor: color }]}>
            <Icon name={icon} size={18} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.type?.name ?? t("equipment.title")}</Text>
            <Text style={styles.cardSub}>
              {t("equipment.serialNumber")}: {item.serialNumber}
            </Text>
            {item.model ? <Text style={styles.cardSub}>{item.model}</Text> : null}
            {openRequests > 0 && (
              <View style={styles.repairBadge}>
                <Icon name="construct-outline" size={12} color="#ef4444" />
                <Text style={styles.repairBadgeText}>{openRequests}</Text>
              </View>
            )}
          </View>
          <View style={[styles.conditionPill, { borderColor: color }]}>
            <Text style={[styles.conditionText, { color }]}>
              {t(`equipment.condition.${item.condition}` as any)}
            </Text>
          </View>
          <Icon name="chevron-forward" size={16} color="#94a3b8" />
        </TouchableOpacity>
      )
    },
    [navigation, t, visitId]
  )

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("equipment.title")}</Text>
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchEquipment(customerId)} />
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrapper}>
            <Icon name="snow-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>{t("equipment.empty")}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1 },
  emptyWrapper: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: "#94a3b8", textAlign: "center", paddingHorizontal: 32 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 12 },
  conditionDot: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#1e293b" },
  cardSub: { fontSize: 12, color: "#64748b" },
  conditionPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  conditionText: { fontSize: 11, fontWeight: "600" },
  repairBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  repairBadgeText: { fontSize: 11, color: "#ef4444", fontWeight: "600" },
  errorText: { color: "#ef4444", textAlign: "center", padding: 12 },
})
