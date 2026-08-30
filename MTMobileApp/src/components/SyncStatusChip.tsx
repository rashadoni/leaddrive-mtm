import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import Geolocation from "@react-native-community/geolocation"
import { api } from "../services/api"
import { getOfflineScope } from "../services/offline-scope"
import {
  acknowledgeOutboxOperation,
  conflictOutboxOperations,
  retryOutboxConflict,
  type OutboxOperation,
} from "../services/outbox"
import { hasRouteFieldAccess } from "../services/bootstrap"
import { refreshSyncStatusCounts, runMobileSync } from "../services/sync-engine"
import { useBootstrapStore } from "../store/bootstrap"
import { useSyncStatusStore, type SyncPipelineId, type SyncPipelineStatus } from "../store/sync-status"

type Props = {
  inverse?: boolean
}

function conflictCode(operation: OutboxOperation) {
  const code = operation.conflict?.serverData?.code
  return typeof code === "string" ? code : "SYNC_CONFLICT"
}

function conflictTranslationKey(code: string) {
  const known: Record<string, string> = {
    MTM_VISIT_OUT_OF_ZONE: "syncCenter.conflictOutOfZone",
    MTM_VISIT_FORCE_FORBIDDEN: "syncCenter.conflictForceForbidden",
    MTM_VISIT_ALREADY_ACTIVE: "syncCenter.conflictActiveVisit",
    MTM_ROUTE_POINT_NOT_AVAILABLE: "syncCenter.conflictRouteUnavailable",
    MTM_ROUTE_TARGET_MISMATCH: "syncCenter.conflictRouteMismatch",
    MTM_VISIT_CUSTOMER_NOT_FOUND: "syncCenter.conflictCustomerMissing",
    MTM_VISIT_REQUIREMENTS_INCOMPLETE: "syncCenter.conflictRequirements",
    MTM_VISIT_STATUS_INVALID: "syncCenter.conflictVisitStatus",
  }
  return known[code] ?? "syncCenter.conflictGeneric"
}

const PIPELINES: ReadonlyArray<{ id: SyncPipelineId; labelKey: string }> = [
  { id: "routeOutbox", labelKey: "syncCenter.pipelineRouteOutbox" },
  { id: "routePull", labelKey: "syncCenter.pipelineRoutePull" },
  { id: "routeV2Pull", labelKey: "syncCenter.pipelineRouteV2Pull" },
  { id: "media", labelKey: "syncCenter.pipelineMedia" },
]

