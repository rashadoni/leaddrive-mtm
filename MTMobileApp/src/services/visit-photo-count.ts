/**
 * Pure half of «Foto: N» on an active visit. No React Native imports, so the
 * counting is unit-tested.
 *
 * Why it exists: on 2026-09-14 on the Galaxy S23 the visit had 3 photos on the
 * server and the app showed «Foto: 0» after a reinstall. The count was a
 * `useState(0)` bumped on each shot, so every restart or remount forgot it —
 * and on «Marşrut» a wrong 0 also swaps the main button back to «Foto çək».
 *
 * A photo of the visit is in exactly one of three places:
 *  - on the server (the visit workspace lists it),
 *  - in the media outbox, waiting for coverage,
 *  - uploaded in this app session after the last workspace read — directly, or
 *    by the sync from the outbox — so the server has it but the list we hold
 *    does not show it yet.
 * The count is the sum. Queued photos are tracked by outbox id rather than as a
 * number: when one leaves the queue it is on the server (the outbox drops an
 * item only after a successful upload), and only the ids tell us that happened
 * even while the server cannot be reached to re-read.
 *
 * Known limits:
 *  - The workspace lists at most 20 photos (`take: 20` in leaddrive-v2
 *    `api/v1/mtm/mobile/visits/[id]/workspace`), so the server part stops at 20.
 *    The org default `maxPhotosPerVisit` is 10; a higher limit needs a real
 *    count from that endpoint.
 *  - Before the first workspace read succeeds the server part is unknown and
 *    counts as 0 — the same 0 the old counter showed on every start. The queue
 *    and this session's photos are counted meanwhile.
 */

export type VisitPhotoSnapshot = {
  /** Photos the server listed at the last successful workspace read; null until one succeeded. */
  serverCount: number | null
  /** Direct uploads of this session that had finished before that read started — already in `serverCount`. */
  uploadsSeenByServer: number
  /** Outbox ids of this visit's photos that are counted as queued. */
  queuedIds: string[]
  /** Ids queued this session that existed when that read started: in `queuedIds` or in `serverCount`. */
  queuedIdsSeenByServer: string[]
}

export const EMPTY_VISIT_PHOTOS: VisitPhotoSnapshot = {
  serverCount: null,
  uploadsSeenByServer: 0,
  queuedIds: [],
  queuedIdsSeenByServer: [],
}

export type VisitPhotoRead = {
  /** Photos in the workspace, or null when the server was not read or not reached. */
  serverCount: number | null
  /** This visit's outbox ids, read BEFORE the server (see `applyPhotoRead`). */
  queuedIds: string[]
  /** Session direct uploads counted when the read started. */
  uploadsAtReadStart: number
  /**
   * Outbox ids this app session queued for the visit, taken when the read
   * started — on any screen. The sync can send one before this screen looks at
   * the outbox, and then only this list says the photo exists.
   */
  sessionQueuedIds: string[]
}

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

/**
 * Folds one read into the snapshot.
 *
 * With the server: its list replaces everything. The queue is read first, so a
 * photo that finishes uploading between the two reads is counted twice until
 * the next read — never zero times, which is what would flip the main button.
 *
 * Without the server: an id that left the queue was acknowledged by the server,
 * but the server count we hold predates it. Keep counting it as queued until a
 * server read includes it; add ids that are new, and ids queued this session
 * that no server read has seen yet even if the sync already sent them.
 */
export function applyPhotoRead(previous: VisitPhotoSnapshot, read: VisitPhotoRead): VisitPhotoSnapshot {
  if (read.serverCount !== null) {
    return {
      serverCount: whole(read.serverCount),
      uploadsSeenByServer: whole(read.uploadsAtReadStart),
      queuedIds: unique(read.queuedIds),
      queuedIdsSeenByServer: unique(read.sessionQueuedIds),
    }
  }
  const seen = new Set(previous.queuedIdsSeenByServer)
  return {
    ...previous,
    queuedIds: unique([
      ...previous.queuedIds,
      ...read.queuedIds,
      ...read.sessionQueuedIds.filter((id) => !seen.has(id)),
    ]),
  }
}

