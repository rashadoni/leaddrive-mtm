import AsyncStorage from "@react-native-async-storage/async-storage"

const STORAGE_KEY = "@mtm_media_outbox_v1"

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

export async function enqueueMediaUpload(input: Omit<MediaOutboxItem, "id" | "attempts" | "nextAttemptAt">) {
  const item: MediaOutboxItem = { ...input, id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, attempts: 0, nextAttemptAt: 0 }
  const items = await read()
  items.push(item)
  await write(items)
  return item
}

export async function pendingMediaUploads(now = Date.now()) {
  return (await read()).filter((item) => item.nextAttemptAt <= now)
}

export async function acknowledgeMediaUpload(id: string) {
  await write((await read()).filter((item) => item.id !== id))
}

export async function deferMediaUpload(id: string, now = Date.now()) {
  const items = await read()
  await write(items.map((item) => item.id !== id ? item : { ...item, attempts: item.attempts + 1, nextAttemptAt: now + Math.min(15 * 60_000, 2 ** (item.attempts + 1) * 1_000) }))
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
