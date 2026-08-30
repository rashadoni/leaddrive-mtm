import AsyncStorage from "@react-native-async-storage/async-storage"
import { getOfflineScope, requireOfflineScope } from "./offline-scope"
import { retryAfterMsFromError, retryDelayMs } from "./sync-retry"
import { routeFieldStorageKey } from "../runtime/route-field-profile"

/**
 * This is intentionally a separate durable journal, not an adapter over the
 * legacy v1 outbox. Route commands have a one-at-a-time causal order and a
 * server-side receipt contract; mixing them with entity sync operations would
 * make either authority able to discard or replay the other's work.
 */
const STORAGE_KEY = routeFieldStorageKey("route-command-journal-v1")

export type MobileRouteCommandPoint = {
  customerId: string
  contactId?: string | null
  plannedTime?: string | null
}

export type MobileRouteCommandRequest =
  | {
      operationId: string
      command: "CREATE_DRAFT"
      payload: { date: string; points: MobileRouteCommandPoint[] }
    }
  | {
      operationId: string
      command: "UPDATE_DRAFT"
      routeId: string
      payload: { expectedVersion: number; points: MobileRouteCommandPoint[] }
    }
  | {
      operationId: string
      command: "PUBLISH"
      routeId: string
      payload: { expectedVersion: number }
    }

export type MobileRouteCommandInput =
  | {
      command: "CREATE_DRAFT"
      payload: { date: string; points: MobileRouteCommandPoint[] }
    }
  | {
      command: "UPDATE_DRAFT"
      routeId: string
      payload: { expectedVersion: number; points: MobileRouteCommandPoint[] }
    }
  | {
      command: "PUBLISH"
      routeId: string
      payload: { expectedVersion: number }
    }

export type MobileRouteCommandAppliedResponse = {
  success: true
  data: {
    id: string
    version: number
    status?: string
    publishedVersion?: number | null
    publishedAt?: string | null
  }
  idempotent?: boolean
}

export type RouteCommandJournalItem = MobileRouteCommandRequest & {
  clientTimestamp: number
  attempts: number
  nextAttemptAt: number
  scopeKey: string
  status: "pending" | "conflict"
  conflict?: {
    error?: string
    code?: string
    status?: number
    recordedAt: number
  }
}

export type RouteCommandFlushResult = {
  sent: number
  deferred: number
  conflicted: number
  acknowledgements: Array<{
    operationId: string
    response: MobileRouteCommandAppliedResponse
  }>
  error?: string
  retryAfterMs?: number
}

export type RouteCommandSender = (
  request: MobileRouteCommandRequest,
) => Promise<unknown>

let storageQueue: Promise<void> = Promise.resolve()

