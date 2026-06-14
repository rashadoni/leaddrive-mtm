import React, { useEffect, useRef, useState } from 'react'
import { StatusBar, Platform, PermissionsAndroid, AppState, AppStateStatus, View, ActivityIndicator } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AppNavigator from './src/navigation/AppNavigator'
import { ErrorBoundary } from './src/components/ErrorBoundary'
import { useAuthStore } from './src/store/auth'
import { startTracking, stopTracking } from './src/services/location'
import { api } from './src/services/api'
import { initI18n } from './src/i18n'
import { initSentry } from './src/services/sentry'
import { version as APP_VERSION } from './package.json'

// M1-3: init Sentry at module-load (NOT inside useEffect) so the SDK is
// live before the first React commit — render-phase errors during initial
// mount get captured. Release format follows Sentry convention
// `<package>@<versionName>+<versionCode>`; versionCode is kept in sync
// with android/app/build.gradle by hand — bump together. Sentry dedupes
// builds by full release string, so the +5 suffix prevents two APKs
// with the same versionName but different versionCode (hotfix → rebuild)
// merging into one release row.
// TODO: read versionCode from native via react-native-device-info's
// getBuildNumber() if we ever forget to bump in lockstep.
const ANDROID_VERSION_CODE = 15
initSentry(`MTMobileApp@${APP_VERSION}+${ANDROID_VERSION_CODE}`)

// Ping interval — keeps agent "online" on server even without GPS fix
const PING_INTERVAL = 60_000 // 60 seconds

function AppContent() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Register the mid-session 401 → store-logout bridge once on mount.
  // Must be set before any authenticated request fires, so we do it here
  // (not inside checkAuth) to guarantee it's live even on the first call.
  // Callback pattern avoids a circular import (api.ts must not import store).
  useEffect(() => {
    api.setUnauthorizedHandler((reason) => {
      useAuthStore.getState().handleRevoked(reason ?? "REVOKED")
    })
  }, [])

  // Start GPS tracking + online ping when logged in
  useEffect(() => {
    console.warn("[APP] isLoggedIn changed:", isLoggedIn)
    if (!isLoggedIn) {
      console.warn("[APP] Not logged in, stopping tracking")
      stopTracking().catch(() => {})
      stopPing()
      return () => { stopTracking().catch(() => {}); stopPing() }
    }

    console.warn("[APP] Logged in! Requesting location permission...")
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]).then(async (results) => {
        console.warn("[APP] Location permission results:", JSON.stringify(results))
        if (results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted') {
          // Start tracking immediately — don't block on background permission
          console.warn("[APP] Starting GPS tracking (background service)...")
          await startTracking()

          // Request background location separately (non-blocking, Android 10+)
          if (Platform.Version >= 29) {
            PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: "Фоновое местоположение",
                message: "MTM нужен доступ к местоположению в фоне для отслеживания маршрутов. Выберите \"Разрешить всегда\".",
                buttonPositive: "Разрешить",
                buttonNegative: "Отмена",
              }
            ).then((r) => console.warn("[APP] Background location:", r))
             .catch((e) => console.warn("[APP] Background location error:", e))
          }
        } else {
          console.warn("[APP] Location permission DENIED — tracking not started")
        }
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).catch(() => {})
      }).catch((e) => console.warn("[APP] Permission request failed:", e))
    } else {
      startTracking()
    }

    // Start online ping (keeps agent visible on map even without fresh GPS)
    startPing()

    return () => { stopTracking().catch(() => {}); stopPing() }
  }, [isLoggedIn])

  // AppState listener — restart tracking when app returns from background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      console.warn(`[APP] AppState: ${appStateRef.current} → ${nextState}`)

      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground — ensure tracking is still running
        const loggedIn = useAuthStore.getState().isLoggedIn
        if (loggedIn) {
          console.warn("[APP] Returned to foreground, ensuring GPS tracking is running")
          // startTracking() is idempotent — won't duplicate if already running
          startTracking().catch(() => {})
          // Send immediate ping to update online status
          sendPing()
        }
      }

      appStateRef.current = nextState
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription?.remove()
  }, [])

  function startPing() {
    if (pingIntervalRef.current) return
    // Send ping immediately
    sendPing()
    pingIntervalRef.current = setInterval(sendPing, PING_INTERVAL)
  }

  function stopPing() {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }

  function sendPing() {
    api.ping().catch(() => {})
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#6C63FF" />
      {/* A render-phase throw in any screen (e.g. the first tab mounting
          right after login) would otherwise silently close the release app
          — "closes after login, reopen and it works". The boundary turns
          that into a recoverable screen + a Sentry capture. */}
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default function App() {
  // M1-1a: bootstrap i18n once before rendering anything that calls
  // useTranslation(). Shows a tiny splash while AsyncStorage + locale
  // detection resolve (typically <50ms). Sentry is already live —
  // initialized at module-load above, so first-render exceptions get
  // captured automatically.
  const [i18nReady, setI18nReady] = useState(false)
  useEffect(() => {
    initI18n()
      .then(() => setI18nReady(true))
      .catch((e) => {
        console.warn("[APP] i18n init failed, rendering anyway:", e)
        setI18nReady(true) // fail-open — show app in fallback (ru) instead of blocking
      })
  }, [])

  if (!i18nReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0B0B1E" }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    )
  }
  return <AppContent />
}
