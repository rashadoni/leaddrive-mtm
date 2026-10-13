import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "./api"
import { getOfflineScope, offlineScopeKey } from "./offline-scope"
import { mayUseOwnAttendanceRequests } from "./attendance-access"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { allOutboxOperations, enqueueOutboxOperation, persistAttendanceDocuments, removeUnqueuedAttendanceDocuments, type OutboxOperation, type OutboxPushResult } from "./outbox"
import { attendanceUuid, validAttendanceInput, type AttendanceDocument, type AttendanceInput, type AttendanceQuota, type AttendanceRequest } from "./attendance-contract"

const cacheKey = (scope: string) => `@mtm_attendance_requests_v1:${scope}`
type Cached = { items: AttendanceRequest[]; nextCursor: string | null; updatedAt: string | null }
const emptyCache = (): Cached => ({ items: [], nextCursor: null, updatedAt: null })
// Load native FS only when needed, using Metro/Jest's shared CommonJS loader.
const filesystem = async (): Promise<typeof import("react-native-fs")> => {
  const loaded = require("react-native-fs")
  return loaded.default ?? loaded
}

// Screen epochs protect React state; these fences also protect persisted data.
// Clearing on a refusal must win over every read already in flight.
const readGeneration = new Map<string, number>()
const clearGeneration = new Map<string, number>()
let cacheQueue: Promise<void> = Promise.resolve()
function nextRead(scope: string) {
  const next = (readGeneration.get(scope) ?? 0) + 1
  readGeneration.set(scope, next)
  return next
}
function cacheMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = cacheQueue.then(operation)
  cacheQueue = result.then(() => undefined, () => undefined)
  return result
}
function cacheGuard(scope: string, clearedAt: number, read?: number) {
  attendanceGuard(scope)
  if ((clearGeneration.get(scope) ?? 0) !== clearedAt || (read !== undefined && readGeneration.get(scope) !== read)) {
    throw new Error("ATTENDANCE_READ_SUPERSEDED")
  }
}

