import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { WebView } from "react-native-webview"
import { useTranslation } from "react-i18next"
import { formatManagerEvidenceAge } from "../../services/manager-location-truth"
import { fieldTheme } from "../../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth } from "../../theme/layoutBreakpoints"
import { CARTO_TILE_WEBVIEW_ORIGINS } from "../maps/carto-tiles"
import {
  buildManagerLiveMapDocument,
  buildManagerLiveMapModel,
  resolveManagerLiveMapSelection,
  type ManagerLiveMapDocumentMarker,
  type ManagerLiveMapMarker,
  type ManagerLiveMapRow,
} from "./manager-live-map"

interface ManagerLiveMapProps {
  rows: ManagerLiveMapRow[]
  loading: boolean
  loadError: boolean
}

function formatTimestamp(value: string | null, language: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleString(language, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function evidenceAgeLabel(ageMs: number | null, t: any): string {
  const age = formatManagerEvidenceAge(ageMs)
  if (!age) return t("managerShell.timeUnknown", { defaultValue: "Time unknown" })
  const key = age.unit === "minute"
    ? "managerShell.minutesAgo"
    : age.unit === "hour"
      ? "managerShell.hoursAgo"
      : "managerShell.daysAgo"
  return t(key, {
    count: age.value,
    defaultValue: `${age.value} ${age.unit}${age.value === 1 ? "" : "s"} ago`,
  })
}

function markerStatusLabel(marker: ManagerLiveMapMarker, t: any): string {
  const presence = t(marker.isOnline ? "managerShell.online" : "managerShell.offline", {
    defaultValue: marker.isOnline ? "Online" : "Offline",
  })
  if (marker.status === "CURRENT") {
    return `${t("managerShell.currentPosition", { defaultValue: "Current position" })} · ${presence}`
  }
  const location = t("managerShell.lastKnownPosition", { defaultValue: "Last known position" })
  if (marker.status === "STALE") {
    return `${location} · ${t("managerShell.gpsStale", { defaultValue: "Old GPS point" })} · ${presence}`
  }
  if (!marker.isOnline) {
    return `${location} · ${presence}`
  }
  return `${location} · ${t("managerShell.gpsDelayed", { defaultValue: "GPS is delayed" })} · ${presence}`
}

function markerTone(marker: ManagerLiveMapMarker) {
  if (marker.status === "CURRENT") {
    return { color: fieldTheme.color.success, tint: fieldTheme.color.successSoft, icon: "locate" }
  }
  if (marker.status === "STALE") {
    return { color: fieldTheme.color.amber, tint: fieldTheme.color.amberSoft, icon: "time-outline" }
  }
  return { color: fieldTheme.color.blue, tint: fieldTheme.color.blueSoft, icon: "location-outline" }
}

export default function ManagerLiveMap({ rows, loading, loadError }: ManagerLiveMapProps) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const tablet = isTabletWidth(width)
  const expandedTablet = isExpandedTabletWidth(width)
  const model = useMemo(() => buildManagerLiveMapModel(rows), [rows])
  const webViewRef = useRef<any>(null)
  const [visualError, setVisualError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const documentMarkers = useMemo<ManagerLiveMapDocumentMarker[]>(() => model.markers.map((marker) => ({
    ...marker,
    statusLabel: markerStatusLabel(marker, t),
    ageLabel: evidenceAgeLabel(marker.locationAgeMs, t),
  })), [model.markers, t])

  const mapDocument = useMemo(() => buildManagerLiveMapDocument(documentMarkers, {
    languageCode: i18n.language,
    accessibilityLabel: t("managerShell.liveMapAccessibility", { defaultValue: "Team location overview" }),
    tapHint: t("managerShell.liveMapTapHint", { defaultValue: "Tap a marker to see its employee and evidence age." }),
    zoomIn: t("managerShell.liveMapZoomIn", { defaultValue: "Zoom in" }),
    zoomOut: t("managerShell.liveMapZoomOut", { defaultValue: "Zoom out" }),
    fit: t("managerShell.liveMapFit", { defaultValue: "Show all employees" }),
    mapLoading: t("managerShell.liveMapLoading", { defaultValue: "Loading map…" }),
    mapUnavailable: t("managerShell.liveMapTilesUnavailable", { defaultValue: "Map tiles are unavailable. Server GPS markers remain visible." }),
    mapAttribution: t("managerShell.liveMapAttribution", { defaultValue: "© OpenStreetMap · © CARTO" }),
  }), [documentMarkers, i18n.language, t])
  const webViewSource = useMemo(() => ({ html: mapDocument, baseUrl: "about:blank" }), [mapDocument])

  useEffect(() => {
    setVisualError(false)
    setSelectedId((current) => resolveManagerLiveMapSelection(model.markers, current))
  }, [mapDocument, model.markers])

  const selectedMarker = useMemo(
    () => model.markers.find((marker) => marker.id === selectedId) ?? null,
    [model.markers, selectedId],
  )

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data)
      if (payload?.type === "marker" && typeof payload.id === "string") {
        setSelectedId(payload.id)
      }
    } catch {
      // Ignore malformed WebView messages. They are not location evidence.
    }
  }, [])

  const selectMarker = useCallback((id: string) => {
    setSelectedId(id)
    webViewRef.current?.injectJavaScript(
      `window.__selectManagerMarker && window.__selectManagerMarker(${JSON.stringify(id)}); true;`,
    )
  }, [])

  const mapHeight = expandedTablet ? 520 : tablet ? 440 : 360

  return (
    <View style={styles.section}>
      <View style={[styles.heading, tablet && styles.headingTablet]}>
        <View style={styles.headingIcon}>
          <Icon name="map" size={23} color={fieldTheme.color.onColor} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t("managerShell.liveMapEyebrow", { defaultValue: "One team · one view" })}</Text>
          <Text style={styles.title}>{t("managerShell.liveMapTitle", { defaultValue: "Live team map" })}</Text>
          <Text style={styles.body}>{t("managerShell.liveMapBody", { defaultValue: "Only server-accepted employee coordinates are shown. Green is current; every other marker is explicitly last known." })}</Text>
        </View>
        <View style={[styles.counts, tablet && styles.countsTablet]}>
          <MapCount color={fieldTheme.color.success} value={model.currentCount} label={t("managerShell.liveMapCurrent", { defaultValue: "Current" })} />
          <MapCount color={fieldTheme.color.blue} value={model.lastKnownCount} label={t("managerShell.liveMapLastKnown", { defaultValue: "Last known" })} />
          <MapCount color={fieldTheme.color.inkMuted} value={model.noCoordinatesCount} label={t("managerShell.liveMapNoCoordinates", { defaultValue: "No GPS" })} />
        </View>
      </View>

      {loadError && model.markers.length > 0 ? (
        <MapNotice
          icon="cloud-offline-outline"
          color={fieldTheme.color.amber}
          tint={fieldTheme.color.amberSoft}
          title={t("managerShell.liveMapSnapshotPreserved", { defaultValue: "Showing the last loaded team map" })}
          body={t("managerShell.liveMapSnapshotPreservedBody", { defaultValue: "It may be outdated. Refresh after the connection returns before treating a marker as current." })}
        />
      ) : null}

      {model.markers.length > 0 ? (
        <View style={styles.evidenceSection}>
          <View style={styles.evidenceHeading}>
            <View style={styles.evidenceHeadingIcon}>
              <Icon name="cloud-done-outline" size={20} color={fieldTheme.color.primary} />
            </View>
            <View style={styles.evidenceHeadingCopy}>
              <Text style={styles.evidenceTitle}>{t("managerShell.liveMapEvidenceTitle", { defaultValue: "Employees shown on the map" })}</Text>
              <Text style={styles.evidenceBody}>{t("managerShell.liveMapEvidenceBody", { defaultValue: "Every card identifies a server-accepted GPS point. Tap a card or its marker for details." })}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.evidenceRail}
          >
            {model.markers.map((marker) => (
              <EvidenceMarkerCard
                key={marker.id}
                marker={marker}
                language={i18n.language}
                selected={marker.id === selectedId}
                onPress={() => selectMarker(marker.id)}
                t={t}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {model.markers.length === 0 ? (
        <View style={[styles.empty, tablet && styles.emptyTablet]}>
          {loading ? <ActivityIndicator color={fieldTheme.color.primary} size="large" /> : <Icon name={loadError ? "cloud-offline-outline" : "location-outline"} size={40} color={loadError ? fieldTheme.color.amber : fieldTheme.color.primary} />}
          <Text style={styles.emptyTitle}>
            {loading
              ? t("common.loading")
              : loadError
                ? t("managerShell.liveMapUnavailable", { defaultValue: "The team map could not be loaded" })
                : t("managerShell.liveMapEmpty", { defaultValue: "No employee coordinates yet" })}
          </Text>
          <Text style={styles.emptyBody}>
            {loadError
              ? t("managerShell.liveMapUnavailableBody", { defaultValue: "No marker is guessed or replaced with this device's location. Refresh when the connection returns." })
              : t("managerShell.liveMapEmptyBody", { defaultValue: "Employees appear here only after the server accepts their GPS position." })}
          </Text>
        </View>
      ) : visualError ? (
        <View style={[styles.empty, tablet && styles.emptyTablet]}>
          <Icon name="warning-outline" size={40} color={fieldTheme.color.amber} />
          <Text style={styles.emptyTitle}>{t("managerShell.liveMapUnavailable", { defaultValue: "The team map could not be displayed" })}</Text>
          <Text style={styles.emptyBody}>{t("managerShell.liveMapUnavailableBody", { defaultValue: "Employee evidence remains available in the cards below. No substitute coordinates are shown." })}</Text>
        </View>
      ) : (
        <View style={[styles.mapFrame, { height: mapHeight }]}>
          <WebView
            ref={webViewRef}
            source={webViewSource}
            originWhitelist={CARTO_TILE_WEBVIEW_ORIGINS}
            javaScriptEnabled
            domStorageEnabled={false}
            cacheEnabled
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
            onMessage={onMessage}
            onLoadEnd={() => {
              if (selectedId) selectMarker(selectedId)
            }}
            onError={() => setVisualError(true)}
            accessibilityLabel={t("managerShell.liveMapAccessibility", { defaultValue: "Team location overview" })}
            style={styles.webView}
          />
        </View>
      )}

      {model.markers.length > 0 ? (
        <View style={styles.legend}>
          <LegendItem color={fieldTheme.color.success} label={t("managerShell.liveMapCurrentLegend", { defaultValue: "Current: online and GPS fresh" })} />
          <LegendItem color={fieldTheme.color.blue} label={t("managerShell.liveMapLastKnownLegend", { defaultValue: "Last known: offline or delayed" })} />
          <LegendItem color={fieldTheme.color.amber} label={t("managerShell.liveMapStaleLegend", { defaultValue: "Last known: old GPS point" })} />
        </View>
      ) : null}

      {selectedMarker ? <SelectedMarker marker={selectedMarker} language={i18n.language} t={t} /> : null}

      {model.noCoordinatesCount > 0 ? (
        <View style={styles.noCoordinatesNote}>
          <Icon name="eye-off-outline" size={19} color={fieldTheme.color.inkMuted} />
          <Text style={styles.noCoordinatesText}>
            {t("managerShell.liveMapNoCoordinatesBody", {
              count: model.noCoordinatesCount,
              defaultValue: "{{count}} employees are omitted from the map because the server has no accepted coordinates.",
            })}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function MapCount({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <View style={styles.count}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  )
}

function EvidenceMarkerCard({
  marker,
  language,
  selected,
  onPress,
  t,
}: {
  marker: ManagerLiveMapMarker
  language: string
  selected: boolean
  onPress: () => void
  t: any
}) {
  const tone = markerTone(marker)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${marker.name}. ${markerStatusLabel(marker, t)}. ${evidenceAgeLabel(marker.locationAgeMs, t)}`}
      accessibilityHint={t("managerShell.liveMapEvidenceHint", { defaultValue: "Show this employee on the map" })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.evidenceCard,
        { borderColor: selected ? tone.color : fieldTheme.color.border },
        selected && { backgroundColor: tone.tint },
        pressed && styles.evidenceCardPressed,
      ]}
    >
      <View style={[styles.evidenceMarker, { backgroundColor: tone.color }]}>
        <Text style={styles.evidenceInitials}>{marker.initials}</Text>
      </View>
      <View style={styles.evidenceCardCopy}>
        <Text style={styles.evidenceName} numberOfLines={1}>{marker.name}</Text>
        <Text style={[styles.evidenceStatus, { color: tone.color }]} numberOfLines={2}>{markerStatusLabel(marker, t)}</Text>
        <View style={styles.evidenceMetaRow}>
          <Icon name="cloud-done-outline" size={14} color={fieldTheme.color.inkMuted} />
          <Text style={styles.evidenceMeta} numberOfLines={1}>
            {t("managerShell.liveMapServerEvidence", { defaultValue: "Accepted by server" })} · {evidenceAgeLabel(marker.locationAgeMs, t)}
          </Text>
        </View>
        <Text style={styles.evidenceTimestamp} numberOfLines={1}>{formatTimestamp(marker.recordedAt, language)}</Text>
      </View>
      <Icon name={selected ? "checkmark-circle" : "chevron-forward"} size={21} color={selected ? tone.color : fieldTheme.color.inkMuted} />
    </Pressable>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  )
}

function MapNotice({ icon, color, tint, title, body }: { icon: string; color: string; tint: string; title: string; body: string }) {
  return (
    <View style={[styles.notice, { backgroundColor: tint, borderColor: color }]}>
      <Icon name={icon} size={21} color={color} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  )
}

function SelectedMarker({ marker, language, t }: { marker: ManagerLiveMapMarker; language: string; t: any }) {
  const tone = markerTone(marker)
  const status = markerStatusLabel(marker, t)
  return (
    <View style={[styles.selected, { backgroundColor: tone.tint, borderColor: tone.color }]} accessibilityLiveRegion="polite">
      <View style={[styles.selectedIcon, { backgroundColor: tone.color }]}>
        <Icon name={tone.icon} size={21} color={fieldTheme.color.onColor} />
      </View>
      <View style={styles.selectedCopy}>
        <Text style={styles.selectedEyebrow}>{t("managerShell.liveMapSelected", { defaultValue: "Selected employee" })}</Text>
        <Text style={styles.selectedName}>{marker.name}</Text>
        <Text style={[styles.selectedStatus, { color: tone.color }]}>{status}</Text>
        <Text style={styles.selectedMeta}>
          {t(marker.status === "CURRENT" ? "managerShell.positionReceived" : "managerShell.historicalPositionReceived", {
            defaultValue: marker.status === "CURRENT" ? "Received {{age}}" : "Historical point from {{age}}",
            age: evidenceAgeLabel(marker.locationAgeMs, t),
          })}
          {marker.recordedAt ? ` · ${formatTimestamp(marker.recordedAt, language)}` : ""}
          {marker.accuracy == null ? "" : ` · ±${Math.round(marker.accuracy)} m`}
        </Text>
        <View style={[styles.presence, { backgroundColor: marker.isOnline ? fieldTheme.color.successSoft : fieldTheme.color.surfaceStrong }]}>
          <View style={[styles.presenceDot, { backgroundColor: marker.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]} />
          <Text style={[styles.presenceText, { color: marker.isOnline ? fieldTheme.color.success : fieldTheme.color.inkMuted }]}>
            {t(marker.isOnline ? "managerShell.online" : "managerShell.offline", { defaultValue: marker.isOnline ? "Online" : "Offline" })}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  heading: { gap: fieldTheme.space.md },
  headingTablet: { flexDirection: "row", alignItems: "center" },
  headingIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: fieldTheme.color.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  title: { color: fieldTheme.color.ink, fontSize: 21, lineHeight: 26, fontWeight: "900" },
  body: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, maxWidth: 680 },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.sm },
  countsTablet: { maxWidth: 390, justifyContent: "flex-end" },
  evidenceSection: {
    gap: fieldTheme.space.sm,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.canvas,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  evidenceHeading: { flexDirection: "row", alignItems: "center", gap: fieldTheme.space.sm },
  evidenceHeadingIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: fieldTheme.radius.sm,
    backgroundColor: fieldTheme.color.primarySoft,
  },
  evidenceHeadingCopy: { flex: 1, gap: 2 },
  evidenceTitle: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  evidenceBody: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  evidenceRail: { gap: fieldTheme.space.sm, paddingVertical: 2, paddingRight: fieldTheme.space.sm },
  evidenceCard: {
    width: 276,
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 2,
    backgroundColor: fieldTheme.color.surface,
  },
  evidenceCardPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  evidenceMarker: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 3,
    borderColor: fieldTheme.color.surface,
  },
  evidenceInitials: { color: fieldTheme.color.onColor, fontSize: 12, fontWeight: "900" },
  evidenceCardCopy: { flex: 1, gap: 2 },
  evidenceName: { color: fieldTheme.color.ink, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  evidenceStatus: { fontSize: 11, lineHeight: 15, fontWeight: "800" },
  evidenceMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  evidenceMeta: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  evidenceTimestamp: { color: fieldTheme.color.inkMuted, fontSize: 10, lineHeight: 14 },
  count: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: fieldTheme.radius.pill,
    backgroundColor: fieldTheme.color.canvas,
  },
  dot: { width: 8, height: 8, borderRadius: fieldTheme.radius.pill },
  countValue: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "900" },
  countLabel: { color: fieldTheme.color.inkMuted, fontSize: 11, fontWeight: "800" },
  mapFrame: {
    minHeight: 320,
    overflow: "hidden",
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.surfaceStrong,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  webView: { flex: 1, backgroundColor: fieldTheme.color.surfaceStrong },
  empty: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    padding: fieldTheme.space.xl,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.canvas,
  },
  emptyTablet: { minHeight: 390 },
  emptyTitle: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900", textAlign: "center" },
  emptyBody: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19, maxWidth: 520, textAlign: "center" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: fieldTheme.space.md },
  legendItem: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 7 },
  legendDot: { width: 11, height: 11, borderRadius: fieldTheme.radius.pill, borderWidth: 2, borderColor: fieldTheme.color.surface },
  legendText: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  notice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
  },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, fontWeight: "900" },
  noticeBody: { color: fieldTheme.color.ink, fontSize: 12, lineHeight: 17 },
  selected: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.md,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
  },
  selectedIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: fieldTheme.radius.md },
  selectedCopy: { flex: 1, gap: 2 },
  selectedEyebrow: { color: fieldTheme.color.inkMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  selectedName: { color: fieldTheme.color.ink, fontSize: 16, fontWeight: "900" },
  selectedStatus: { fontSize: 12, lineHeight: 17, fontWeight: "900" },
  selectedMeta: { color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
  presence: { minHeight: 34, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: fieldTheme.radius.pill },
  presenceDot: { width: 8, height: 8, borderRadius: fieldTheme.radius.pill },
  presenceText: { fontSize: 10, fontWeight: "900" },
  noCoordinatesNote: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
  },
  noCoordinatesText: { flex: 1, color: fieldTheme.color.inkMuted, fontSize: 11, lineHeight: 16 },
})
