import React, { useEffect, useState, useCallback, useRef } from "react"
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
  ScrollView,
} from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useTranslation } from "react-i18next"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import RNFS from "react-native-fs"
import ImageResizer from "react-native-image-resizer"
import Geolocation from "@react-native-community/geolocation"
import { RootStackParamList } from "../../navigation/AppNavigator"
import { api } from "../../services/api"
import { lastKnownPosition } from "../../services/location"
import { pollScanUntilTerminal } from "../../services/shelf-scan-poll"
import PhotoCaptureModal from "../../components/PhotoCaptureModal"

/** Idempotency key per capture (UUIDv4 when Hermes exposes crypto, else unique fallback). */
function generateClientScanId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

type Nav = NativeStackNavigationProp<RootStackParamList, "Planogram">
type RouteType = RouteProp<RootStackParamList, "Planogram">

interface ExpectedSku {
  skuId: string
  expectedFacings: number
  position?: number
}

interface Planogram {
  id: string
  title: string
  category?: string | null
  imageUrl: string | null
  description?: string | null
  expectedSkus?: ExpectedSku[]
}

interface DetectedResult {
  label: string
  skuId: string | null
  confidence: number
  facings: number
}

interface AnalysisResult {
  planogramId: string
  detectedSkus: DetectedResult[]
  missingSkus: Array<{ skuId: string; skuName?: string; expectedFacings: number }>
  complianceScore: number | null
  totalDetected: number
  modelVersion: string
  // Slice A: ids of the persisted scan (null when the server degraded to
  // ephemeral mode, persisted:false)
  analysisId?: string | null
  photoId?: string | null
  persisted?: boolean
  // Variant C Phase 3: terminal status from a polled (backstop) result —
  // "COMPLETED" | "FAILED" | "REJECTED". Absent on a fresh inline 200.
  status?: string
  errorMessage?: string | null
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
  const [loadError, setLoadError] = useState<string | null>(null)

  // AI scan state. analyzingId — the planogram being analyzed RIGHT NOW:
  // the spinner must render only on that card (a global boolean made every
  // card spin during any scan — user-reported bug).
  const [scanPlanogramId, setScanPlanogramId] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  // Slice A: per-planogram id of the persisted scan — attached to the
  // submitted verdict so the supervisor sees AI score next to the decision
  const [analysisIds, setAnalysisIds] = useState<Record<string, string>>({})
  // Variant C Phase 3: stops an in-flight backstop poll if the screen unmounts
  // (avoids setState-after-unmount) — flipped true on teardown.
  const unmountedRef = useRef(false)
  useEffect(() => () => { unmountedRef.current = true }, [])

