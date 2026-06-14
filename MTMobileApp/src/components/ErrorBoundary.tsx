import React from "react"
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Sentry } from "../services/sentry"
import { i18n } from "../i18n"

/**
 * App-wide error boundary.
 *
 * Why this exists: a release build has NO redbox — an unhandled error thrown
 * during a screen's render tears down the whole React tree and Android closes
 * the app. This boundary catches JS RENDER-phase errors and turns a silent
 * app-kill into a recoverable screen.
 *
 * NOTE: it does NOT catch native crashes (e.g. the original "closes after
 * login" bug was a native NullPointerException in the geolocation library on
 * the Android main looper — fixed separately in services/location.ts; a JS
 * error boundary can never see a native crash). It remains a safety net for
 * the JS-render class of failure, and makes those crashes DIAGNOSABLE:
 *   - Sentry.captureException (once a DSN is set in services/sentry.ts)
 *   - console.error to logcat (needs the phone tethered)
 *   - the error is shown ON SCREEN behind a "Details" toggle — selectable so a
 *     field user with no DSN/logcat can long-press → copy → send it to us
 *   - persisted to AsyncStorage (@mtm_last_crash) so it survives the dismiss
 *
 * The boundary itself must never throw — it uses only primitive RN components
 * and reads strings through i18n.t with hardcoded defaults, so it renders even
 * if the locale bundle failed to load.
 */
const CRASH_KEY = "@mtm_last_crash"

interface Props {
  children: React.ReactNode
  /** Test seam — invoked with the caught error after Sentry capture. */
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  /** React component stack from componentDidCatch — the most useful clue for a
   *  render-phase crash (which screen threw). Held in state so the fallback can
   *  display it; getDerivedStateFromError only receives the error. */
  componentStack: string | null
  /** User toggled the technical detail open. Hidden by default so a normal
   *  field user sees a clean recovery screen, not a wall of stack trace. */
  showDetails: boolean
  /** Bumped on retry to force a full remount of the child tree (clears any
   *  stuck navigator/store state — the "reopen fixes it" signal suggests the
   *  crash is transient/stale-state, so a clean remount is what actually helps;
   *  a deterministic throw will just surface the fallback again). */
  resetKey: number
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null, showDetails: false, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // logcat trail — survives even with no Sentry DSN
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
    try {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    } catch {
      // never let crash-reporting crash the crash screen
    }
    // Persist the last crash so it's recoverable after dismiss / no DSN / no
    // logcat. Fire-and-forget; wrapped so a storage failure can't re-crash.
    try {
      void AsyncStorage.setItem(
        CRASH_KEY,
        JSON.stringify({
          message: error.message,
          stack: error.stack ?? null,
          componentStack: info.componentStack ?? null,
          at: new Date().toISOString(),
        }),
      ).catch(() => {})
    } catch {
      // ignore
    }
    this.props.onError?.(error, info)
  }

  handleReset = (): void => {
    this.setState(s => ({ hasError: false, error: null, componentStack: null, showDetails: false, resetKey: s.resetKey + 1 }))
  }

  toggleDetails = (): void => {
    this.setState(s => ({ showDetails: !s.showDetails }))
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      // keyed fragment: bumping resetKey on retry remounts the whole subtree
      return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>
    }

    const title = i18n.t("errorBoundary.title", { defaultValue: "Что-то пошло не так" })
    const body = i18n.t("errorBoundary.body", {
      defaultValue: "Произошла ошибка. Нажмите, чтобы попробовать снова.",
    })
    const retry = i18n.t("common.retry", { defaultValue: "Повторить" })
    const detailsLabel = i18n.t("errorBoundary.details", { defaultValue: "Подробности" })

    const detailText = [
      this.state.error?.message,
      this.state.componentStack?.trim(),
    ]
      .filter(Boolean)
      .join("\n\n")

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <TouchableOpacity testID="error-retry" style={styles.button} onPress={this.handleReset} accessibilityRole="button">
            <Text style={styles.buttonText}>{retry}</Text>
          </TouchableOpacity>

          {detailText ? (
            <TouchableOpacity testID="error-details-toggle" onPress={this.toggleDetails} accessibilityRole="button" style={styles.detailsToggle}>
              <Text style={styles.detailsToggleText}>{this.state.showDetails ? "▾ " : "▸ "}{detailsLabel}</Text>
            </TouchableOpacity>
          ) : null}

          {this.state.showDetails && detailText ? (
            // selectable → long-press to copy on Android (no clipboard pkg needed)
            <Text style={styles.detail} selectable>{detailText}</Text>
          ) : null}
        </ScrollView>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F9" },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "700", color: "#0B0B1E", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 20 },
  button: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  detailsToggle: { marginTop: 18, paddingVertical: 6 },
  detailsToggleText: { fontSize: 13, color: "#6C63FF", fontWeight: "600" },
  detail: {
    fontSize: 11,
    color: "#475569",
    marginTop: 8,
    fontFamily: "monospace",
    alignSelf: "stretch",
  },
})
