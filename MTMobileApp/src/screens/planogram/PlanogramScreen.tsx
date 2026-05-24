import React, { useEffect, useState, useCallback } from "react"
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  StatusBar,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"

type Nav = NativeStackNavigationProp<RootStackParamList, "Planogram">
type RouteType = RouteProp<RootStackParamList, "Planogram">

interface Planogram {
  id: string
  title: string
  category?: string
  imageUrl: string
  description?: string
}

type ComplianceStatus = "compliant" | "non_compliant" | null

export default function PlanogramScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<RouteType>()
  const insets = useSafeAreaInsets()
  const { customerId, customerName, visitId } = route.params

  const [planograms, setPlanograms] = useState<Planogram[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [compliance, setCompliance] = useState<Record<string, ComplianceStatus>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getPlanograms(customerId)
      if (res.success) {
        const list: Planogram[] = res.data?.planograms ?? []
        setPlanograms(list)
        const initial: Record<string, ComplianceStatus> = {}
        list.forEach(p => { initial[p.id] = null })
        setCompliance(initial)
      }
    } catch {
      // silent — empty state handles it
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { load() }, [load])

  const setStatus = (id: string, status: ComplianceStatus) => {
    setCompliance(prev => ({ ...prev, [id]: status }))
  }

  const markedCount = Object.values(compliance).filter(v => v !== null).length
  const canSubmit = markedCount > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const results = Object.entries(compliance)
        .filter(([, s]) => s !== null)
        .map(([planogramId, status]) => ({ planogramId, status: status! }))

      await api.submitPlanogramCheck({ customerId, visitId, results })
      Alert.alert(t("planogram.submitSuccess"), "", [
        { text: t("common.ok"), onPress: () => navigation.goBack() },
      ])
    } catch {
      Alert.alert(t("common.error"), t("planogram.submitError"))
    } finally {
      setSubmitting(false)
    }
  }

  const renderItem = ({ item }: { item: Planogram }) => {
    const status = compliance[item.id]
    return (
      <View style={styles.card}>
        {item.category && (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUrl(item.imageUrl)}>
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.zoomHint}>
            <Text style={styles.zoomHintText}>🔍 {t("planogram.tapToZoom")}</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}

        <View style={styles.complianceRow}>
          <TouchableOpacity
            style={[styles.compBtn, styles.compBtnYes, status === "compliant" && styles.compBtnYesActive]}
            onPress={() => setStatus(item.id, status === "compliant" ? null : "compliant")}
          >
            <Text style={[styles.compBtnText, status === "compliant" && styles.compBtnTextActive]}>
              ✓ {t("planogram.compliant")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.compBtn, styles.compBtnNo, status === "non_compliant" && styles.compBtnNoActive]}
            onPress={() => setStatus(item.id, status === "non_compliant" ? null : "non_compliant")}
          >
            <Text style={[styles.compBtnText, status === "non_compliant" && styles.compBtnTextActive]}>
              ✕ {t("planogram.nonCompliant")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("planogram.title")}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{customerName}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C63FF" />
        </View>
      ) : planograms.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📐</Text>
          <Text style={styles.emptyTitle}>{t("planogram.empty")}</Text>
          <Text style={styles.emptyHint}>{t("planogram.emptyHint")}</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={planograms}
            keyExtractor={p => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />

          <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
            {markedCount > 0 && (
              <Text style={styles.footerCount}>
                {t("planogram.markedCount", { n: markedCount, total: planograms.length })}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{t("planogram.submit")}</Text>
              }
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Full-screen image preview */}
      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewUrl(null)}>
          <Image
            source={{ uri: previewUrl ?? "" }}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <View style={styles.previewClose}>
            <Text style={styles.previewCloseText}>✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  backBtn: { marginRight: 12, padding: 4 },
  backIcon: { fontSize: 32, color: "#6C63FF", lineHeight: 36 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0B0B1E" },
  headerSub: { fontSize: 13, color: "#94a3b8", marginTop: 1 },

  // States
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#0B0B1E" },
  emptyHint: { fontSize: 13, color: "#94a3b8", textAlign: "center", paddingHorizontal: 32 },

  // List
  list: { padding: 16, gap: 16 },

  // Card
  card: {
    backgroundColor: "#fff", borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  categoryChip: {
    position: "absolute", top: 10, left: 10, zIndex: 1,
    backgroundColor: "#6C63FF", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  categoryText: { fontSize: 11, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
  image: { width: "100%", height: 200 },
  zoomHint: {
    position: "absolute", bottom: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  zoomHintText: { fontSize: 11, color: "#fff" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0B0B1E", margin: 14, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: "#64748b", marginHorizontal: 14, marginBottom: 4 },

  // Compliance
  complianceRow: {
    flexDirection: "row", gap: 10,
    margin: 14, marginTop: 10,
  },
  compBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, alignItems: "center",
  },
  compBtnYes: { borderColor: "#22c55e", backgroundColor: "#f0fdf4" },
  compBtnYesActive: { backgroundColor: "#22c55e" },
  compBtnNo: { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
  compBtnNoActive: { backgroundColor: "#ef4444" },
  compBtnText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  compBtnTextActive: { color: "#fff" },

  // Footer
  footer: {
    backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
    gap: 6,
  },
  footerCount: { fontSize: 12, color: "#94a3b8", textAlign: "center" },
  submitBtn: {
    backgroundColor: "#6C63FF", borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Preview
  previewBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center", alignItems: "center",
  },
  previewImage: { width: "100%", height: "80%" },
  previewClose: {
    position: "absolute", top: 50, right: 20,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    width: 36, height: 36, justifyContent: "center", alignItems: "center",
  },
  previewCloseText: { color: "#fff", fontSize: 16, fontWeight: "700" },
})
