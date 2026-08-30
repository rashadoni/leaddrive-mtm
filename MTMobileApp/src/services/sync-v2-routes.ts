import AsyncStorage from "@react-native-async-storage/async-storage"
import { routeFieldStorageKey } from "../runtime/route-field-profile"
import { api } from "./api"
import type { RetryableSyncError } from "./sync-retry"

/**
 * Read-only Route Field sync v2 pilot.
 *
 * This cache intentionally does not feed the shipping v1 route UI yet.  It
 * lets an explicitly enrolled device prove the v2 pagination/cursor contract
 * alongside the compatible v1 read path, without creating a second mutation
 * authority or replacing a working offline projection prematurely.
 */
export const ROUTE_V2_STREAM = "routes" as const
export const ROUTE_V2_DEFAULT_PAGE_SIZE = 200
export const ROUTE_V2_MAX_PAGES_PER_RUN = 3
/** Prevent a malformed 413 hint from turning one fair pass into a hot loop. */
export const ROUTE_V2_MAX_PAGE_REDUCTIONS = 3

type PlainRecord = Record<string, unknown>

export type RouteV2StoredRecord = {
  revision: string
  data: PlainRecord
}

export type RouteV2Snapshot = {
  /** Server-issued snapshot identity; never manufacture or parse it locally. */
  snapshotId: string
  nextPage: string
  records: Record<string, RouteV2StoredRecord>
}

export type RouteV2State = {
  version: 1
  epoch: string
  /** Only a completed snapshot or an applied delta page can advance this. */
  cursor: string | null
  records: Record<string, RouteV2StoredRecord>
  /** Retain a revision after deletion so a replayed older UPSERT cannot win. */
  tombstoneRevisions: Record<string, string>
  /** A partial snapshot is staged separately until its final page commits. */
  snapshot: RouteV2Snapshot | null
}

export type RouteV2SyncOutcome = {
  status: "synced" | "partial" | "resnapshot-required" | "disabled"
  pages: number
  complete: boolean
  /** Present only when the endpoint has definitively withdrawn v2 access. */
  disabledReason?: string
}

type RouteV2Item = {
  entityType: "route"
  id: string
  revision: string
  data: PlainRecord
}

type RouteV2Tombstone = {
  entityType: "route"
  id: string
  revision: string
  reason: string | null
}

type RouteV2Envelope = {
  snapshotId: string | null
  items: RouteV2Item[]
  tombstones: RouteV2Tombstone[]
  nextPage: string | null
  complete: boolean
  nextCursor: string | null
}

type RouteV2RequestKind = "snapshot" | "delta"

function stateKey(tenantId: string, agentId: string) {
  return routeFieldStorageKey(`sync-v2:${ROUTE_V2_STREAM}:${tenantId}:${agentId}`)
}

export function routeV2RoutesStorageKey(tenantId: string, agentId: string) {
  return stateKey(tenantId, agentId)
}

function emptyState(epoch: string): RouteV2State {
  return {
    version: 1,
    epoch,
    cursor: null,
    records: {},
    tombstoneRevisions: {},
    snapshot: null,
  }
}

function object(value: unknown): PlainRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PlainRecord : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function decimalRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)
}

function opaqueToken(value: unknown): value is string {
  // The APK never parses a cursor. Bound its local storage size only so a
  // malformed proxy response cannot grow a durable key without limit. This
  // mirrors the server's MTM_MOBILE_SYNC_V2_MAX_CURSOR_LENGTH contract.
  return typeof value === "string" && value.length > 0 && value.length <= 4_096
}

/** Compare decimal revisions without relying on BigInt support in older JS engines. */
export function compareRouteV2Revision(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length
  if (left === right) return 0
  return left < right ? -1 : 1
}

function parseStoredRecord(value: unknown): RouteV2StoredRecord | null {
  const record = object(value)
  const revision = record && decimalRevision(record.revision) ? record.revision : null
  const data = record ? object(record.data) : null
  return revision && data ? { revision, data } : null
}

