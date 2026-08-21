import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import NetInfo from "@react-native-community/netinfo"
import { useNavigation } from "@react-navigation/native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { WebView } from "react-native-webview"
import { api } from "../../services/api"
import {
  formatGpsPointTime,
  gpsDateKey,
  normalizeGpsTimeZone,
  toGpsHistory,
  type GpsHistory,
  type GpsPoint,
} from "../../services/gps-history"
import { shiftDateKey } from "../../services/week"
import { useHeaderTop } from "../../hooks/useTabBarHeight"
import { useBootstrapStore } from "../../store/bootstrap"
import { fieldTheme } from "../../theme/fieldTheme"
import {
  isExpandedTabletWidth,
  isTabletWidth,
  LAYOUT_TOUCH_TARGETS,
} from "../../theme/layoutBreakpoints"
import {
  buildGpsRouteDocument,
  createGpsPlaybackModel,
  selectGpsPlaybackPoint,
  type GpsPlaybackModel,
  type GpsPlaybackSelection,
  type GpsTimelinePoint,
} from "./gps-history-model"

type Translate = (key: string, options?: Record<string, unknown>) => string
type GpsLoadIssue = "none" | "offline" | "timeout" | "access" | "error"

const PLAYBACK_STEP_MS = 900

function formatDate(dateKey: string, language: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

function accuracyTone(accuracy?: number): { color: string; background: string } {
  if (accuracy == null) return { color: fieldTheme.color.inkMuted, background: fieldTheme.color.surfaceStrong }
  if (accuracy <= 25) return { color: fieldTheme.color.success, background: fieldTheme.color.successSoft }
  if (accuracy <= 75) return { color: fieldTheme.color.amber, background: fieldTheme.color.amberSoft }
  return { color: fieldTheme.color.danger, background: fieldTheme.color.dangerSoft }
}

function pointKey(point: GpsTimelinePoint): string {
  return `${point.id || "gps-point"}-${point.sourceIndex}`
}

export default function GpsHistoryScreen() {
  const { t, i18n } = useTranslation()
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const headerTop = useHeaderTop()
  const bootstrapTimezone = useBootstrapStore((state) => state.data?.timezone)
  const safeBootstrapTimezone = useMemo(
    () => normalizeGpsTimeZone(bootstrapTimezone),
    [bootstrapTimezone],
  )
  const [anchor, setAnchor] = useState<string>(() => gpsDateKey(new Date(), safeBootstrapTimezone))
  const [historyTimezone, setHistoryTimezone] = useState<string | undefined>(safeBootstrapTimezone)
  const [data, setData] = useState<GpsHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadIssue, setLoadIssue] = useState<GpsLoadIssue>("none")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const historyCache = useRef(new Map<string, GpsHistory>())
  const requestController = useRef<AbortController | null>(null)
  const userSelectedDate = useRef(false)

  const loadHistory = useCallback(async (date: string, initial = false) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const retained = historyCache.current.get(date) ?? null

    if (initial) {
      setData(retained)
      setLoading(!retained)
      setRefreshing(Boolean(retained))
    } else {
      setRefreshing(true)
    }
    setLoadIssue("none")

    try {
      const response = await api.getLocationHistory(date, controller.signal)
      if (!response.success || !response.data) throw new Error(response.error || "GPS_HISTORY_LOAD_FAILED")
      if (controller.signal.aborted) return
      const history = toGpsHistory(response.data)
      if (history.date && history.date !== date) throw new Error("GPS_HISTORY_DATE_MISMATCH")
      const normalizedHistory = { ...history, date: history.date || date }
      historyCache.current.set(date, normalizedHistory)
      setData(normalizedHistory)
      if (normalizedHistory.timezone) setHistoryTimezone(normalizedHistory.timezone)
      setLoadIssue("none")
    } catch (error: any) {
      if (controller.signal.aborted || error.message === "ABORTED" || error.message === "SESSION_EXPIRED") return
      const cached = historyCache.current.get(date)
      if (cached) setData(cached)

      if (error?.code === "MTM_MOBILE_CAPABILITY_REQUIRED" || error?.status === 403) {
        setLoadIssue("access")
      } else if (error.message === "REQUEST_TIMEOUT") {
        setLoadIssue("timeout")
      } else {
        try {
          const network = await NetInfo.fetch()
          if (controller.signal.aborted) return
          const disconnected = network.isConnected === false || network.isInternetReachable === false
          setLoadIssue(disconnected ? "offline" : "error")
        } catch {
          if (!controller.signal.aborted) setLoadIssue("error")
        }
      }
    } finally {
      if (requestController.current === controller) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
    setPlaying(false)
    loadHistory(anchor, true)
    return () => requestController.current?.abort()
  }, [anchor, loadHistory])

  useEffect(() => {
    if (!safeBootstrapTimezone) return
    setHistoryTimezone((current) => current ?? safeBootstrapTimezone)
    if (userSelectedDate.current) return

    const tenantToday = gpsDateKey(new Date(), safeBootstrapTimezone)
    if (tenantToday === anchor) return
    requestController.current?.abort()
    const retained = historyCache.current.get(tenantToday) ?? null
    setData(retained)
    setLoading(!retained)
    setRefreshing(Boolean(retained))
    setLoadIssue("none")
    setSelectedIndex(0)
    setPlaying(false)
    setAnchor(tenantToday)
  }, [anchor, safeBootstrapTimezone])

  const effectiveTimezone = data?.timezone ?? historyTimezone ?? safeBootstrapTimezone
  const model = useMemo(
    () => createGpsPlaybackModel(data?.points ?? [], data?.gpsIntervalSeconds),
    [data?.gpsIntervalSeconds, data?.points],
  )
  const selection = useMemo(
    () => selectGpsPlaybackPoint(model, selectedIndex),
    [model, selectedIndex],
  )

  useEffect(() => {
    if (model.routePoints.length < 2) setPlaying(false)
    setSelectedIndex((current) => Math.min(current, Math.max(model.routePoints.length - 1, 0)))
  }, [model.routePoints.length])

  useEffect(() => {
    if (!playing || model.routePoints.length < 2) return
    const lastIndex = model.routePoints.length - 1
    const timer = setInterval(() => {
      setSelectedIndex((current) => {
        if (current >= lastIndex) {
          setPlaying(false)
          return lastIndex
        }
        return current + 1
      })
    }, PLAYBACK_STEP_MS)
    return () => clearInterval(timer)
  }, [model.routePoints.length, playing])

  const touchTarget = tablet ? LAYOUT_TOUCH_TARGETS.expandedTablet : LAYOUT_TOUCH_TARGETS.compact
  const currentDateKey = gpsDateKey(new Date(), effectiveTimezone)
  const isToday = anchor === currentDateKey

  const selectDate = (next: string) => {
    if (next === anchor) return
    userSelectedDate.current = true
    requestController.current?.abort()
    const retained = historyCache.current.get(next) ?? null
    setData(retained)
    setLoading(!retained)
    setRefreshing(Boolean(retained))
    setLoadIssue("none")
    setSelectedIndex(0)
    setPlaying(false)
    setAnchor(next)
  }

  const moveDay = (offset: number) => {
    const next = shiftDateKey(anchor, offset)
    if (next > currentDateKey) return
    selectDate(next)
  }

  const refresh = () => loadHistory(anchor)

  const renderPoint = ({ item, index }: { item: GpsTimelinePoint; index: number }) => (
    <PointRow
      point={item}
      position={index + 1}
      selected={item.playbackIndex === selection.index && item.playbackIndex != null}
      language={i18n.language}
      timezone={effectiveTimezone}
      t={t}
      onPress={() => {
        if (item.playbackIndex == null) return
        setPlaying(false)
        setSelectedIndex(item.playbackIndex)
      }}
    />
  )

  const timelineHeader = (
    <View style={styles.timelineHeader}>
      <View style={styles.sectionIcon}>
        <Icon name="time-outline" size={20} color={fieldTheme.color.primary} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{t("gpsHistory.timelineTitle")}</Text>
        <Text style={styles.sectionBody}>{t("gpsHistory.timelineHint")}</Text>
      </View>
    </View>
  )

  const overview = data ? (
    <HistoryOverview
      data={data}
      model={model}
      selection={selection}
      selectedIndex={selectedIndex}
      playing={playing}
      loadIssue={loadIssue}
      language={i18n.language}
      timezone={effectiveTimezone}
      tablet={expandedTablet}
      t={t}
      onSelect={setSelectedIndex}
      onPlayingChange={setPlaying}
      onRetry={refresh}
    />
  ) : null

  let content: React.ReactNode
  if (loading && !data) {
    content = (
      <View style={styles.center} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={fieldTheme.color.primary} />
        <Text style={styles.loadingText}>{t("common.loading")}</Text>
      </View>
    )
  } else if (!data) {
    content = (
      <ScrollView
        contentContainerStyle={styles.failureScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <FailureState issue={loadIssue} refreshing={refreshing} t={t} onRetry={refresh} onBack={() => navigation.goBack()} />
      </ScrollView>
    )
  } else if (data.points.length === 0) {
    content = (
      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={fieldTheme.color.primary}
            colors={[fieldTheme.color.primary]}
          />
        )}
      >
        {loadIssue !== "none" && <LoadNotice issue={loadIssue} t={t} onRetry={refresh} />}
        <SummaryGrid data={data} tablet={tablet} t={t} />
        <EmptyHistory t={t} />
      </ScrollView>
    )
  } else if (expandedTablet) {
    content = (
      <View style={styles.tabletPage}>
        <View style={styles.tabletColumns}>
          <View style={styles.masterPanel}>
            <FlatList
              data={model.timelinePoints}
              keyExtractor={pointKey}
              renderItem={renderPoint}
              ListHeaderComponent={timelineHeader}
              contentContainerStyle={styles.timelineListTablet}
              refreshControl={(
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={fieldTheme.color.primary}
                  colors={[fieldTheme.color.primary]}
                />
              )}
            />
          </View>
          <ScrollView style={styles.detailPanel} contentContainerStyle={styles.detailPanelContent}>
            {overview}
          </ScrollView>
        </View>
      </View>
    )
  } else {
    content = (
      <FlatList
        data={model.timelinePoints}
        keyExtractor={pointKey}
        renderItem={renderPoint}
        ListHeaderComponent={(
          <>
            {overview}
            {timelineHeader}
          </>
        )}
        contentContainerStyle={styles.phoneList}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={fieldTheme.color.primary}
            colors={[fieldTheme.color.primary]}
          />
        )}
      />
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerInner}>
          <View style={styles.titleRow}>
            {navigation.canGoBack() && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("gpsHistory.back")}
                onPress={() => navigation.goBack()}
                style={({ pressed }) => [styles.backButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
              >
                <Icon name="arrow-back" size={23} color={fieldTheme.color.onColor} />
              </Pressable>
            )}
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>{t("gpsHistory.eyebrow")}</Text>
              <Text style={styles.headerTitle}>{t("gpsHistory.title")}</Text>
              <Text style={styles.headerSubtitle}>{t("gpsHistory.subtitle")}</Text>
            </View>
          </View>

          <View style={styles.dayNavigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("gpsHistory.previousDay")}
              onPress={() => moveDay(-1)}
              style={({ pressed }) => [styles.navButton, { width: touchTarget, height: touchTarget }, pressed && styles.pressed]}
            >
              <Icon name="chevron-back" size={22} color={fieldTheme.color.onColor} />
            </Pressable>
            <View style={styles.dateCopy}>
              <Text style={styles.dateLabel}>{formatDate(anchor, i18n.language)}</Text>
              {!isToday && (
                <Pressable accessibilityRole="button" onPress={() => selectDate(currentDateKey)} style={styles.todayButton}>
                  <Text style={styles.todayText}>{t("gpsHistory.today")}</Text>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("gpsHistory.nextDay")}
              accessibilityState={{ disabled: isToday }}
              disabled={isToday}
              onPress={() => moveDay(1)}
              style={({ pressed }) => [
                styles.navButton,
                { width: touchTarget, height: touchTarget },
                isToday && styles.disabled,
                pressed && !isToday && styles.pressed,
              ]}
            >
              <Icon name="chevron-forward" size={22} color={fieldTheme.color.onColor} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("gpsHistory.refresh")}
              accessibilityState={{ disabled: loading || refreshing }}
              disabled={loading || refreshing}
              onPress={refresh}
              style={({ pressed }) => [
                styles.navButton,
                { width: touchTarget, height: touchTarget },
                (loading || refreshing) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
              ) : (
                <Icon name="refresh" size={21} color={fieldTheme.color.onColor} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
      {content}
    </View>
  )
}