export function attendanceScope(): string {
  const agent = useAuthStore.getState().agent
  const bootstrap = useBootstrapStore.getState()
  const scope = getOfflineScope()
  if (!scope || scope !== offlineScopeKey(agent?.organizationId, agent?.id)
    || !mayUseOwnAttendanceRequests(bootstrap.data, agent, bootstrap.routeFieldAccess)) {
    throw Object.assign(new Error("ATTENDANCE_ACCESS_UNAVAILABLE"), { code: "MTM_ATTENDANCE_DISABLED", status: 403 })
  }
  return scope
}
export function attendanceGuard(scope: string): void {
  if (attendanceScope() !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
}
export function attendanceAccessDenied(error: unknown): boolean {
  return [401, 403, 404].includes((error as { status?: number })?.status ?? 0)
    || (error as Error)?.message === "SESSION_EXPIRED"
}
export async function clearAttendanceCache(scope: string) {
  clearGeneration.set(scope, (clearGeneration.get(scope) ?? 0) + 1)
  nextRead(scope)
  await cacheMutation(() => AsyncStorage.removeItem(cacheKey(scope)))
}
async function handleFailure(scope: string, error: unknown): Promise<never> {
  if (attendanceAccessDenied(error)) await clearAttendanceCache(scope)
  throw error
}
function requestDto(value: AttendanceRequest): AttendanceRequest {
  if (!value || typeof value.id !== "string" || typeof value.clientRequestId !== "string" || !value.details
    || !["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(value.status)) throw new Error("ATTENDANCE_RESPONSE_INVALID")
  // Cache only the own-list fields needed on the phone. Never cache correction
  // ledger snapshots, employee directory, GPS or any extra future server fields.
  const { id, clientRequestId, status, startDate, endDate, reason, submittedAt, decisionNote, decidedAt, cancelledAt, version } = value
  const { kind, unit, startTime, endTime, timezone, attachmentIds } = value.details
  const snapshot = value.details.dayKind
  const dayKind = snapshot && typeof snapshot.code === "string" && snapshot.names
    && typeof snapshot.names.az === "string" && typeof snapshot.names.ru === "string" && typeof snapshot.names.en === "string"
    ? { code: snapshot.code, names: { az: snapshot.names.az, ru: snapshot.names.ru, en: snapshot.names.en } } : undefined
  return { id, clientRequestId, status, startDate, endDate, reason, submittedAt, decisionNote, decidedAt, cancelledAt, version,
    details: { kind, unit, startTime, endTime, timezone, attachmentIds, ...(dayKind ? { dayKind } : {}) } }
}
export async function cachedAttendanceRequests(scope: string): Promise<Cached> {
  attendanceGuard(scope)
  const clearedAt = clearGeneration.get(scope) ?? 0
  const raw = await AsyncStorage.getItem(cacheKey(scope))
  cacheGuard(scope, clearedAt)
  if (!raw) return emptyCache()
  try {
    const parsed = JSON.parse(raw)
    return { items: parsed.items.map(requestDto), nextCursor: parsed.nextCursor ?? null, updatedAt: parsed.updatedAt ?? null }
  } catch { return emptyCache() }
}
export async function loadAttendanceRequests(scope: string, cursor?: string): Promise<Cached> {
  const read = nextRead(scope), clearedAt = clearGeneration.get(scope) ?? 0
  const guard = () => cacheGuard(scope, clearedAt, read)
  try {
    guard()
    const response = await api.getAttendanceRequests(cursor, guard)
    guard()
    if (response?.success !== true || !Array.isArray(response.data?.items)) throw new Error("ATTENDANCE_RESPONSE_INVALID")
    const loaded: AttendanceRequest[] = response.data.items.map(requestDto)
    return await cacheMutation(async () => {
      guard()
      const old = cursor ? await cachedAttendanceRequests(scope) : emptyCache()
      guard()
      const items = [...new Map<string, AttendanceRequest>([...old.items, ...loaded].map(row => [row.id, row])).values()]
      const next = { items, nextCursor: response.data.nextCursor ?? null, updatedAt: new Date().toISOString() }
      await AsyncStorage.setItem(cacheKey(scope), JSON.stringify(next))
      guard()
      return next
    })
  } catch (error) { return handleFailure(scope, error) }
}
export async function loadAttendanceQuota(scope: string, month: string): Promise<AttendanceQuota> {
  try {
    attendanceGuard(scope)
    const response = await api.getAttendanceQuota(month, () => attendanceGuard(scope))
    attendanceGuard(scope)
    if (response?.success !== true || response.data?.month !== month) throw new Error("ATTENDANCE_RESPONSE_INVALID")
    return response.data
  } catch (error) { return handleFailure(scope, error) }
}
export async function keepAttendanceDocument(scope: string, capturedPath: string): Promise<AttendanceDocument> {
  attendanceGuard(scope)
  const fs = await filesystem()
  const directory = `${fs.DocumentDirectoryPath}/attendance-documents`
  const clientAttachmentId = attendanceUuid()
  const path = `${directory}/${clientAttachmentId}.jpg`
  const source = capturedPath.replace(/^file:\/\//, "")
  if (!source.startsWith("/") || /^(https?|content):/i.test(source)) throw new Error("ATTENDANCE_DOCUMENT_LOCAL_REQUIRED")
  const stat = await fs.stat(source)
  if (!stat.isFile() || Number(stat.size) < 1 || Number(stat.size) > 5 * 1024 * 1024) throw new Error("ATTENDANCE_DOCUMENT_SIZE")
  attendanceGuard(scope)
  await fs.mkdir(directory, { NSURLIsExcludedFromBackupKey: true })
  await fs.copyFile(source, path)
  try { attendanceGuard(scope) } catch (error) { await fs.unlink(path).catch(() => {}); throw error }
  return { clientAttachmentId, path, scopeKey: scope }
}
export async function removeAttendanceDocument(document: AttendanceDocument) {
  const fs = await filesystem()
  if (document.path === `${fs.DocumentDirectoryPath}/attendance-documents/${document.clientAttachmentId}.jpg`) {
    await fs.unlink(document.path).catch(() => {})
  }
}
/** Draft cleanup preserves files already handed to any account's durable queue. */
export async function discardAttendanceDraftDocuments(documents: AttendanceDocument[]) {
  await removeUnqueuedAttendanceDocuments(documents, removeAttendanceDocument)
}
export async function queueAttendanceRequest(scope: string, input: AttendanceInput, documents: AttendanceDocument[]) {
  attendanceGuard(scope)
  if (!validAttendanceInput(input) || documents.length > 3 || documents.some(document => document.scopeKey !== scope) || input.attachmentIds.length !== 0) throw new Error("ATTENDANCE_INPUT_INVALID")
  const existing = (await allOutboxOperations()).find(row => row.entity === "attendanceRequests" && row.op === "create" && row.data.clientRequestId === input.clientRequestId)
  attendanceGuard(scope)
  if (existing) {
    const original = { ...existing.data, attachmentIds: [] }
    if (JSON.stringify(original) !== JSON.stringify({ ...input, reason: input.reason.trim() })) throw new Error("ATTENDANCE_ALREADY_QUEUED")
    if (JSON.stringify((existing.attendanceDocuments ?? []).map(document => document.clientAttachmentId)) !== JSON.stringify(documents.map(document => document.clientAttachmentId))) throw new Error("ATTENDANCE_ALREADY_QUEUED")
    return existing
  }
  return enqueueOutboxOperation({ entity: "attendanceRequests", op: "create", data: { ...input, reason: input.reason.trim() }, attendanceDocuments: documents }, scope)
}
export async function queueAttendanceCancellation(scope: string, request: AttendanceRequest) {
  attendanceGuard(scope)
  if (request.status !== "PENDING" || request.details.kind === "HR_RECORD") throw new Error("ATTENDANCE_ALREADY_DECIDED")
  const ownerCache = await cachedAttendanceRequests(scope)
  attendanceGuard(scope)
  if (!ownerCache.items.some(item => item.id === request.id && item.clientRequestId === request.clientRequestId)) throw new Error("ATTENDANCE_SCOPE_CHANGED")
  const existing = (await allOutboxOperations()).find(row => row.entity === "attendanceRequests" && row.op === "update" && row.data.id === request.id)
  attendanceGuard(scope)
  if (existing) return existing
  return enqueueOutboxOperation({ entity: "attendanceRequests", op: "update", data: { id: request.id } }, scope)
}
export async function attendanceQueued(scope: string) {
  attendanceGuard(scope)
  const rows = await allOutboxOperations()
  attendanceGuard(scope)
  return rows.filter(row => row.entity === "attendanceRequests")
}
async function sendAttendanceOperation(item: OutboxOperation): Promise<OutboxPushResult> {
  const scope = item.scopeKey
  const clearedAt = clearGeneration.get(scope) ?? 0
  const guard = () => cacheGuard(scope, clearedAt)
  try {
    guard()
    let response
    if (item.op === "create") {
      let current = item
      const documents = [...(item.attendanceDocuments ?? [])]
      for (let index = 0; index < documents.length; index++) {
        guard()
        if (documents[index].uploadedId) continue
        const document = documents[index]
        const fs = await filesystem()
        if (document.scopeKey !== scope || document.path !== `${fs.DocumentDirectoryPath}/attendance-documents/${document.clientAttachmentId}.jpg`) throw Object.assign(new Error("document"), { code: "MTM_ATTENDANCE_DOCUMENT_INVALID", status: 400 })
        guard()
        const uploaded = await api.uploadAttendanceDocument(String(item.data.clientRequestId), document.clientAttachmentId, document.path, guard)
        guard()
        if (uploaded?.success !== true || typeof uploaded.data?.id !== "string") throw new Error("ATTENDANCE_RESPONSE_INVALID")
        documents[index] = { ...document, uploadedId: uploaded.data.id }
        current = await persistAttendanceDocuments(item.operationId, scope, [...documents])
        guard()
      }
      const input = current.data as AttendanceInput
      if (!validAttendanceInput(input)) throw Object.assign(new Error("input"), { code: "MTM_ATTENDANCE_REQUEST_INVALID", status: 400 })
      response = await api.submitAttendanceRequest(input, guard)
      guard()
      if (response?.data?.request?.clientRequestId !== input.clientRequestId) throw new Error("ATTENDANCE_RESPONSE_INVALID")
    } else {
      response = await api.cancelAttendanceRequest(String(item.data.id), guard)
      guard()
      if (response?.data?.request?.id !== item.data.id || response?.data?.request?.status !== "CANCELLED") throw new Error("ATTENDANCE_RESPONSE_INVALID")
    }
    if (response?.success !== true) throw new Error("ATTENDANCE_RESPONSE_INVALID")
    const row = requestDto(response.data.request)
    // A request completed after older list reads began. Those responses can
    // no longer erase this accepted row or roll a decision back to PENDING.
    nextRead(scope)
    await cacheMutation(async () => {
      cacheGuard(scope, clearedAt)
      const old = await cachedAttendanceRequests(scope)
      cacheGuard(scope, clearedAt)
      const previous = old.items.find(value => value.id === row.id)
      const latest = previous && previous.version > row.version ? previous : row
      await AsyncStorage.setItem(cacheKey(scope), JSON.stringify({ ...old, items: [latest, ...old.items.filter(value => value.id !== row.id)], updatedAt: new Date().toISOString() }))
      cacheGuard(scope, clearedAt)
    })
    guard()
    // Every id was persisted before POST. Losing the final acknowledgement
    // still retries exactly that input, even after these local copies go away.
    for (const document of item.attendanceDocuments ?? []) await removeAttendanceDocument(document)
    guard()
    return { operationId: item.operationId, status: "ok" }
  } catch (error) {
    // Never acknowledge an earlier account's response in a later session.
    if (getOfflineScope() !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    if (attendanceAccessDenied(error)) await clearAttendanceCache(scope)
    const status = (error as { status?: number }).status
    const code = (error as { code?: string }).code
    if (status && [400, 401, 403, 404, 409, 413, 422].includes(status)) {
      return { operationId: item.operationId, status: "conflict", error: typeof code === "string" && /^MTM_ATTENDANCE_[A-Z_]+$/.test(code) ? code : "MTM_ATTENDANCE_REQUEST_FAILED" }
    }
    return { operationId: item.operationId, status: "deferred" }
  }
}
/** Same durable outbox, feature-specific transport; never exposes attendance to legacy sync. */
export async function pushAttendanceAndLegacy(operations: OutboxOperation[], guard?: () => void) {
  guard?.()
  const attendance = operations.filter(item => item.entity === "attendanceRequests")
  const legacy = operations.filter(item => item.entity !== "attendanceRequests")
  const sendLegacy = async () => {
    let response
    if (legacy.some(item => item.entity === "attendanceConsents" || (item.entity === "workdays" && item.data.attendanceMark))) {
      const { pushAttendanceLocationOperations } = require("./attendance-location") as typeof import('./attendance-location')
      response = await pushAttendanceLocationOperations(legacy, guard)
    } else response = guard ? await api.syncPush(legacy, guard) : await api.syncPush(legacy)
    guard?.()
    if (response?.results?.some((result: import('./outbox').OutboxPushResult) => result.serverData?.attendanceQr !== undefined)) {
      const scope = getOfflineScope()
      if (!scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
      const { rememberAttendanceQrReceipts } = require('./attendance-qr') as typeof import('./attendance-qr')
      await rememberAttendanceQrReceipts(scope, legacy, response.results, guard)
      guard?.()
    }
    return response
  }
  if (attendance.length === 0) return sendLegacy()
  const scope = getOfflineScope()
  const results: OutboxPushResult[] = []
  if (legacy.length) {
    try { results.push(...((await sendLegacy())?.results ?? [])); guard?.() } catch { /* Keep those operations pending. */ }
  }
  for (const item of attendance) {
    guard?.()
    if (scope !== getOfflineScope()) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    // Withdrawing a feature pauses its queue. It never silently destroys evidence.
    try { attendanceGuard(item.scopeKey) } catch { continue }
    results.push(await sendAttendanceOperation(item))
    guard?.()
  }
  return { results }
}
