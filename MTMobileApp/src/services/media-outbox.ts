import AsyncStorage from "@react-native-async-storage/async-storage"
import { getOfflineScope, requireOfflineScope } from "./offline-scope"

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

export async function deferMediaUpload(id: string, now = Date.now()) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    const items = await read()
    await write(items.map((item) => item.id !== id || item.scopeKey !== scope ? item : { ...item, attempts: item.attempts + 1, nextAttemptAt: now + Math.min(15 * 60_000, 2 ** (item.attempts + 1) * 1_000) }))
  })
}

export async function flushMediaOutbox(send: (item: MediaOutboxItem) => Promise<unknown>) {
  const pending = await pendingMediaUploads()
  let sent = 0
  for (const item of pending) {
    try { await send(item); await acknowledgeMediaUpload(item.id); sent += 1 }
    catch { await deferMediaUpload(item.id) }
  }
  return { sent, deferred: pending.length - sent }
}