/**
 * The workspace needs a (re-)read when the count we hold cannot be trusted:
 * none succeeded yet, a counted queued photo has since reached the server, a
 * photo queued this session (on either tab) reached it before any read saw it,
 * or a direct upload finished after the last read started. Otherwise the local
 * queue is enough and the screen does not hit the network on every refresh.
 */
export function needsServerPhotoRead(
  snapshot: VisitPhotoSnapshot,
  queuedIdsNow: string[],
  sessionUploads: number,
  sessionQueuedIds: string[] = [],
): boolean {
  if (snapshot.serverCount === null) return true
  const now = new Set(queuedIdsNow)
  if (snapshot.queuedIds.some((id) => !now.has(id))) return true
  const seen = new Set(snapshot.queuedIdsSeenByServer)
  if (sessionQueuedIds.some((id) => !now.has(id) && !seen.has(id))) return true
  return whole(sessionUploads) > snapshot.uploadsSeenByServer
}

/** What «Foto: N» shows. */
export function visitPhotoCount(snapshot: VisitPhotoSnapshot, sessionUploads: number): number {
  const unseenUploads = Math.max(0, whole(sessionUploads) - snapshot.uploadsSeenByServer)
  return (snapshot.serverCount ?? 0) + new Set(snapshot.queuedIds).size + unseenUploads
}

/**
 * The count a screen holds for one visit, plus what is needed to fold reads in
 * the right order. Each load reads the local queue first and applies it at once
 * (a queued photo shows without waiting for a 20 s workspace timeout in weak
 * coverage), then maybe the server. Loads overlap — a sync refresh and a photo
 * just taken — so answers arrive out of order.
 */
export type VisitPhotoState = {
  visitId: string | null
  snapshot: VisitPhotoSnapshot
  /** Sequence of the read whose server count is held; 0 when none. */
  serverRead: number
  /** The newest queue-only read applied, kept to re-apply over an older server answer. */
  newestQueueRead: { read: number; photoRead: VisitPhotoRead } | null
}

export const EMPTY_VISIT_PHOTO_STATE: VisitPhotoState = {
  visitId: null,
  snapshot: EMPTY_VISIT_PHOTOS,
  serverRead: 0,
  newestQueueRead: null,
}

/** The held snapshot belongs to one visit; a different visit starts from nothing. */
export function photosForVisit(state: VisitPhotoState, visitId: string | null): VisitPhotoSnapshot {
  return state.visitId === visitId ? state.snapshot : EMPTY_VISIT_PHOTOS
}

/**
 * Folds read number `read` (increasing per load) into the state. Returns the
 * same object when the answer is stale.
 *
 * Only a server answer makes older reads stale. A newer read whose server call
 * failed must not throw away an older one that succeeded: that was the first
 * server count after a reinstall, and dropping it left «Foto: 0» in place. Its
 * queue ids are merged instead; they only ever add. When an older server answer
 * lands after a newer queue read, that queue read is merged again on top, so a
 * photo queued in between does not drop out of the count.
 */
export function foldPhotoRead(state: VisitPhotoState, visitId: string, read: number, photoRead: VisitPhotoRead): VisitPhotoState {
  const own = state.visitId === visitId ? state : { ...EMPTY_VISIT_PHOTO_STATE, visitId }
  if (read < own.serverRead) return state
  const snapshot = applyPhotoRead(own.snapshot, photoRead)
  if (photoRead.serverCount === null) {
    const newest = !own.newestQueueRead || read > own.newestQueueRead.read ? { read, photoRead } : own.newestQueueRead
    return { visitId, snapshot, serverRead: own.serverRead, newestQueueRead: newest }
  }
  const newer = own.newestQueueRead && own.newestQueueRead.read > read ? own.newestQueueRead : null
  return {
    visitId,
    snapshot: newer ? applyPhotoRead(snapshot, newer.photoRead) : snapshot,
    serverRead: read,
    newestQueueRead: newer,
  }
}
