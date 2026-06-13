import React from "react"
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native"
import { Sentry } from "../services/sentry"
import { i18n } from "../i18n"

/**
 * App-wide error boundary.
 *
 * Why this exists: a release build has NO redbox — an unhandled error thrown
 * during a screen's render (e.g. the first tab mounting right after login)
 * tears down the whole React tree and Android closes the app. The user then
 * reopens it and it works, because the second mount hits a different state.
 * That "app closes after login → reopen and it's fine" report is exactly this
 * class of bug. Wrapping the navigator converts a silent app-kill into a
 * recoverable screen AND ships the stack trace to Sentry (once a DSN is set;
 * until then it's still logged to logcat via console.error), so the next
 * occurrence is diagnosable instead of invisible.
 *
 * The boundary itself must never throw — it uses only primitive RN components
 * and reads strings through i18n.t with hardcoded defaults, so it renders even
 * if the locale bundle failed to load.
 */
interface Props {
  children: React.ReactNode
  /** Test seam — invoked with the caught error after Sentry capture. */
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  /** Bumped on retry to force a full remount of the child tree (clears any
   *  stuck navigator/store state — the "reopen fixes it" signal suggests the
   *  crash is transient/stale-state, so a clean remount is what actually helps;
   *  a deterministic throw will just surface the fallback again). */
  resetKey: number
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // logcat trail — survives even with no Sentry DSN
    console.error("[ErrorBoundary] caught render error:", error, info.componentStack)
    try {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    } catch {
      // never let crash-reporting crash the crash screen
    }
    this.props.onError?.(error, info)
  }

  handleReset = (): void => {
    this.setState(s => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }))
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

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {__DEV__ && this.state.error ? (
            <Text style={styles.detail}>{this.state.error.message}</Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={this.handleReset} accessibilityRole="button">
            <Text style={styles.buttonText}>{retry}</Text>
          </TouchableOpacity>
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
  detail: {
    fontSize: 12,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 20,
    fontFamily: "monospace",
  },
  button: {
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
})