function pipelineStatusLabel(
  pipeline: SyncPipelineStatus,
  locale: string,
  t: TFunction,
) {
  if (pipeline.phase === "syncing") return t("syncCenter.pipelineSyncing")
  if (pipeline.phase === "disabled") return t("syncCenter.pipelineDisabled")
  if (pipeline.phase === "error") return t("syncCenter.pipelineError")
  if (pipeline.phase === "backoff") {
    const retryAt = pipeline.retryAt
      ? new Date(pipeline.retryAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : null
    return retryAt
      ? t("syncCenter.pipelineBackoffAt", { value: retryAt })
      : t("syncCenter.pipelineBackoff")
  }
  return t("syncCenter.pipelineReady")
}

export default function SyncStatusChip({ inverse = false }: Props) {
  const { t, i18n } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<OutboxOperation[]>([])
  const routeFieldAccess = useBootstrapStore((state) => state.routeFieldAccess)
  const { phase, pending, mediaPending, lastSyncedAt, lastError, pipelines } = useSyncStatusStore()
  const syncAllowed = hasRouteFieldAccess(routeFieldAccess)

  const reload = useCallback(async () => {
    const scope = getOfflineScope()
    if (scope) await useSyncStatusStore.getState().hydrate(scope)
    const [, currentConflicts] = await Promise.all([
      refreshSyncStatusCounts(),
      conflictOutboxOperations(),
    ])
    setConflicts(currentConflicts)
  }, [])

  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  const outstanding = pending + mediaPending
  const label = useMemo(() => {
    if (phase === "syncing") return t("syncCenter.syncing")
    if (conflicts.length > 0) return t("syncCenter.conflictsShort", { n: conflicts.length })
    if (phase === "offline") return outstanding > 0
      ? t("syncCenter.offlinePending", { n: outstanding })
      : t("syncCenter.offline")
    if (outstanding > 0) return t("syncCenter.pendingShort", { n: outstanding })
    return t("syncCenter.synced")
  }, [conflicts.length, outstanding, phase, t])

  const syncNow = async () => {
    if (!syncAllowed) {
      setActionError(t("routeFieldAccess.syncBlocked"))
      return
    }
    setBusyId("sync")
    setActionError(null)
    try {
      await runMobileSync()
      await reload()
    } catch {
      setActionError(t("syncCenter.actionFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const retry = async (operation: OutboxOperation, force = false) => {
    if (!syncAllowed) {
      setActionError(t("routeFieldAccess.syncBlocked"))
      return
    }
    setBusyId(operation.operationId)
    setActionError(null)
    const refreshLocation = !force && conflictCode(operation) === "MTM_VISIT_OUT_OF_ZONE"
    try {
      let dataPatch: Record<string, unknown> | undefined = force ? { force: true } : undefined
      if (refreshLocation) {
        const position = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
          Geolocation.getCurrentPosition(
            (result) => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude }),
            reject,
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
          )
        })
        dataPatch = { checkInLat: position.latitude, checkInLng: position.longitude, force: false }
      }
      await retryOutboxConflict(operation.operationId, dataPatch)
      await runMobileSync()
      await reload()
    } catch {
      setActionError(t(refreshLocation ? "syncCenter.retryLocationFailed" : "syncCenter.actionFailed"))
    } finally {
      setBusyId(null)
    }
  }

  const discard = async (operation: OutboxOperation) => {
    setBusyId(operation.operationId)
    setActionError(null)
    try {
      await acknowledgeOutboxOperation(operation.operationId)
      await reload()
    } catch {
      setActionError(t("syncCenter.actionFailed"))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("syncCenter.open")}
        accessibilityHint={label}
        onPress={() => { setVisible(true); reload().catch(() => {}) }}
        style={({ pressed }) => [
          styles.chip,
          inverse ? styles.chipInverse : styles.chipDefault,
          conflicts.length > 0 && styles.chipConflict,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.chipIcon, inverse && styles.inverseText]}>
          {phase === "syncing" ? "↻" : conflicts.length > 0 ? "!" : phase === "offline" ? "○" : "✓"}
        </Text>
        <Text style={[styles.chipLabel, inverse && styles.inverseText]} numberOfLines={1}>{label}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.heading}>{t("syncCenter.title")}</Text>
                <Text style={styles.subtitle}>{t("syncCenter.subtitle")}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.summary}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{pending}</Text>
                <Text style={styles.metricLabel}>{t("syncCenter.pending")}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, conflicts.length > 0 && styles.danger]}>{conflicts.length}</Text>
                <Text style={styles.metricLabel}>{t("syncCenter.conflicts")}</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{mediaPending}</Text>
                <Text style={styles.metricLabel}>{t("syncCenter.media")}</Text>
              </View>
            </View>

            <Text style={styles.lastSync}>
              {lastSyncedAt
                ? t("syncCenter.lastSync", { value: new Date(lastSyncedAt).toLocaleString(i18n.language) })
                : t("syncCenter.neverSynced")}
            </Text>
            {lastError ? <Text style={styles.errorText}>{t("syncCenter.lastError", { value: lastError })}</Text> : null}
            {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

            <View style={styles.pipelineSection} accessibilityLabel={t("syncCenter.pipelines")}>
              <Text style={styles.pipelineHeading}>{t("syncCenter.pipelines")}</Text>
              {PIPELINES.map(({ id, labelKey }) => {
                const pipeline = pipelines[id]
                return (
                  <View key={id} style={styles.pipelineRow}>
                    <Text style={styles.pipelineName}>{t(labelKey)}</Text>
                    <Text style={[
                      styles.pipelineState,
                      pipeline.phase === "backoff" && styles.pipelineBackoff,
                      pipeline.phase === "error" && styles.pipelineError,
                    ]}>
                      {pipelineStatusLabel(pipeline, i18n.language, t)}
                    </Text>
                  </View>
                )
              })}
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {conflicts.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>✓</Text>
                  <Text style={styles.emptyTitle}>{t("syncCenter.noConflicts")}</Text>
                  <Text style={styles.emptyBody}>{t("syncCenter.noConflictsBody")}</Text>
                </View>
              ) : conflicts.map((operation) => {
                const code = conflictCode(operation)
                const operationBusy = busyId === operation.operationId
                const canForce = code === "MTM_VISIT_OUT_OF_ZONE"
                  && operation.entity === "visits"
                  && operation.op === "create"
                  && api.canForceCheckIn
                return (
                  <View key={operation.operationId} style={styles.conflictCard}>
                    <Text style={styles.conflictTitle}>{t(conflictTranslationKey(code))}</Text>
                    <Text style={styles.conflictCode}>{code}</Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={operationBusy || !syncAllowed}
                        onPress={() => { discard(operation).catch(() => {}) }}
                        style={[styles.secondaryButton, (operationBusy || !syncAllowed) && styles.disabled]}
                      >
                        <Text style={styles.secondaryText}>{t("syncCenter.discard")}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={operationBusy || !syncAllowed}
                        onPress={() => { retry(operation).catch(() => {}) }}
                        style={[styles.secondaryButton, (operationBusy || !syncAllowed) && styles.disabled]}
                      >
                        <Text style={styles.secondaryText}>{t("common.retry")}</Text>
                      </Pressable>
                      {canForce ? (
                        <Pressable
                          accessibilityRole="button"
                          disabled={operationBusy || !syncAllowed}
                          onPress={() => { retry(operation, true).catch(() => {}) }}
                          style={[styles.forceButton, (operationBusy || !syncAllowed) && styles.disabled]}
                        >
                          <Text style={styles.forceText}>{t("syncCenter.forceRetry")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )
              })}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busyId !== null || !syncAllowed }}
              disabled={busyId !== null || !syncAllowed}
              onPress={() => { syncNow().catch(() => {}) }}
              style={[styles.syncButton, (busyId !== null || !syncAllowed) && styles.disabled]}
            >
              {busyId === "sync" ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncText}>{t("syncCenter.syncNow")}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  chip: { minHeight: 44, maxWidth: 190, paddingHorizontal: 12, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1 },
  chipDefault: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  chipInverse: { backgroundColor: "rgba(255,255,255,0.13)", borderColor: "rgba(255,255,255,0.24)" },
  chipConflict: { backgroundColor: "#fff7ed", borderColor: "#fb923c" },
  chipIcon: { color: "#0f766e", fontSize: 15, fontWeight: "900" },
  chipLabel: { flexShrink: 1, color: "#334155", fontSize: 12, fontWeight: "800" },
  inverseText: { color: "#fff" },
  pressed: { opacity: 0.76 },
  overlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(15,23,42,0.56)", padding: 18 },
  sheet: { maxHeight: "88%", borderRadius: 22, backgroundColor: "#fff", padding: 20 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headingCopy: { flex: 1 },
  heading: { color: "#0f172a", fontSize: 21, fontWeight: "900" },
  subtitle: { marginTop: 4, color: "#64748b", fontSize: 13, lineHeight: 18 },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#f1f5f9" },
  closeText: { color: "#475569", fontSize: 28, lineHeight: 30 },
  summary: { marginTop: 18, flexDirection: "row", gap: 10 },
  metric: { flex: 1, minHeight: 70, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#f8fafc" },
  metricValue: { color: "#0f766e", fontSize: 22, fontWeight: "900" },
  metricLabel: { marginTop: 3, color: "#64748b", fontSize: 10, fontWeight: "700", textAlign: "center" },
  danger: { color: "#dc2626" },
  lastSync: { marginTop: 14, color: "#475569", fontSize: 12 },
  errorText: { marginTop: 6, color: "#b91c1c", fontSize: 12 },
  pipelineSection: { marginTop: 14, gap: 7 },
  pipelineHeading: { color: "#475569", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  pipelineRow: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#f8fafc", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pipelineName: { flex: 1, color: "#334155", fontSize: 12, fontWeight: "700" },
  pipelineState: { color: "#0f766e", fontSize: 11, fontWeight: "800", textAlign: "right" },
  pipelineBackoff: { color: "#b45309" },
  pipelineError: { color: "#b91c1c" },
  list: { flexGrow: 0, marginTop: 12 },
  listContent: { paddingBottom: 4, gap: 10 },
  empty: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 12 },
  emptyIcon: { color: "#0f766e", fontSize: 26, fontWeight: "900" },
  emptyTitle: { marginTop: 8, color: "#0f172a", fontSize: 15, fontWeight: "800" },
  emptyBody: { marginTop: 4, color: "#64748b", fontSize: 12, textAlign: "center", lineHeight: 17 },
  conflictCard: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed" },
  conflictTitle: { color: "#9a3412", fontSize: 14, fontWeight: "800" },
  conflictCode: { marginTop: 3, color: "#c2410c", fontSize: 10, fontWeight: "700" },
  conflictBody: { marginTop: 7, color: "#7c2d12", fontSize: 12, lineHeight: 17 },
  actionRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#fdba74" },
  secondaryText: { color: "#9a3412", fontSize: 12, fontWeight: "800" },
  forceButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 13, borderRadius: 12, backgroundColor: "#c2410c" },
  forceText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  syncButton: { minHeight: 50, marginTop: 16, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#0f766e" },
  syncText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.5 },
})