function parseStoredState(raw: unknown): RouteV2State | null {
  const value = object(raw)
  const epoch = value && nonEmptyString(value.epoch)
  if (!value || value.version !== 1 || !epoch) return null
  const cursor = value.cursor === null ? null : opaqueToken(value.cursor) ? value.cursor : null
  const recordsRaw = object(value.records) ?? {}
  const tombstonesRaw = object(value.tombstoneRevisions) ?? {}
  const records: Record<string, RouteV2StoredRecord> = {}
  const tombstoneRevisions: Record<string, string> = {}
  for (const [id, record] of Object.entries(recordsRaw)) {
    const parsed = parseStoredRecord(record)
    if (id && parsed) records[id] = parsed
  }
  for (const [id, revision] of Object.entries(tombstonesRaw)) {
    if (id && decimalRevision(revision)) tombstoneRevisions[id] = revision
  }

  const snapshotRaw = value.snapshot === null ? null : object(value.snapshot)
  const snapshotId = snapshotRaw ? nonEmptyString(snapshotRaw.snapshotId) : null
  const snapshot = snapshotRaw && snapshotId && opaqueToken(snapshotRaw.nextPage)
    ? {
        snapshotId,
        nextPage: snapshotRaw.nextPage,
        records: Object.fromEntries(Object.entries(object(snapshotRaw.records) ?? {}).flatMap(([id, record]) => {
          const parsed = parseStoredRecord(record)
          return id && parsed ? [[id, parsed]] : []
        })),
      }
    : null

  // A valid partial snapshot never has a committed delta cursor. Treat a
  // corrupt mixed state as a v2-only resnapshot rather than risking a cursor
  // advance against incomplete records.
  if (snapshot && cursor) return null
  return { version: 1, epoch, cursor, records, tombstoneRevisions, snapshot }
}

export async function readRouteV2RoutesState(tenantId: string, agentId: string, epoch: string): Promise<RouteV2State> {
  const stored = await readStoredRouteV2RoutesState(tenantId, agentId)
  return stored?.epoch === epoch ? stored : emptyState(epoch)
}

async function readStoredRouteV2RoutesState(tenantId: string, agentId: string): Promise<RouteV2State | null> {
  const raw = await AsyncStorage.getItem(stateKey(tenantId, agentId))
  if (!raw) return null
  try {
    return parseStoredState(JSON.parse(raw))
  } catch {
    return null
  }
}

async function writeState(tenantId: string, agentId: string, state: RouteV2State) {
  // One AsyncStorage value is the local transaction boundary for this pilot:
  // route page merge and continuation/committed cursor change together.
  await AsyncStorage.setItem(stateKey(tenantId, agentId), JSON.stringify(state))
}

/** Deletes only the routes-v2 projection/cursor. Never touch v1 cache/outbox/media. */
export async function clearRouteV2RoutesState(tenantId: string, agentId: string) {
  await AsyncStorage.removeItem(stateKey(tenantId, agentId))
}

function parseItem(value: unknown): RouteV2Item {
  const item = object(value)
  const id = nonEmptyString(item?.id)
  const data = object(item?.data)
  if (!item || item.entityType !== "route" || !id || !decimalRevision(item.revision) || !data) {
    throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
  }
  return { entityType: "route", id, revision: item.revision, data }
}

function parseTombstone(value: unknown): RouteV2Tombstone {
  const tombstone = object(value)
  const id = nonEmptyString(tombstone?.id)
  if (!tombstone || tombstone.entityType !== "route" || !id || !decimalRevision(tombstone.revision)) {
    throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
  }
  return {
    entityType: "route",
    id,
    revision: tombstone.revision,
    reason: typeof tombstone.reason === "string" ? tombstone.reason : null,
  }
}

function parseEnvelope(raw: unknown, kind: RouteV2RequestKind): RouteV2Envelope {
  const response = object(raw)
  const itemsRaw = Array.isArray(response?.items) ? response.items : null
  const tombstonesRaw = Array.isArray(response?.tombstones) ? response.tombstones : null
  if (
    !response ||
    response.success !== true ||
    response.protocolVersion !== 2 ||
    response.stream !== ROUTE_V2_STREAM ||
    !itemsRaw ||
    !tombstonesRaw ||
    typeof response.complete !== "boolean"
  ) throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")

  const nextPage = response.nextPage === null ? null : opaqueToken(response.nextPage) ? response.nextPage : undefined
  const nextCursor = response.nextCursor === null ? null : opaqueToken(response.nextCursor) ? response.nextCursor : undefined
  const snapshotId = response.snapshotId === undefined || response.snapshotId === null
    ? null
    : nonEmptyString(response.snapshotId)
  if (nextPage === undefined || nextCursor === undefined) throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
  const envelope: RouteV2Envelope = {
    snapshotId,
    items: itemsRaw.map(parseItem),
    tombstones: tombstonesRaw.map(parseTombstone),
    nextPage,
    complete: response.complete,
    nextCursor,
  }

  if (kind === "snapshot") {
    if (envelope.tombstones.length > 0 || !snapshotId) throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
    if (envelope.complete) {
      if (envelope.nextPage || !envelope.nextCursor) throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
    } else if (!envelope.nextPage || envelope.nextCursor) {
      throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
    }
  } else if (envelope.nextPage || !envelope.nextCursor) {
    throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
  }

  return envelope
}

