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
  TextInput,
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
import { preserveExifAcrossResize } from "../../lib/photo-watermark"
import { enqueueScan, drainScanQueue, getQueuedScanCount, isConnectivityError } from "../../services/scan-queue"
import NetInfo from "@react-native-community/netinfo"
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
  brand?: string | null
  imageUrl: string | null
  description?: string | null
  expectedSkus?: ExpectedSku[]
}

interface CatalogSku {
  id: string
  name: string
  code?: string | null
  brand?: string | null
  unit?: string | null
}

type CustomerCategory = "A" | "B" | "C" | "D"
const CUSTOMER_CATEGORIES: CustomerCategory[] = ["A", "B", "C", "D"]

interface DetectedResult {
  label: string
  skuId: string | null
  confidence: number
  facings: number
}

interface BrandShareEntry {
  brand: string
  facings: number
  sharePct: number
  ours: boolean
}
interface BrandShareOfShelf {
  brands: BrandShareEntry[]
  ourSharePct: number
  competitorSharePct: number
  totalFacings: number
}

interface AnalysisResult {
  planogramId: string
  detectedSkus: DetectedResult[]
  missingSkus: Array<{ skuId: string; skuName?: string; expectedFacings: number }>
  complianceScore: number | null
  totalDetected: number
  // Brand-level share of shelf (our portfolio % vs competitor) — present on every
  // scan from the server. Optional so an older cached response still type-checks.
  brandShareOfShelf?: BrandShareOfShelf
  // Perfect-Store composite score + grade (gold/silver/bronze/fail). Optional.
  perfectStore?: {
    score: number | null
    grade: "gold" | "silver" | "bronze" | "fail" | null
    pillars: Array<{ key: string; score: number; weight: number }>
  }
  // In-visit prescriptive guidance: ranked "restock / add N facings" actions.
  actions?: Array<{
    skuId: string
    skuName: string
    type: "restock" | "add_facings"
    current: number
    expected: number
    deficit: number
  }>
  // Price-OCR compliance (only when MTM_PRICE_OCR_ENABLED on the server).
  priceCompliance?: {
    entries: Array<{
      skuId: string
      skuName: string
      expected: number
      detected: number
      deviationPct: number
      status: "ok" | "underpriced" | "overpriced"
    }>
    unmatchedCount: number
    okCount: number
    violationCount: number
  }
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

// Perfect-Store grade → colour + medal icon (matches metrics.ts banding).
const PS_GRADE_COLOR: Record<"gold" | "silver" | "bronze" | "fail", string> = {
  gold: "#d97706",
  silver: "#6b7280",
  bronze: "#b45309",
  fail: "#ef4444",
}
const PS_GRADE_ICON: Record<"gold" | "silver" | "bronze" | "fail", string> = {
  gold: "🥇",
  silver: "🥈",
  bronze: "🥉",
  fail: "⚠️",
}

export default function PlanogramScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<Nav>()
  const route = useRoute<RouteType>()
  const insets = useSafeAreaInsets()
  const { customerId, customerName, visitId } = route.params

