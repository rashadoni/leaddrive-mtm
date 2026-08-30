import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  StatusBar,
  StyleSheet,
  View,
} from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import NetInfo from "@react-native-community/netinfo"
import AppNavigatorAndroidV2 from "../navigation/AppNavigatorAndroidV2"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { useAuthStore } from "../store/auth"
import { useHintsStore } from "../store/hints"
import { useBootstrapStore } from "../store/bootstrap"
import { stopTracking } from "../services/location.android"
import { api } from "../services/api"
import { markMobileOffline, runMobileSync, withdrawRouteFieldV2ShadowState } from "../services/sync-engine"
import { initI18n } from "../i18n/index.android"
import { initSentry } from "../services/sentry"
import { hasRouteFieldAccess, isConfirmedRouteFieldWithdrawal } from "../services/bootstrap"
import { fieldTheme } from "../theme/fieldTheme"
import { ROUTE_FIELD_PROFILE } from "./route-field-profile"

initSentry(`${ROUTE_FIELD_PROFILE.sentryProject}@${ROUTE_FIELD_PROFILE.apkVersion}`)

function AppContent() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  const flushPendingOperations = useCallback(async () => {
    const auth = useAuthStore.getState()
    if (!auth.isLoggedIn || !auth.agent) return
    if (!hasRouteFieldAccess(useBootstrapStore.getState().routeFieldAccess)) return
    try {
      return await runMobileSync()
    } catch {
      // The durable v1 queue remains untouched and can retry after a later
      // server-confirmed Route Field bootstrap.
    }
  }, [])

  const refreshAdmissionAndSync = useCallback(async () => {
    const auth = useAuthStore.getState()
    if (!auth.isLoggedIn || !auth.agent) return
    const access = await useBootstrapStore.getState().fetchBootstrap()
    if (!hasRouteFieldAccess(access)) {
      // A network failure also resolves fail-closed as `unavailable`. Purge
      // only after a parsed server bootstrap confirms the withdrawal; a
      // transient offline state must not erase a recoverable shadow cache.
      const bootstrap = useBootstrapStore.getState().data
      if (isConfirmedRouteFieldWithdrawal(bootstrap, access)) {
        await withdrawRouteFieldV2ShadowState({
          tenantId: auth.agent.organizationId,
          agentId: auth.agent.id,
          reason: access === "disabled"
            ? "TENANT_CAPABILITY_DISABLED"
            : "ROUTE_FIELD_ADMISSION_UNAVAILABLE",
        })
      }
      return
    }
    await flushPendingOperations()
  }, [flushPendingOperations])

  useEffect(() => {
    // v3 deliberately retires the old HRM-workday-controlled background GPS
    // service. We stop an inherited v2 service at startup, but retain
    // foreground visit/location capture until a route-specific GPS contract is
    // approved server-first.
    stopTracking().catch(() => {})
    if (isLoggedIn) {
      refreshAdmissionAndSync().catch(() => {})
    }
  }, [isLoggedIn, refreshAdmissionAndSync])

  useEffect(() => {
    if (!isLoggedIn) return
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        refreshAdmissionAndSync().catch(() => {})
      } else if (state.isConnected === false || state.isInternetReachable === false) {
        markMobileOffline().catch(() => {})
      }
    })
    return unsubscribe
  }, [isLoggedIn, refreshAdmissionAndSync])

  useEffect(() => {
    api.setUnauthorizedHandler((reason) => {
      useAuthStore.getState().handleRevoked(reason ?? "REVOKED")
    })
  }, [])

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        refreshAdmissionAndSync().catch(() => {})
      }
      appStateRef.current = nextState
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange)
    return () => subscription.remove()
  }, [refreshAdmissionAndSync])

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={fieldTheme.color.primaryStrong} />
      <ErrorBoundary>
        <AppNavigatorAndroidV2 />
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default function AndroidApp() {
  const [i18nReady, setI18nReady] = useState(false)

  useEffect(() => {
    useHintsStore.getState().hydrate().catch(() => {})
    initI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true))
  }, [])

  if (!i18nReady) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={fieldTheme.color.onColor} />
      </View>
    )
  }

  return <AppContent />
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: fieldTheme.color.primaryStrong,
  },
})
