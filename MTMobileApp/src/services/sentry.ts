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

// Project `mtm-mobile` in the `lead-drive` org, EU data region (note the
// `.de.` host — the organization's storage location is Europe and cannot be
// changed after creation). A DSN is not a credential: it only authorizes
// SENDING events, carries no read access, and ships inside every copy of the
// app anyway — so it lives in the repo rather than in a build secret.
//
// Set to "" to mute crash reporting entirely (e.g. an offline-only build).
// On production builds an empty value triggers a console.warn in logcat, so a
// release that lost its DSN is caught before QA leaves the building.
const DSN: string = "https://4c0cb8245b40ddd3f2d77cc336fe8727@o4511404827803648.ingest.de.sentry.io/4511848200405072"

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