  const [planograms, setPlanograms] = useState<Planogram[]>([])
  // 'category' = matched this store's cluster; 'fallback-all' = no exact match,
  // showing every active standard; 'none' = org has none. Drives the banner.
  const [matchedBy, setMatchedBy] = useState<"category" | "fallback-all" | "none" | null>(null)
  const [customerCategory, setCustomerCategory] = useState<CustomerCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [compliance, setCompliance] = useState<Record<string, ComplianceStatus>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // Planogram ids whose reference image failed to load (404 / broken) — they fall
  // back to the 📐 placeholder instead of showing a blank with a "tap to zoom".
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createVisible, setCreateVisible] = useState(false)
  const [creatingPlanogram, setCreatingPlanogram] = useState(false)
  const [catalogSkus, setCatalogSkus] = useState<CatalogSku[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [skuSearch, setSkuSearch] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [newBrand, setNewBrand] = useState("")
  const [newCategory, setNewCategory] = useState<CustomerCategory>("B")
  const [selectedSkus, setSelectedSkus] = useState<Record<string, number>>({})

  // AI scan state. analyzingId — the planogram being analyzed RIGHT NOW:
  // the spinner must render only on that card (a global boolean made every
  // card spin during any scan — user-reported bug).
  const [scanPlanogramId, setScanPlanogramId] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  // Golden-reference capture (supervisor sets the ideal-shelf baseline). A
  // SEPARATE modal + spinner from the field-scan flow so the working scan path
  // is untouched. canSetGolden gates the button to supervisor-and-up (server
  // also 403s an AGENT).
  const [goldenPlanogramId, setGoldenPlanogramId] = useState<string | null>(null)
  const [settingGoldenId, setSettingGoldenId] = useState<string | null>(null)
  const canSetGolden = api.canSetGoldenReference
  const canManagePlanograms = api.canSetGoldenReference
  // Slice A: per-planogram id of the persisted scan — attached to the
  // submitted verdict so the supervisor sees AI score next to the decision
  const [analysisIds, setAnalysisIds] = useState<Record<string, string>>({})
  // Variant C Phase 3: stops an in-flight backstop poll if the screen unmounts
  // (avoids setState-after-unmount) — flipped true on teardown.
  const unmountedRef = useRef(false)
  useEffect(() => () => { unmountedRef.current = true }, [])

  // C4b: count of scans captured offline and queued for upload. Drives the banner.
  const [queuedCount, setQueuedCount] = useState(0)
  const refreshQueuedCount = useCallback(async () => {
    try { setQueuedCount(await getQueuedScanCount()) } catch { /* count is best-effort */ }
  }, [])

  // Drain the offline scan queue when this screen is up and the device is online —
  // on mount AND on every reconnect while mounted. Scans originate here, so this is
  // the natural place to flush them; drainScanQueue is concurrency-guarded + safe
  // when empty/offline. The replay is idempotent (same clientScanId), so the server
  // never double-counts.
  useEffect(() => {
    let cancelled = false
    const runDrain = async () => {
      try {
        const r = await drainScanQueue()
        if (cancelled) return
        if (r.uploaded > 0 || r.failed > 0) await refreshQueuedCount()
      } catch { /* a drain failure is non-fatal; the queue persists for next time */ }
    }
    refreshQueuedCount()
    // addEventListener fires immediately with the current state, then on changes —
    // so an online mount drains right away and a later reconnect drains again.
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected) runDrain()
    })
    return () => { cancelled = true; unsub() }
  }, [refreshQueuedCount])

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
        setMatchedBy(res.data?.matchedBy ?? null)
        setCustomerCategory((res.data?.customerCategory as CustomerCategory | null) ?? null)
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

  const fetchCatalogSkus = useCallback(async (q = "") => {
    setCatalogLoading(true)
    try {
      const res = await api.getSkus({
        search: q.trim() ? q.trim() : undefined,
        isActive: true,
      })
      if (res.success) {
        setCatalogSkus(res.data?.skus ?? [])
      } else {
        setCatalogSkus([])
      }
    } catch {
      setCatalogSkus([])
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const openCreatePlanogram = () => {
    const category = customerCategory ?? "B"
    setNewCategory(category)
    setNewTitle(t("planogram.standardNamePlaceholder", { customer: customerName, category }))
    setNewBrand("")
    setSkuSearch("")
    setSelectedSkus({})
    setCreateVisible(true)
    fetchCatalogSkus()
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

  const handleCreatePlanogram = async () => {
    const entries = Object.entries(selectedSkus).filter(([, facings]) => facings > 0)
    const name = newTitle.trim()
    if (!name || entries.length === 0 || creatingPlanogram) return
    setCreatingPlanogram(true)
    try {
      const res = await api.createPlanogram({
        name,
        brand: newBrand.trim() || undefined,
        customerCategory: newCategory,
        description: `${customerName} ${newCategory}`,
        expectedSkus: entries.map(([skuId, expectedFacings], index) => ({
          skuId,
          expectedFacings,
          position: index + 1,
        })),
      })
      if (!res?.success) {
        Alert.alert(t("common.error"), res?.error ?? t("planogram.createError"))
        return
      }
      const created = res.data
      const item: Planogram = {
        id: created.id,
        title: created.name,
        description: created.description ?? null,
        category: created.customerCategory ?? newCategory,
        brand: created.brand ?? null,
        imageUrl: created.referenceImageUrl ?? null,
        expectedSkus: created.expectedSkus ?? [],
      }
      setPlanograms(prev => [item, ...prev])
      setMatchedBy("category")
      setCustomerCategory(newCategory)
      setCompliance(prev => ({ ...prev, [item.id]: null }))
      setCreateVisible(false)
      Alert.alert(
        t("planogram.createSuccess"),
        t("planogram.createSuccessBody"),
        [{ text: t("common.ok"), onPress: () => setGoldenPlanogramId(item.id) }],
      )
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.createError"))
    } finally {
      setCreatingPlanogram(false)
    }
  }

  const setStatus = (id: string, status: ComplianceStatus) => {
    setCompliance(prev => ({ ...prev, [id]: status }))
  }

  const markedCount = Object.values(compliance).filter(v => v !== null).length
  const canSubmit = markedCount > 0 && !submitting
  const selectedSkuCount = Object.keys(selectedSkus).length
  const canCreatePlanogram = newTitle.trim().length > 0 && selectedSkuCount > 0 && !creatingPlanogram

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
      // react-native-image-resizer re-encodes the JPEG WITHOUT EXIF, dropping the
      // provenance tags photoWatermarkPipeline injected (Software/Make/Model,
      // DateTimeOriginal, GPS). Re-apply the source EXIF onto the resized file so
      // the anti-fraud chain survives to the server. No-op-safe (the visible
      // watermark still proves presence if this can't run). (C4a)
      await preserveExifAcrossResize(path, resized.uri)
      const imageBase64 = await RNFS.readFile(resized.uri.replace("file://", ""), "base64")
      const clientScanId = generateClientScanId()

      // C4b: when there's no connection, persist the scan and replay it later
      // (idempotent on clientScanId) instead of losing the visit's compliance
      // proof. Shared by the up-front offline check and the network-error fallback.
      const enqueueOffline = async () => {
        await enqueueScan({
          clientScanId,
          planogramId,
          visitId: visitId ?? null,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          imageMediaType: "image/jpeg",
          srcImagePath: resized.uri,
        })
        await refreshQueuedCount()
        Alert.alert(
          t("planogram.savedOfflineTitle", { defaultValue: "Saved — will upload when online" }),
          t("planogram.savedOfflineBody", {
            defaultValue: "No connection right now. This scan is queued and uploads automatically when you're back online.",
          }),
        )
      }

      // Known-offline → queue immediately rather than waiting out the 60s timeout.
      const net = await NetInfo.fetch().catch(() => null)
      if (net?.isConnected === false) {
        await enqueueOffline()
        return
      }

      let res
      try {
        res = await api.analyzeShelf({
          planogramId,
          imageBase64,
          imageMediaType: "image/jpeg",
          visitId,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          clientScanId,
        })
      } catch (e) {
        // Lost connectivity mid-request → queue it; a real server error rethrows
        // to the outer catch and surfaces the message.
        if (isConnectivityError(e)) {
          await enqueueOffline()
          return
        }
        throw e
      }

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

  // Golden-reference capture: a supervisor photographs the IDEAL shelf; the
  // server sets referenceImageUrl + clears stale embeddings. Precise slot markup
  // + activation happens on the web. No watermark (the reference must be clean).
  const handleGoldenPhotoTaken = async (path: string) => {
    if (!goldenPlanogramId) return
    const planogramId = goldenPlanogramId
    setGoldenPlanogramId(null)
    setSettingGoldenId(planogramId)
    try {
      // A reference image deserves a bit more resolution than a field scan.
      const resized = await ImageResizer.createResizedImage(
        path.startsWith("file://") ? path : `file://${path}`,
        1600, 1600, "JPEG", 90, 0,
      )
      const imageBase64 = await RNFS.readFile(resized.uri.replace("file://", ""), "base64")
      const res = await api.setGoldenReference({ planogramId, imageBase64, imageMediaType: "image/jpeg" })
      if (res?.success) {
        if (unmountedRef.current) return
        // Update ONLY this card's reference image — do NOT call load(): it
        // re-inits the whole compliance map to null (PlanogramScreen load()),
        // wiping the supervisor's already-marked compliant/non-compliant cards.
        if (typeof res.url === "string") {
          setPlanograms(prev => prev.map(pl => (pl.id === planogramId ? { ...pl, imageUrl: res.url as string } : pl)))
        }
        Alert.alert(
          t("planogram.goldenSetTitle", { defaultValue: "Golden reference saved" }),
          t("planogram.goldenSetBody", {
            defaultValue:
              "Now mark the slots on this photo in the web admin. Until then, scans use the provisional AI score (not the deterministic one).",
          }),
        )
      } else {
        Alert.alert(t("common.error"), res?.error ?? t("planogram.submitError"))
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message ?? t("planogram.submitError"))
    } finally {
      if (!unmountedRef.current) setSettingGoldenId(null)
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
        {item.brand && (
          <View style={styles.brandChip}>
            <Text style={styles.brandText}>🏷️ {item.brand}</Text>
          </View>
        )}

        {(() => {
          // Resolve the (root-relative) reference path to an absolute URL; fall
          // back to the placeholder when there's no image OR it failed to load.
          const resolvedImg = api.resolveMediaUrl(item.imageUrl)
          return resolvedImg && !failedImages.has(item.id) ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUrl(resolvedImg)}>
              <Image
                source={{ uri: resolvedImg }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setFailedImages(prev => new Set(prev).add(item.id))}
              />
              <View style={styles.zoomHint}>
                <Text style={styles.zoomHintText}>🔍 {t("planogram.tapToZoom")}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.noImagePlaceholder}>
              <Text style={styles.noImageText}>📐</Text>
            </View>
          )
        })()}

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

        {/* Supervisor-only: capture the IDEAL shelf as the golden reference */}
        {canSetGolden && (
          <TouchableOpacity
            style={styles.goldenBtn}
            onPress={() => setGoldenPlanogramId(item.id)}
            disabled={settingGoldenId !== null || analyzingId !== null}
          >
            {settingGoldenId === item.id ? (
              <ActivityIndicator size="small" color="#b45309" />
            ) : (
              <Text style={styles.goldenBtnText}>
                ⭐ {t("planogram.setGolden", { defaultValue: "Set as Golden Reference" })}
              </Text>
            )}
          </TouchableOpacity>
        )}

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

  const renderCategoryPanel = () => {
    if (!customerCategory && !canManagePlanograms) return null
    const exact = matchedBy === "category"
    return (
      <View style={styles.categoryPanel}>
        <View style={{ flex: 1 }}>
          <Text style={styles.categoryPanelTitle}>
            {customerCategory
              ? t(exact ? "planogram.showingCategory" : "planogram.categoryContext", { category: customerCategory })
              : t("planogram.title")}
          </Text>
          <Text style={styles.categoryPanelText}>
            {matchedBy === "fallback-all"
              ? t("planogram.chooseStandard")
              : planograms.length === 0
                ? t("planogram.emptyHint")
                : t("planogram.chooseStandard")}
          </Text>
        </View>
        {canManagePlanograms && (
          <TouchableOpacity style={styles.createSmallBtn} onPress={openCreatePlanogram}>
            <Text style={styles.createSmallBtnText}>＋ {t("planogram.createStandard")}</Text>
          </TouchableOpacity>
        )}
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

      {/* C4b: offline scan queue indicator — uploads automatically when online */}
      {queuedCount > 0 && (
        <View style={styles.queueBanner}>
          <Text style={styles.queueText}>
            ⏳ {t("planogram.queuedScans", {
              count: queuedCount,
              defaultValue: `${queuedCount} offline scan(s) queued — uploading when back online`,
            })}
          </Text>
        </View>
      )}

      {!loading && !loadError && renderCategoryPanel()}

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
          {canManagePlanograms && (
            <TouchableOpacity style={styles.emptyCreateBtn} onPress={openCreatePlanogram}>
              <Text style={styles.emptyCreateBtnText}>＋ {t("planogram.createStandard")}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {matchedBy === "fallback-all" && (
            <View style={styles.fallbackBanner}>
              <Text style={styles.fallbackText}>
                ⚠️ {t("planogram.fallbackNote", {
                  defaultValue: "No standard set for this store's category — showing all standards.",
                })}
              </Text>
            </View>
          )}
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

      {/* Camera for the GOLDEN reference — deliberately NO watermark: the
          reference image is the clean ideal-shelf baseline, not a field record. */}
      <PhotoCaptureModal
        visible={!!goldenPlanogramId}
        onClose={() => setGoldenPlanogramId(null)}
        onPhotoTaken={handleGoldenPhotoTaken}
      />

      {/* Manager flow: create the missing category standard, then capture its reference photo. */}
      <Modal
        visible={createVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.createBackdrop}>
          <View style={[styles.createSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.createHeader}>
              <Text style={styles.createTitle}>{t("planogram.createTitle")}</Text>
              <TouchableOpacity onPress={() => setCreateVisible(false)} disabled={creatingPlanogram}>
                <Text style={styles.resultClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.createBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>{t("planogram.targetCategory")}</Text>
              <View style={styles.categoryPicker}>
                {CUSTOMER_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryOption, newCategory === cat && styles.categoryOptionActive]}
                    onPress={() => {
                      setNewCategory(cat)
                      if (!newTitle.trim()) {
                        setNewTitle(t("planogram.standardNamePlaceholder", { customer: customerName, category: cat }))
                      }
                    }}
                  >
                    <Text style={[styles.categoryOptionText, newCategory === cat && styles.categoryOptionTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t("planogram.standardName")}</Text>
              <TextInput
                style={styles.textInput}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder={t("planogram.standardNamePlaceholder", { customer: customerName, category: newCategory })}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.inputLabel}>{t("planogram.brand")}</Text>
              <TextInput
                style={styles.textInput}
                value={newBrand}
                onChangeText={setNewBrand}
                placeholder={t("planogram.brandPlaceholder")}
                placeholderTextColor="#94a3b8"
              />

              <View style={styles.skuSearchRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                  value={skuSearch}
                  onChangeText={(text) => {
                    setSkuSearch(text)
                    fetchCatalogSkus(text)
                  }}
                  placeholder={t("planogram.skuSearch")}
                  placeholderTextColor="#94a3b8"
                  returnKeyType="search"
                  onSubmitEditing={() => fetchCatalogSkus(skuSearch)}
                />
                {catalogLoading && <ActivityIndicator size="small" color="#6C63FF" />}
              </View>

              <Text style={styles.selectedSkuText}>
                {t("planogram.selectedSkus", { n: selectedSkuCount })}
              </Text>

              {catalogSkus.slice(0, 30).map(sku => {
                const qty = selectedSkus[sku.id] ?? 0
                return (
                  <View key={sku.id} style={styles.createSkuRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.createSkuName} numberOfLines={1}>{sku.name}</Text>
                      <Text style={styles.createSkuMeta} numberOfLines={1}>
                        {[sku.code, sku.brand].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={styles.facingStepper}>
                      <TouchableOpacity
                        style={[styles.stepBtn, qty === 0 && styles.stepBtnDisabled]}
                        onPress={() => adjustSkuFacings(sku.id, -1)}
                        disabled={qty === 0}
                      >
                        <Text style={styles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <View style={styles.facingValue}>
                        <Text style={styles.facingValueText}>{qty}</Text>
                      </View>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => adjustSkuFacings(sku.id, 1)}>
                        <Text style={styles.stepBtnText}>＋</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}

              {!canCreatePlanogram && (
                <Text style={styles.createHint}>{t("planogram.createDisabledHint")}</Text>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.createSubmitBtn, !canCreatePlanogram && styles.submitBtnDisabled]}
              onPress={handleCreatePlanogram}
              disabled={!canCreatePlanogram}
            >
              {creatingPlanogram
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.createSubmitText}>{t("planogram.createStandard")}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                {/* Perfect-Store composite — the headline store grade */}
                {analysisResult.perfectStore?.score != null && analysisResult.perfectStore.grade && (
                  <View style={[styles.psCard, { borderColor: PS_GRADE_COLOR[analysisResult.perfectStore.grade] }]}>
                    <View style={styles.psHeaderRow}>
                      <Text style={[styles.psGrade, { color: PS_GRADE_COLOR[analysisResult.perfectStore.grade] }]}>
                        {PS_GRADE_ICON[analysisResult.perfectStore.grade]}{" "}
                        {t(`planogram.grade.${analysisResult.perfectStore.grade}`, {
                          defaultValue: analysisResult.perfectStore.grade.toUpperCase(),
                        })}
                      </Text>
                      <Text style={[styles.psScore, { color: PS_GRADE_COLOR[analysisResult.perfectStore.grade] }]}>
                        {analysisResult.perfectStore.score}
                      </Text>
                    </View>
                    <Text style={styles.psSubtitle}>
                      {t("planogram.perfectStore", { defaultValue: "Perfect Store" })}
                    </Text>
                    <View style={styles.psPillarRow}>
                      {analysisResult.perfectStore.pillars.map(p => (
                        <Text key={p.key} style={styles.psPillar}>
                          {t(`planogram.pillar.${p.key}`, { defaultValue: p.key })} {p.score}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}

                {/* In-visit guidance — what to fix before leaving */}
                {analysisResult.actions && analysisResult.actions.length > 0 && (
                  <View style={styles.actionsCard}>
                    <Text style={styles.actionsTitle}>
                      🛠️ {t("planogram.fixNow", { defaultValue: "Fix before you leave" })}
                    </Text>
                    {analysisResult.actions.map(a => (
                      <View key={a.skuId} style={styles.actionRow}>
                        <Text style={styles.actionText} numberOfLines={1}>
                          {a.type === "restock" ? "🔴 " : "➕ "}
                          {a.type === "restock"
                            ? t("planogram.actionRestock", { name: a.skuName, n: a.deficit, defaultValue: `Restock ${a.skuName}` })
                            : t("planogram.actionAddFacings", { name: a.skuName, n: a.deficit, defaultValue: `Add ${a.deficit} × ${a.skuName}` })}
                        </Text>
                        <Text style={styles.actionMeta}>{a.current}/{a.expected}</Text>
                      </View>
                    ))}
                  </View>
                )}

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

                  {/* Share of Shelf — our portfolio vs competitor (FMCG KAM view) */}
                  {analysisResult.brandShareOfShelf &&
                    analysisResult.brandShareOfShelf.totalFacings > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
                          📊 {t("planogram.shareOfShelf", { defaultValue: "Share of Shelf" })}
                        </Text>
                        {/* Stacked bar: ours (green) vs competitor (grey) */}
                        <View style={styles.sosBar}>
                          <View
                            style={{
                              width: `${analysisResult.brandShareOfShelf.ourSharePct}%`,
                              backgroundColor: "#22c55e",
                            }}
                          />
                          <View
                            style={{
                              width: `${analysisResult.brandShareOfShelf.competitorSharePct}%`,
                              backgroundColor: "#cbd5e1",
                            }}
                          />
                        </View>
                        <View style={styles.sosLegendRow}>
                          <Text style={[styles.sosLegend, { color: "#16a34a" }]}>
                            {t("planogram.ours", { defaultValue: "Ours" })} {analysisResult.brandShareOfShelf.ourSharePct}%
                          </Text>
                          <Text style={[styles.sosLegend, { color: "#64748b" }]}>
                            {t("planogram.competitor", { defaultValue: "Competitor" })} {analysisResult.brandShareOfShelf.competitorSharePct}%
                          </Text>
                        </View>
                        {analysisResult.brandShareOfShelf.brands.map((b, i) => (
                          <View key={i} style={styles.skuRow}>
                            <Text style={styles.skuLabel} numberOfLines={1}>
                              {b.ours ? "" : "△ "}{b.brand}
                            </Text>
                            <Text style={styles.skuMeta}>×{b.facings} · {b.sharePct}%</Text>
                          </View>
                        ))}
                      </>
                    )}

                  {/* Price compliance — shelf tag vs reference (only when server flag on) */}
                  {analysisResult.priceCompliance &&
                    analysisResult.priceCompliance.entries.length > 0 && (
                      <>
                        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
                          🏷️ {t("planogram.priceCompliance", { defaultValue: "Price check" })}
                          {analysisResult.priceCompliance.violationCount > 0
                            ? ` · ${analysisResult.priceCompliance.violationCount} ⚠️`
                            : " · ✅"}
                        </Text>
                        {analysisResult.priceCompliance.entries.map(e => (
                          <View key={e.skuId} style={styles.skuRow}>
                            <Text style={styles.skuLabel} numberOfLines={1}>
                              {e.status === "ok" ? "✅ " : e.status === "underpriced" ? "🔻 " : "🔺 "}
                              {e.skuName}
                            </Text>
                            <Text
                              style={[
                                styles.skuMeta,
                                e.status !== "ok" && { color: "#ef4444", fontWeight: "700" },
                              ]}
                            >
                              {e.detected} / {e.expected} ({e.deviationPct > 0 ? "+" : ""}
                              {Math.round(e.deviationPct)}%)
                            </Text>
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
  fallbackBanner: {
    backgroundColor: "#fef3c7", borderColor: "#fcd34d", borderWidth: 1,
    borderRadius: 10, marginHorizontal: 12, marginTop: 8, padding: 10,
  },
  fallbackText: { fontSize: 12, color: "#92400e", lineHeight: 16 },

  // C4b offline-scan-queue banner (blue, distinct from the amber fallback note)
  queueBanner: {
    backgroundColor: "#dbeafe", borderColor: "#93c5fd", borderWidth: 1,
    borderRadius: 10, marginHorizontal: 12, marginTop: 8, padding: 10,
  },
  queueText: { fontSize: 12, color: "#1e40af", lineHeight: 16, fontWeight: "600" },
  categoryPanel: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderColor: "#e2e8f0", borderWidth: 1,
    borderRadius: 12, marginHorizontal: 12, marginTop: 10, padding: 12,
  },
  categoryPanelTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  categoryPanelText: { fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 16 },
  createSmallBtn: {
    marginLeft: 10, backgroundColor: "#0f172a", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  createSmallBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  emptyCreateBtn: {
    marginTop: 12, backgroundColor: "#6C63FF", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  emptyCreateBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },

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
  brandChip: {
    position: "absolute", top: 10, right: 10, zIndex: 1,
    backgroundColor: "#0f172a", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  brandText: { fontSize: 11, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
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

  // Golden-reference button (supervisor only) — amber to read as "baseline", distinct from the scan action
  goldenBtn: {
    marginHorizontal: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: "#f59e0b", borderRadius: 10,
    paddingVertical: 9, alignItems: "center",
    backgroundColor: "#fffbeb",
  },
  goldenBtnText: { fontSize: 13, fontWeight: "600", color: "#b45309" },

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
  // Share of Shelf stacked bar
  sosBar: {
    flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden",
    backgroundColor: "#f1f5f9", marginBottom: 6,
  },
  sosLegendRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  sosLegend: { fontSize: 12, fontWeight: "700" },
  // Perfect-Store card
  psCard: {
    borderWidth: 2, borderRadius: 14, padding: 12, marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  psHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  psGrade: { fontSize: 18, fontWeight: "800" },
  psScore: { fontSize: 28, fontWeight: "800" },
  psSubtitle: { fontSize: 11, color: "#94a3b8", marginTop: -2, textTransform: "uppercase", letterSpacing: 0.5 },
  psPillarRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  psPillar: {
    fontSize: 11, color: "#475569", backgroundColor: "#eef2f7",
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6, marginBottom: 4,
  },
  // In-visit guidance card
  actionsCard: {
    backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1,
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  actionsTitle: { fontSize: 13, fontWeight: "800", color: "#1e3a8a", marginBottom: 6 },
  actionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 4,
  },
  actionText: { fontSize: 13, color: "#1e293b", flex: 1, marginRight: 8 },
  actionMeta: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  resultDoneBtn: {
    marginTop: 16, backgroundColor: "#6C63FF",
    borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
  resultDoneText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Create planogram sheet
  createBackdrop: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  createSheet: {
    maxHeight: "88%", backgroundColor: "#fff",
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 16,
  },
  createHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  createTitle: { fontSize: 18, fontWeight: "800", color: "#0B0B1E" },
  createBody: { maxHeight: 640 },
  inputLabel: { fontSize: 12, fontWeight: "800", color: "#334155", marginBottom: 7, marginTop: 10 },
  textInput: {
    borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#0f172a", backgroundColor: "#f8fafc",
    marginBottom: 4,
  },
  categoryPicker: { flexDirection: "row", gap: 8, marginBottom: 4 },
  categoryOption: {
    flex: 1, borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12,
    paddingVertical: 10, alignItems: "center", backgroundColor: "#f8fafc",
  },
  categoryOptionActive: { borderColor: "#6C63FF", backgroundColor: "#f5f3ff" },
  categoryOptionText: { fontSize: 14, fontWeight: "800", color: "#475569" },
  categoryOptionTextActive: { color: "#6C63FF" },
  skuSearchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectedSkuText: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 10, marginBottom: 6 },
  createSkuRow: {
    flexDirection: "row", alignItems: "center",
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
    paddingVertical: 10,
  },
  createSkuName: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  createSkuMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  facingStepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#eef2ff",
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { fontSize: 18, fontWeight: "900", color: "#6C63FF" },
  facingValue: {
    minWidth: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0",
  },
  facingValueText: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  createHint: { fontSize: 12, color: "#b45309", marginTop: 10, marginBottom: 2 },
  createSubmitBtn: {
    marginTop: 12, backgroundColor: "#6C63FF",
    borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
  createSubmitText: { fontSize: 15, fontWeight: "800", color: "#fff" },
})
