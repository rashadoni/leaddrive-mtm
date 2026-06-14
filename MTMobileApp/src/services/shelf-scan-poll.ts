/**
 * Variant C Phase 3 — mobile sync-pull reconcile.
 *
 * When the shelf-scan POST returns 202 (Claude was overloaded so the server
 * PARKED the scan for the backstop cron), the app polls the scan's status by
 * analysisId until it reaches a terminal state — or gives up after a bounded
 * window and tells the agent it'll finish in the background (the durable
 * backstop completes it server-side regardless; the linked analysisId means the
 * submitted verdict still picks up the eventual AI score).
 *
 * This module is the PURE, testable core — no React, no timers of its own; the
 * caller injects `sleep` so tests run instantly.
 */

/** A scan is still being analyzed while the server reports this pseudo-status. */
export const PROCESSING = "processing"

/** Bounded poll window: ~12 attempts, backoff 1.5s→5s cap ≈ 50s total. The 202
 *  path is the rare degraded case (Claude overloaded); most scans return 200
 *  inline and never poll. Past this the agent is told it'll finish in background. */
export const POLL_MAX_ATTEMPTS = 12
const POLL_BASE_MS = 1500
const POLL_CAP_MS = 5000

/** Exponential-ish backoff, capped. attempt 0→1.5s, 1→3s, 2+→5s. */
export function pollBackoffMs(attempt: number): number {
  return Math.min(POLL_CAP_MS, POLL_BASE_MS * 2 ** Math.min(Math.max(0, attempt), 3))
}

/** The parsed body shape both analyzeShelf and getShelfAnalysis return. */
export interface ScanBody {
  success?: boolean
  data?: ({ status?: string } & Record<string, unknown>) | null
  error?: string
}

export type PollOutcome =
  | { terminal: true; data: NonNullable<ScanBody["data"]> } // COMPLETED / FAILED / REJECTED
  | { terminal: false; data: null } // gave up — still processing in background

/**
 * Poll `fetchStatus(analysisId)` until its `data.status` is a terminal value
 * (anything other than "processing") or the attempt budget runs out. A thrown
 * fetch (transient network blip) does NOT abort — it's swallowed and retried,
 * because the durable scan is still being worked server-side.
 */
export async function pollScanUntilTerminal(
  analysisId: string,
  fetchStatus: (id: string) => Promise<ScanBody>,
  opts: {
    sleep: (ms: number) => Promise<void>
    maxAttempts?: number
    backoff?: (attempt: number) => number
    shouldStop?: () => boolean // e.g. the screen unmounted / a newer scan started
  },
): Promise<PollOutcome> {
  const maxAttempts = opts.maxAttempts ?? POLL_MAX_ATTEMPTS
  const backoff = opts.backoff ?? pollBackoffMs

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts.shouldStop?.()) return { terminal: false, data: null }
    await opts.sleep(backoff(attempt))
    if (opts.shouldStop?.()) return { terminal: false, data: null }

    let body: ScanBody
    try {
      body = await fetchStatus(analysisId)
    } catch {
      continue // transient network — the scan is still durable, keep polling
    }

    const status = body?.data?.status
    if (body?.success && body.data && status && status !== PROCESSING) {
      return { terminal: true, data: body.data }
    }
    // still PROCESSING (or a malformed body) → keep polling
  }

  return { terminal: false, data: null }
}