function HistoryOverview({
  data,
  model,
  selection,
  selectedIndex,
  playing,
  loadIssue,
  language,
  timezone,
  tablet,
  t,
  onSelect,
  onPlayingChange,
  onRetry,
}: {
  data: GpsHistory
  model: GpsPlaybackModel
  selection: GpsPlaybackSelection
  selectedIndex: number
  playing: boolean
  loadIssue: GpsLoadIssue
  language: string
  timezone?: string
  tablet: boolean
  t: Translate
  onSelect: (index: number) => void
  onPlayingChange: (playing: boolean) => void
  onRetry: () => void
}) {
  return (
    <View>
      {loadIssue !== "none" && <LoadNotice issue={loadIssue} t={t} onRetry={onRetry} />}
      <SummaryGrid data={data} tablet={tablet} t={t} />
      <View style={styles.explainer}>
        <Icon name="information-circle-outline" size={21} color={fieldTheme.color.primary} />
        <Text style={styles.explainerText}>{t("gpsHistory.trackingHint")}</Text>
      </View>
      {model.missingCoordinateCount > 0 && (
        <View style={styles.coordinateNotice} accessibilityLiveRegion="polite">
          <Icon name="alert-circle-outline" size={20} color={fieldTheme.color.amber} />
          <Text style={styles.coordinateNoticeText}>
            {t("gpsHistory.pointsWithoutCoordinates", { count: model.missingCoordinateCount })}
          </Text>
        </View>
      )}
      {model.invalidTimestampCount > 0 && (
        <View style={styles.coordinateNotice} accessibilityLiveRegion="polite">
          <Icon name="time-outline" size={20} color={fieldTheme.color.amber} />
          <Text style={styles.coordinateNoticeText}>
            {t("gpsHistory.pointsWithoutTime", { count: model.invalidTimestampCount })}
          </Text>
        </View>
      )}
      {model.gpsGapCount > 0 && (
        <View style={styles.coordinateNotice} accessibilityLiveRegion="polite">
          <Icon name="git-compare-outline" size={20} color={fieldTheme.color.amber} />
          <Text style={styles.coordinateNoticeText}>
            {t("gpsHistory.routeGaps", {
              count: model.gpsGapCount,
              minutes: Math.ceil(model.gapThresholdSeconds / 60),
            })}
          </Text>
        </View>
      )}
      <RoutePlaybackCard
        model={model}
        selection={selection}
        selectedIndex={selectedIndex}
        playing={playing}
        language={language}
        timezone={timezone}
        tablet={tablet}
        t={t}
        onSelect={onSelect}
        onPlayingChange={onPlayingChange}
      />
    </View>
  )
}

