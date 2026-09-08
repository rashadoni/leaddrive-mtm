/**
 * What the sync centre shows in its list of lanes, and how it stamps the time.
 *
 * Field UX audit B12. The sheet listed all five lanes unconditionally under the
 * heading "Sync pipelines", and stamped the last sync with a bare
 * `toLocaleString`, seconds and all. Two of those three are not cosmetic:
 *
 * - `routeV2Pull` is the pilot lane. When a tenant is not in the v2 cohort the
 *   sync engine takes the withdrawal branch and never touches this lane's
 *   status, so it sits at `idle` forever — and the sheet reported it as READY.
 *   A lane that says "ready" while nothing will ever run on it is worse than no
 *   line at all: the rep reads it as a promise. Hiding it here is a fix at the
 *   reading end; the honest fix at the writing end is for the engine to mark
 *   the lane disabled in that branch, which is a change to persisted epoch
 *   state and belongs to its own task.
 * - A lane the server switched off (`disabled`) is likewise nothing the rep can
 *   act on. It is internal bookkeeping wearing a status row.
 *
 * Everything else stays: a lane that is syncing, retrying or broken is exactly
 * what this sheet exists to show.
 */

/** The parts of a lane's status this module reads. */
export type SyncCentreLane = {
  phase: string
  /** Set once the lane has actually completed a pass. */
  lastSucceededAt?: number | string | null
}

/** The pilot lane: present in the code for everyone, real only for the cohort. */
export const PILOT_SYNC_PIPELINE = "routeV2Pull"

export function isVisibleSyncPipeline(id: string, lane: SyncCentreLane | undefined | null): boolean {
  if (!lane) return false
  if (lane.phase === "disabled") return false
  // Untouched pilot lane: idle and never once succeeded means the engine has
  // not armed it for this tenant.
  if (id === PILOT_SYNC_PIPELINE && lane.phase === "idle" && !lane.lastSucceededAt) return false
  return true
}

export function visibleSyncPipelines<T extends { id: string }>(
  order: readonly T[],
  lanes: Record<string, SyncCentreLane | undefined>,
): T[] {
  return order.filter((entry) => isVisibleSyncPipeline(entry.id, lanes[entry.id]))
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * "Last sync" as a person reads it: the day, the month by name, and the clock
 * to the minute. `toLocaleString` gave "05.09.2026, 14:30:07" — seconds nobody
 * needs, and in Azerbaijani an ICU root fallback on top.
 *
 * The date half goes through the app's shared formatter so Azerbaijani months
 * are the ones this app writes everywhere else; the clock is assembled here,
 * 24-hour, because that is what the rest of the field UI shows and it must not
 * depend on which ICU build the phone happens to carry.
 */
export function syncCentreLastSyncText(
  value: Date | string | number,
  language: string,
  formatDatePart: (value: Date | string, language: string, options: Intl.DateTimeFormatOptions) => string,
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const day = formatDatePart(date, language, { day: "numeric", month: "short" })
  return `${day}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