function mergeSnapshotRecords(
  current: Record<string, RouteV2StoredRecord>,
  items: RouteV2Item[],
): Record<string, RouteV2StoredRecord> {
  const next = { ...current }
  for (const item of items) {
    const existing = next[item.id]
    if (!existing || compareRouteV2Revision(item.revision, existing.revision) >= 0) {
      next[item.id] = { revision: item.revision, data: item.data }
    }
  }
  return next
}

function mergeDelta(state: RouteV2State, envelope: RouteV2Envelope): RouteV2State {
  const records = { ...state.records }
  const tombstoneRevisions = { ...state.tombstoneRevisions }
  const operations = [
    ...envelope.items.map((item) => ({ kind: "upsert" as const, id: item.id, revision: item.revision, data: item.data })),
    ...envelope.tombstones.map((item) => ({ kind: "tombstone" as const, id: item.id, revision: item.revision })),
  ].sort((left, right) => {
    const revisionOrder = compareRouteV2Revision(left.revision, right.revision)
    if (revisionOrder !== 0) return revisionOrder
    // A same-revision tombstone wins over an upsert should a response ever
    // contain both while the device replays a page after process death.
    return left.kind === right.kind ? 0 : left.kind === "upsert" ? -1 : 1
  })

  for (const operation of operations) {
    const recordRevision = records[operation.id]?.revision
    const tombstoneRevision = tombstoneRevisions[operation.id]
    const highest = recordRevision && tombstoneRevision
      ? compareRouteV2Revision(recordRevision, tombstoneRevision) >= 0 ? recordRevision : tombstoneRevision
      : recordRevision ?? tombstoneRevision
    if (highest && compareRouteV2Revision(operation.revision, highest) < 0) continue

    if (operation.kind === "tombstone") {
      delete records[operation.id]
      tombstoneRevisions[operation.id] = operation.revision
      continue
    }
    // A same-revision tombstone already applied from a replay must stay gone.
    if (tombstoneRevision && compareRouteV2Revision(operation.revision, tombstoneRevision) <= 0) continue
    records[operation.id] = { revision: operation.revision, data: operation.data }
    delete tombstoneRevisions[operation.id]
  }

  return { ...state, records, tombstoneRevisions }
}

function errorStatus(error: unknown): number | undefined {
  const status = (error as RetryableSyncError | null)?.status
  return typeof status === "number" ? status : undefined
}

function errorCode(error: unknown): string | undefined {
  const code = (error as RetryableSyncError | null)?.code
  return typeof code === "string" ? code : undefined
}

function reducedPageSize(current: number, error: unknown): number | null {
  const recommended = (error as { recommendedPageSize?: unknown } | null)?.recommendedPageSize
  const parsedRecommendation = typeof recommended === "number" && Number.isFinite(recommended)
    ? Math.floor(recommended)
    : null
  const candidate = parsedRecommendation == null
    ? Math.floor(current / 2)
    : Math.min(current - 1, parsedRecommendation)
  return candidate >= 1 ? candidate : null
}

async function requestPage(cursor: string | null, pageSize: number): Promise<{ raw: unknown; pageSize: number }> {
  let effectivePageSize = pageSize
  let reductions = 0
  while (true) {
    try {
      return { raw: await api.syncV2Routes(cursor, effectivePageSize), pageSize: effectivePageSize }
    } catch (error) {
      if (errorStatus(error) !== 413) throw error
      const reduced = reducedPageSize(effectivePageSize, error)
      if (!reduced || reductions >= ROUTE_V2_MAX_PAGE_REDUCTIONS) throw error
      effectivePageSize = reduced
      reductions += 1
    }
  }
}

