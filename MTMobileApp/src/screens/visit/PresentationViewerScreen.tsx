import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
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
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import type { RootStackParamList } from "../../navigation/AppNavigatorAndroidV2"
import { api } from "../../services/api"
import {
  cleanupPresentationFiles,
  downloadPresentationFile,
  openExternalPresentation,
  presentationFormat,
  renderPdfPage,
  setPresentationImmersive,
  type RenderedPdfPage,
} from "../../services/presentation-file"
import { fieldTheme, themed } from "../../theme/fieldTheme"
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
import {
  PRESENTATION_DOTS_MAX,
  PRESENTATION_PAGE_GAP,
  pagesToPrepare,
  stripRest,
  swipeOffset,
  swipeTurn,
} from "./presentation-swipe"

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
    fullScreen: "Во весь экран",
    showChrome: "Показать панели",
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
    fullScreen: "Tam ekran",
    showChrome: "Panelləri göstər",
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
    fullScreen: "Full screen",
    showChrome: "Show panels",
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
  // Every page rendered in this opening, by its index: going back to a page,
  // or onto a neighbour prepared ahead, shows it without rendering it again.
  const renderedPages = useRef(new Map<number, RenderedPdfPage>())
  // Neighbours whose picture is already on screen beside the page: turning
  // onto one of them counts it as displayed at once, as it is.
  const neighbourLoaded = useRef(new Set<string>())
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
  // The panels (header, evidence banner, page controls) cost about a third of
  // a phone screen, which is exactly the third a 16:9 slide needed. The deck
  // opens without them, system bars included (owner, 2026-11-11: «пусть сразу
  // же открывается полноэкранным»); «Panelləri göstər» brings them back. A tap
  // on the page no longer toggles them: the client's agents, swiping, kept
  // flipping the screen in and out of full screen.
  const [chromeVisible, setChromeVisible] = useState(false)
  // The pages beside `around`, as far as they are rendered.
  const [neighbours, setNeighbours] = useState<{ around: number; previous: RenderedPdfPage | null; next: RenderedPdfPage | null }>({ around: 0, previous: null, next: null })
  const [stageBox, setStageBox] = useState<ZoomSize>({ width: 0, height: 0 })
  const insets = useSafeAreaInsets()
  // The strip of pages under the finger. Every page has its own place on it —
  // page i at i stage widths — and the strip stands at the page on screen, so
  // a turn only moves the strip on: the picture that slid in IS the page, the
  // same picture, never swapped for another one afterwards. It used to be: the
  // strip jumped back to rest and the page's one picture changed its file, and
  // on the tablet the previous slide came up over the new one for a frame
  // (client of the owner, 2026-11-12: «slaydı dəyişəndə hələ də flash atır,
  // elə bil əvvəlki slaydla üst-üstə düşür bir anlıq»).
  const swipeX = useRef(new Animated.Value(0)).current
  const stripIndex = useRef(0)
  const turning = useRef(false)

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
    const fitted = fittedPageBox(stageSize.current, pageSize.current)
    fittedSize.current = fitted
    const bounded = clampPan(transform.current, fitted, stageSize.current, transform.current.scale)
    applyTransform({ scale: transform.current.scale, x: bounded.x, y: bounded.y })
  }, [applyTransform])

  const toggleChrome = useCallback(() => {
    setChromeVisible((visible) => !visible)
  }, [])

  // Full screen is the page alone: while the deck is still loading, or failed,
  // the header (and its close button) stays.
  const immersive = !chromeVisible && viewer.kind === "pdf"
  useEffect(() => {
    ignore(setPresentationImmersive(immersive))
  }, [immersive])

  // Leaving the viewer must never leave the phone without its system bars.
  useEffect(() => () => {
    ignore(setPresentationImmersive(false))
  }, [])

  const onStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: stageWidth, height: stageHeight } = event.nativeEvent.layout
    stageSize.current = { width: stageWidth, height: stageHeight }
    setStageBox((current) => (current.width === stageWidth && current.height === stageHeight ? current : { width: stageWidth, height: stageHeight }))
    measureFit()
    swipeX.setValue(stripRest(stripIndex.current, stageWidth))
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
  }, [measureFit, swipeX])

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

  // The responder is made once; what it needs to know about the page on
  // screen it reads here, as it is at the moment of the gesture.
  const viewerRef = useRef(viewer)
  viewerRef.current = viewer
  const neighboursRef = useRef(neighbours)
  neighboursRef.current = neighbours
  const turnPageRef = useRef<(direction: -1 | 1) => void>(() => {})

  const springBack = useCallback(() => {
    Animated.spring(swipeX, { toValue: stripRest(stripIndex.current, stageSize.current.width), useNativeDriver: true, bounciness: 0, speed: 24 }).start()
  }, [swipeX])

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
      if (!isZoomed(transform.current.scale)) {
        // A whole page under one finger: the strip follows it, as in the gallery.
        if (gesture.current.mode !== "pan" || turning.current) return
        swipeX.setValue(stripRest(stripIndex.current, stageSize.current.width) + swipeOffset(state.dx, Boolean(neighboursRef.current.previous) || (viewerRef.current.kind === "pdf" && viewerRef.current.pageIndex > 0), Boolean(neighboursRef.current.next) || (viewerRef.current.kind === "pdf" && viewerRef.current.pageIndex < viewerRef.current.rendered.pageCount - 1)))
        return
      }
      const moved = clampPan(
        { x: gesture.current.x + (state.dx - gesture.current.dxBase), y: gesture.current.y + (state.dy - gesture.current.dyBase) },
        fittedSize.current,
        stageSize.current,
        transform.current.scale,
      )
      applyTransform({ scale: transform.current.scale, x: moved.x, y: moved.y })
    },
    onPanResponderRelease: (_event, state) => {
      // Only a tap starts a double tap: two quick swipes in a row are two
      // page turns, not a zoom.
      const tapped = gesture.current.mode !== "pinch" && Math.abs(state.dx) < 6 && Math.abs(state.dy) < 6
      lastTapAt.current = tapped && gesture.current.mode !== "none" ? Date.now() : null
      const swiped = !tapped && gesture.current.mode === "pan" && !isZoomed(transform.current.scale)
      gesture.current = { mode: "none", distance: 0, scale: transform.current.scale, x: transform.current.x, y: transform.current.y, dxBase: 0, dyBase: 0 }
      if (turning.current) return
      if (!swiped) {
        // A tap may have nudged the strip a few pixels.
        springBack()
        return
      }
      const current = viewerRef.current
      const turn = current.kind === "pdf"
        ? swipeTurn({
          dx: state.dx,
          vx: state.vx,
          stageWidth: stageSize.current.width,
          hasPrevious: current.pageIndex > 0,
          hasNext: current.pageIndex < current.rendered.pageCount - 1,
        })
        : 0
      if (turn === 0) springBack()
      else turnPageRef.current(turn)
    },
    onPanResponderTerminate: () => {
      gesture.current = { mode: "none", distance: 0, scale: transform.current.scale, x: transform.current.x, y: transform.current.y, dxBase: 0, dyBase: 0 }
      if (!turning.current) springBack()
    },
  }), [applyTransform, springBack, stagePoint, swipeX, zoomTo])

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
    // The picture is on screen every time it is drawn, not only the first
    // time: a page turned back to used to stay under «Səhifə hazırlanır…» for
    // good, because the journal had already counted it (client of the owner,
    // 2026-11-12: «geriyə çevirdikdə donur»).
    setViewer((current) => current.kind === "pdf" && current.rendered.uri === uri && !current.imageLoaded
      ? { ...current, imageLoaded: true }
      : current)
    // The journal counts a page once per opening, as before.
    if (loadedImageUris.current.has(uri)) return
    loadedImageUris.current.add(uri)
    const displayedPage = zeroBasedPage + 1
    const viewedAt = new Date().toISOString()
    pagesViewed.current.add(displayedPage)
    pageEvents.current.push({ page: displayedPage, viewedAt })
    lastPage.current = displayedPage
    pageCount.current = knownPageCount
    ensureEvidenceSession(knownPageCount)
  }, [ensureEvidenceSession])

  /** One page as a picture: from this opening's renders when it is there, rendered once otherwise. */
  const renderPage = useCallback(async (filePath: string, zeroBasedPage: number): Promise<RenderedPdfPage> => {
    const known = renderedPages.current.get(zeroBasedPage)
    if (known) return known
    const rendered = await renderPdfPage(filePath, zeroBasedPage, targetRenderWidthRef.current)
    renderedPages.current.set(zeroBasedPage, rendered)
    renderedUris.current.add(rendered.uri)
    return rendered
  }, [])

  const neighboursOf = useCallback((zeroBasedPage: number) => ({
    around: zeroBasedPage,
    previous: renderedPages.current.get(zeroBasedPage - 1) ?? null,
    next: renderedPages.current.get(zeroBasedPage + 1) ?? null,
  }), [])

  /**
   * The neighbours are rendered ahead, next first, so a swipe never waits. In
   * the background: the agent can turn on while they are being drawn.
   */
  const prepareNeighbours = useCallback(async (filePath: string, zeroBasedPage: number, pageTotal: number, generation: number) => {
    for (const neighbour of pagesToPrepare(zeroBasedPage, pageTotal)) {
      try {
        await renderPage(filePath, neighbour)
      } catch {
        // A neighbour that fails is rendered again when it is turned to.
      }
      if (!mounted.current || generation !== renderGeneration.current) return
      setNeighbours(neighboursOf(zeroBasedPage))
    }
  }, [neighboursOf, renderPage])

  const showPdfPage = useCallback(async (filePath: string, zeroBasedPage: number) => {
    const generation = ++renderGeneration.current
    try {
      const rendered = await renderPage(filePath, zeroBasedPage)
      if (!mounted.current || generation !== renderGeneration.current) return
      // A neighbour already on screen is a page already displayed: no
      // «Səhifə hazırlanır…» over a picture the agent just slid in.
      const alreadyShown = neighbourLoaded.current.has(rendered.uri)
      setViewer({ kind: "pdf", filePath, pageIndex: zeroBasedPage, rendered, imageLoaded: false })
      setNeighbours(neighboursOf(zeroBasedPage))
      // A new page starts fitted: carrying a zoom over would open the next
      // slide somewhere in its middle with no way back but pinching out.
      pageSize.current = { width: rendered.width, height: rendered.height }
      fittedSize.current = fittedPageBox(stageSize.current, pageSize.current)
      resetZoom()
      pageCount.current = rendered.pageCount
      if (alreadyShown) markPageDisplayed(rendered.uri, zeroBasedPage, rendered.pageCount)
      ignore(prepareNeighbours(filePath, zeroBasedPage, rendered.pageCount, generation))
    } catch {
      if (mounted.current && generation === renderGeneration.current) setViewer({ kind: "failed" })
    }
  }, [markPageDisplayed, neighboursOf, prepareNeighbours, renderPage, resetZoom])

  /**
   * A page's picture is drawn on the strip. The page on screen counts as
   * displayed; a neighbour drawn beside it counts the moment it is turned to.
   */
  const onPagePictureLoad = useCallback((uri: string, zeroBasedPage: number, knownPageCount: number) => {
    neighbourLoaded.current.add(uri)
    const current = viewerRef.current
    if (current.kind === "pdf" && current.rendered.uri === uri) markPageDisplayed(uri, zeroBasedPage, knownPageCount)
  }, [markPageDisplayed])

  /**
   * To the previous or the next page. With the neighbour's picture already
   * drawn the strip slides on to it, as under the finger, and stays there:
   * that picture is the page from now on. Otherwise the strip moves at once and
   * the page is rendered in its place, under «Səhifə hazırlanır…».
   */
  const turnPage = useCallback((direction: -1 | 1) => {
    const current = viewerRef.current
    if (current.kind !== "pdf" || turning.current) return
    const target = current.pageIndex + direction
    if (target < 0 || target >= current.rendered.pageCount) {
      springBack()
      return
    }
    turning.current = true
    stripIndex.current = target
    const rest = stripRest(target, stageSize.current.width)
    const finish = () => {
      showPdfPage(current.filePath, target).finally(() => { turning.current = false })
    }
    const ready = renderedPages.current.get(target)
    if (!ready || !neighbourLoaded.current.has(ready.uri) || stageSize.current.width <= 0) {
      swipeX.setValue(rest)
      finish()
      return
    }
    Animated.timing(swipeX, { toValue: rest, duration: 200, useNativeDriver: true }).start(finish)
  }, [showPdfPage, springBack, swipeX])
  turnPageRef.current = turnPage

  // «Назад» on the phone — the button, or the swipe in from the edge of the
  // screen — is the previous slide, not the end of the deck (owner,
  // 2026-11-12: «если нажимаю назад, то слайд предыдущий должен открываться, а
  // не с первого»). It closed the viewer, and the deck opened again on page 1.
  // On the first page it closes, as before.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const current = viewerRef.current
      if (current.kind !== "pdf" || current.pageIndex === 0) return false
      turnPageRef.current(-1)
      return true
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    const generation = ++loadGeneration.current
    const previousRenderedUris = [...renderedUris.current]
    localFile.current = null
    renderedUris.current.clear()
    renderedPages.current.clear()
    neighbourLoaded.current.clear()
    loadedImageUris.current.clear()
    stripIndex.current = 0
    turning.current = false
    swipeX.setValue(0)
    setNeighbours({ around: 0, previous: null, next: null })
    // The downloaded deck stays on the device for the next opening; only this
    // opening's page pictures go.
    if (previousRenderedUris.length) {
      ignore(cleanupPresentationFiles(null, previousRenderedUris))
    }
    setViewer({ kind: "starting" })
    setEvidenceState(sessionId.current ? "recorded" : "idle")

    const load = async () => {
      if (!source || format === "unsupported") throw new Error("PRESENTATION_SOURCE_UNAVAILABLE")
      const downloadedPath = await downloadPresentationFile({
        source,
        document: product.document,
      })
      if (!mounted.current || generation !== loadGeneration.current) return
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
    }
  }, [attempt, format, product.document, showPdfPage, source, swipeX])

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
    ignore(cleanupPresentationFiles(null, renderedUris.current))
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
    <View style={[styles.container, immersive && styles.containerImmersive]}>
      {!immersive ? (
      <View style={[styles.header, tablet && styles.headerTablet, { paddingTop: 8 + insets.top, paddingLeft: 14 + insets.left, paddingRight: 14 + insets.right }]}>
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
      ) : null}

      {viewer.kind === "pdf" && chromeVisible ? (
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
            style={[
              styles.pageStage,
              tablet && styles.pageStageTablet,
              !chromeVisible && styles.pageStageImmersive,
            ]}
            onLayout={onStageLayout}
            {...panResponder.panHandlers}
          >
            {/* The page and its neighbours on one strip that follows the finger.
                Each page keeps its own place and its own picture (key = page):
                turning moves the strip, it never swaps a picture. */}
            <Animated.View style={[styles.swipeStrip, { transform: [{ translateX: swipeX }] }]}>
            {[
              neighbours.around === viewer.pageIndex ? { index: viewer.pageIndex - 1, page: neighbours.previous } : null,
              { index: viewer.pageIndex, page: viewer.rendered },
              neighbours.around === viewer.pageIndex ? { index: viewer.pageIndex + 1, page: neighbours.next } : null,
            ].map((slot) => {
              if (!slot?.page) return null
              const { index, page } = slot
              const current = index === viewer.pageIndex
              if (!current && stageBox.width <= 0) return null
              const laidOut = stageBox.width > 0
              const fitted = fittedPageBox(stageBox, { width: page.width, height: page.height })
              return (
                <View
                  key={index}
                  pointerEvents="none"
                  style={laidOut
                    ? [styles.stripSlot, { left: index * (stageBox.width + PRESENTATION_PAGE_GAP), width: stageBox.width, height: stageBox.height }]
                    : styles.pageLayer}
                >
                  <Animated.View
                    style={[
                      styles.pageLayer,
                      current ? { transform: [{ translateX: zoomX }, { translateY: zoomY }, { scale: zoomScale }] } : null,
                    ]}
                  >
                    {/*
                      The white sheet is the page itself, not the stage around it: a
                      16:9 slide inside a portrait card used to sit in a field of
                      white with no edge to tell page from padding.
                    */}
                    <View style={[styles.paper, laidOut ? { width: fitted.width, height: fitted.height } : styles.paperFill]}>
                      <Image
                        accessibilityLabel={current ? `${copy.page} ${index + 1} / ${page.pageCount}` : undefined}
                        source={{ uri: page.uri }}
                        resizeMode="contain"
                        // Android fades every new picture in over 300 ms from the
                        // dark stage: a page drawn on a turn came up as a flash.
                        fadeDuration={0}
                        style={styles.pageImage}
                        onLoad={() => onPagePictureLoad(page.uri, index, page.pageCount)}
                        onError={current ? () => setViewer({ kind: "failed" }) : undefined}
                      />
                    </View>
                  </Animated.View>
                </View>
              )
            })}
            </Animated.View>
            {viewer.imageLoaded ? (
              <View style={[styles.chipRow, { right: 10 + insets.right, bottom: 10 + (chromeVisible ? 0 : insets.bottom) }]} pointerEvents="box-none">
              {chromeVisible ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.fullScreen}
                onPress={toggleChrome}
                style={({ pressed }) => [styles.zoomChip, pressed && styles.pressed]}
                testID="presentation-chrome-chip"
              >
                <Icon name="scan-outline" size={16} color={fieldTheme.color.ink} />
                <Text style={styles.zoomChipText}>{copy.fullScreen}</Text>
              </Pressable>
              ) : null}
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
              </View>
            ) : null}
            {!viewer.imageLoaded ? (
              <View style={styles.pageLoader}>
                <ActivityIndicator color={fieldTheme.color.primary} />
                <Text style={styles.pageLoadingText}>{copy.pageLoading}</Text>
              </View>
            ) : null}
            {/* Full screen keeps what the agent needs on the page itself: the
                panels back, and at the bottom where he is in the deck with both
                ways and the close beside them. */}
            {!chromeVisible ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.showChrome}
                  onPress={toggleChrome}
                  style={({ pressed }) => [styles.overlayChip, { top: 12 + insets.top, right: 12 + insets.right }, pressed && styles.pressed]}
                  testID="presentation-chrome-chip"
                >
                  <Icon name="chevron-collapse-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.overlayChipText}>{copy.showChrome}</Text>
                </Pressable>
                {/* Close sits with the arrows, where the thumb already is (owner,
                    2026-11-12: «закрыть кнопка должна быть везде вниз, где
                    навигация, крестиком»). */}
                <View style={[styles.overlayPager, { bottom: 14 + insets.bottom }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.close}
                    onPress={() => navigation.goBack()}
                    style={({ pressed }) => [styles.overlayPagerButton, pressed && styles.pressed]}
                    testID="presentation-fullscreen-close"
                  >
                    <Icon name="close" size={20} color="#FFFFFF" />
                  </Pressable>
                  <View style={styles.overlayPagerDivider} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.previous}
                    disabled={viewer.pageIndex === 0}
                    onPress={() => turnPage(-1)}
                    style={({ pressed }) => [styles.overlayPagerButton, viewer.pageIndex === 0 && styles.pageButtonDisabled, pressed && styles.pressed]}
                    testID="presentation-fullscreen-previous"
                  >
                    <Icon name="chevron-back" size={20} color="#FFFFFF" />
                  </Pressable>
                  <Text style={styles.overlayPagerText}>{viewer.pageIndex + 1} / {viewer.rendered.pageCount}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.next}
                    disabled={viewer.pageIndex >= viewer.rendered.pageCount - 1}
                    onPress={() => turnPage(1)}
                    style={({ pressed }) => [styles.overlayPagerButton, viewer.pageIndex >= viewer.rendered.pageCount - 1 && styles.pageButtonDisabled, pressed && styles.pressed]}
                    testID="presentation-fullscreen-next"
                  >
                    <Icon name="chevron-forward" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
          {chromeVisible ? (
          <View style={[styles.pageControls, tablet && styles.pageControlsTablet, { paddingBottom: (tablet ? 14 : 8) + insets.bottom, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.close}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.pageButton, pressed && styles.pressed]}
              testID="presentation-panels-close"
            >
              <Icon name="close" size={24} color={fieldTheme.color.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.previous}
              disabled={viewer.pageIndex === 0 || !viewer.imageLoaded}
              onPress={() => turnPage(-1)}
              style={({ pressed }) => [styles.pageButton, (viewer.pageIndex === 0 || !viewer.imageLoaded) && styles.pageButtonDisabled, pressed && styles.pressed]}
            >
              <Icon name="chevron-back" size={24} color={fieldTheme.color.ink} />
            </Pressable>
            <View>
              <Text style={styles.pageCounter}>{copy.page} {viewer.pageIndex + 1} / {viewer.rendered.pageCount}</Text>
              {viewer.rendered.pageCount > 1 && viewer.rendered.pageCount <= PRESENTATION_DOTS_MAX ? (
                <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {Array.from({ length: viewer.rendered.pageCount }, (_unused, index) => (
                    <View key={index} style={[styles.dot, index === viewer.pageIndex && styles.dotCurrent]} />
                  ))}
                </View>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.next}
              disabled={viewer.pageIndex >= viewer.rendered.pageCount - 1 || !viewer.imageLoaded}
              onPress={() => turnPage(1)}
              style={({ pressed }) => [styles.pageButton, (viewer.pageIndex >= viewer.rendered.pageCount - 1 || !viewer.imageLoaded) && styles.pageButtonDisabled, pressed && styles.pressed]}
            >
              <Icon name="chevron-forward" size={24} color={fieldTheme.color.ink} />
            </Pressable>
          </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

/**
 * Dark enough that a white page reads as a sheet, not as more chrome. The
 * stage and the white paper stay the same in the night palette: a slide is a
 * printed page whatever the phone's theme.
 */
const STAGE_BACKDROP = "#111A1F"

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  containerImmersive: { backgroundColor: STAGE_BACKDROP },
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
  // The stage is the dark table the page lies on; the page is the sheet.
  pageStage: { flex: 1, margin: 10, overflow: "hidden", borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: STAGE_BACKDROP },
  pageStageTablet: { marginHorizontal: 22, marginVertical: 14 },
  pageStageImmersive: { margin: 0, borderRadius: 0, borderWidth: 0 },
  pageLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  swipeStrip: { ...StyleSheet.absoluteFillObject },
  stripSlot: { position: "absolute", top: 0, alignItems: "center", justifyContent: "center" },
  overlayChip: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(19, 35, 31, 0.72)" },
  overlayChipText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  overlayPager: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 24, backgroundColor: "rgba(19, 35, 31, 0.72)" },
  overlayPagerButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255, 255, 255, 0.14)" },
  overlayPagerDivider: { width: 1, height: 24, backgroundColor: "rgba(255, 255, 255, 0.28)" },
  overlayPagerText: { minWidth: 56, color: "#FFFFFF", fontSize: 15, fontWeight: "800", textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: fieldTheme.color.border },
  dotCurrent: { width: 18, backgroundColor: fieldTheme.color.primary },
  paper: { overflow: "hidden", backgroundColor: "#FFFFFF" },
  paperFill: { width: "100%", height: "100%" },
  pageImage: { width: "100%", height: "100%" },
  chipRow: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 8 },
  zoomChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  zoomChipText: { color: fieldTheme.color.ink, fontSize: 12, fontWeight: "800" },
  pageLoader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: fieldTheme.color.surface },
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
}))
