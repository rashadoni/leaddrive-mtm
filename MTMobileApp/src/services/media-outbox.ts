import AsyncStorage from "@react-native-async-storage/async-storage"
import { getOfflineScope, requireOfflineScope } from "./offline-scope"
import { retryAfterMsFromError, retryDelayMs } from "./sync-retry"

const STORAGE_KEY = "@mtm_media_outbox_v1"

let storageQueue: Promise<void> = Promise.resolve()

export type MediaOutboxItem = {
  id: string
  filePath: string
  fileName?: string
  visitId?: string
  category?: string
  latitude?: number
  longitude?: number
  attempts: number
  nextAttemptAt: number
  scopeKey: string
}

async function read(): Promise<MediaOutboxItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

async function write(items: MediaOutboxItem[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation)
  storageQueue = result.then(() => undefined, () => undefined)
  return result
}

export async function enqueueMediaUpload(input: Omit<MediaOutboxItem, "id" | "attempts" | "nextAttemptAt" | "scopeKey">) {
  const item: MediaOutboxItem = { ...input, id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, attempts: 0, nextAttemptAt: 0, scopeKey: requireOfflineScope() }
  await serializeMutation(async () => {
    const items = await read()
    items.push(item)
    await write(items)
  })
  return item
}

export async function pendingMediaUploads(now = Date.now()) {
  const scope = getOfflineScope()
  return (await read()).filter((item) => Boolean(scope) && item.scopeKey === scope && item.nextAttemptAt <= now)
}

export async function allMediaUploads() {
  const scope = getOfflineScope()
  return (await read()).filter((item) => Boolean(scope) && item.scopeKey === scope)
}

export async function acknowledgeMediaUpload(id: string) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    await write((await read()).filter((item) => item.id !== id || item.scopeKey !== scope))
  })
}

export async function deferMediaUpload(
  id: string,
  now = Date.now(),
  retry?: { retryAfterMs?: number; jitter?: boolean; random?: () => number },
) {
  const scope = requireOfflineScope()
  let retryAt = now
  await serializeMutation(async () => {
    const items = await read()
    await write(items.map((item) => {
      if (item.id !== id || item.scopeKey !== scope) return item
      const attempts = item.attempts + 1
      retryAt = now + retryDelayMs({ attempts, ...retry })
      return { ...item, attempts, nextAttemptAt: retryAt }
    }))
  })
  return retryAt
}

export async function flushMediaOutbox(
  send: (item: MediaOutboxItem) => Promise<unknown>,
  options?: { now?: () => number; random?: () => number },
) {
  const pending = await pendingMediaUploads()
  let sent = 0
  let earliestRetryAt: number | null = null
  let lastError: string | undefined
  for (const item of pending) {
    try { await send(item); await acknowledgeMediaUpload(item.id); sent += 1 }
    catch (error) {
      const now = options?.now?.() ?? Date.now()
      const retryAfterMs = retryAfterMsFromError(error)
      const retryAt = await deferMediaUpload(item.id, now, {
        retryAfterMs,
        // Media is a legacy v1 queue too. Do not change its ordinary retry
        // schedule; only a server-provided Retry-After gets fair jitter.
        jitter: retryAfterMs !== undefined,
        random: options?.random,
      })
      earliestRetryAt = earliestRetryAt === null ? retryAt : Math.min(earliestRetryAt, retryAt)
      lastError = error instanceof Error ? error.message : "SYNC_MEDIA_FAILED"
    }
  }
  return {
    sent,
    deferred: pending.length - sent,
    ...(lastError ? { error: lastError } : {}),
    ...(earliestRetryAt !== null ? { retryAfterMs: Math.max(0, earliestRetryAt - (options?.now?.() ?? Date.now())) } : {}),
  }
}
