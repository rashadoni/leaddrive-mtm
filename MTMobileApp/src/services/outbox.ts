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
  /** Private document dependencies for attendance only; never sent to legacy sync. */
  attendanceDocuments?: import("./attendance-contract").AttendanceDocument[]
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

export async function enqueueOutboxOperation(input: Pick<OutboxOperation, "entity" | "op" | "data" | "attendanceDocuments">, expectedScope?: string) {
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
    if (expectedScope && requireOfflineScope() !== expectedScope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    const items = await read()
    if (expectedScope && requireOfflineScope() !== expectedScope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    if (item.entity === "workdays" && item.data.attendanceMark && items.some(row => row.scopeKey === item.scopeKey && row.entity === "attendanceConsents")) {
      const { redactAttendanceMarkData } = await import("./attendance-location-contract")
      item.data = redactAttendanceMarkData(item.data)
    }
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

/**
 * Requeue a rejected operation as a fresh one.
 *
 * Returns the NEW operationId, or null when there was nothing to retry (the
 * row is gone, belongs to another scope, or is not in conflict). Callers that
 * then wait for this operation's outcome need that id: the old one is dead by
 * design, and waiting on it reports the pinned conflict for ever — which is
 * exactly how "Повторить" used to do nothing (field UX audit B1, task T1).
 */
export async function retryOutboxConflict(
  operationId: string,
  dataPatch?: Record<string, unknown>,
): Promise<string | null> {
  const scope = requireOfflineScope()
  let nextOperationId: string | null = null
  await serializeMutation(async () => {
    const items = await read()
    await write(items.map((item) => {
      if (item.operationId !== operationId || item.scopeKey !== scope || item.status !== "conflict") {
        return item
      }
      // The server idempotently pins both successful and conflicting
      // operationIds. A user-directed retry must therefore be a new
      // operation while retaining the same entity payload/client id;
      // reusing the old id would only replay the pinned conflict.
      nextOperationId = createOperationId()
      return {
        ...item,
        operationId: nextOperationId,
        clientTimestamp: Date.now(),
        data: dataPatch ? { ...item.data, ...dataPatch } : item.data,
        status: "pending" as const,
        conflict: undefined,
        attempts: 0,
        nextAttemptAt: 0,
      }
    }))
  })
  return nextOperationId
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
  options?: { now?: () => number; random?: () => number; select?: (operation: OutboxOperation) => boolean; guard?: () => void },
) {
  options?.guard?.()
  const pending = (await pendingOutboxOperations()).filter(item => options?.select ? options.select(item) : true)
  options?.guard?.()
  if (pending.length === 0) return { sent: 0, deferred: 0, conflicted: 0 }
  try {
    const response = await send(pending)
    options?.guard?.()
    const resultById = new Map((response.results ?? []).map((result) => [result.operationId, result.status]))
    let sent = 0
    let deferred = 0
    let conflicted = 0
    for (const item of pending) {
      options?.guard?.()
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
    // A lost scope/admission must not acknowledge or reschedule another session.
    options?.guard?.()
    const retryAfterMs = retryAfterMsFromError(error)
    for (const item of pending) {
      options?.guard?.()
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

/** Capture the owner before any await; uploaded ids must be durable before create. */
export async function persistAttendanceDocuments(operationId: string, scopeKey: string, documents: NonNullable<OutboxOperation["attendanceDocuments"]>) {
  return serializeMutation(async () => {
    if (requireOfflineScope() !== scopeKey) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    const items = await read()
    if (requireOfflineScope() !== scopeKey) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    const item = items.find(row => row.operationId === operationId && row.scopeKey === scopeKey && row.entity === "attendanceRequests" && row.op === "create")
    if (!item) throw new Error("ATTENDANCE_OPERATION_MISSING")
    item.attendanceDocuments = documents
    item.data = { ...item.data, attachmentIds: documents.map(document => document.uploadedId).filter((id): id is string => Boolean(id)) }
    await write(items)
    if (requireOfflineScope() !== scopeKey) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    return item
  })
}

/** Cleanup cannot race an already-started durable outbox mutation or inspect only
 * the newly active account. A queued photo still belongs to its original owner. */
export async function removeUnqueuedAttendanceDocuments(
  documents: NonNullable<OutboxOperation["attendanceDocuments"]>,
  remove: (document: NonNullable<OutboxOperation["attendanceDocuments"]>[number]) => Promise<void>,
) {
  await serializeMutation(async () => {
    // A malformed/unreadable queue is not proof that a private file is unused.
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.entity !== "string" || typeof item.scopeKey !== "string"
      || (item.attendanceDocuments !== undefined && (!Array.isArray(item.attendanceDocuments)
        || item.attendanceDocuments.some((document: unknown) => !document || typeof document !== "object"
          || typeof (document as { path?: unknown }).path !== "string" || typeof (document as { clientAttachmentId?: unknown }).clientAttachmentId !== "string"))))) {
      throw new Error("ATTENDANCE_OUTBOX_UNREADABLE")
    }
    const operations = parsed as OutboxOperation[]
    for (const document of documents) {
      const referenced = operations.some(item => item.entity === "attendanceRequests"
        && item.scopeKey === document.scopeKey
        && item.attendanceDocuments?.some(saved => saved.path === document.path && saved.clientAttachmentId === document.clientAttachmentId))
      if (!referenced) await remove(document)
    }
  })
}

async function readAttendancePrivacyQueue(): Promise<OutboxOperation[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  const parsed: unknown = raw === null ? [] : JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some(row => !row || typeof row.scopeKey !== "string" || typeof row.operationId !== "string"
    || typeof row.entity !== "string" || !row.data || typeof row.data !== "object" || Array.isArray(row.data))) throw new Error("ATTENDANCE_OUTBOX_UNREADABLE")
  return parsed as OutboxOperation[]
}
export async function attendancePrivacyOperations(scope: string) {
  if (requireOfflineScope() !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
  const rows = await readAttendancePrivacyQueue()
  if (requireOfflineScope() !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
  return rows.filter(row => row.scopeKey === scope)
}

// Consent withdrawals and their coordinate removal share ONE durable write.
// A capture/transport already in progress observes the synchronous epoch fence.
const attendancePrivacyEpochs = new Map<string, number>()
const attendancePrivacyBlockedScopes = new Set<string>()
export const attendancePrivacyBlocked = (scope: string) => attendancePrivacyBlockedScopes.has(scope)
export function releaseAttendancePrivacyBlock(scope: string, epoch: number) {
  if (attendancePrivacyEpoch(scope) === epoch) attendancePrivacyBlockedScopes.delete(scope)
}
export const attendancePrivacyEpoch = (scope: string) => attendancePrivacyEpochs.get(scope) ?? 0
export async function queueAttendanceConsent(scope: string, input: import('./attendance-location-contract').AttendanceConsentInput) {
  // Even an unsuccessful disk write must stop this running process from
  // sending a previously captured fix. No success is claimed until persisted.
  attendancePrivacyBlockedScopes.add(scope)
  attendancePrivacyEpochs.set(scope, attendancePrivacyEpoch(scope) + 1)
  return serializeMutation(async () => {
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    const items = await readAttendancePrivacyQueue()
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    const pending = items.find(item => item.scopeKey === scope && item.entity === 'attendanceConsents' && item.status === 'pending')
    if (pending) throw new Error('ATTENDANCE_CONSENT_PENDING')
    const item: OutboxOperation = { operationId: input.requestId, entity: 'attendanceConsents', op: 'create', data: { ...input },
      clientTimestamp: Date.now(), attempts: 0, nextAttemptAt: 0, scopeKey: scope, status: 'pending' }
    const { redactAttendanceMarkData } = await import('./attendance-location-contract')
    const next = items.filter(row => !(row.scopeKey === scope && row.entity === 'attendanceConsents' && row.status === 'conflict'))
      .map(row => row.scopeKey === scope && row.entity === 'workdays' ? { ...row, data: redactAttendanceMarkData(row.data) } : row)
    next.push(item)
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    await write(next)
    return item
  })
}
/** Re-read rather than sending a stale flush snapshot. Preserve identities,
 * original timestamps, all other payload fields, and other accounts verbatim. */
export async function prepareAttendanceMarks(scope: string, operationIds: string[], consentId: string | null) {
  return serializeMutation(async () => {
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    const items = await readAttendancePrivacyQueue()
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    const blocked = attendancePrivacyBlocked(scope) || items.some(item => item.scopeKey === scope && item.entity === 'attendanceConsents')
    const { redactAttendanceMarkData } = await import('./attendance-location-contract')
    let changed = false
    const next = items.map(item => {
      const mark = item.data.attendanceMark as import('./attendance-location-contract').AttendanceMark | undefined
      if (item.scopeKey !== scope || item.entity !== 'workdays' || !mark) return item
      if (!blocked && consentId && mark.consentRevisionId === consentId) return item
      const data = redactAttendanceMarkData(item.data)
      if (JSON.stringify(data) === JSON.stringify(item.data)) return item
      changed = true; return { ...item, data }
    })
    if (changed) await write(next)
    if (requireOfflineScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
    return next.filter(item => item.scopeKey === scope && operationIds.includes(item.operationId))
  })
}
