import AsyncStorage from "@react-native-async-storage/async-storage"
import { getOfflineScope, requireOfflineScope } from "./offline-scope"
import { retryAfterMsFromError, retryDelayMs } from "./sync-retry"

const STORAGE_KEY = "@mtm_sync_outbox_v1"

export type OutboxOperation = {
  operationId: string
  entity: string
  op: "create" | "update"
  data: Record<string, unknown>
  clientTimestamp: number
  attempts: number
  nextAttemptAt: number
  scopeKey: string
  status: "pending" | "conflict"
  conflict?: {
    error?: string
    serverData?: Record<string, unknown>
    recordedAt: number
  }
}

export type OutboxPushResult = {
  operationId: string
  status: string
  error?: string
  serverData?: Record<string, unknown>
}

let storageQueue: Promise<void> = Promise.resolve()

function createOperationId() {
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

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation)
  storageQueue = result.then(() => undefined, () => undefined)
  return result
}

function inCurrentScope(item: OutboxOperation, scope = getOfflineScope()) {
  return Boolean(scope) && item.scopeKey === scope
}

export async function enqueueOutboxOperation(input: Pick<OutboxOperation, "entity" | "op" | "data">) {
  const item: OutboxOperation = {
    ...input,
    operationId: createOperationId(),
    clientTimestamp: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    scopeKey: requireOfflineScope(),
    status: "pending",
  }
  await serializeMutation(async () => {
    const items = await read()
    items.push(item)
    await write(items)
  })
  return item
}

export async function pendingOutboxOperations(now = Date.now()) {
  return (await read()).filter((item) => (
    inCurrentScope(item) && item.status !== "conflict" && item.nextAttemptAt <= now
  ))
}

/**
 * Every queued operation regardless of backoff schedule. `pendingOutboxOperations`
 * hides ops whose retry is deferred into the future; this returns them all, which
 * is what a "N awaiting sync" UI indicator needs to count.
 */
export async function allOutboxOperations(): Promise<OutboxOperation[]> {
  return (await read()).filter((item) => inCurrentScope(item))
}

export async function acknowledgeOutboxOperation(operationIdToRemove: string) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    await write((await read()).filter((item) => (
      item.operationId !== operationIdToRemove || item.scopeKey !== scope
    )))
  })
}

export async function deferOutboxOperation(
  operationIdToDefer: string,
  now = Date.now(),
  retry?: { retryAfterMs?: number; jitter?: boolean; random?: () => number },
) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    const items = await read()
    const next = items.map((item) => {
      if (item.operationId !== operationIdToDefer || item.scopeKey !== scope) return item
      const attempts = item.attempts + 1
      return {
        ...item,
        attempts,
        nextAttemptAt: now + retryDelayMs({ attempts, ...retry }),
      }
    })
    await write(next)
  })
}

export async function markOutboxConflict(operationId: string, result: OutboxPushResult) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    const items = await read()
    await write(items.map((item) => (
      item.operationId === operationId && item.scopeKey === scope
        ? {
            ...item,
            status: "conflict" as const,
            conflict: {
              ...(result.error ? { error: result.error } : {}),
              ...(result.serverData ? { serverData: result.serverData } : {}),
              recordedAt: Date.now(),
            },
          }
        : item
    )))
  })
}

export async function conflictOutboxOperations() {
  return (await allOutboxOperations()).filter((item) => item.status === "conflict")
}

export async function retryOutboxConflict(operationId: string, dataPatch?: Record<string, unknown>) {
  const scope = requireOfflineScope()
  await serializeMutation(async () => {
    const items = await read()
    await write(items.map((item) => (
      item.operationId === operationId && item.scopeKey === scope && item.status === "conflict"
        ? {
            ...item,
            // The server idempotently pins both successful and conflicting
            // operationIds. A user-directed retry must therefore be a new
            // operation while retaining the same entity payload/client id;
            // reusing the old id would only replay the pinned conflict.
            operationId: createOperationId(),
            clientTimestamp: Date.now(),
            data: dataPatch ? { ...item.data, ...dataPatch } : item.data,
            status: "pending" as const,
            conflict: undefined,
            attempts: 0,
            nextAttemptAt: 0,
          }
        : item
    )))
  })
}

export async function clearOutbox() {
  const scope = getOfflineScope()
  if (!scope) return
  await serializeMutation(async () => {
    await write((await read()).filter((item) => item.scopeKey !== scope))
  })
}

export async function flushOutbox(
  send: (operations: OutboxOperation[]) => Promise<{ results?: OutboxPushResult[] }>,
  options?: { now?: () => number; random?: () => number },
) {
  const pending = await pendingOutboxOperations()
  if (pending.length === 0) return { sent: 0, deferred: 0, conflicted: 0 }
  try {
    const response = await send(pending)
    const resultById = new Map((response.results ?? []).map((result) => [result.operationId, result.status]))
    let sent = 0
    let deferred = 0
    let conflicted = 0
    for (const item of pending) {
      const status = resultById.get(item.operationId)
      if (status === "ok") {
        await acknowledgeOutboxOperation(item.operationId)
        sent += 1
      } else if (status === "conflict") {
        const result = response.results?.find((entry) => entry.operationId === item.operationId)
        await markOutboxConflict(item.operationId, result ?? { operationId: item.operationId, status })
        conflicted += 1
      } else {
        await deferOutboxOperation(item.operationId, options?.now?.() ?? Date.now(), {
          // This is the v1 compatibility queue. Preserve its historical
          // deterministic backoff unless the server explicitly supplies a
          // Retry-After window that benefits from cohort spreading.
          jitter: false,
          random: options?.random,
        })
        deferred += 1
      }
    }
    return { sent, deferred, conflicted }
  } catch (error) {
    const retryAfterMs = retryAfterMsFromError(error)
    for (const item of pending) {
      await deferOutboxOperation(item.operationId, options?.now?.() ?? Date.now(), {
        retryAfterMs,
        jitter: retryAfterMs !== undefined,
        random: options?.random,
      })
    }
    return {
      sent: 0,
      deferred: pending.length,
      conflicted: 0,
      error: error instanceof Error ? error.message : "SYNC_PUSH_FAILED",
      retryAfterMs,
    }
  }
}
