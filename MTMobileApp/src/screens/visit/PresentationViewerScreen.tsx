import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import type { LayoutChangeEvent, NativeTouchEvent } from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { useNavigation, useRoute } from "@react-navigation/native"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import {
  cleanupPresentationFiles,
  downloadPresentationFile,
  openExternalPresentation,
  presentationFormat,
  renderPdfPage,
  type RenderedPdfPage,
} from "../../services/presentation-file"
import { fieldTheme } from "../../theme/fieldTheme"
import { isTabletWidth } from "../../theme/layoutBreakpoints"
import {
  clampPan,
  clampZoomScale,
  fittedPageBox,
  isDoubleTap,
  isZoomed,
  nextDoubleTapScale,
  pinchDistance,
  pinchFocus,
  presentationRenderWidth,
  zoomAroundFocus,
  type ZoomPoint,
  type ZoomSize,
  type ZoomTransform,
} from "./presentation-zoom"

const COPY = {
  ru: {
    evidencePending: "Фиксируем показ страницы…",
    evidence: "Показ файла записывается в журнал визита",
    evidenceFailed: "Файл открыт, но запись в журнал не удалась",
    truth: "Журнал фиксирует открытие и показанные страницы, но не доказывает, что клиент их видел.",
    starting: "Загружаем презентацию…",
    pageLoading: "Готовим страницу…",
    failed: "Не удалось открыть презентацию",
    retry: "Повторить",
    close: "Закрыть",
    previous: "Предыдущая страница",
    next: "Следующая страница",
    page: "Страница",
    externalTitle: "Открыть презентацию в другом приложении",
    externalHint: "LeadDrive не сможет подтвердить просмотр страниц PowerPoint, поэтому такой запуск не отмечает презентацию выполненной.",
    externalOpen: "Открыть PowerPoint",
    externalOpened: "Файл передан внешнему приложению. Просмотр страниц не подтверждён.",
    zoomHint: "Увеличить",
    zoomReset: "Вся страница",
  },
  az: {
    evidencePending: "Səhifənin göstərilməsi qeydə alınır…",
    evidence: "Faylın göstərilməsi ziyarət jurnalına yazılır",
    evidenceFailed: "Fayl açıldı, lakin jurnala yazmaq mümkün olmadı",
    truth: "Jurnal açılmanı və göstərilən səhifələri qeyd edir, lakin müştərinin onları gördüyünü sübut etmir.",
    starting: "Təqdimat yüklənir…",
    pageLoading: "Səhifə hazırlanır…",
    failed: "Təqdimatı açmaq alınmadı",
    retry: "Yenidən cəhd et",
    close: "Bağla",
    previous: "Əvvəlki səhifə",
    next: "Növbəti səhifə",
    page: "Səhifə",
    externalTitle: "Təqdimatı başqa tətbiqdə açın",
    externalHint: "LeadDrive PowerPoint səhifələrinin baxışını təsdiqləyə bilməz, buna görə bu açılış təqdimatı tamamlanmış saymır.",
    externalOpen: "PowerPoint-i aç",
    externalOpened: "Fayl xarici tətbiqə ötürüldü. Səhifələrə baxış təsdiqlənməyib.",
    zoomHint: "Böyüt",
    zoomReset: "Bütün səhifə",
  },
  en: {
    evidencePending: "Recording the displayed page…",
    evidence: "This file display is recorded in the visit log",
    evidenceFailed: "The file opened, but the visit log could not be updated",
    truth: "The log records the opening and displayed pages; it does not prove the customer saw them.",
    starting: "Loading presentation…",
    pageLoading: "Preparing page…",
    failed: "The presentation could not be opened",
    retry: "Try again",
    close: "Close",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    externalTitle: "Open this presentation in another app",
    externalHint: "LeadDrive cannot verify PowerPoint pages shown outside the app, so this handoff does not complete the presentation step.",
    externalOpen: "Open PowerPoint",
    externalOpened: "The file was handed to another app. Page viewing is not verified.",
    zoomHint: "Zoom in",
    zoomReset: "Fit page",
  },
} as const

type EvidenceState = "idle" | "pending" | "recorded" | "failed"
type ViewerState =
  | { kind: "starting" }
  | { kind: "failed" }
  | { kind: "powerpoint"; filePath: string; opened: boolean }
  | { kind: "pdf"; filePath: string; pageIndex: number; rendered: RenderedPdfPage; imageLoaded: boolean }

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