/**
 * Pulls at most a few pages per supervisor pass for tenant fairness.  The
 * durable opaque cursor or snapshot continuation resumes the next pass.  The
 * caller must invoke this only after a current bootstrap advertises the exact
 * cohort and epoch; an endpoint-side 403 is still handled defensively.
 */
export async function syncRouteV2Routes(input: {
  tenantId: string
  agentId: string
  epoch: string
  pageSize?: number
  maxPages?: number
}): Promise<RouteV2SyncOutcome> {
  if (!input.tenantId || !input.agentId || !input.epoch) throw new Error("MOBILE_SYNC_V2_SCOPE_INVALID")
  let pageSize = Math.max(1, Math.min(500, Math.floor(input.pageSize ?? ROUTE_V2_DEFAULT_PAGE_SIZE)))
  const maxPages = Math.max(1, Math.min(ROUTE_V2_MAX_PAGES_PER_RUN, Math.floor(input.maxPages ?? ROUTE_V2_MAX_PAGES_PER_RUN)))
  const stored = await readStoredRouteV2RoutesState(input.tenantId, input.agentId)
  let state = stored?.epoch === input.epoch ? stored : emptyState(input.epoch)
  // Epoch changes are cohort/scope changes, not a signal to touch v1 state.
  // Persist the fresh state before a request so a process death cannot resume
  // an opaque cursor belonging to the previous server epoch.
  if (!stored || stored.epoch !== input.epoch) {
    await writeState(input.tenantId, input.agentId, state)
  }

  let pages = 0
  while (pages < maxPages) {
    const kind: RouteV2RequestKind = state.snapshot || !state.cursor ? "snapshot" : "delta"
    const requestCursor = state.snapshot?.nextPage ?? state.cursor
    let page: { raw: unknown; pageSize: number }
    try {
      page = await requestPage(requestCursor, pageSize)
      // A 413 retry succeeded with a smaller page; use that size for the
      // remainder of this bounded pass instead of repeatedly probing 200.
      pageSize = page.pageSize
    } catch (error) {
      const status = errorStatus(error)
      const code = errorCode(error)
      if (status === 403 && code === "MOBILE_SYNC_V2_COHORT_DISABLED") {
        await clearRouteV2RoutesState(input.tenantId, input.agentId)
        return { status: "disabled", pages, complete: false, disabledReason: code }
      }
      if (
        status === 409 ||
        (status === 400 && code === "MOBILE_SYNC_V2_CURSOR_INVALID") ||
        (status === 400 && code === "MOBILE_SYNC_V2_CURSOR_EXPIRED")
      ) {
        await clearRouteV2RoutesState(input.tenantId, input.agentId)
        return { status: "resnapshot-required", pages, complete: false }
      }
      throw error
    }

    const envelope = parseEnvelope(page.raw, kind)
    pages += 1
    if (kind === "snapshot") {
      if (!envelope.snapshotId) throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
      if (!envelope.complete && requestCursor && envelope.nextPage === requestCursor) {
        throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
      }
      const snapshot = state.snapshot ?? { snapshotId: envelope.snapshotId, nextPage: "", records: {} }
      if (snapshot.snapshotId !== envelope.snapshotId) {
        throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
      }
      const records = mergeSnapshotRecords(snapshot.records, envelope.items)
      if (envelope.complete) {
        state = {
          version: 1,
          epoch: input.epoch,
          cursor: envelope.nextCursor,
          records,
          tombstoneRevisions: {},
          snapshot: null,
        }
        await writeState(input.tenantId, input.agentId, state)
        return { status: "synced", pages, complete: true }
      }
      state = {
        ...state,
        cursor: null,
        snapshot: { snapshotId: envelope.snapshotId, nextPage: envelope.nextPage!, records },
      }
      await writeState(input.tenantId, input.agentId, state)
      continue
    }

    if (requestCursor && envelope.nextCursor === requestCursor) {
      throw new Error("MOBILE_SYNC_V2_PROTOCOL_INVALID")
    }
    state = {
      ...mergeDelta(state, envelope),
      cursor: envelope.nextCursor,
      snapshot: null,
    }
    await writeState(input.tenantId, input.agentId, state)
    if (envelope.complete) return { status: "synced", pages, complete: true }
  }

  return { status: "partial", pages, complete: false }
}
