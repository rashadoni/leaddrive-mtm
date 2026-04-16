import React, { useEffect, useRef } from 'react'
import { StatusBar, Platform, PermissionsAndroid, AppState, AppStateStatus } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AppNavigator from './src/navigation/AppNavigator'
import { useAuthStore } from './src/store/auth'
import { startTracking, stopTracking } from './src/services/location'
import { api } from './src/services/api'

// Ping interval — keeps agent "online" on server even without GPS fix
const PING_INTERVAL = 60_000 // 60 seconds

function AppContent() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      <AppNavigator />
    </SafeAreaProvider>
  )
}

export default function App() {
  return <AppContent />
}