function ignore(promise: Promise<unknown>): void {
  promise.catch(() => {})
}

export default function PresentationViewerScreen() {
  const { i18n } = useTranslation()
  const copy = COPY[language(i18n.language)]
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "PresentationViewer">>()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const { visitId, product } = route.params
  const format = useMemo(() => presentationFormat(product.document), [product.document])
  const source = useMemo(() => api.authorizedDocumentSource(product.downloadUrl), [product.downloadUrl])
  const targetRenderWidth = presentationRenderWidth(width, PixelRatio.get())
  const targetRenderWidthRef = useRef(targetRenderWidth)
  targetRenderWidthRef.current = targetRenderWidth

  const clientSessionId = useRef(`presentation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const sessionId = useRef<string | null>(null)
  const sessionStart = useRef<Promise<void> | null>(null)
  const openedAt = useRef<Date | null>(null)
  const activeSince = useRef(0)
  const activeSeconds = useRef(0)
  const pageCount = useRef<number | null>(null)
  const lastPage = useRef<number | null>(null)
  const pagesViewed = useRef(new Set<number>())
  const pageEvents = useRef<Array<{ page: number; viewedAt: string }>>([])
  const loadedImageUris = useRef(new Set<string>())
  const renderedUris = useRef(new Set<string>())
  const retiredUris = useRef(new Set<string>())
  const localFile = useRef<string | null>(null)
  const loadGeneration = useRef(0)
  const renderGeneration = useRef(0)
  const mounted = useRef(true)
  const closeRequested = useRef(false)
  const finalizeStarted = useRef(false)

  const [attempt, setAttempt] = useState(0)
  const [viewer, setViewer] = useState<ViewerState>({ kind: "starting" })
  const [evidenceState, setEvidenceState] = useState<EvidenceState>("idle")
  const [zoomedIn, setZoomedIn] = useState(false)

  // The page is one Animated layer: gestures write these values directly, so a
  // pinch does not re-render the screen (and does not interrupt the evidence
  // timers running beside it).
  const zoomScale = useRef(new Animated.Value(1)).current
  const zoomX = useRef(new Animated.Value(0)).current
  const zoomY = useRef(new Animated.Value(0)).current
  const transform = useRef<ZoomTransform>({ scale: 1, x: 0, y: 0 })
  const stageRef = useRef<View>(null)
  const stageOrigin = useRef<ZoomPoint>({ x: 0, y: 0 })
  const stageSize = useRef<ZoomSize>({ width: 0, height: 0 })
  const pageSize = useRef<ZoomSize>({ width: 0, height: 0 })
  const fittedSize = useRef<ZoomSize>({ width: 0, height: 0 })
  // `dxBase` is where the drag counter stood when panning began: a gesture that
  // starts as a pinch and ends on one finger must not jump by the whole
  // distance the fingers travelled while pinching.
  const gesture = useRef({ mode: "none" as "none" | "pan" | "pinch", distance: 0, scale: 1, x: 0, y: 0, dxBase: 0, dyBase: 0 })
  const lastTapAt = useRef<number | null>(null)

  const applyTransform = useCallback((next: ZoomTransform) => {
    transform.current = next
    zoomScale.setValue(next.scale)
    zoomX.setValue(next.x)
    zoomY.setValue(next.y)
    setZoomedIn((current) => (current === isZoomed(next.scale) ? current : isZoomed(next.scale)))
  }, [zoomScale, zoomX, zoomY])

  const resetZoom = useCallback(() => {
    applyTransform({ scale: 1, x: 0, y: 0 })
  }, [applyTransform])

  const measureFit = useCallback(() => {
    fittedSize.current = fittedPageBox(stageSize.current, pageSize.current)
    const bounded = clampPan(transform.current, fittedSize.current, stageSize.current, transform.current.scale)
    applyTransform({ scale: transform.current.scale, x: bounded.x, y: bounded.y })
  }, [applyTransform])

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: stageWidth, height: stageHeight } = event.nativeEvent.layout
    stageSize.current = { width: stageWidth, height: stageHeight }
    measureFit()
    // Touches arrive in window coordinates, and the page layer is transformed,
    // so a touch's own `locationX` is measured against a moving target. The
    // stage origin converts them once, in the only frame that stays still.
    stageRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      stageOrigin.current = { x, y }
      if (measuredWidth > 0 && measuredHeight > 0) {
        stageSize.current = { width: measuredWidth, height: measuredHeight }
        measureFit()
      }
    })
  }, [measureFit])

  const stagePoint = useCallback((touch: NativeTouchEvent): ZoomPoint => ({
    x: touch.pageX - stageOrigin.current.x,
    y: touch.pageY - stageOrigin.current.y,
  }), [])

  const zoomTo = useCallback((nextScale: number, focus: { x: number; y: number }) => {
    applyTransform(zoomAroundFocus({
      transform: transform.current,
      nextScale,
      focus,
      stage: stageSize.current,
      fitted: fittedSize.current,
    }))
  }, [applyTransform])

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (event, state) => (
      event.nativeEvent.touches.length >= 2
      || (isZoomed(transform.current.scale) && (Math.abs(state.dx) > 2 || Math.abs(state.dy) > 2))
    ),
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches
      gesture.current = {
        mode: touches.length >= 2 ? "pinch" : "pan",
        distance: touches.length >= 2 ? pinchDistance(stagePoint(touches[0]), stagePoint(touches[1])) : 0,
        scale: transform.current.scale,
        x: transform.current.x,
        y: transform.current.y,
        dxBase: 0,
        dyBase: 0,
      }
      if (touches.length !== 1) return
      const now = Date.now()
      if (isDoubleTap(lastTapAt.current, now)) {
        lastTapAt.current = null
        gesture.current.mode = "none"
        zoomTo(nextDoubleTapScale(transform.current.scale), stagePoint(touches[0]))
        return
      }
      lastTapAt.current = now
    },
    onPanResponderMove: (event, state) => {
      const touches = event.nativeEvent.touches
      if (touches.length >= 2) {
        const distance = pinchDistance(stagePoint(touches[0]), stagePoint(touches[1]))
        if (gesture.current.mode !== "pinch" || gesture.current.distance <= 0) {
          gesture.current = {
            mode: "pinch",
            distance,
            scale: transform.current.scale,
            x: transform.current.x,
            y: transform.current.y,
            dxBase: state.dx,
            dyBase: state.dy,
          }
          return
        }
        const focus = pinchFocus(stagePoint(touches[0]), stagePoint(touches[1]))
        zoomTo(clampZoomScale(gesture.current.scale * (distance / gesture.current.distance)), focus)
        return
      }
      if (gesture.current.mode === "pinch") {
        // The second finger left: carry on as a drag from where the pinch
        // ended, not from where the two fingers first touched down.
        gesture.current = {
          mode: "pan",
          distance: 0,
          scale: transform.current.scale,
          x: transform.current.x,
          y: transform.current.y,
          dxBase: state.dx,
          dyBase: state.dy,
        }
        return
      }
      if (!isZoomed(transform.current.scale)) return
      const moved = clampPan(
        { x: gesture.current.x + (state.dx - gesture.current.dxBase), y: gesture.current.y + (state.dy - gesture.current.dyBase) },
        fittedSize.current,
        stageSize.current,
        transform.current.scale,
      )
      applyTransform({ scale: transform.current.scale, x: moved.x, y: moved.y })
    },
    onPanResponderRelease: () => {
      gesture.current = { mode: "none", distance: 0, scale: transform.current.scale, x: transform.current.x, y: transform.current.y, dxBase: 0, dyBase: 0 }
    },
    onPanResponderTerminate: () => {
      gesture.current = { mode: "none", distance: 0, scale: transform.current.scale, x: transform.current.x, y: transform.current.y, dxBase: 0, dyBase: 0 }
    },
  }), [applyTransform, stagePoint, zoomTo])

  const activeDurationSeconds = useCallback((now: number) => (
    activeSeconds.current
    + (activeSince.current > 0 ? Math.max(0, Math.floor((now - activeSince.current) / 1_000)) : 0)
  ), [])

  const evidencePayload = useCallback((now: Date) => ({
    lastViewedAt: now.toISOString(),
    activeDurationSeconds: activeDurationSeconds(now.getTime()),
    pageCount: pageCount.current,
    lastPage: lastPage.current,
    pagesViewed: [...pagesViewed.current].sort((a, b) => a - b),
    pageEvents: [...pageEvents.current],
  }), [activeDurationSeconds])

  const finalizeSession = useCallback((id: string) => {
    if (finalizeStarted.current) return
    finalizeStarted.current = true
    const closedAt = new Date()
    currentPosition().then((closeLocation) => api.savePresentationSession(id, {
      ...evidencePayload(closedAt),
      closedAt: closedAt.toISOString(),
      closeLocation,
    })).catch(() => {})
  }, [evidencePayload])

  const ensureEvidenceSession = useCallback((knownPageCount: number) => {
    if (sessionId.current || sessionStart.current) return
    const firstOpenedAt = openedAt.current ?? new Date()
    openedAt.current = firstOpenedAt
    activeSince.current = activeSince.current || firstOpenedAt.getTime()
    pageCount.current = knownPageCount
    if (mounted.current) setEvidenceState("pending")

    sessionStart.current = (async () => {
      const location = await currentPosition()
      try {
        const response = await api.startPresentationSession({
          clientSessionId: clientSessionId.current,
          visitId,
          productId: product.id,
          openedAt: firstOpenedAt.toISOString(),
          location,
          pageCount: knownPageCount,
        })
        if (!response?.success || !response.data?.id) throw new Error("PRESENTATION_SESSION_START_FAILED")
        const createdSessionId = String(response.data.id)
        sessionId.current = createdSessionId
        if (closeRequested.current || !mounted.current) {
          finalizeSession(createdSessionId)
        } else {
          const now = new Date()
          api.savePresentationSession(createdSessionId, evidencePayload(now))
            .then(() => {
              if (mounted.current) setEvidenceState("recorded")
            })
            .catch(() => {
              if (mounted.current) setEvidenceState("failed")
            })
        }
      } catch {
        if (mounted.current) setEvidenceState("failed")
        sessionStart.current = null
      }
    })()
  }, [evidencePayload, finalizeSession, product.id, visitId])

  const markPageDisplayed = useCallback((uri: string, zeroBasedPage: number, knownPageCount: number) => {
    if (loadedImageUris.current.has(uri)) return
    loadedImageUris.current.add(uri)
    const displayedPage = zeroBasedPage + 1
    const viewedAt = new Date().toISOString()
    pagesViewed.current.add(displayedPage)
    pageEvents.current.push({ page: displayedPage, viewedAt })
    lastPage.current = displayedPage
    pageCount.current = knownPageCount
    ensureEvidenceSession(knownPageCount)
    for (const retiredUri of retiredUris.current) {
      renderedUris.current.delete(retiredUri)
      ignore(cleanupPresentationFiles(null, [retiredUri]))
    }
    retiredUris.current.clear()
    setViewer((current) => current.kind === "pdf" && current.rendered.uri === uri
      ? { ...current, imageLoaded: true }
      : current)
  }, [ensureEvidenceSession])

  const showPdfPage = useCallback(async (filePath: string, zeroBasedPage: number) => {
    const generation = ++renderGeneration.current
    try {
      const rendered = await renderPdfPage(filePath, zeroBasedPage, targetRenderWidthRef.current)
      if (!mounted.current || generation !== renderGeneration.current) {
        ignore(cleanupPresentationFiles(null, [rendered.uri]))
        return
      }
      setViewer((current) => {
        if (current.kind === "pdf" && current.rendered.uri !== rendered.uri) {
          retiredUris.current.add(current.rendered.uri)
        }
        return { kind: "pdf", filePath, pageIndex: zeroBasedPage, rendered, imageLoaded: false }
      })
      // A new page starts fitted: carrying a zoom over would open the next
      // slide somewhere in its middle with no way back but pinching out.
      pageSize.current = { width: rendered.width, height: rendered.height }
      fittedSize.current = fittedPageBox(stageSize.current, pageSize.current)
      resetZoom()
      renderedUris.current.add(rendered.uri)
      pageCount.current = rendered.pageCount
    } catch {
      if (mounted.current && generation === renderGeneration.current) setViewer({ kind: "failed" })
    }
  }, [resetZoom])

  useEffect(() => {
    const generation = ++loadGeneration.current
    let downloadedPath: string | null = null
    const previousFile = localFile.current
    const previousRenderedUris = [...renderedUris.current]
    localFile.current = null
    renderedUris.current.clear()
    retiredUris.current.clear()
    loadedImageUris.current.clear()
    if (previousFile || previousRenderedUris.length) {
      ignore(cleanupPresentationFiles(previousFile, previousRenderedUris))
    }
    setViewer({ kind: "starting" })
    setEvidenceState(sessionId.current ? "recorded" : "idle")

    const load = async () => {
      if (!source || format === "unsupported") throw new Error("PRESENTATION_SOURCE_UNAVAILABLE")
      downloadedPath = await downloadPresentationFile({
        source,
        document: product.document,
        cacheKey: clientSessionId.current,
      })
      if (!mounted.current || generation !== loadGeneration.current) {
        ignore(cleanupPresentationFiles(downloadedPath, []))
        return
      }
      localFile.current = downloadedPath
      if (format === "pdf") {
        await showPdfPage(downloadedPath, 0)
      } else {
        setViewer({ kind: "powerpoint", filePath: downloadedPath, opened: false })
      }
    }

    load().catch(() => {
      if (mounted.current && generation === loadGeneration.current) setViewer({ kind: "failed" })
    })

    const loadGenerationRef = loadGeneration
    const renderGenerationRef = renderGeneration
    return () => {
      ++loadGenerationRef.current
      ++renderGenerationRef.current
      if (downloadedPath && downloadedPath !== localFile.current) {
        ignore(cleanupPresentationFiles(downloadedPath, []))
      }
    }
  }, [attempt, format, product.document, showPdfPage, source])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const now = Date.now()
      if (nextState === "active" && openedAt.current) {
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
      const now = new Date()
      api.savePresentationSession(sessionId.current, evidencePayload(now))
        .then(() => {
          if (mounted.current) setEvidenceState("recorded")
        })
        .catch(() => {
          if (mounted.current) setEvidenceState("failed")
        })
    }, 15_000)
    return () => clearInterval(interval)
  }, [evidencePayload])

  useEffect(() => () => {
    mounted.current = false
    closeRequested.current = true
    ++loadGeneration.current
    ++renderGeneration.current
    if (sessionId.current) finalizeSession(sessionId.current)
    ignore(cleanupPresentationFiles(localFile.current, renderedUris.current))
  }, [finalizeSession])

  const openPowerPoint = useCallback(async () => {
    if (viewer.kind !== "powerpoint") return
    try {
      await openExternalPresentation(viewer.filePath, product.document.mimeType)
      if (mounted.current) setViewer({ ...viewer, opened: true })
    } catch {
      if (mounted.current) setViewer({ kind: "failed" })
    }
  }, [product.document.mimeType, viewer])

  const evidenceLabel = evidenceState === "recorded"
    ? copy.evidence
    : evidenceState === "failed"
      ? copy.evidenceFailed
      : copy.evidencePending
  const evidenceColor = evidenceState === "failed" ? fieldTheme.color.danger : fieldTheme.color.success
  const evidenceBackground = evidenceState === "failed" ? fieldTheme.color.dangerSoft : fieldTheme.color.successSoft

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
      </View>

      {viewer.kind === "pdf" ? (
        <View style={[styles.evidenceBanner, { backgroundColor: evidenceBackground }]}>
          <Icon
            name={evidenceState === "failed" ? "alert-circle-outline" : evidenceState === "recorded" ? "shield-checkmark-outline" : "time-outline"}
            size={19}
            color={evidenceColor}
          />
          <View style={styles.evidenceCopy}>
            <Text style={[styles.evidenceText, { color: evidenceColor }]}>{evidenceLabel}</Text>
            <Text style={styles.truthText}>{copy.truth}</Text>
          </View>
        </View>
      ) : null}

      {viewer.kind === "starting" ? (
        <View style={styles.state}>
          <ActivityIndicator color={fieldTheme.color.primary} />
          <Text style={styles.stateText}>{copy.starting}</Text>
        </View>
      ) : viewer.kind === "failed" ? (
        <View style={styles.state}>
          <Icon name="alert-circle-outline" size={34} color={fieldTheme.color.danger} />
          <Text style={styles.stateText}>{copy.failed}</Text>
          <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>{copy.retry}</Text>
          </Pressable>
        </View>
      ) : viewer.kind === "powerpoint" ? (
        <View style={styles.state}>
          <View style={styles.externalIcon}>
            <Icon name="easel-outline" size={32} color={fieldTheme.color.coral} />
          </View>
          <Text style={styles.stateTitle}>{copy.externalTitle}</Text>
          <Text style={styles.externalHint}>{viewer.opened ? copy.externalOpened : copy.externalHint}</Text>
          <Pressable accessibilityRole="button" onPress={() => { ignore(openPowerPoint()) }} style={styles.retryButton}>
            <Icon name="open-outline" size={19} color={fieldTheme.color.onColor} />
            <Text style={styles.retryText}>{copy.externalOpen}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.viewer}>
          <View
            ref={stageRef}
            style={[styles.pageStage, tablet && styles.pageStageTablet]}
            onLayout={onStageLayout}
            {...panResponder.panHandlers}
          >
            <Animated.View
              style={[
                styles.pageLayer,
                { transform: [{ translateX: zoomX }, { translateY: zoomY }, { scale: zoomScale }] },
              ]}
            >
              <Image
                accessibilityLabel={`${copy.page} ${viewer.pageIndex + 1} / ${viewer.rendered.pageCount}`}
                source={{ uri: viewer.rendered.uri }}
                resizeMode="contain"
                style={styles.pageImage}
                onLoad={() => markPageDisplayed(viewer.rendered.uri, viewer.pageIndex, viewer.rendered.pageCount)}
                onError={() => setViewer({ kind: "failed" })}
              />
            </Animated.View>
            {viewer.imageLoaded ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={zoomedIn ? copy.zoomReset : copy.zoomHint}
                onPress={() => {
                  if (zoomedIn) {
                    resetZoom()
                    return
                  }
                  zoomTo(nextDoubleTapScale(1), { x: stageSize.current.width / 2, y: stageSize.current.height / 2 })
                }}
                style={({ pressed }) => [styles.zoomChip, pressed && styles.pressed]}
                testID="presentation-zoom-chip"
              >
                <Icon name={zoomedIn ? "contract-outline" : "expand-outline"} size={16} color={fieldTheme.color.ink} />
                <Text style={styles.zoomChipText}>{zoomedIn ? copy.zoomReset : copy.zoomHint}</Text>
              </Pressable>
            ) : null}
            {!viewer.imageLoaded ? (
              <View style={styles.pageLoader}>
                <ActivityIndicator color={fieldTheme.color.primary} />
                <Text style={styles.pageLoadingText}>{copy.pageLoading}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.pageControls, tablet && styles.pageControlsTablet]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.previous}
              disabled={viewer.pageIndex === 0 || !viewer.imageLoaded}
              onPress={() => { ignore(showPdfPage(viewer.filePath, viewer.pageIndex - 1)) }}
              style={({ pressed }) => [styles.pageButton, (viewer.pageIndex === 0 || !viewer.imageLoaded) && styles.pageButtonDisabled, pressed && styles.pressed]}
            >
              <Icon name="chevron-back" size={24} color={fieldTheme.color.ink} />
            </Pressable>
            <Text style={styles.pageCounter}>{copy.page} {viewer.pageIndex + 1} / {viewer.rendered.pageCount}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.next}
              disabled={viewer.pageIndex >= viewer.rendered.pageCount - 1 || !viewer.imageLoaded}
              onPress={() => { ignore(showPdfPage(viewer.filePath, viewer.pageIndex + 1)) }}
              style={({ pressed }) => [styles.pageButton, (viewer.pageIndex >= viewer.rendered.pageCount - 1 || !viewer.imageLoaded) && styles.pageButtonDisabled, pressed && styles.pressed]}
            >
              <Icon name="chevron-forward" size={24} color={fieldTheme.color.ink} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  headerTablet: { paddingHorizontal: 22 },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "800" },
  file: { marginTop: 2, color: fieldTheme.color.inkMuted, fontSize: 12 },
  evidenceBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  evidenceCopy: { flex: 1, minWidth: 0 },
  evidenceText: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  truthText: { marginTop: 1, color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15 },
  viewer: { flex: 1 },
  pageStage: { flex: 1, margin: 10, overflow: "hidden", borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: "#FFFFFF" },
  pageStageTablet: { marginHorizontal: 22, marginVertical: 14 },
  pageLayer: { ...StyleSheet.absoluteFillObject },
  pageImage: { width: "100%", height: "100%" },
  zoomChip: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: "rgba(251,253,252,0.94)" },
  zoomChipText: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "800" },
  pageLoader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(251,253,252,0.92)" },
  pageLoadingText: { color: fieldTheme.color.inkMuted, fontSize: 12, fontWeight: "700" },
  pageControls: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 16, paddingBottom: 8 },
  pageControlsTablet: { paddingBottom: 14 },
  pageButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  pageButtonDisabled: { opacity: 0.35 },
  pageCounter: { minWidth: 110, color: fieldTheme.color.ink, fontSize: 14, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.72 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  stateTitle: { maxWidth: 460, color: fieldTheme.color.ink, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "700", textAlign: "center" },
  externalIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.coralSoft },
  externalHint: { maxWidth: 520, color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingHorizontal: 20, backgroundColor: fieldTheme.color.primary },
  retryText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "800" },
})
