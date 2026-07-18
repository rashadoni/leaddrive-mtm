import AsyncStorage from "@react-native-async-storage/async-storage"

const STORAGE_KEY = "@mtm_sync_outbox_v1"

export type OutboxOperation = {
  operationId: string
  entity: string
  op: "create" | "update"
  data: Record<string, unknown>
  clientTimestamp: number
  attempts: number
  nextAttemptAt: number
}

function operationId() {
  return `mtm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function read(): Promise<OutboxOperation[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function write(items: OutboxOperation[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export async function enqueueOutboxOperation(input: Pick<OutboxOperation, "entity" | "op" | "data">) {
  const item: OutboxOperation = {
    ...input,
    operationId: operationId(),
    clientTimestamp: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  }
  const items = await read()
  items.push(item)
  await write(items)
  return item
}

export async function pendingOutboxOperations(now = Date.now()) {
  return (await read()).filter((item) => item.nextAttemptAt <= now)
}

export async function acknowledgeOutboxOperation(operationIdToRemove: string) {
  await write((await read()).filter((item) => item.operationId !== operationIdToRemove))
}

export async function deferOutboxOperation(operationIdToDefer: string, now = Date.now()) {
  const items = await read()
  const next = items.map((item) => {
    if (item.operationId !== operationIdToDefer) return item
    const attempts = item.attempts + 1
    return { ...item, attempts, nextAttemptAt: now + Math.min(15 * 60_000, 2 ** attempts * 1_000) }
  })
  await write(next)
}

export async function clearOutbox() {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
