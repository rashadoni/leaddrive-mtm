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
import { useWorkdayStore, workdayKey } from "../store/workday"
import { setTrackingWorkdayId, startTracking, stopTracking } from "../services/location.android"
import { api } from "../services/api"
import { markMobileOffline } from "../services/sync-engine"
import { initI18n } from "../i18n/index.android"
import { initSentry } from "../services/sentry"
import { refreshRouteFieldSession } from "../services/field-session"
import { fieldTheme } from "../theme/fieldTheme"
import { ROUTE_FIELD_PROFILE } from "./route-field-profile"

initSentry(`${ROUTE_FIELD_PROFILE.sentryProject}@${ROUTE_FIELD_PROFILE.apkVersion}`)

function AppContent() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const agent = useAuthStore((state) => state.agent)
  const activeWorkday = useWorkdayStore((state) => state.activeWorkday)
  const workdayHydrated = useWorkdayStore((state) => state.hydrated)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const currentWorkdayKey = workdayKey(agent?.organizationId, agent?.id)
  const activeWorkdayId = activeWorkday?.key === currentWorkdayKey &&
    activeWorkday.syncState === "CONFIRMED" &&
    !activeWorkday.paused
    ? activeWorkday.workdayId
    : null
  const mayTrack = isLoggedIn && agent?.role === "AGENT" && workdayHydrated && activeWorkdayId !== null

  const refreshAdmissionAndSync = useCallback(() => refreshRouteFieldSession(), [])

  useEffect(() => {
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

  const requestForegroundLocation = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true
    try {
      const [fineGranted, coarseGranted] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
      ])
      if (fineGranted || coarseGranted) return true
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ])
      return result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
        result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!mayTrack || !activeWorkdayId) {
      setTrackingWorkdayId(null)
      stopTracking().catch(() => {})
      return () => {
        cancelled = true
        setTrackingWorkdayId(null)
        stopTracking().catch(() => {})
      }
    }

    void (async () => {
      if (!await requestForegroundLocation() || cancelled) return
      const auth = useAuthStore.getState()
      const workday = useWorkdayStore.getState().activeWorkday
      const key = workdayKey(auth.agent?.organizationId, auth.agent?.id)
      const latestWorkdayId = auth.isLoggedIn && auth.agent?.role === "AGENT" &&
        workday?.key === key && workday.syncState === "CONFIRMED" && !workday.paused
        ? workday.workdayId
        : null
      if (!latestWorkdayId || cancelled) return

      setTrackingWorkdayId(latestWorkdayId)
      await startTracking()
      if (cancelled) {
        await stopTracking()
        return
      }
      if (Platform.OS === "android" && Number(Platform.Version) >= 29) {
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION).catch(() => {})
      }
    })().catch(() => {})

    return () => {
      cancelled = true
      setTrackingWorkdayId(null)
      stopTracking().catch(() => {})
    }
  }, [activeWorkdayId, mayTrack, requestForegroundLocation])

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