function RoutePlaybackCard({
  model,
  selection,
  selectedIndex,
  playing,
  language,
  timezone,
  tablet,
  t,
  onSelect,
  onPlayingChange,
}: {
  model: GpsPlaybackModel
  selection: GpsPlaybackSelection
  selectedIndex: number
  playing: boolean
  language: string
  timezone?: string
  tablet: boolean
  t: Translate
  onSelect: (index: number) => void
  onPlayingChange: (playing: boolean) => void
}) {
  const webViewRef = useRef<any>(null)
  const [visualError, setVisualError] = useState(false)
  const routeDocument = useMemo(
    () => buildGpsRouteDocument(model.routeSegments, {
      language: language.split("-")[0] || "en",
      routeLabel: t("gpsHistory.routeTitle"),
      start: t("gpsHistory.routeStart"),
      end: t("gpsHistory.routeEnd"),
      current: t("gpsHistory.routeCurrent"),
      localSchemeHint: t("gpsHistory.localSchemeHint"),
    }),
    [language, model.routeSegments, t],
  )
  const webViewSource = useMemo(
    () => ({ html: routeDocument, baseUrl: "about:blank" }),
    [routeDocument],
  )

  useEffect(() => {
    setVisualError(false)
  }, [routeDocument])

  const syncMarker = useCallback(() => {
    webViewRef.current?.injectJavaScript(`window.setPlaybackIndex(${selectedIndex}); true;`)
  }, [selectedIndex])

  useEffect(() => {
    syncMarker()
  }, [syncMarker])

  const jumpTo = (index: number) => {
    onPlayingChange(false)
    onSelect(index)
  }

  const togglePlayback = () => {
    if (model.routePoints.length < 2) return
    if (playing) {
      onPlayingChange(false)
      return
    }
    if (selection.isLast) onSelect(0)
    onPlayingChange(true)
  }

  const playLabel = playing
    ? t("gpsHistory.pause")
    : selection.isLast && model.routePoints.length > 1
      ? t("gpsHistory.replay")
      : selectedIndex > 0
        ? t("gpsHistory.resume")
        : t("gpsHistory.play")

  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeading}>
        <View style={styles.routeHeadingIcon}>
          <Icon name="map-outline" size={22} color={fieldTheme.color.primary} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{t("gpsHistory.routeTitle")}</Text>
          <Text style={styles.sectionBody}>{t("gpsHistory.routeHint")}</Text>
        </View>
      </View>

      {model.routePoints.length === 0 ? (
        <View style={[styles.noCoordinates, tablet && styles.noCoordinatesTablet]}>
          <Icon name="navigate-circle-outline" size={42} color={fieldTheme.color.primary} />
          <Text style={styles.noCoordinatesTitle}>{t("gpsHistory.noCoordinatesTitle")}</Text>
          <Text style={styles.noCoordinatesBody}>{t("gpsHistory.noCoordinatesBody")}</Text>
        </View>
      ) : visualError ? (
        <View style={[styles.noCoordinates, tablet && styles.noCoordinatesTablet]}>
          <Icon name="warning-outline" size={38} color={fieldTheme.color.amber} />
          <Text style={styles.noCoordinatesTitle}>{t("gpsHistory.routeUnavailableTitle")}</Text>
          <Text style={styles.noCoordinatesBody}>{t("gpsHistory.routeUnavailableBody")}</Text>
        </View>
      ) : (
        <View style={[styles.routeVisual, tablet && styles.routeVisualTablet]}>
          <WebView
            ref={webViewRef}
            source={webViewSource}
            originWhitelist={["about:blank"]}
            javaScriptEnabled
            domStorageEnabled={false}
            cacheEnabled={false}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            scrollEnabled={false}
            bounces={false}
            onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
            onLoadEnd={syncMarker}
            onError={() => setVisualError(true)}
            accessibilityLabel={t("gpsHistory.routeAccessibility", {
              current: selection.index + 1,
              total: model.routePoints.length,
            })}
            style={styles.webView}
          />
        </View>
      )}

      {selection.point && (
        <View style={styles.playbackPanel}>
          <View style={styles.playbackHeading}>
            <View>
              <Text style={styles.playbackEyebrow}>{t("gpsHistory.playbackTitle")}</Text>
              <Text style={styles.currentTime}>
                {formatGpsPointTime(selection.point.recordedAt, language, timezone)}
              </Text>
            </View>
            <View style={styles.pointCounter}>
              <Text style={styles.pointCounterText}>
                {t("gpsHistory.pointOf", { current: selection.index + 1, total: model.routePoints.length })}
              </Text>
            </View>
          </View>
          <Text style={styles.playbackHint}>{t("gpsHistory.playbackHint")}</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(selection.progress * 100)}%` }]} />
          </View>

          <View style={styles.currentFacts}>
            <View style={styles.currentCoordinate}>
              <Icon name="location-outline" size={17} color={fieldTheme.color.primary} />
              <Text style={styles.currentCoordinateText} numberOfLines={1}>
                {selection.point.latitude.toFixed(5)}, {selection.point.longitude.toFixed(5)}
              </Text>
            </View>
            <PointMeta point={selection.point} t={t} />
          </View>

          <View style={styles.playbackControls}>
            <PlaybackButton
              icon="play-back"
              label={t("gpsHistory.previousPoint")}
              disabled={selection.isFirst}
              onPress={() => jumpTo(selection.index - 1)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              accessibilityState={{ disabled: model.routePoints.length < 2 }}
              disabled={model.routePoints.length < 2}
              onPress={togglePlayback}
              style={({ pressed }) => [
                styles.playButton,
                model.routePoints.length < 2 && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Icon name={playing ? "pause" : selection.isLast ? "refresh" : "play"} size={22} color={fieldTheme.color.onColor} />
              <Text style={styles.playButtonText}>{playLabel}</Text>
            </Pressable>
            <PlaybackButton
              icon="play-forward"
              label={t("gpsHistory.nextPoint")}
              disabled={selection.isLast}
              onPress={() => jumpTo(selection.index + 1)}
            />
          </View>
        </View>
      )}
    </View>
  )
}

function PlaybackButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: string
  label: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.playbackButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Icon name={icon} size={23} color={fieldTheme.color.primaryStrong} />
    </Pressable>
  )
}

function SummaryGrid({ data, tablet, t }: { data: GpsHistory; tablet: boolean; t: Translate }) {
  return (
    <View style={[styles.summaryGrid, tablet && styles.summaryGridTablet]}>
      <SummaryCard icon="walk-outline" value={`${data.distanceKm}`} label={t("gpsHistory.statKm")} tone="primary" />
      <SummaryCard icon="radio-outline" value={`${data.pointCount}`} label={t("gpsHistory.statPoints")} tone="success" />
      <SummaryCard
        icon="timer-outline"
        value={data.gpsIntervalSeconds ? `${data.gpsIntervalSeconds}s` : "—"}
        label={t("gpsHistory.statInterval")}
        tone="blue"
      />
    </View>
  )
}

function SummaryCard({ icon, value, label, tone }: {
  icon: string
  value: string
  label: string
  tone: "primary" | "success" | "blue"
}) {
  const color = tone === "success"
    ? fieldTheme.color.success
    : tone === "blue"
      ? fieldTheme.color.blue
      : fieldTheme.color.primary
  const background = tone === "success"
    ? fieldTheme.color.successSoft
    : tone === "blue"
      ? fieldTheme.color.blueSoft
      : fieldTheme.color.primarySoft
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: background }]}>
        <Icon name={icon} size={21} color={color} />
      </View>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function LoadNotice({ issue, t, onRetry }: { issue: Exclude<GpsLoadIssue, "none">; t: Translate; onRetry: () => void }) {
  const timeout = issue === "timeout"
  const offline = issue === "offline"
  const access = issue === "access"
  const title = offline
    ? t("gpsHistory.retainedOfflineTitle")
    : timeout
      ? t("gpsHistory.retainedTimeoutTitle")
      : access
        ? t("gpsHistory.accessTitle")
      : t("gpsHistory.retainedErrorTitle")
  const body = offline
    ? t("gpsHistory.retainedOfflineBody")
    : timeout
      ? t("gpsHistory.retainedTimeoutBody")
      : access
        ? t("gpsHistory.accessBody")
      : t("gpsHistory.retainedErrorBody")
  return (
    <View style={styles.loadNotice} accessibilityLiveRegion="polite">
      <Icon name={offline ? "cloud-offline-outline" : timeout ? "timer-outline" : "warning-outline"} size={22} color={fieldTheme.color.amber} />
      <View style={styles.loadNoticeCopy}>
        <Text style={styles.loadNoticeTitle}>{title}</Text>
        <Text style={styles.loadNoticeBody}>{body}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("gpsHistory.retry")} onPress={onRetry} style={styles.noticeRetry}>
        <Icon name="refresh" size={21} color={fieldTheme.color.amber} />
      </Pressable>
    </View>
  )
}

function FailureState({
  issue,
  refreshing,
  t,
  onRetry,
  onBack,
}: {
  issue: GpsLoadIssue
  refreshing: boolean
  t: Translate
  onRetry: () => void
  onBack: () => void
}) {
  const offline = issue === "offline"
  const timeout = issue === "timeout"
  const access = issue === "access"
  const title = offline
    ? t("gpsHistory.offlineTitle")
    : timeout
      ? t("gpsHistory.timeoutTitle")
      : access
        ? t("gpsHistory.accessTitle")
      : t("gpsHistory.errorTitle")
  const body = offline
    ? t("gpsHistory.offlineBody")
    : timeout
      ? t("gpsHistory.timeoutBody")
      : access
        ? t("gpsHistory.accessBody")
      : t("gpsHistory.errorBody")
  return (
    <View style={styles.failure} accessibilityLiveRegion="polite">
      <View style={styles.failureIcon}>
        <Icon name={offline ? "cloud-offline-outline" : timeout ? "timer-outline" : "warning-outline"} size={38} color={fieldTheme.color.amber} />
      </View>
      <Text style={styles.failureTitle}>{title}</Text>
      <Text style={styles.failureBody}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={access ? t("gpsHistory.back") : t("gpsHistory.retry")}
        disabled={refreshing}
        onPress={access ? onBack : onRetry}
        style={({ pressed }) => [styles.retryButton, refreshing && styles.disabled, pressed && styles.pressed]}
      >
        {refreshing ? (
          <ActivityIndicator color={fieldTheme.color.onColor} />
        ) : (
          <Icon name={access ? "arrow-back" : "refresh"} size={21} color={fieldTheme.color.onColor} />
        )}
        <Text style={styles.retryButtonText}>{access ? t("gpsHistory.back") : t("gpsHistory.retry")}</Text>
      </Pressable>
    </View>
  )
}

function EmptyHistory({ t }: { t: Translate }) {
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <View style={styles.emptyIconWrap}>
        <Icon name="location-outline" size={34} color={fieldTheme.color.primary} />
      </View>
      <Text style={styles.emptyTitle}>{t("gpsHistory.empty")}</Text>
      <Text style={styles.emptyBody}>{t("gpsHistory.emptyHelp")}</Text>
    </View>
  )
}

function PointMeta({ point, t }: { point: GpsPoint; t: Translate }) {
  const accuracy = accuracyTone(point.accuracy)
  return (
    <View style={styles.pointMeta}>
      {point.accuracy != null && (
        <View style={[styles.metaChip, { backgroundColor: accuracy.background }]}>
          <Icon name="locate-outline" size={14} color={accuracy.color} />
          <Text style={[styles.metaText, { color: accuracy.color }]}>{t("gpsHistory.accuracy", { value: Math.round(point.accuracy) })}</Text>
        </View>
      )}
      {point.speed != null && point.speed > 0 && (
        <View style={styles.metaChip}>
          <Icon name="speedometer-outline" size={14} color={fieldTheme.color.inkMuted} />
          <Text style={styles.metaText}>{t("gpsHistory.speed", { value: Math.round(point.speed) })}</Text>
        </View>
      )}
      {point.battery != null && (
        <View style={styles.metaChip}>
          <Icon name="battery-half-outline" size={14} color={fieldTheme.color.inkMuted} />
          <Text style={styles.metaText}>{t("gpsHistory.battery", { value: Math.round(point.battery) })}</Text>
        </View>
      )}
    </View>
  )
}

function PointRow({
  point,
  position,
  selected,
  language,
  timezone,
  t,
  onPress,
}: {
  point: GpsTimelinePoint
  position: number
  selected: boolean
  language: string
  timezone?: string
  t: Translate
  onPress: () => void
}) {
  const unavailable = point.playbackIndex == null
  const invalidTime = point.timestampMs == null
  const unavailableLabel = invalidTime ? t("gpsHistory.noRecordedTime") : t("gpsHistory.noCoordinate")
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("gpsHistory.timelinePoint", {
        number: position,
        time: formatGpsPointTime(point.recordedAt, language, timezone),
      })}
      accessibilityState={{ selected, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pointRow,
        selected && styles.pointRowSelected,
        unavailable && styles.pointRowUnavailable,
        pressed && styles.pointRowPressed,
      ]}
    >
      <View style={[styles.timelineDotWrap, selected && styles.timelineDotWrapSelected]}>
        {selected ? (
          <Icon name="navigate" size={16} color={fieldTheme.color.onColor} />
        ) : (
          <Text style={styles.timelineNumber}>{point.playbackIndex != null ? point.playbackIndex + 1 : "—"}</Text>
        )}
      </View>
      <View style={styles.pointContent}>
        <View style={styles.pointTitleRow}>
          <Text style={styles.pointTime}>{formatGpsPointTime(point.recordedAt, language, timezone)}</Text>
          {selected && <Text style={styles.selectedLabel}>{t("gpsHistory.selectedPoint")}</Text>}
        </View>
        {unavailable ? (
          <>
            <View style={styles.noCoordinateChip}>
              <Icon name={invalidTime ? "time-outline" : "alert-circle-outline"} size={14} color={fieldTheme.color.amber} />
              <Text style={styles.noCoordinateText}>{unavailableLabel}</Text>
            </View>
            <PointMeta point={point} t={t} />
          </>
        ) : (
          <PointMeta point={point} t={t} />
        )}
      </View>
      {!unavailable && <Icon name="chevron-forward" size={19} color={selected ? fieldTheme.color.primary : fieldTheme.color.border} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  header: { backgroundColor: fieldTheme.color.primaryStrong, paddingBottom: fieldTheme.space.lg, paddingHorizontal: fieldTheme.space.lg },
  headerInner: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md },
  backButton: { borderRadius: fieldTheme.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  titleCopy: { flex: 1 },
  eyebrow: { color: "#BBD6CB", fontSize: 12, lineHeight: 16, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  headerTitle: { color: fieldTheme.color.onColor, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 2 },
  headerSubtitle: { color: "#D7E9E1", fontSize: 14, lineHeight: 20, marginTop: fieldTheme.space.xs },
  dayNavigation: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, marginTop: fieldTheme.space.lg },
  navButton: { alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.12)" },
  dateCopy: { flex: 1, alignItems: "center" },
  dateLabel: { color: fieldTheme.color.onColor, fontSize: 16, lineHeight: 21, fontWeight: "800", textAlign: "center" },
  todayButton: { minHeight: 32, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, marginTop: 2 },
  todayText: { color: "#C7E6DA", fontSize: 12, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: fieldTheme.space.md },
  loadingText: { color: fieldTheme.color.inkMuted, fontSize: 14 },
  phoneList: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: fieldTheme.space.lg, paddingBottom: fieldTheme.space.xxl, flexGrow: 1 },
  tabletPage: { flex: 1, width: "100%", maxWidth: 1180, alignSelf: "center", padding: fieldTheme.space.lg },
  tabletColumns: { flex: 1, flexDirection: "row", gap: fieldTheme.space.lg },
  masterPanel: { width: 350, minWidth: 320, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.lg, overflow: "hidden" },
  detailPanel: { flex: 1 },
  detailPanelContent: { paddingBottom: fieldTheme.space.xxl },
  timelineListTablet: { padding: fieldTheme.space.md, paddingBottom: fieldTheme.space.xl, flexGrow: 1 },
  summaryGrid: { flexDirection: "row", gap: fieldTheme.space.sm },
  summaryGridTablet: { gap: fieldTheme.space.md },
  summaryCard: { flex: 1, minHeight: 108, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md },
  summaryIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summaryValue: { fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: fieldTheme.space.sm },
  summaryLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800", marginTop: 1 },
  explainer: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.primarySoft, borderRadius: fieldTheme.radius.md, marginTop: fieldTheme.space.md },
  explainerText: { flex: 1, color: fieldTheme.color.primaryStrong, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  coordinateNotice: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, backgroundColor: fieldTheme.color.amberSoft, borderRadius: fieldTheme.radius.md, marginTop: fieldTheme.space.md },
  coordinateNoticeText: { flex: 1, color: fieldTheme.color.amber, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  routeCard: { backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.lg, padding: fieldTheme.space.md, marginTop: fieldTheme.space.md },
  routeHeading: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, marginBottom: fieldTheme.space.md },
  routeHeadingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: fieldTheme.color.primarySoft },
  sectionIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: fieldTheme.color.primarySoft },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  sectionBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  routeVisual: { height: 260, borderRadius: fieldTheme.radius.md, overflow: "hidden", borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surfaceStrong },
  routeVisualTablet: { height: 380 },
  webView: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  noCoordinates: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.surfaceStrong },
  noCoordinatesTablet: { minHeight: 320 },
  noCoordinatesTitle: { color: fieldTheme.color.ink, fontSize: 16, lineHeight: 21, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.md },
  noCoordinatesBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 440, marginTop: fieldTheme.space.sm },
  playbackPanel: { marginTop: fieldTheme.space.md, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.canvas },
  playbackHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: fieldTheme.space.md },
  playbackEyebrow: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  currentTime: { color: fieldTheme.color.ink, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 2 },
  pointCounter: { minHeight: 32, justifyContent: "center", paddingHorizontal: fieldTheme.space.md, borderRadius: fieldTheme.radius.pill, backgroundColor: fieldTheme.color.primarySoft },
  pointCounterText: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "800" },
  playbackHint: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18, marginTop: fieldTheme.space.sm },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: fieldTheme.color.surfaceStrong, marginTop: fieldTheme.space.md },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: fieldTheme.color.coral },
  currentFacts: { marginTop: fieldTheme.space.md },
  currentCoordinate: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6 },
  currentCoordinateText: { flex: 1, color: fieldTheme.color.ink, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  playbackControls: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.md },
  playbackButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  playButton: { flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.coral },
  playButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  timelineHeader: { flexDirection: "row", alignItems: "flex-start", gap: fieldTheme.space.md, paddingTop: fieldTheme.space.lg, paddingBottom: fieldTheme.space.md },
  pointRow: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.md, backgroundColor: fieldTheme.color.surface, borderWidth: 1, borderColor: fieldTheme.color.border, borderRadius: fieldTheme.radius.md, padding: fieldTheme.space.md, marginBottom: fieldTheme.space.sm },
  pointRowSelected: { borderColor: fieldTheme.color.primary, backgroundColor: fieldTheme.color.primarySoft },
  pointRowUnavailable: { opacity: 0.72 },
  pointRowPressed: { transform: [{ scale: 0.99 }] },
  timelineDotWrap: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.surfaceStrong },
  timelineDotWrapSelected: { backgroundColor: fieldTheme.color.primary },
  timelineNumber: { color: fieldTheme.color.primaryStrong, fontSize: 12, fontWeight: "900" },
  pointContent: { flex: 1 },
  pointTitleRow: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  pointTime: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900" },
  selectedLabel: { color: fieldTheme.color.primaryStrong, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
  pointMeta: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  metaChip: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: fieldTheme.color.surfaceStrong, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm },
  metaText: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "700" },
  noCoordinateChip: { alignSelf: "flex-start", minHeight: 30, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: fieldTheme.color.amberSoft, borderRadius: fieldTheme.radius.pill, paddingHorizontal: fieldTheme.space.sm, marginTop: fieldTheme.space.sm },
  noCoordinateText: { color: fieldTheme.color.amber, fontSize: 11, fontWeight: "800" },
  loadNotice: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm, padding: fieldTheme.space.md, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.amberSoft, marginBottom: fieldTheme.space.md },
  loadNoticeCopy: { flex: 1 },
  loadNoticeTitle: { color: fieldTheme.color.amber, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  loadNoticeBody: { color: fieldTheme.color.amber, fontSize: 12, lineHeight: 17, marginTop: 2 },
  noticeRetry: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.sm, backgroundColor: "rgba(255,255,255,0.55)" },
  failureScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: fieldTheme.space.xl },
  failure: { width: "100%", maxWidth: 480, alignItems: "center", padding: fieldTheme.space.xl, borderRadius: fieldTheme.radius.lg, borderWidth: 1, borderColor: fieldTheme.color.border, backgroundColor: fieldTheme.color.surface },
  failureIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.amberSoft },
  failureTitle: { color: fieldTheme.color.ink, fontSize: 20, lineHeight: 26, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.lg },
  failureBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: fieldTheme.space.sm },
  retryButton: { minWidth: 190, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: fieldTheme.space.sm, borderRadius: fieldTheme.radius.md, backgroundColor: fieldTheme.color.primary, marginTop: fieldTheme.space.xl, paddingHorizontal: fieldTheme.space.lg },
  retryButtonText: { color: fieldTheme.color.onColor, fontSize: 15, fontWeight: "900" },
  emptyScroll: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: fieldTheme.space.lg, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 44 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.primarySoft },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 17, lineHeight: 22, fontWeight: "900", textAlign: "center", marginTop: fieldTheme.space.lg },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 440, marginTop: fieldTheme.space.sm },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.72 },
})
