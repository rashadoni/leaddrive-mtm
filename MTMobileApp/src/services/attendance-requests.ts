import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "./api"
import { getOfflineScope, offlineScopeKey } from "./offline-scope"
import { hasRouteFieldAccess } from "./bootstrap"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { agentMayAttendanceRequests } from "../lib/agent-permissions"
import { allOutboxOperations, enqueueOutboxOperation, persistAttendanceDocuments, type OutboxOperation, type OutboxPushResult } from "./outbox"
import { attendanceUuid, validAttendanceInput, type AttendanceDocument, type AttendanceInput, type AttendanceQuota, type AttendanceRequest } from "./attendance-contract"

const cacheKey = (scope: string) => `@mtm_attendance_requests_v1:${scope}`
type Cached = { items: AttendanceRequest[]; nextCursor: string | null; updatedAt: string | null }
const emptyCache = (): Cached => ({ items: [], nextCursor: null, updatedAt: null })
const filesystem = async () => (await import("react-native-fs")).default

export function attendanceScope(): string {
  const agent = useAuthStore.getState().agent
  const bootstrap = useBootstrapStore.getState()
  const scope = getOfflineScope()
  if (!scope || scope !== offlineScopeKey(agent?.organizationId, agent?.id) || agent?.role !== "AGENT"
    || !hasRouteFieldAccess(bootstrap.routeFieldAccess) || !agentMayAttendanceRequests(bootstrap.data?.policies)) {
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
export async function clearAttendanceCache(scope: string) { await AsyncStorage.removeItem(cacheKey(scope)) }
async function handleFailure(scope: string, error: unknown) {
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
  return { id, clientRequestId, status, startDate, endDate, reason, submittedAt, decisionNote, decidedAt, cancelledAt, version,
    details: { kind, unit, startTime, endTime, timezone, attachmentIds } }
}
export async function cachedAttendanceRequests(scope: string): Promise<Cached> {
  attendanceGuard(scope)
  const raw = await AsyncStorage.getItem(cacheKey(scope))
  attendanceGuard(scope)
  if (!raw) return emptyCache()
  try {
    const parsed = JSON.parse(raw)
    return { items: parsed.items.map(requestDto), nextCursor: parsed.nextCursor ?? null, updatedAt: parsed.updatedAt ?? null }
  } catch { return emptyCache() }
}
export async function loadAttendanceRequests(scope: string, cursor?: string): Promise<Cached> {
  try {
    attendanceGuard(scope)
    const response = await api.getAttendanceRequests(cursor, () => attendanceGuard(scope))
    attendanceGuard(scope)
    if (response?.success !== true || !Array.isArray(response.data?.items)) throw new Error("ATTENDANCE_RESPONSE_INVALID")
    const old = cursor ? await cachedAttendanceRequests(scope) : emptyCache()
    const loaded: AttendanceRequest[] = response.data.items.map(requestDto)
    const items = [...new Map<string, AttendanceRequest>([...old.items, ...loaded].map(row => [row.id, row])).values()]
    const next = { items, nextCursor: response.data.nextCursor ?? null, updatedAt: new Date().toISOString() }
    attendanceGuard(scope)
    await AsyncStorage.setItem(cacheKey(scope), JSON.stringify(next))
    attendanceGuard(scope)
    return next
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
export async function queueAttendanceRequest(scope: string, input: AttendanceInput, documents: AttendanceDocument[]) {
  attendanceGuard(scope)
  if (!validAttendanceInput(input) || documents.length > 3 || documents.some(document => document.scopeKey !== scope) || input.attachmentIds.length !== 0) throw new Error("ATTENDANCE_INPUT_INVALID")
  const existing = (await allOutboxOperations()).find(row => row.entity === "attendanceRequests" && row.op === "create" && row.data.clientRequestId === input.clientRequestId)
  attendanceGuard(scope)
  if (existing) {
    const original = { ...existing.data, attachmentIds: [] }
    if (JSON.stringify(original) !== JSON.stringify({ ...input, reason: input.reason.trim() })) throw new Error("ATTENDANCE_ALREADY_QUEUED")
    return existing
  }
  return enqueueOutboxOperation({ entity: "attendanceRequests", op: "create", data: { ...input, reason: input.reason.trim() }, attendanceDocuments: documents }, scope)
}
export async function queueAttendanceCancellation(scope: string, request: AttendanceRequest) {
  attendanceGuard(scope)
  if (request.status !== "PENDING") throw new Error("ATTENDANCE_ALREADY_DECIDED")
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
  const guard = () => attendanceGuard(scope)
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
    const old = await cachedAttendanceRequests(scope)
    guard()
    await AsyncStorage.setItem(cacheKey(scope), JSON.stringify({ ...old, items: [row, ...old.items.filter(value => value.id !== row.id)], updatedAt: new Date().toISOString() }))
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
export async function pushAttendanceAndLegacy(operations: OutboxOperation[]) {
  const attendance = operations.filter(item => item.entity === "attendanceRequests")
  const legacy = operations.filter(item => item.entity !== "attendanceRequests")
  if (attendance.length === 0) return api.syncPush(legacy)
  const scope = getOfflineScope()
  const results: OutboxPushResult[] = []
  if (legacy.length) {
    try { results.push(...((await api.syncPush(legacy))?.results ?? [])) } catch { /* Keep those operations pending. */ }
  }
  for (const item of attendance) {
    if (scope !== getOfflineScope()) throw new Error("ATTENDANCE_SCOPE_CHANGED")
    // Withdrawing a feature pauses its queue. It never silently destroys evidence.
    try { attendanceGuard(item.scopeKey) } catch { continue }
    results.push(await sendAttendanceOperation(item))
  }
  return { results }
}
