import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useNavigation } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import RNFS from "react-native-fs"
import ImageResizer from "react-native-image-resizer"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"

type Navigation = NativeStackNavigationProp<RootStackParamList, "PlanogramLibrary">
type CustomerCategory = "A" | "B" | "C" | "D"
type StandardMode = "golden" | "manual"

interface CatalogSku {
  id: string
  name: string
  code?: string | null
  brand?: string | null
}

interface ExpectedSku {
  skuId?: string
  name?: string
  skuName?: string
  expectedFacings?: number
}

interface PlanogramStandard {
  id: string
  name: string
  description?: string | null
  customerCategory?: CustomerCategory | null
  brand?: string | null
  referenceImageUrl?: string | null
  expectedSkus?: ExpectedSku[]
}

const CATEGORIES: CustomerCategory[] = ["A", "B", "C", "D"]

export default function PlanogramLibraryScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Navigation>()
  const insets = useSafeAreaInsets()
  const canGoBack = navigation.canGoBack()

  const [loading, setLoading] = useState(true)
  const [standards, setStandards] = useState<PlanogramStandard[]>([])
  const [createVisible, setCreateVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [category, setCategory] = useState<CustomerCategory>("B")
  const [mode, setMode] = useState<StandardMode>("golden")
  const [name, setName] = useState("")
  const [brand, setBrand] = useState("")
  const [skuSearch, setSkuSearch] = useState("")
  const [catalogSkus, setCatalogSkus] = useState<CatalogSku[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [selectedSkus, setSelectedSkus] = useState<Record<string, number>>({})
  const [goldenPlanogramId, setGoldenPlanogramId] = useState<string | null>(null)
  const [settingGoldenId, setSettingGoldenId] = useState<string | null>(null)

  const loadStandards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listPlanogramStandards({ limit: 100 })
      if (res.success) {
        setStandards(res.data?.planograms ?? [])
      } else {
        Alert.alert(t("common.error"), res.error ?? t("planogram.loadError"))
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.loadError"))
    } finally {
      setLoading(false)
    }
  }, [t])

  const fetchCatalogSkus = useCallback(async (q = "") => {
    setCatalogLoading(true)
    try {
      const res = await api.getSkus({
        search: q.trim() ? q.trim() : undefined,
        isActive: true,
      })
      setCatalogSkus(res.success ? (res.data?.skus ?? []) : [])
    } catch {
      setCatalogSkus([])
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStandards()
  }, [loadStandards])

  useEffect(() => {
    if (createVisible && mode === "manual") {
      fetchCatalogSkus(skuSearch)
    }
  }, [createVisible, fetchCatalogSkus, mode, skuSearch])

  const selectedSkuCount = useMemo(() => Object.keys(selectedSkus).length, [selectedSkus])
  const canCreate = name.trim().length > 0 && !creating

  const openCreate = () => {
    setCategory("B")
    setMode("golden")
    setName("")
    setBrand("")
    setSkuSearch("")
    setCatalogSkus([])
    setSelectedSkus({})
    setCreateVisible(true)
  }

  const adjustSkuFacings = (skuId: string, delta: number) => {
    setSelectedSkus(prev => {
      const next = { ...prev }
      const value = Math.max(0, (next[skuId] ?? 0) + delta)
      if (value === 0) delete next[skuId]
      else next[skuId] = value
      return next
    })
  }

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      const entries = mode === "manual"
        ? Object.entries(selectedSkus).filter(([, facings]) => facings > 0)
        : []
      const res = await api.createPlanogram({
        name: name.trim(),
        brand: brand.trim() || undefined,
        customerCategory: category,
        description: mode === "golden"
          ? t("planogram.modeGolden")
          : t("planogram.modeManual"),
        expectedSkus: entries.map(([skuId, expectedFacings], index) => ({
          skuId,
          expectedFacings,
          position: index + 1,
        })),
      })
      if (!res.success) {
        Alert.alert(t("common.error"), res.error ?? t("planogram.createError"))
        return
      }

      const created = res.data
      const standard: PlanogramStandard = {
        id: created.id,
        name: created.name,
        description: created.description ?? null,
        customerCategory: created.customerCategory ?? category,
        brand: created.brand ?? null,
        referenceImageUrl: created.referenceImageUrl ?? null,
        expectedSkus: created.expectedSkus ?? [],
      }
      setStandards(prev => [standard, ...prev])
      setCreateVisible(false)

      if (mode === "golden") {
        Alert.alert(
          t("planogram.createSuccess"),
          t("planogram.createSuccessBody"),
          [{ text: t("common.ok"), onPress: () => setGoldenPlanogramId(standard.id) }],
        )
      } else {
        Alert.alert(t("planogram.createSuccess"), t("planogram.createManualSuccessBody"))
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.createError"))
    } finally {
      setCreating(false)
    }
  }

  const handleGoldenPhotoTaken = async (path: string) => {
    if (!goldenPlanogramId) return
    setSettingGoldenId(goldenPlanogramId)
    try {
      const normalizedPath = path.startsWith("file://") ? path.replace("file://", "") : path
      const resized = await ImageResizer.createResizedImage(
        normalizedPath.startsWith("file://") ? normalizedPath : `file://${normalizedPath}`,
        1600,
        1600,
        "JPEG",
        90,
        0,
      )
      const resizedPath = resized.uri.startsWith("file://") ? resized.uri.replace("file://", "") : resized.uri
      const imageBase64 = await RNFS.readFile(resizedPath, "base64")
      const res = await api.setGoldenReference({
        planogramId: goldenPlanogramId,
        imageBase64,
        imageMediaType: "image/jpeg",
      })
      if (!res.success) {
        Alert.alert(t("common.error"), res.error ?? t("planogram.createError"))
        return
      }
      const imageUrl = res.url ?? res.data?.referenceImageUrl
      if (imageUrl) {
        setStandards(prev => prev.map(item => (
          item.id === goldenPlanogramId ? { ...item, referenceImageUrl: imageUrl } : item
        )))
      }
      Alert.alert(t("planogram.goldenSetTitle"), t("planogram.goldenSetBody"))
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.createError"))
    } finally {
      setSettingGoldenId(null)
      setGoldenPlanogramId(null)
    }
  }

  const renderCreateSheet = () => (
    <Modal
      visible={createVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setCreateVisible(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t("planogram.createShelfStandard")}</Text>
            <TouchableOpacity onPress={() => setCreateVisible(false)} disabled={creating}>
              <Text style={styles.closeText}>x</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>{t("planogram.targetCategory")}</Text>
            <View style={styles.categoryPicker}>
              {CATEGORIES.map(item => (
                <TouchableOpacity
                  key={item}
                  style={[styles.categoryOption, category === item && styles.categoryOptionActive]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.categoryOptionText, category === item && styles.categoryOptionTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>{t("planogram.standardMode")}</Text>
            <View style={styles.modePicker}>
              <TouchableOpacity
                style={[styles.modeOption, mode === "golden" && styles.modeOptionActive]}
                onPress={() => setMode("golden")}
              >
                <Text style={[styles.modeTitle, mode === "golden" && styles.modeTitleActive]}>
                  {t("planogram.modeGolden")}
                </Text>
                <Text style={styles.modeHint}>{t("planogram.modeGoldenHint")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeOption, mode === "manual" && styles.modeOptionActive]}
                onPress={() => setMode("manual")}
              >
                <Text style={[styles.modeTitle, mode === "manual" && styles.modeTitleActive]}>
                  {t("planogram.modeManual")}
                </Text>
                <Text style={styles.modeHint}>{t("planogram.modeManualHint")}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>{t("planogram.shelfName")}</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder={t("planogram.shelfNamePlaceholder", { category })}
              placeholderTextColor="#64748b"
            />

            <Text style={styles.inputLabel}>{t("planogram.brand")}</Text>
            <TextInput
              style={styles.textInput}
              value={brand}
              onChangeText={setBrand}
              placeholder={t("planogram.brandPlaceholder")}
              placeholderTextColor="#64748b"
            />

            {mode === "manual" && (
              <>
                <Text style={styles.optionalHint}>{t("planogram.manualOptionalHint")}</Text>
                <View style={styles.skuSearchRow}>
                  <TextInput
                    style={[styles.textInput, styles.searchInput]}
                    value={skuSearch}
                    onChangeText={setSkuSearch}
                    placeholder={t("planogram.skuSearch")}
                    placeholderTextColor="#64748b"
                  />
                  {catalogLoading && <ActivityIndicator size="small" color="#6C63FF" />}
                </View>
                <Text style={styles.selectedSkuText}>{t("planogram.selectedSkus", { n: selectedSkuCount })}</Text>
                {catalogSkus.slice(0, 12).map(sku => {
                  const facings = selectedSkus[sku.id] ?? 0
                  return (
                    <View key={sku.id} style={styles.skuRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.skuName} numberOfLines={1}>{sku.name}</Text>
                        <Text style={styles.skuMeta} numberOfLines={1}>
                          {[sku.code, sku.brand].filter(Boolean).join(" · ") || t("planogram.facings")}
                        </Text>
                      </View>
                      <View style={styles.facingStepper}>
                        <TouchableOpacity
                          style={[styles.stepBtn, facings === 0 && styles.stepBtnDisabled]}
                          onPress={() => adjustSkuFacings(sku.id, -1)}
                          disabled={facings === 0}
                        >
                          <Text style={styles.stepBtnText}>-</Text>
                        </TouchableOpacity>
                        <View style={styles.facingValue}>
                          <Text style={styles.facingValueText}>{facings}</Text>
                        </View>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSkuFacings(sku.id, 1)}>
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
              </>
            )}

            {!canCreate && <Text style={styles.createHint}>{t("planogram.createDisabledHint")}</Text>}
            <TouchableOpacity
              style={[styles.createSubmitBtn, !canCreate && styles.createSubmitBtnDisabled]}
              onPress={handleCreate}
              disabled={!canCreate}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createSubmitText}>{t("planogram.createStandard")}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5F9" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {canGoBack && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("planogram.libraryTitle")}</Text>
          <Text style={styles.headerSub}>{t("planogram.librarySubtitle")}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.centerText}>{t("common.loading")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}>
          <TouchableOpacity style={styles.createEntry} onPress={openCreate}>
            <View>
              <Text style={styles.createEntryTitle}>+ {t("planogram.createShelfStandard")}</Text>
              <Text style={styles.createEntryText}>{t("planogram.createShelfStandardHint")}</Text>
            </View>
          </TouchableOpacity>

          {standards.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyIcon}>▦</Text>
              <Text style={styles.emptyTitle}>{t("planogram.noStandards")}</Text>
              <Text style={styles.emptyText}>{t("planogram.noStandardsHint")}</Text>
            </View>
          ) : standards.map(item => {
            const skuCount = item.expectedSkus?.length ?? 0
            return (
              <View key={item.id} style={styles.standardCard}>
                {item.referenceImageUrl ? (
                  <Image source={{ uri: item.referenceImageUrl }} style={styles.standardImage} resizeMode="cover" />
                ) : (
                  <View style={styles.standardImagePlaceholder}>
                    <Text style={styles.standardImageIcon}>▦</Text>
                  </View>
                )}
                <View style={styles.cardContent}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.categoryChip}>{item.customerCategory ?? "-"}</Text>
                    {item.brand ? <Text style={styles.brandChip}>{item.brand}</Text> : null}
                  </View>
                  <Text style={styles.standardTitle}>{item.name}</Text>
                  <Text style={styles.standardMeta}>
                    {skuCount > 0
                      ? t("planogram.standardSkuCount", { n: skuCount })
                      : t("planogram.standardNoSku")}
                  </Text>
                  <TouchableOpacity
                    style={styles.referenceBtn}
                    onPress={() => setGoldenPlanogramId(item.id)}
                    disabled={settingGoldenId === item.id}
                  >
                    {settingGoldenId === item.id ? (
                      <ActivityIndicator size="small" color="#b45309" />
                    ) : (
                      <Text style={styles.referenceBtnText}>
                        {item.referenceImageUrl ? t("planogram.replaceGolden") : t("planogram.setGolden")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      {renderCreateSheet()}
      <PhotoCaptureModal
        visible={!!goldenPlanogramId}
        onClose={() => setGoldenPlanogramId(null)}
        onPhotoTaken={handleGoldenPhotoTaken}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  backBtn: { marginRight: 12, padding: 4 },
  backIcon: { fontSize: 32, color: "#6C63FF", lineHeight: 36 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#0B0B1E" },
  headerSub: { fontSize: 13, color: "#64748b", marginTop: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  centerText: { fontSize: 13, color: "#64748b" },
  list: { padding: 16, gap: 14 },
  createEntry: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 16,
  },
  createEntryTitle: { fontSize: 16, fontWeight: "800", color: "#fff" },
  createEntryText: { fontSize: 13, color: "#cbd5e1", marginTop: 4, lineHeight: 18 },
  emptyBlock: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyIcon: { fontSize: 38, color: "#94a3b8" },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0B0B1E", marginTop: 8 },
  emptyText: { fontSize: 13, color: "#64748b", marginTop: 6, textAlign: "center", lineHeight: 18 },
  standardCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  standardImage: { width: "100%", height: 148 },
  standardImagePlaceholder: {
    width: "100%",
    height: 104,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  standardImageIcon: { fontSize: 34, color: "#94a3b8" },
  cardContent: { padding: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  categoryChip: {
    backgroundColor: "#f5f3ff",
    color: "#6C63FF",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  brandChip: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  standardTitle: { fontSize: 16, fontWeight: "800", color: "#0B0B1E" },
  standardMeta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  referenceBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fffbeb",
  },
  referenceBtnText: { fontSize: 13, fontWeight: "800", color: "#b45309" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#0B0B1E" },
  closeText: { fontSize: 20, color: "#94a3b8", padding: 4 },
  sheetBody: { maxHeight: 640 },
  inputLabel: { fontSize: 12, fontWeight: "800", color: "#334155", marginBottom: 7, marginTop: 10 },
  textInput: {
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    marginBottom: 4,
  },
  categoryPicker: { flexDirection: "row", gap: 8, marginBottom: 4 },
  categoryOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  categoryOptionActive: { borderColor: "#6C63FF", backgroundColor: "#f5f3ff" },
  categoryOptionText: { fontSize: 14, fontWeight: "800", color: "#475569" },
  categoryOptionTextActive: { color: "#6C63FF" },
  modePicker: { gap: 8 },
  modeOption: {
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  modeOptionActive: { borderColor: "#6C63FF", backgroundColor: "#f5f3ff" },
  modeTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  modeTitleActive: { color: "#6C63FF" },
  modeHint: { fontSize: 12, color: "#64748b", lineHeight: 16, marginTop: 3 },
  optionalHint: { fontSize: 12, color: "#64748b", lineHeight: 17, marginTop: 8 },
  skuSearchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  searchInput: { flex: 1, marginBottom: 0 },
  selectedSkuText: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 10, marginBottom: 6 },
  skuRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 10,
  },
  skuName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  skuMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  facingStepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { fontSize: 18, fontWeight: "900", color: "#6C63FF" },
  facingValue: {
    minWidth: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  facingValueText: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  createHint: { fontSize: 12, color: "#b45309", marginTop: 10, marginBottom: 2 },
  createSubmitBtn: {
    marginTop: 12,
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  createSubmitBtnDisabled: { opacity: 0.42 },
  createSubmitText: { fontSize: 15, fontWeight: "800", color: "#fff" },
})