  // Silent GPS read: permission was requested at app start (background
  // tracking); on failure fall back to the tracker's last known position.
  const getCoords = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      return await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          err => reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
        )
      })
    } catch {
      return lastKnownPosition
        ? { latitude: lastKnownPosition.latitude, longitude: lastKnownPosition.longitude }
        : null
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.getPlanograms(customerId)
      if (res.success) {
        const list: Planogram[] = res.data?.planograms ?? []
        setPlanograms(list)
        const initial: Record<string, ComplianceStatus> = {}
        list.forEach(p => { initial[p.id] = null })
        setCompliance(initial)
      } else {
        setLoadError(`API error: ${res.error ?? "unknown"}`)
      }
    } catch (e: any) {
      setLoadError(e?.message ?? "Network error")
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
        .map(([planogramId, status]) => ({
          planogramId,
          status: status!,
          ...(analysisIds[planogramId] ? { analysisId: analysisIds[planogramId] } : {}),
        }))

      await api.submitPlanogramCheck({ customerId, visitId, results })
      Alert.alert(
        t("planogram.submitSuccess"),
        t("planogram.submitSuccessBody", { n: results.length }),
        [{ text: t("common.ok"), onPress: () => navigation.goBack() }],
      )
    } catch {
      Alert.alert(t("common.error"), t("planogram.submitError"))
    } finally {
      setSubmitting(false)
    }
  }

  // Apply a TERMINAL scan result (fresh inline 200 or a polled backstop result)
  // to the screen: show it, link its analysisId, auto-set compliance from score.
  // A FAILED/REJECTED scan surfaces an error and does NOT auto-set compliance —
  // the agent marks it by hand.
  const applyAnalysisData = (planogramId: string, data: Partial<AnalysisResult>) => {
    if (data?.analysisId) {
      setAnalysisIds(prev => ({ ...prev, [planogramId]: data.analysisId as string }))
    }
    if (data?.status === "FAILED" || data?.status === "REJECTED") {
      Alert.alert(t("common.error"), t("planogram.submitError"))
      return
    }
    const result = { planogramId, ...data } as AnalysisResult
    setAnalysisResult(result)
    if (typeof result.complianceScore === "number") {
      const autoStatus: ComplianceStatus = result.complianceScore >= 70 ? "compliant" : "non_compliant"
      setCompliance(prev => ({ ...prev, [planogramId]: autoStatus }))
    }
  }

  const handlePhotoTaken = async (path: string) => {
    if (!scanPlanogramId) return
    const planogramId = scanPlanogramId
    setScanPlanogramId(null)
    setAnalyzingId(planogramId)

    try {
      // Resize to max 1200px wide, 85% JPEG quality — keeps base64 under ~500KB.
      // GPS in parallel — it rides along to the persisted photo row (Slice A).
      const [resized, coords] = await Promise.all([
        ImageResizer.createResizedImage(
          path.startsWith("file://") ? path : `file://${path}`,
          1200, 1200, "JPEG", 85, 0
        ),
        getCoords(),
      ])
      const imageBase64 = await RNFS.readFile(resized.uri.replace("file://", ""), "base64")
      const res = await api.analyzeShelf({
        planogramId,
        imageBase64,
        imageMediaType: "image/jpeg",
        visitId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        clientScanId: generateClientScanId(),
      })

      if (res?.data?.status === "processing") {
        // 202 — Claude was overloaded; the server parked the scan for the durable
        // backstop. Link the analysisId now (so a submitted verdict still picks up
        // the eventual score) and poll until terminal. The spinner stays up.
        const analysisId = res.data.analysisId as string | undefined
        if (!analysisId) {
          // Defensive: the backend always returns analysisId on a 202; without it
          // we can't poll a status URL — fall straight to the background message
          // rather than hammering /shelf-analytics/undefined for the whole window.
          Alert.alert(t("planogram.aiResult"), t("planogram.processingInBackground"))
        } else {
          setAnalysisIds(prev => ({ ...prev, [planogramId]: analysisId }))
          const outcome = await pollScanUntilTerminal(
            analysisId,
            id => api.getShelfAnalysis(id),
            {
              sleep: ms => new Promise(r => setTimeout(r, ms)),
              shouldStop: () => unmountedRef.current,
            },
          )
          if (unmountedRef.current) return
          if (outcome.terminal) {
            applyAnalysisData(planogramId, outcome.data)
          } else {
            // Still processing after the poll window — the backstop will finish it
            // server-side; the agent can mark compliance by hand and submit now.
            Alert.alert(t("planogram.aiResult"), t("planogram.processingInBackground"))
          }
        }
      } else if (res?.success && res?.data) {
        applyAnalysisData(planogramId, res.data) // fresh inline result
      } else {
        Alert.alert(t("common.error"), res?.error ?? t("planogram.submitError"))
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.submitError"))
    } finally {
      if (!unmountedRef.current) setAnalyzingId(null)
    }
  }

  const renderItem = ({ item }: { item: Planogram }) => {
    const status = compliance[item.id]
    const lastResult = analysisResult?.planogramId === item.id ? analysisResult : null

    return (
      <View style={styles.card}>
        {item.category && (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}

        {item.imageUrl ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUrl(item.imageUrl)}>
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            <View style={styles.zoomHint}>
              <Text style={styles.zoomHintText}>🔍 {t("planogram.tapToZoom")}</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Text style={styles.noImageText}>📐</Text>
          </View>
        )}

        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}

        {/* AI scan result inline */}
        {lastResult && (
          <View style={styles.resultBanner}>
            <Text style={styles.resultTitle}>
              {lastResult.complianceScore !== null
                ? `AI: ${Math.round(lastResult.complianceScore)}% ` + t("planogram.compliant")
                : `AI: ${lastResult.totalDetected} SKU`}
            </Text>
            {lastResult.missingSkus.length > 0 && (
              <Text style={styles.resultMissing}>
                ⚠️ {lastResult.missingSkus.length} {t("planogram.missing", { defaultValue: "missing" })}
              </Text>
            )}
            <TouchableOpacity onPress={() => setAnalysisResult(lastResult)}>
              <Text style={styles.resultDetails}>{t("planogram.details", { defaultValue: "Details →" })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Scan button — spinner ONLY on the card being analyzed */}
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setScanPlanogramId(item.id)}
          disabled={analyzingId !== null}
        >
          {analyzingId === item.id ? (
            <ActivityIndicator size="small" color="#6C63FF" />
          ) : (
            <Text style={styles.scanBtnText}>📷 {t("planogram.scan", { defaultValue: "Scan Shelf" })}</Text>
          )}
        </TouchableOpacity>

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
        {analyzingId !== null && <ActivityIndicator size="small" color="#6C63FF" style={{ marginRight: 8 }} />}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C63FF" />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Ошибка загрузки</Text>
          <Text style={styles.emptyHint}>{loadError}</Text>
          <Text style={[styles.emptyHint, { marginTop: 4, fontSize: 11, color: "#999" }]}>ID: {customerId}</Text>
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

      {/* Camera for AI scan — watermark context burns date/agent/customer/GPS
          into the shelf photo before it is persisted server-side (Slice A) */}
      <PhotoCaptureModal
        visible={!!scanPlanogramId}
        onClose={() => setScanPlanogramId(null)}
        onPhotoTaken={handlePhotoTaken}
        watermark={
          api.currentAgent
            ? {
                agent: {
                  id: api.currentAgent.id,
                  name: api.currentAgent.name,
                  code: api.currentAgent.code,
                },
                visit: visitId ? { id: visitId } : null,
                customer: { id: customerId, name: customerName },
                getLocation: getCoords,
                getLastKnownLocation: () =>
                  lastKnownPosition
                    ? {
                        latitude: lastKnownPosition.latitude,
                        longitude: lastKnownPosition.longitude,
                        capturedAt: new Date(lastKnownPosition.timestamp),
                      }
                    : null,
              }
            : undefined
        }
      />

      {/* AI Analysis Result Modal */}
      <Modal
        visible={!!analysisResult}
        transparent
        animationType="slide"
        onRequestClose={() => setAnalysisResult(null)}
      >
        <View style={styles.resultBackdrop}>
          <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultSheetTitle}>
                🤖 {t("planogram.aiResult", { defaultValue: "AI Analysis" })}
              </Text>
              <TouchableOpacity onPress={() => setAnalysisResult(null)}>
                <Text style={styles.resultClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {analysisResult && (
              <>
                {/* Score */}
                {analysisResult.complianceScore !== null && (
                  <View style={[
                    styles.scoreBlock,
                    analysisResult.complianceScore >= 70 ? styles.scoreGood : styles.scoreBad,
                  ]}>
                    <Text style={styles.scoreValue}>
                      {Math.round(analysisResult.complianceScore)}%
                    </Text>
                    <Text style={styles.scoreLabel}>
                      {analysisResult.complianceScore >= 70
                        ? t("planogram.compliant")
                        : t("planogram.nonCompliant")}
                    </Text>
                  </View>
                )}

                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {/* Detected */}
                  <Text style={styles.sectionTitle}>
                    ✅ {t("planogram.detected", { defaultValue: "Detected" })} ({analysisResult.totalDetected})
                  </Text>
                  {analysisResult.detectedSkus.map((d, i) => (
                    <View key={i} style={styles.skuRow}>
                      <Text style={styles.skuLabel} numberOfLines={1}>{d.label}</Text>
                      <Text style={styles.skuMeta}>×{d.facings} · {Math.round(d.confidence * 100)}%</Text>
                    </View>
                  ))}

                  {/* Missing */}
                  {analysisResult.missingSkus.length > 0 && (
                    <>
                      <Text style={[styles.sectionTitle, { marginTop: 12, color: "#ef4444" }]}>
                        ❌ {t("planogram.missing", { defaultValue: "Missing" })} ({analysisResult.missingSkus.length})
                      </Text>
                      {analysisResult.missingSkus.map((s, i) => (
                        <View key={i} style={styles.skuRow}>
                          <Text style={styles.skuLabel}>{s.skuName ?? s.skuId}</Text>
                          <Text style={styles.skuMeta}>exp ×{s.expectedFacings}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.resultDoneBtn}
                  onPress={() => setAnalysisResult(null)}
                >
                  <Text style={styles.resultDoneText}>{t("common.ok")}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
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
  image: { width: "100%", height: 180 },
  noImagePlaceholder: {
    width: "100%", height: 80,
    backgroundColor: "#f8fafc",
    justifyContent: "center", alignItems: "center",
  },
  noImageText: { fontSize: 32 },
  zoomHint: {
    position: "absolute", bottom: 8, right: 8,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  zoomHintText: { fontSize: 11, color: "#fff" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0B0B1E", margin: 14, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: "#64748b", marginHorizontal: 14, marginBottom: 4 },

  // AI result inline banner
  resultBanner: {
    marginHorizontal: 14, marginBottom: 8,
    backgroundColor: "#eff6ff", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#bfdbfe",
  },
  resultTitle: { fontSize: 13, fontWeight: "700", color: "#1d4ed8" },
  resultMissing: { fontSize: 12, color: "#dc2626", marginTop: 2 },
  resultDetails: { fontSize: 12, color: "#6C63FF", marginTop: 4, fontWeight: "600" },

  // Scan button
  scanBtn: {
    marginHorizontal: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: "#6C63FF", borderRadius: 10,
    paddingVertical: 9, alignItems: "center",
    backgroundColor: "#f5f3ff",
  },
  scanBtnText: { fontSize: 13, fontWeight: "600", color: "#6C63FF" },

  // Compliance
  complianceRow: {
    flexDirection: "row", gap: 10,
    margin: 14, marginTop: 4,
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

  // Analysis result sheet
  resultBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  resultSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingTop: 16,
  },
  resultHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 16,
  },
  resultSheetTitle: { fontSize: 17, fontWeight: "700", color: "#0B0B1E" },
  resultClose: { fontSize: 18, color: "#94a3b8", padding: 4 },
  scoreBlock: {
    borderRadius: 14, padding: 16, alignItems: "center", marginBottom: 16,
  },
  scoreGood: { backgroundColor: "#dcfce7" },
  scoreBad: { backgroundColor: "#fef2f2" },
  scoreValue: { fontSize: 40, fontWeight: "800", color: "#0B0B1E" },
  scoreLabel: { fontSize: 14, fontWeight: "600", color: "#475569", marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 },
  skuRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  skuLabel: { fontSize: 13, color: "#0B0B1E", flex: 1, marginRight: 8 },
  skuMeta: { fontSize: 12, color: "#94a3b8" },
  resultDoneBtn: {
    marginTop: 16, backgroundColor: "#6C63FF",
    borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
  resultDoneText: { fontSize: 15, fontWeight: "700", color: "#fff" },
})
