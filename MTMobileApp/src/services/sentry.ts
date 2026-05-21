/**
 * M1-3 — Sentry wrapper. Thin layer over @sentry/react-native:
 *   - `initSentry(release)` reads the build-time DSN constant + __DEV__
 *     to pick environment, builds config via the pure helper, and calls
 *     Sentry.init. Returns true if init happened, false if skipped.
 *   - `setAgentContext` attaches agent + org as scope tags after login.
 *   - `clearAgentContext` wipes them on logout.
 *
 * Why a wrapper:
 *   1. Keep `buildSentryConfig` testable in jest without mocking the
 *      native bridge.
 *   2. Single seam to mute Sentry entirely if Mars asks for offline-
 *      only operation (set DSN="").
 *   3. Concentrate the PII boundary — Sentry capture calls everywhere
 *      else just use the SDK directly, but ID propagation lives here.
 */
import * as Sentry from "@sentry/react-native"
import { buildSentryConfig } from "./sentry-config"

// TODO(deploy): replace with real DSN OR wire `react-native-config` to
// load from `.env` at build time. Empty string = init silently skipped
// on development. On production builds (`__DEV__ === false`) the empty
// string now triggers a console.warn — visible in logcat — so a release
// that forgot to set DSN is caught before QA leaves the building.
const DSN: string = ""

// __DEV__ is the standard RN flag — true on metro/JS-dev, false on
// release builds. Production / staging differentiation is determined
// at build time by tooling that should override DSN per environment.
const ENV: string = typeof __DEV__ !== "undefined" && __DEV__ ? "development" : "production"

let initialized = false

export function initSentry(release: string): boolean {
  if (initialized) return true
  const config = buildSentryConfig({ dsn: DSN, environment: ENV, release })
  if (!config) {
    // Loud-on-production warn so a release without DSN is visible in
    // logcat. Dev / metro builds get a quiet log.
    if (ENV === "production") {
      console.warn(
        "[Sentry] DSN not set on production build — crashes WILL NOT report. Set in src/services/sentry.ts before release.",
      )
    } else {
      console.log("[Sentry] DSN not set — crash reporting skipped (dev build)")
    }
    return false
  }
  Sentry.init(config as Sentry.ReactNativeOptions)
  initialized = true
  return true
}

export function setAgentContext(
  agentId: string | null,
  organizationId: string | null,
): void {
  if (!initialized) return
  Sentry.setUser(agentId ? { id: agentId } : null)
  // Sentry's Primitive type accepts undefined; passing undefined removes
  // the tag. No type cast needed (drop the previous as-unknown-as-string
  // hack — that was over-defensive).
  Sentry.setTag("organization_id", organizationId ?? undefined)
}

export function clearAgentContext(): void {
  if (!initialized) return
  Sentry.setUser(null)
  Sentry.setTag("organization_id", undefined)
}

export { Sentry }