function createOperationId() {
  return `rf-route-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPoint(value: unknown): value is MobileRouteCommandPoint {
  if (!isRecord(value) || typeof value.customerId !== "string") return false
  return (value.contactId === undefined || value.contactId === null || typeof value.contactId === "string")
    && (value.plannedTime === undefined || value.plannedTime === null || typeof value.plannedTime === "string")
}

function isPayloadForCommand(command: unknown, payload: unknown): boolean {
  if (!isRecord(payload)) return false
  if (command === "CREATE_DRAFT") {
    return typeof payload.date === "string" && Array.isArray(payload.points) && payload.points.every(isPoint)
  }
  if (command === "UPDATE_DRAFT") {
    return typeof payload.expectedVersion === "number"
      && Number.isFinite(payload.expectedVersion)
      && Array.isArray(payload.points)
      && payload.points.every(isPoint)
  }
  if (command === "PUBLISH") {
    return typeof payload.expectedVersion === "number" && Number.isFinite(payload.expectedVersion)
  }
  return false
}

function isJournalItem(value: unknown): value is RouteCommandJournalItem {
  if (!isRecord(value)) return false
  if (
    typeof value.operationId !== "string"
    || typeof value.command !== "string"
    || typeof value.clientTimestamp !== "number"
    || !Number.isFinite(value.clientTimestamp)
    || typeof value.attempts !== "number"
    || !Number.isFinite(value.attempts)
    || typeof value.nextAttemptAt !== "number"
    || !Number.isFinite(value.nextAttemptAt)
    || typeof value.scopeKey !== "string"
    || (value.status !== "pending" && value.status !== "conflict")
    || !isPayloadForCommand(value.command, value.payload)
  ) return false
  if (value.command !== "CREATE_DRAFT" && typeof value.routeId !== "string") return false
  if (value.conflict !== undefined && !isRecord(value.conflict)) return false
  return true
}

/**
 * A malformed journal is a data-safety event. Refuse to overwrite it: an APK
 * update must not silently turn a parse error into lost field work.
 */
async function read(): Promise<RouteCommandJournalItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("ROUTE_COMMAND_JOURNAL_CORRUPT")
  }
  if (!Array.isArray(parsed) || !parsed.every(isJournalItem)) {
    throw new Error("ROUTE_COMMAND_JOURNAL_CORRUPT")
  }
  return parsed
}

async function write(items: RouteCommandJournalItem[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation)
  storageQueue = result.then(() => undefined, () => undefined)
  return result
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("ROUTE_COMMAND_JOURNAL_INVALID_VALUE")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  }
  throw new Error("ROUTE_COMMAND_JOURNAL_INVALID_VALUE")
}

function requestFor(item: RouteCommandJournalItem): MobileRouteCommandRequest {
  if (item.command === "CREATE_DRAFT") {
    return {
      operationId: item.operationId,
      command: item.command,
      payload: clone(item.payload),
    }
  }
  return {
    operationId: item.operationId,
    command: item.command,
    routeId: item.routeId,
    payload: clone(item.payload),
  }
}

function requestFingerprint(request: MobileRouteCommandInput | RouteCommandJournalItem): string {
  const routeId = request.command === "CREATE_DRAFT" ? undefined : request.routeId
  return canonicalJson({
    command: request.command,
    ...(routeId !== undefined ? { routeId } : {}),
    payload: request.payload,
  })
}

function inCurrentScope(item: RouteCommandJournalItem, scope = getOfflineScope()) {
  return Boolean(scope) && item.scopeKey === scope
}

function errorDetails(error: unknown) {
  const candidate = error as { message?: unknown; code?: unknown; status?: unknown } | null
  return {
    error: candidate && typeof candidate.message === "string" ? candidate.message : "MOBILE_ROUTE_COMMAND_FAILED",
    ...(candidate && typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(candidate && typeof candidate.status === "number" && Number.isFinite(candidate.status)
      ? { status: candidate.status }
      : {}),
  }
}

function isTerminalConflict(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status
  // The server pins deterministic route conflicts as 409 receipts. A malformed
  // command is a client contract failure and must not be retried in a loop.
  return status === 409 || status === 400 || status === 422
}

function asAppliedResponse(value: unknown): MobileRouteCommandAppliedResponse | null {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null
  if (typeof value.data.id !== "string" || value.data.id.length === 0) return null
  if (typeof value.data.version !== "number" || !Number.isInteger(value.data.version) || value.data.version < 1) {
    return null
  }
  return value as MobileRouteCommandAppliedResponse
}

export async function enqueueRouteCommand(input: MobileRouteCommandInput): Promise<RouteCommandJournalItem> {
  const scope = requireOfflineScope()
  const snapshot = clone(input)
  const fingerprint = requestFingerprint(snapshot)
  return serializeMutation(async () => {
    // Never write an operation captured under a prior tenant/user scope after
    // logout or an account switch races with a planner action.
    if (getOfflineScope() !== scope) throw new Error("OFFLINE_SCOPE_CHANGED")
    const items = await read()
    const duplicate = items.find((item) => item.scopeKey === scope && requestFingerprint(item) === fingerprint)
    if (duplicate) return duplicate
    const item: RouteCommandJournalItem = {
      ...snapshot,
      operationId: createOperationId(),
      clientTimestamp: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
      scopeKey: scope,
      status: "pending",
    }
    await write([...items, item])
    return item
  })
}

export async function allRouteCommandJournalEntries(): Promise<RouteCommandJournalItem[]> {
  // AsyncStorage array order is the serialized enqueue order. Do not sort by
  // wall clock: two quick taps can share a millisecond, while their order is
  // still part of the durable command causality contract.
  return (await read()).filter((item) => inCurrentScope(item))
}

export async function pendingRouteCommands(now = Date.now()): Promise<RouteCommandJournalItem[]> {
  return (await allRouteCommandJournalEntries()).filter((item) => item.status === "pending" && item.nextAttemptAt <= now)
}

export async function conflictRouteCommands(): Promise<RouteCommandJournalItem[]> {
  return (await allRouteCommandJournalEntries()).filter((item) => item.status === "conflict")
}

export async function acknowledgeRouteCommand(operationId: string): Promise<boolean> {
  const scope = getOfflineScope()
  if (!scope) return false
  return serializeMutation(async () => {
    if (getOfflineScope() !== scope) return false
    const items = await read()
    const next = items.filter((item) => item.operationId !== operationId || item.scopeKey !== scope)
    if (next.length === items.length) return false
    await write(next)
    return true
  })
}

async function deferRouteCommand(
  operationId: string,
  now: number,
  retry?: { retryAfterMs?: number; jitter?: boolean; random?: () => number },
): Promise<boolean> {
  const scope = getOfflineScope()
  if (!scope) return false
  return serializeMutation(async () => {
    if (getOfflineScope() !== scope) return false
    const items = await read()
    let changed = false
    const next = items.map((item) => {
      if (item.operationId !== operationId || item.scopeKey !== scope || item.status !== "pending") return item
      changed = true
      const attempts = item.attempts + 1
      return {
        ...item,
        attempts,
        nextAttemptAt: now + retryDelayMs({ attempts, ...retry }),
      }
    })
    if (!changed) return false
    await write(next)
    return true
  })
}

async function markRouteCommandConflict(operationId: string, failure: ReturnType<typeof errorDetails>): Promise<boolean> {
  const scope = getOfflineScope()
  if (!scope) return false
  return serializeMutation(async () => {
    if (getOfflineScope() !== scope) return false
    const items = await read()
    let changed = false
    const next = items.map((item) => {
      if (item.operationId !== operationId || item.scopeKey !== scope || item.status !== "pending") return item
      changed = true
      return {
        ...item,
        status: "conflict" as const,
        conflict: { ...failure, recordedAt: Date.now() },
      }
    })
    if (!changed) return false
    await write(next)
    return true
  })
}

async function nextFlushableRouteCommand(now: number): Promise<RouteCommandJournalItem | null> {
  const pending = (await allRouteCommandJournalEntries()).filter((item) => item.status === "pending")
  const first = pending[0]
  // Preserve one causal queue: a command behind a backed-off write must never
  // leapfrog it and publish/update a route whose preceding command is unknown.
  if (!first || first.nextAttemptAt > now) return null
  return first
}

/**
 * Sends command envelopes strictly one at a time. Only a verified success
 * response removes an item. Any ambiguous network/storage result retains the
 * original operation ID so a later call reaches the server receipt instead of
 * creating a duplicate route mutation.
 */
export async function flushRouteCommandJournal(
  send: RouteCommandSender,
  options?: { now?: () => number; random?: () => number },
): Promise<RouteCommandFlushResult> {
  const result: RouteCommandFlushResult = { sent: 0, deferred: 0, conflicted: 0, acknowledgements: [] }
  const now = options?.now ?? Date.now
  while (true) {
    const item = await nextFlushableRouteCommand(now())
    if (!item) return result
    try {
      const response = asAppliedResponse(await send(requestFor(item)))
      if (!response) {
        throw Object.assign(new Error("MOBILE_ROUTE_COMMAND_RESPONSE_INVALID"), {
          code: "MOBILE_ROUTE_COMMAND_RESPONSE_INVALID",
        })
      }
      const acknowledged = await acknowledgeRouteCommand(item.operationId)
      if (!acknowledged) {
        return {
          ...result,
          deferred: result.deferred + 1,
          error: "MOBILE_ROUTE_COMMAND_SCOPE_CHANGED",
        }
      }
      result.sent += 1
      result.acknowledgements.push({ operationId: item.operationId, response })
    } catch (error) {
      const failure = errorDetails(error)
      if (isTerminalConflict(error)) {
        const marked = await markRouteCommandConflict(item.operationId, failure)
        return marked
          ? { ...result, conflicted: result.conflicted + 1, error: failure.error }
          : { ...result, deferred: result.deferred + 1, error: "MOBILE_ROUTE_COMMAND_SCOPE_CHANGED" }
      }
      const retryAfterMs = retryAfterMsFromError(error)
      const deferred = await deferRouteCommand(item.operationId, now(), {
        retryAfterMs,
        jitter: true,
        random: options?.random,
      })
      return {
        ...result,
        deferred: result.deferred + 1,
        error: deferred ? failure.error : "MOBILE_ROUTE_COMMAND_SCOPE_CHANGED",
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      }
    }
  }
}

function routeCommandError(input: {
  message: string
  code: string
  status?: number
  retryAfterMs?: number
}) {
  const error = new Error(input.message) as Error & {
    code: string
    status?: number
    retryAfterMs?: number
  }
  error.code = input.code
  if (input.status !== undefined) error.status = input.status
  if (input.retryAfterMs !== undefined) error.retryAfterMs = input.retryAfterMs
  return error
}

/**
 * Planner-facing helper. It makes persistence happen before the request and
 * either returns the server result or leaves the exact envelope safely queued.
 * A repeated UI tap reuses an equal pending/conflict envelope rather than
 * allocating another route operation ID.
 */
export async function submitRouteCommand(
  input: MobileRouteCommandInput,
  send: RouteCommandSender,
  options?: { now?: () => number; random?: () => number },
): Promise<MobileRouteCommandAppliedResponse> {
  const item = await enqueueRouteCommand(input)
  const result = await flushRouteCommandJournal(send, options)
  const acknowledgement = result.acknowledgements.find((entry) => entry.operationId === item.operationId)
  if (acknowledgement) return acknowledgement.response

  const current = (await allRouteCommandJournalEntries()).find((entry) => entry.operationId === item.operationId)
  if (current?.status === "conflict") {
    throw routeCommandError({
      message: current.conflict?.error ?? "MOBILE_ROUTE_COMMAND_CONFLICT",
      code: current.conflict?.code ?? "MOBILE_ROUTE_COMMAND_CONFLICT",
      ...(current.conflict?.status !== undefined ? { status: current.conflict.status } : {}),
    })
  }
  throw routeCommandError({
    message: result.error ?? "MOBILE_ROUTE_COMMAND_QUEUED",
    code: "MOBILE_ROUTE_COMMAND_QUEUED",
    ...(result.retryAfterMs !== undefined ? { retryAfterMs: result.retryAfterMs } : {}),
  })
}
