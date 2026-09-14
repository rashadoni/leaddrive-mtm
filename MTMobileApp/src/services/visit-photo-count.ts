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
 *  - uploaded directly in this app session after the last workspace read, so
 *    the server has it but the list we hold does not show it yet.
 * The count is the sum. Queued photos are tracked by outbox id rather than as a
 * number: when one leaves the queue it is on the server, and only the ids tell
 * us that happened even while the server cannot be reached to re-read.
 */

export type VisitPhotoSnapshot = {
  /** Photos the server listed at the last successful workspace read; null until one succeeded. */
  serverCount: number | null
  /** Direct uploads of this session that had finished before that read started — already in `serverCount`. */
  uploadsSeenByServer: number
  /** Outbox ids of this visit's photos that are counted as queued. */
  queuedIds: string[]
}

export const EMPTY_VISIT_PHOTOS: VisitPhotoSnapshot = { serverCount: null, uploadsSeenByServer: 0, queuedIds: [] }

export type VisitPhotoRead = {
  /** Photos in the workspace, or null when the server was not read or not reached. */
  serverCount: number | null
  /** This visit's outbox ids, read BEFORE the server (see `applyPhotoRead`). */
  queuedIds: string[]
  /** Session direct uploads counted when the read started. */
  uploadsAtReadStart: number
}

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Folds one read into the snapshot.
 *
 * With the server: its list replaces everything. The queue is read first, so a
 * photo that finishes uploading between the two reads is counted twice until
 * the next read — never zero times, which is what would flip the main button.
 *
 * Without the server: an id that left the queue was acknowledged by the server
 * (the outbox drops an item only after a successful upload), but the server
 * count we hold predates it. Keep counting it as queued until a server read
 * includes it; add ids that are new.
 */
export function applyPhotoRead(previous: VisitPhotoSnapshot, read: VisitPhotoRead): VisitPhotoSnapshot {
  if (read.serverCount !== null) {
    return {
      serverCount: whole(read.serverCount),
      uploadsSeenByServer: whole(read.uploadsAtReadStart),
      queuedIds: [...new Set(read.queuedIds)],
    }
  }
  return {
    ...previous,
    queuedIds: [...new Set([...previous.queuedIds, ...read.queuedIds])],
  }
}

/**
 * The workspace needs a (re-)read when the count we hold cannot be trusted:
 * none succeeded yet, a counted queued photo has since reached the server, or a
 * direct upload finished after the last read started. Otherwise the local queue
 * is enough and the screen does not hit the network on every refresh.
 */
export function needsServerPhotoRead(snapshot: VisitPhotoSnapshot, queuedIdsNow: string[], sessionUploads: number): boolean {
  if (snapshot.serverCount === null) return true
  const now = new Set(queuedIdsNow)
  if (snapshot.queuedIds.some((id) => !now.has(id))) return true
  return whole(sessionUploads) > snapshot.uploadsSeenByServer
}

/** What «Foto: N» shows. */
export function visitPhotoCount(snapshot: VisitPhotoSnapshot, sessionUploads: number): number {
  const unseenUploads = Math.max(0, whole(sessionUploads) - snapshot.uploadsSeenByServer)
  return (snapshot.serverCount ?? 0) + new Set(snapshot.queuedIds).size + unseenUploads
}
