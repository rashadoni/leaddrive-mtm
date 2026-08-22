import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  Platform,
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
import { useDashboardLayoutStore } from "../store/dashboard-layout"
import { useWorkdayStore, workdayKey } from "../store/workday"
import { useBootstrapStore } from "../store/bootstrap"
import { setTrackingWorkdayId, startTracking, stopTracking } from "../services/location.android"
import { api } from "../services/api"
import { markMobileOffline, runMobileSync } from "../services/sync-engine"
import { i18n, initI18n } from "../i18n/index.android"
import { initSentry } from "../services/sentry"
import { canExecuteFieldWork, canTrackFieldLocation } from "../auth/roles"
import { fieldTheme } from "../theme/fieldTheme"
import { version as APP_VERSION } from "../../package.json"

const ANDROID_VERSION_CODE = 29
initSentry(`MTMobileApp@${APP_VERSION}+${ANDROID_VERSION_CODE}`)

function AppContent() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const agent = useAuthStore((state) => state.agent)
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const activeWorkdayId = activeWorkday?.key === currentWorkdayKey
    ? activeWorkday.workdayId
    : null
  const mayTrack =
    isLoggedIn &&
    canTrackFieldLocation(agent?.role) &&
    workdayHydrated &&
    activeWorkdayId !== null

  const flushPendingOperations = useCallback(async () => {
    const auth = useAuthStore.getState()
    if (!auth.isLoggedIn || !auth.agent || !canExecuteFieldWork(auth.agent.role)) return
    try {
      await runMobileSync()
    } catch {
      // The outbox remains queued and will retry on the next connection/app
      // foreground event. GPS tracking may still start locally for offline
      // capture, but it cannot fabricate an online map status.
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      flushPendingOperations()
      useBootstrapStore.getState().fetchBootstrap()
    }
  }, [isLoggedIn, flushPendingOperations])

  useEffect(() => {
    if (!isLoggedIn) return
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        flushPendingOperations()
      } else if (state.isConnected === false || state.isInternetReachable === false) {
        markMobileOffline().catch(() => {})
      }
    })
    return unsubscribe
  }, [isLoggedIn, flushPendingOperations])

  useEffect(() => {
    api.setUnauthorizedHandler((reason) => {
      useAuthStore.getState().handleRevoked(reason ?? "REVOKED")
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!mayTrack || !activeWorkdayId) {
      setTrackingWorkdayId(null)
      stopTracking().catch(() => {})
      // `end()` clears local state straight after queuing FINISH. Flush here
      // as well as on start so an online user disappears from the live map
      // immediately instead of waiting for a foreground/network event.
      if (isLoggedIn) void flushPendingOperations()
      return () => {
        setTrackingWorkdayId(null)
        stopTracking().catch(() => {})
      }
    }

    if (Platform.OS === "android") {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ])
        .then(async (results) => {
          if (results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== "granted") return
          // Send START/FINISH straight away before emitting GPS. This closes a
          // race where the first coordinate was rejected because the workday
          // had only been queued locally a moment earlier.
          await flushPendingOperations()
          const auth = useAuthStore.getState()
          const workday = useWorkdayStore.getState()
          const latestKey = workdayKey(auth.agent?.organizationId, auth.agent?.id)
          const latestWorkdayId = workday.activeWorkday?.key === latestKey
            ? workday.activeWorkday.workdayId
            : null
          if (
            cancelled ||
            !auth.isLoggedIn ||
            !canTrackFieldLocation(auth.agent?.role) ||
            !latestWorkdayId
          ) {
            return
          }
          setTrackingWorkdayId(latestWorkdayId)
          await startTracking()
          if (cancelled) {
            await stopTracking()
            return
          }
          if (Number(Platform.Version) >= 29) {
            PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: i18n.t("mobilePermission.backgroundLocationTitle"),
                message: i18n.t("mobilePermission.backgroundLocationBody"),
                buttonPositive: i18n.t("permission.allow"),
                buttonNegative: i18n.t("common.cancel"),
              }
            ).catch(() => {})
          }
          PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).catch(() => {})
        })
        .catch(() => {})
    } else {
      setTrackingWorkdayId(activeWorkdayId)
      startTracking().catch(() => {})
    }

    return () => {
      cancelled = true
      setTrackingWorkdayId(null)
      stopTracking().catch(() => {})
    }
  }, [activeWorkdayId, flushPendingOperations, isLoggedIn, mayTrack])

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        void (async () => {
          await flushPendingOperations()
          const auth = useAuthStore.getState()
          const workday = useWorkdayStore.getState()
          const latestKey = workdayKey(auth.agent?.organizationId, auth.agent?.id)
          const latestWorkdayId = workday.activeWorkday?.key === latestKey
            ? workday.activeWorkday.workdayId
            : null
          if (auth.isLoggedIn && canTrackFieldLocation(auth.agent?.role) && latestWorkdayId) {
            setTrackingWorkdayId(latestWorkdayId)
            startTracking().catch(() => {})
          }
        })()
      }
      appStateRef.current = nextState
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange)
    return () => subscription.remove()
  }, [flushPendingOperations])

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
    useDashboardLayoutStore.getState().hydrate().catch(() => {})
    useWorkdayStore.getState().hydrate().catch(() => {})
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
