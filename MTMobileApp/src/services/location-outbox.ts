import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * Coordinates that could not be sent yet.
 *
 * The phone captures a position every 30 seconds and used to throw it away if
 * the request failed. The failure is ordinary — Android suspends the network
 * while the device is stationary with the screen off, a clinic has no signal,
 * a lift, a basement — and each one left a hole in the day nobody could
 * explain afterwards. On 20 September one agent's day had seven such holes of
 * 12 to 38 minutes, all while the workday was open and the phone stood still.
 *
 * The server was always ready for this: `/mobile/location` accepts a past
 * `recordedAt` and deduplicates by `clientLocationId`. A delayed point is
 * therefore not a lie about where the agent is now — it is the truth about
 * where they were then, arriving late.
 *
 * What this must never do is grow without a bound or retry something the
 * server has already refused for good: a point inside a break, or outside the
 * workday, is rejected on purpose and must leave the queue.
 */

export const OUTBOX_KEY = "@mtm_gps_outbox_v1"

/** ~5 hours at one point every 30 seconds. Oldest are dropped first. */
export const OUTBOX_CAPACITY = 600

/** Per tick, on top of the live point: the endpoint allows 30 requests a minute. */
export const FLUSH_PER_TICK = 8

export interface QueuedPoint {
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
  altitude?: number
  workdayId?: string
  recordedAt: string
  clientLocationId: string
}

export type UploadVerdict =
  /** Worth keeping: the network or the server, not the point. */
  | "retry"
  /** The server refused this point itself; keeping it would clog the queue. */
  | "drop"
  /** The session is gone; tracking stops and nothing is queued. */
  | "stop"

interface FailureShape {
  message?: string
  status?: number
  code?: string
}

/**
 * A 4xx is the server's verdict on this exact point and will not change by
 * repeating it. Everything else — no status at all (network, timeout, abort),
 * a 5xx, or 429 — is about this minute.
 */
export function classifyUploadFailure(error: FailureShape | null | undefined): UploadVerdict {
  if (!error) return "retry"
  if (error.message === "SESSION_EXPIRED") return "stop"
  const status = error.status
  if (typeof status !== "number") return "retry"
  if (status === 429) return "retry"
  if (status >= 400 && status < 500) return "drop"
  return "retry"
}

/** Append, keeping the newest when the queue is full. */
export function appendPoint(
  queue: readonly QueuedPoint[],
  point: QueuedPoint,
  capacity: number = OUTBOX_CAPACITY,
): QueuedPoint[] {
  const next = [...queue, point]
  return next.length <= capacity ? next : next.slice(next.length - capacity)
}

function parseQueue(raw: string | null): QueuedPoint[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is QueuedPoint => (
      !!item && typeof item === "object"
      && typeof item.latitude === "number" && Number.isFinite(item.latitude)
      && typeof item.longitude === "number" && Number.isFinite(item.longitude)
      && typeof item.recordedAt === "string"
      && typeof item.clientLocationId === "string" && item.clientLocationId.length > 0
    ))
  } catch {
    return []
  }
}

export async function readQueue(): Promise<QueuedPoint[]> {
  try {
    return parseQueue(await AsyncStorage.getItem(OUTBOX_KEY))
  } catch {
    return []
  }
}

async function writeQueue(queue: readonly QueuedPoint[]): Promise<void> {
  try {
    if (queue.length === 0) await AsyncStorage.removeItem(OUTBOX_KEY)
    else await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(queue))
  } catch {}
}

export async function queuePoint(point: QueuedPoint): Promise<void> {
  await writeQueue(appendPoint(await readQueue(), point))
}

export async function clearQueue(): Promise<void> {
  await writeQueue([])
}

export interface FlushResult {
  sent: number
  dropped: number
  remaining: number
}

/**
 * Send the oldest points first and stop at the first one worth retrying, so a
 * dead network costs one request per tick rather than the whole queue. Order
 * is preserved: what stays is still in capture order.
 */
export async function flushQueue(
  send: (point: QueuedPoint) => Promise<unknown>,
  limit: number = FLUSH_PER_TICK,
): Promise<FlushResult> {
  const queue = await readQueue()
  if (queue.length === 0) return { sent: 0, dropped: 0, remaining: 0 }

  let sent = 0
  let dropped = 0
  let index = 0
  while (index < queue.length && index < limit) {
    try {
      await send(queue[index])
      sent += 1
      index += 1
    } catch (error) {
      const verdict = classifyUploadFailure(error as FailureShape)
      if (verdict === "drop") {
        dropped += 1
        index += 1
        continue
      }
      // "retry" and "stop" both mean: leave the rest where they are.
      break
    }
  }

  const remainder = queue.slice(index)
  await writeQueue(remainder)
  return { sent, dropped, remaining: remainder.length }
}
