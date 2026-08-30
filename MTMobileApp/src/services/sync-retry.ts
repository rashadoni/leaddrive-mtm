/** Maximum one pipeline retry delay. The server's bounded Retry-After wins. */
const MAX_RETRY_DELAY_MS = 15 * 60_000

export type RetryableSyncError = Error & {
  code?: string
  status?: number
  retryAfterMs?: number
}

/**
 * HTTP Retry-After accepts either delta seconds or an HTTP date.  Invalid and
 * expired values are deliberately ignored; they must never turn into an
 * immediate busy-loop retry.
 */
export function retryAfterMsFromHeader(value: string | null | undefined, now = Date.now()): number | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw)
    return Number.isSafeInteger(seconds) ? Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000) : undefined
  }
  const at = Date.parse(raw)
  if (!Number.isFinite(at) || at <= now) return undefined
  return Math.min(MAX_RETRY_DELAY_MS, at - now)
}

export function retryAfterMsFromError(error: unknown): number | undefined {
  const value = (error as RetryableSyncError | null)?.retryAfterMs
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(MAX_RETRY_DELAY_MS, Math.floor(value))
    : undefined
}

/**
 * Exponential backoff for local failures.  When a server supplies
 * Retry-After, the returned delay is never shorter than that value; jitter is
 * positive-only in that case so a cohort does not stampede exactly together.
 */
export function retryDelayMs(input: {
  attempts: number
  retryAfterMs?: number
  jitter?: boolean
  random?: () => number
}): number {
  const attempts = Math.max(1, Math.floor(input.attempts))
  const random = Math.max(0, Math.min(1, input.random?.() ?? Math.random()))
  const retryAfterMs = input.retryAfterMs
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    const base = Math.max(1_000, Math.min(MAX_RETRY_DELAY_MS, Math.ceil(retryAfterMs)))
    if (!input.jitter || base === MAX_RETRY_DELAY_MS) return base
    const extra = Math.min(1_000, Math.floor(base * 0.25 * random))
    return Math.min(MAX_RETRY_DELAY_MS, base + extra)
  }

  const base = Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** (attempts - 1))
  if (!input.jitter) return base
  // Symmetric jitter is fine for a locally generated delay.  The lower bound
  // stays positive and all writes remain in their existing durable outbox.
  return Math.max(1_000, Math.round(base * (0.75 + random * 0.5)))
}
