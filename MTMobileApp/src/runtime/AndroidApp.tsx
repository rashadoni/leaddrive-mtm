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
import { startTracking, stopTracking } from "../services/location.android"
import { api } from "../services/api"
import { flushOutbox } from "../services/outbox"
import { flushMediaOutbox, MediaOutboxItem } from "../services/media-outbox"
import { pullAndApplySync } from "../services/sync-cache"
import { i18n, initI18n } from "../i18n/index.android"
import { initSentry } from "../services/sentry"
import { canTrackFieldLocation } from "../auth/roles"
import { fieldTheme } from "../theme/fieldTheme"
import { version as APP_VERSION } from "../../package.json"

const ANDROID_VERSION_CODE = 23
const PING_INTERVAL = 60_000

initSentry(`MTMobileApp@${APP_VERSION}+${ANDROID_VERSION_CODE}`)

function AppContent() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const agent = useAuthStore((state) => state.agent)
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const mayTrack =
    isLoggedIn &&
    canTrackFieldLocation(agent?.role) &&
    workdayHydrated &&
    activeWorkday?.key === currentWorkdayKey

  const sendPing = useCallback(() => {
    api.ping().catch(() => {})
  }, [])

  const stopPing = useCallback(() => {
    if (!pingIntervalRef.current) return
    clearInterval(pingIntervalRef.current)
    pingIntervalRef.current = null
  }, [])

  const startPing = useCallback(() => {
    if (pingIntervalRef.current) return
    sendPing()
    pingIntervalRef.current = setInterval(sendPing, PING_INTERVAL)
  }, [sendPing])

  const flushPendingOperations = useCallback(() => {
    const auth = useAuthStore.getState()
    if (!auth.isLoggedIn || !auth.agent) return
    flushOutbox((operations) => api.syncPush(operations))
      .then(() => pullAndApplySync(auth.agent!.organizationId, auth.agent!.id, (since) => api.syncPull(since)))
      .catch(() => {})
    flushMediaOutbox((item: MediaOutboxItem) => api.uploadPhoto(item)).catch(() => {})
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

    if (!mayTrack) {
      stopTracking().catch(() => {})
      stopPing()
      return () => {
        stopTracking().catch(() => {})
        stopPing()
      }
    }

    if (Platform.OS === "android") {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ])
        .then(async (results) => {
          if (results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== "granted") return
          const auth = useAuthStore.getState()
          const workday = useWorkdayStore.getState()
          const latestKey = workdayKey(auth.agent?.organizationId, auth.agent?.id)
          if (
            cancelled ||
            !auth.isLoggedIn ||
            !canTrackFieldLocation(auth.agent?.role) ||
            workday.activeWorkday?.key !== latestKey
          ) {
            return
          }
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
      startTracking().catch(() => {})
    }

    startPing()
    return () => {
      cancelled = true
      stopTracking().catch(() => {})
      stopPing()
    }
  }, [mayTrack, startPing, stopPing])

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        flushPendingOperations()
        const auth = useAuthStore.getState()
        const workday = useWorkdayStore.getState()
        const latestKey = workdayKey(auth.agent?.organizationId, auth.agent?.id)
        if (auth.isLoggedIn && canTrackFieldLocation(auth.agent?.role) &&
            workday.activeWorkday?.key === latestKey) {
          startTracking().catch(() => {})
          sendPing()
        }
      }
      appStateRef.current = nextState
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange)
    return () => subscription.remove()
  }, [sendPing, flushPendingOperations])

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
