import React, { useEffect, useState } from "react"
import { ActivityIndicator, AppState, StatusBar, View } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import NetInfo from "@react-native-community/netinfo"
import Geolocation from "@react-native-community/geolocation"
import { ErrorBoundary } from "../components/ErrorBoundary"
import AppFeedbackHost from "../components/AppFeedbackHost"
import { api } from "../services/api"
import { initI18n } from "../i18n/index.android"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useHintsStore } from "../store/hints"
import { useSyncStatusStore } from "../store/sync-status"
import { hasOfficeAttendanceAccess } from "../services/attendance-access"
import { refreshAttendanceSession } from "../services/attendance-session"
import { startForegroundSyncRetry } from "../services/foreground-sync-retry"
import { followPhoneColorScheme } from "../services/follow-phone-color-scheme"
import { dismissAllChoices } from "../services/app-feedback"
import { checkTimeAppUpdate } from "../services/time-app-update"
import { fieldTheme, useFieldColorScheme } from "../theme/fieldTheme"
import AttendanceNavigator from "./AttendanceNavigator"
import { TimePresentationProvider } from "./ui/TimePresentation"

/** Separate entry point: no field runtime, GPS service, heartbeat or MTM updater. */
export default function AttendanceApp() {
  const [ready, setReady] = useState(false)
  const scheme = useFieldColorScheme()
  const { isLoggedIn, agent } = useAuthStore()
  const admitted = useBootstrapStore(state => hasOfficeAttendanceAccess(state.data, agent))
  useEffect(() => followPhoneColorScheme(), [])
  useEffect(() => {
    // Only the shared mark-time capture may request an OS location permission.
    Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: "android" })
    api.setUnauthorizedHandler(reason => useAuthStore.getState().handleRevoked(reason ?? "REVOKED"))
    let mounted = true
    void useHintsStore.getState().hydrate().catch(() => {})
    void initI18n().catch(() => {}).then(async () => {
      await useAuthStore.getState().checkAuth()
      if (mounted) setReady(true)
    })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (!ready) return
    let mounted = true
    let coldStart = true
    let previous = AppState.currentState
    const check = () => {
      if (AppState.currentState !== "active") return
      void checkTimeAppUpdate({ coldStart, isCurrent: () => mounted })
      coldStart = false
    }
    check()
    const lifecycle = AppState.addEventListener("change", next => {
      if (previous !== "active" && next === "active") check()
      previous = next
    })
    return () => { mounted = false; lifecycle.remove() }
  }, [ready])
  useEffect(() => {
    if (!isLoggedIn) { dismissAllChoices(); return }
    const refresh = () => { void refreshAttendanceSession().catch(() => {}) }
    refresh()
    const network = NetInfo.addEventListener(state => {
      const online = state.isConnected === false || state.isInternetReachable === false ? false : state.isConnected === true ? true : null
      useSyncStatusStore.getState().setOnline(online)
      // Loss of network must replace live admission with the bounded cache
      // before an offline action can be captured, including a long-lived app.
      if (online !== null) refresh()
    })
    const lifecycle = AppState.addEventListener("change", state => { if (state === "active") refresh() })
    return () => { network(); lifecycle.remove() }
  }, [isLoggedIn, agent?.organizationId, agent?.id])
  // A field login cannot start the generic field queue scheduler in this app.
  useEffect(() => admitted ? startForegroundSyncRetry() : undefined, [admitted])
  return <TimePresentationProvider><SafeAreaProvider>
    <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} backgroundColor={fieldTheme.color.canvas} />
    {ready ? <ErrorBoundary><AttendanceNavigator /></ErrorBoundary> :
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: fieldTheme.color.canvas }}><ActivityIndicator /></View>}
    <AppFeedbackHost />
  </SafeAreaProvider></TimePresentationProvider>
}
