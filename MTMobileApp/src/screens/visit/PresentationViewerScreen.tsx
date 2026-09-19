import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { useNavigation, useRoute } from "@react-navigation/native"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { WebView } from "react-native-webview"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"

const COPY = {
  ru: {
    evidence: "Открытие файла записывается в журнал визита",
    truth: "Журнал подтверждает открытие файла в приложении, но не доказывает, что клиент его видел.",
    starting: "Открываем презентацию…",
    failed: "Не удалось открыть презентацию",
    retry: "Повторить",
    close: "Закрыть",
    fileHint: "Предпросмотр PowerPoint зависит от поддержки формата на устройстве.",
  },
  az: {
    evidence: "Faylın açılması ziyarət jurnalına yazılır",
    truth: "Jurnal faylın tətbiqdə açıldığını təsdiqləyir, lakin müştərinin ona baxdığını sübut etmir.",
    starting: "Təqdimat açılır…",
    failed: "Təqdimatı açmaq alınmadı",
    retry: "Yenidən cəhd et",
    close: "Bağla",
    fileHint: "PowerPoint önbaxışı cihazın format dəstəyindən asılıdır.",
  },
  en: {
    evidence: "This file opening is recorded in the visit log",
    truth: "The log proves the file was opened in the app; it does not prove the customer watched it.",
    starting: "Opening presentation…",
    failed: "The presentation could not be opened",
    retry: "Try again",
    close: "Close",
    fileHint: "PowerPoint preview depends on format support on this device.",
  },
} as const

function language(value: string): keyof typeof COPY {
  if (value.toLowerCase().startsWith("az")) return "az"
  if (value.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    )
  })
}

export default function PresentationViewerScreen() {
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "PresentationViewer">>()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const { visitId, product } = route.params
  const source = useMemo(() => api.authorizedDocumentSource(product.downloadUrl), [product.downloadUrl])
  const clientSessionId = useRef(`presentation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const sessionId = useRef<string | null>(null)
  const openedAt = useRef(new Date())
  const activeSince = useRef(Date.now())
  const activeSeconds = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<"starting" | "ready" | "failed">("starting")

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      setState("starting")
      const location = await currentPosition()
      try {
        const response = await api.startPresentationSession({
          clientSessionId: clientSessionId.current,
          visitId,
          productId: product.id,
          openedAt: openedAt.current.toISOString(),
          location,
        })
        if (response?.success && response.data?.id) {
          const createdSessionId = String(response.data.id)
          sessionId.current = createdSessionId
          if (cancelled) {
            const closedAt = new Date().toISOString()
            void api.savePresentationSession(createdSessionId, {
              lastViewedAt: closedAt,
              activeDurationSeconds: 0,
              pagesViewed: [],
              pageEvents: [],
              closedAt,
            }).catch(() => {})
            return
          }
          activeSince.current = Date.now()
          setState("ready")
          return
        }
      } catch {}
      if (!cancelled) setState("failed")
    }
    void start()
    return () => { cancelled = true }
  }, [attempt, product.id, visitId])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const now = Date.now()
      if (nextState === "active") {
        activeSince.current = now
      } else if (activeSince.current > 0) {
        activeSeconds.current += Math.max(0, Math.floor((now - activeSince.current) / 1_000))
        activeSince.current = 0
      }
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!sessionId.current) return
      const now = Date.now()
      const seconds = activeSeconds.current + (activeSince.current > 0 ? Math.floor((now - activeSince.current) / 1_000) : 0)
      void api.savePresentationSession(sessionId.current, {
        lastViewedAt: new Date(now).toISOString(),
        activeDurationSeconds: seconds,
        pagesViewed: [],
        pageEvents: [],
      }).catch(() => {})
    }, 15_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => () => {
    if (!sessionId.current) return
    const closedAt = new Date()
    const now = closedAt.getTime()
    const seconds = activeSeconds.current + (activeSince.current > 0 ? Math.floor((now - activeSince.current) / 1_000) : 0)
    void currentPosition().then((closeLocation) => api.savePresentationSession(sessionId.current!, {
      lastViewedAt: closedAt.toISOString(),
      activeDurationSeconds: seconds,
      pagesViewed: [],
      pageEvents: [],
      closedAt: closedAt.toISOString(),
      closeLocation,
    })).catch(() => {})
  }, [])

  return (
    <View style={styles.container}>
      <View style={[styles.header, tablet && styles.headerTablet]}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Icon name="close" size={24} color={fieldTheme.color.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.file} numberOfLines={1}>
            {product.document.title || product.document.fileName}
            {product.presentationVersion ? ` · v${product.presentationVersion}` : ""}
          </Text>
        </View>
        <View style={styles.evidencePill}>
          <Icon name="shield-checkmark-outline" size={17} color={fieldTheme.color.success} />
          <Text style={styles.evidenceText}>{copy.evidence}</Text>
        </View>
      </View>

      <View style={styles.truthBanner}>
        <Icon name="information-circle-outline" size={19} color={fieldTheme.color.blue} />
        <Text style={styles.truthText}>{copy.truth}</Text>
      </View>

      {state === "starting" ? (
        <View style={styles.state}>
          <ActivityIndicator color={fieldTheme.color.primary} />
          <Text style={styles.stateText}>{copy.starting}</Text>
        </View>
      ) : state === "failed" || !source ? (
        <View style={styles.state}>
          <Icon name="alert-circle-outline" size={34} color={fieldTheme.color.danger} />
          <Text style={styles.stateText}>{copy.failed}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.viewer}>
          <Text style={styles.fileHint}>{copy.fileHint}</Text>
          <WebView
            source={source}
            style={styles.webView}
            originWhitelist={["https://*", "http://*"]}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            onError={() => setState("failed")}
            onHttpError={() => setState("failed")}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  headerTablet: { paddingHorizontal: 22 },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "800" },
  file: { marginTop: 2, color: fieldTheme.color.inkMuted, fontSize: 12 },
  evidencePill: { maxWidth: 220, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: fieldTheme.color.successSoft },
  evidenceText: { flexShrink: 1, color: fieldTheme.color.success, fontSize: 11, fontWeight: "700" },
  truthBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: fieldTheme.color.blueSoft },
  truthText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 12, lineHeight: 17 },
  viewer: { flex: 1 },
  fileHint: { paddingHorizontal: 16, paddingVertical: 8, color: fieldTheme.color.inkMuted, fontSize: 11, backgroundColor: fieldTheme.color.surface },
  webView: { flex: 1, backgroundColor: fieldTheme.color.surface },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  stateText: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  retryButton: { minHeight: 44, justifyContent: "center", borderRadius: 14, paddingHorizontal: 20, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
})
