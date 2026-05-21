/**
 * M1-3 — Pure builder for Sentry init options.
 *
 * Decoupled from the @sentry/react-native SDK so unit tests don't have
 * to mock the native bridge. Inputs are environment variables + agent
 * identity; outputs are the config object passed to `Sentry.init()`.
 *
 * Returns `null` when DSN is missing — caller skips init entirely
 * (avoids noisy "no DSN" warnings on dev builds where Sentry isn't
 * configured). Production builds set SENTRY_DSN at build time.
 */

export interface SentryConfigInput {
  /** From env (SENTRY_DSN_MTM_MOBILE). Empty → skip init. */
  dsn: string | null | undefined
  /** "production" | "staging" | "development" — drives sampling. */
  environment: string
  /** App version + build (matches versionName in build.gradle). */
  release: string
  /**
   * Optional agent context — when present, attached as a Sentry scope
   * `user` tag so traces are filterable per agent. Don't include PII
   * beyond what supervisors already see in `MtmAuditLog.agentId`.
   */
  agentId?: string | null
  organizationId?: string | null
}

export interface SentryConfig {
  dsn: string
  environment: string
  release: string
  /** 0-1, fraction of transactions sampled for perf. Lower in prod
   * to keep the bill predictable — Mars Overseas pilot is ~7 reps,
   * 50% is plenty; production rollout (351 reps) drops to 0.1. */
  tracesSampleRate: number
  /**
   * 0-1, fraction of errors sampled. ALWAYS 1.0 — we want every
   * crash. Set lower only if we hit a noisy 3rd-party error storm.
   */
  sampleRate: number
  /** Strip request bodies / GPS coords from breadcrumbs so we don't
   * persist customer data into Sentry's storage. */
  sendDefaultPii: false
  /** Initial scope tags (agent + org context, if known). */
  initialScope?: {
    user?: { id: string }
    tags?: Record<string, string>
  }
}

// Per-environment traces sample rate. Production is intentionally low
// — at 351 reps × many sessions/day, 1.0 would blow Sentry's free tier.
const TRACES_SAMPLE_RATE: Record<string, number> = {
  production: 0.1,
  staging: 0.5,
  development: 1.0,
}
const TRACES_SAMPLE_RATE_DEFAULT = 0.5 // unknown env (e.g. "qa")

export function buildSentryConfig(input: SentryConfigInput): SentryConfig | null {
  const dsn = (input.dsn ?? "").trim()
  if (dsn === "") return null

  const config: SentryConfig = {
    dsn,
    environment: input.environment,
    release: input.release,
    tracesSampleRate:
      TRACES_SAMPLE_RATE[input.environment] ?? TRACES_SAMPLE_RATE_DEFAULT,
    // Always capture every crash — these are the whole point of the
    // integration. Tune down only if a 3rd-party error storm fires.
    sampleRate: 1.0,
    // Never auto-attach IP / cookies / request headers. Mars's agents
    // are PII subjects under Azerbaijan data law; supervisor audits
    // already carry the controlled subset of identity we need.
    sendDefaultPii: false,
  }

  // Attach scope tags only when we have something — empty `initialScope`
  // would show up as `user: {}` in Sentry's UI and obscure real ones.
  if (input.agentId || input.organizationId) {
    const scope: NonNullable<SentryConfig["initialScope"]> = {}
    if (input.agentId) scope.user = { id: input.agentId }
    if (input.organizationId) {
      scope.tags = { organization_id: input.organizationId }
    }
    config.initialScope = scope
  }

  return config
}
