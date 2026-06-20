/**
 * Offline shelf-scan queue (C4b).
 *
 * A field agent often scans a shelf inside a store with no signal. Before this,
 * `handlePhotoTaken` POSTed straight to `analyzeShelf` and, on a network failure,
 * just showed an error — the scan (and the visit's compliance proof) was lost.
 *
 * This module persists such scans and replays them when connectivity returns:
 *   - enqueueScan: copy the resized JPEG into a DURABLE dir (the resizer's output
 *     lives in a cache dir the OS can evict) + record the scan metadata in
 *     AsyncStorage. Keyed by the capture's `clientScanId`.
 *   - drainScanQueue: re-POST each queued scan via `analyzeShelf` with its ORIGINAL
 *     `clientScanId`. The server de-dupes on that key (Variant-C idempotency), so a
 *     replay never double-counts. A POST that RESOLVES (200 inline OR 202 parked
 *     for the backstop) is "accepted" → the queued copy is deleted; the server owns
 *     the result from there (the agent has already left the store, so we do NOT
 *     poll). A connectivity / expired-session error stops the drain and keeps the
 *     queue intact for the next attempt. A genuine server error bumps an attempt
 *     counter and is abandoned after MAX_ATTEMPTS so one poison scan can't wedge it.
 *
 * Storage is bounded (MAX_QUEUE, oldest dropped). No WatermelonDB / migration — the
 * queue is a small JSON array; the heavy bytes live as files on disk.
 */
import AsyncStorage from "@react-native-async-storage/async-storage"
import RNFS from "react-native-fs"
import { api } from "./api"

const QUEUE_KEY = "@mtm_scan_queue"
const QUEUE_DIR = `${RNFS.DocumentDirectoryPath}/scan-queue`
const MAX_QUEUE = 50
const MAX_ATTEMPTS = 6

export interface QueuedScan {
  clientScanId: string
  planogramId: string
  visitId: string | null
  latitude: number | null
  longitude: number | null
  imageMediaType: string
  /** Durable path of the copied JPEG inside QUEUE_DIR. */
  imagePath: string
  queuedAt: number
  attempts: number
}

const stripScheme = (p: string) => p.replace(/^file:\/\//, "")

async function readQueue(): Promise<QueuedScan[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as QueuedScan[]) : []
  } catch {
    return []
  }
}

async function writeQueue(q: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

/**
 * A failure that means "the server wasn't reachable / the session is dead" — i.e.
 * retrying the SAME request later may succeed, so we should KEEP the scan queued
 * and stop draining (vs a genuine server rejection, which won't change on retry).
 * Mirrors the error strings api.request() throws.
 */
export function isConnectivityError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "")
  return (
    /network request failed/i.test(msg) ||
    msg === "REQUEST_TIMEOUT" ||
    msg === "ABORTED" ||
    msg === "Server not configured"
  )
}

/** Whether the drain should stop entirely (connectivity gone, or auth expired). */
function shouldStopDrain(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "")
  return isConnectivityError(e) || msg === "SESSION_EXPIRED"
}

export async function getQueuedScanCount(): Promise<number> {
  return (await readQueue()).length
}

/**
 * Persist a scan that couldn't be uploaded now. Copies the resized JPEG into the
 * durable queue dir and records its metadata. Idempotent on clientScanId (a
 * re-enqueue of the same capture replaces the prior entry). Throws only if the
 * file copy fails (the caller still has the on-screen error to fall back on).
 */
export async function enqueueScan(input: {
  clientScanId: string
  planogramId: string
  visitId: string | null
  latitude: number | null
  longitude: number | null
  imageMediaType: string
  /** Path of the resized JPEG produced by ImageResizer (cache dir). */
  srcImagePath: string
}): Promise<void> {
  await RNFS.mkdir(QUEUE_DIR).catch(() => {}) // idempotent; ignore "already exists"
  const ext = input.imageMediaType === "image/png" ? "png" : "jpg"
  const dest = `${QUEUE_DIR}/${input.clientScanId}.${ext}`
  await RNFS.copyFile(stripScheme(input.srcImagePath), dest)

  // The file copy is committed before the queue write. If the write fails, unlink
  // the just-copied JPEG so it can't linger as an untracked orphan (the cap only
  // evicts TRACKED entries, so an orphan would never be drained or reclaimed).
  try {
    const queue = (await readQueue()).filter(s => s.clientScanId !== input.clientScanId)
    queue.push({
      clientScanId: input.clientScanId,
      planogramId: input.planogramId,
      visitId: input.visitId,
      latitude: input.latitude,
      longitude: input.longitude,
      imageMediaType: input.imageMediaType,
      imagePath: dest,
      queuedAt: Date.now(),
      attempts: 0,
    })
    // Bound the queue — drop the oldest (and its file) beyond the cap so a
    // chronically-offline device can't fill the disk.
    while (queue.length > MAX_QUEUE) {
      const dropped = queue.shift()
      if (dropped) await RNFS.unlink(dropped.imagePath).catch(() => {})
    }
    await writeQueue(queue)
  } catch (e) {
    await RNFS.unlink(dest).catch(() => {})
    throw e
  }
}

export interface DrainResult {
  uploaded: number
  remaining: number
  /** Dropped permanently: server-rejected past MAX_ATTEMPTS, or the file vanished. */
  failed: number
}

let _draining = false

/**
 * Replay queued scans oldest-first. Concurrency-guarded (a mount + reconnect that
 * both fire only drains once). Safe to call when the queue is empty or offline.
 */
export async function drainScanQueue(): Promise<DrainResult> {
  if (_draining) return { uploaded: 0, remaining: await getQueuedScanCount(), failed: 0 }
  _draining = true
  try {
    const queue = await readQueue()
    if (queue.length === 0) return { uploaded: 0, remaining: 0, failed: 0 }

    const keep: QueuedScan[] = []
    let uploaded = 0
    let failed = 0

    for (let i = 0; i < queue.length; i++) {
      const scan = queue[i]

      let base64: string
      try {
        base64 = await RNFS.readFile(stripScheme(scan.imagePath), "base64")
      } catch {
        // The durable file is gone — can't recover this scan; drop it.
        failed++
        continue
      }

      try {
        // Resolves on any 2xx/202 (inline result or parked for the backstop) →
        // accepted. Same clientScanId → server de-dupes, so replay is safe.
        await api.analyzeShelf({
          planogramId: scan.planogramId,
          imageBase64: base64,
          imageMediaType: scan.imageMediaType === "image/png" ? "image/png" : "image/jpeg",
          visitId: scan.visitId ?? undefined,
          latitude: scan.latitude ?? undefined,
          longitude: scan.longitude ?? undefined,
          clientScanId: scan.clientScanId,
        })
        await RNFS.unlink(stripScheme(scan.imagePath)).catch(() => {})
        uploaded++
      } catch (e) {
        if (shouldStopDrain(e)) {
          // Still offline / auth dead — keep THIS scan and everything after it,
          // untouched, for the next drain.
          keep.push(...queue.slice(i))
          break
        }
        // Genuine server rejection — count an attempt; abandon a poison scan after
        // MAX_ATTEMPTS so it can't wedge the whole queue.
        const attempts = scan.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          await RNFS.unlink(stripScheme(scan.imagePath)).catch(() => {})
          failed++
        } else {
          keep.push({ ...scan, attempts })
        }
      }
    }

    await writeQueue(keep)
    return { uploaded, remaining: keep.length, failed }
  } finally {
    _draining = false
  }
}
