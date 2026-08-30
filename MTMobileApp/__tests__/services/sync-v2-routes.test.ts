import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

jest.mock("../../src/services/api", () => ({
  api: { syncV2Routes: jest.fn() },
}))

import { api } from "../../src/services/api"
import {
  ROUTE_V2_MAX_PAGE_REDUCTIONS,
  readRouteV2RoutesState,
  routeV2RoutesStorageKey,
  syncRouteV2Routes,
} from "../../src/services/sync-v2-routes"

const mockedPull = api.syncV2Routes as jest.Mock
const tenantId = "tenant-a"
const agentId = "agent-a"
const epoch = "routes-epoch-1"

function route(id: string, revision: string, data: Record<string, unknown> = { date: "2026-08-30" }) {
  return { entityType: "route", id, revision, data }
}

function snapshot(input: {
  snapshotId?: string
  items?: unknown[]
  nextPage?: string | null
  complete: boolean
  nextCursor?: string | null
}) {
  return {
    success: true,
    protocolVersion: 2,
    stream: "routes",
    snapshotId: input.snapshotId ?? "snapshot-1",
    items: input.items ?? [],
    tombstones: [],
    nextPage: input.nextPage ?? null,
    complete: input.complete,
    nextCursor: input.nextCursor ?? null,
  }
}

function delta(input: {
  items?: unknown[]
  tombstones?: unknown[]
  complete: boolean
  nextCursor: string
}) {
  return {
    success: true,
    protocolVersion: 2,
    stream: "routes",
    items: input.items ?? [],
    tombstones: input.tombstones ?? [],
    nextPage: null,
    complete: input.complete,
    nextCursor: input.nextCursor,
  }
}

describe("Route Field v2 routes shadow cache", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
  })

  it("stages an initial snapshot and advances the opaque cursor only after its final page", async () => {
    mockedPull
      .mockResolvedValueOnce(snapshot({
        items: [route("route-1", "5")],
        nextPage: "opaque-snapshot-page-2",
        complete: false,
      }))
      .mockResolvedValueOnce(snapshot({
        items: [route("route-2", "5")],
        complete: true,
        nextCursor: "opaque-delta-cursor-1",
      }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch, maxPages: 1 })).resolves.toEqual({
      status: "partial",
      pages: 1,
      complete: false,
    })
    const staged = await readRouteV2RoutesState(tenantId, agentId, epoch)
    expect(staged.cursor).toBeNull()
    expect(staged.records).toEqual({})
    expect(staged.snapshot).toMatchObject({
      snapshotId: "snapshot-1",
      nextPage: "opaque-snapshot-page-2",
      records: { "route-1": { revision: "5" } },
    })

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch, maxPages: 1 })).resolves.toEqual({
      status: "synced",
      pages: 1,
      complete: true,
    })
    const committed = await readRouteV2RoutesState(tenantId, agentId, epoch)
    expect(committed).toMatchObject({
      cursor: "opaque-delta-cursor-1",
      snapshot: null,
      records: {
        "route-1": { revision: "5" },
        "route-2": { revision: "5" },
      },
    })
    expect(mockedPull).toHaveBeenNthCalledWith(1, null, 200)
    expect(mockedPull).toHaveBeenNthCalledWith(2, "opaque-snapshot-page-2", 200)
  })

  it("keeps a newest tombstone over an older replayed UPSERT", async () => {
    mockedPull
      .mockResolvedValueOnce(snapshot({
        items: [route("route-1", "1")],
        complete: true,
        nextCursor: "opaque-delta-cursor-1",
      }))
      .mockResolvedValueOnce(delta({
        items: [route("route-1", "2")],
        tombstones: [{ entityType: "route", id: "route-1", revision: "3", reason: "SCOPE_REMOVED" }],
        complete: true,
        nextCursor: "opaque-delta-cursor-2",
      }))

    await syncRouteV2Routes({ tenantId, agentId, epoch })
    await syncRouteV2Routes({ tenantId, agentId, epoch })

    const state = await readRouteV2RoutesState(tenantId, agentId, epoch)
    expect(state.cursor).toBe("opaque-delta-cursor-2")
    expect(state.records["route-1"]).toBeUndefined()
    expect(state.tombstoneRevisions["route-1"]).toBe("3")
  })

  it("clears only the v2 projection on a controlled resnapshot and preserves v1 data", async () => {
    const v1Key = `@mtm_sync_cache_v1:${tenantId}:${agentId}`
    await AsyncStorage.setItem(v1Key, JSON.stringify({ version: "v1", entities: { routes: [{ id: "legacy-route" }] } }))
    mockedPull.mockRejectedValue(Object.assign(new Error("scope changed"), {
      status: 409,
      code: "MOBILE_SYNC_V2_RESNAPSHOT_REQUIRED",
    }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch })).resolves.toEqual({
      status: "resnapshot-required",
      pages: 0,
      complete: false,
    })
    expect(await AsyncStorage.getItem(routeV2RoutesStorageKey(tenantId, agentId))).toBeNull()
    expect(await AsyncStorage.getItem(v1Key)).toContain("legacy-route")
  })

  it("drops the shadow cache and reports disabled when the exact cohort is withdrawn", async () => {
    await AsyncStorage.setItem(routeV2RoutesStorageKey(tenantId, agentId), JSON.stringify({
      version: 1,
      epoch,
      cursor: "opaque-delta-cursor-1",
      records: { "route-1": { revision: "1", data: {} } },
      tombstoneRevisions: {},
      snapshot: null,
    }))
    mockedPull.mockRejectedValue(Object.assign(new Error("cohort disabled"), {
      status: 403,
      code: "MOBILE_SYNC_V2_COHORT_DISABLED",
    }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch })).resolves.toEqual({
      status: "disabled",
      pages: 0,
      complete: false,
      disabledReason: "MOBILE_SYNC_V2_COHORT_DISABLED",
    })
    expect(await AsyncStorage.getItem(routeV2RoutesStorageKey(tenantId, agentId))).toBeNull()
  })

  it("retries the identical opaque cursor with the server-recommended smaller page", async () => {
    mockedPull
      .mockRejectedValueOnce(Object.assign(new Error("too large"), {
        status: 413,
        code: "MOBILE_SYNC_V2_PAYLOAD_TOO_LARGE",
        recommendedPageSize: 50,
      }))
      .mockResolvedValueOnce(snapshot({
        complete: true,
        nextCursor: "opaque-delta-cursor-1",
      }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch })).resolves.toMatchObject({ status: "synced" })
    expect(mockedPull).toHaveBeenNthCalledWith(1, null, 200)
    expect(mockedPull).toHaveBeenNthCalledWith(2, null, 50)
  })

  it("caps a pass at three pages even when a caller supplies a larger local limit", async () => {
    mockedPull
      .mockResolvedValueOnce(snapshot({ nextPage: "opaque-page-2", complete: false }))
      .mockResolvedValueOnce(snapshot({ nextPage: "opaque-page-3", complete: false }))
      .mockResolvedValueOnce(snapshot({ nextPage: "opaque-page-4", complete: false }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch, maxPages: 99 })).resolves.toEqual({
      status: "partial",
      pages: 3,
      complete: false,
    })
    expect(mockedPull).toHaveBeenCalledTimes(3)
    expect((await readRouteV2RoutesState(tenantId, agentId, epoch)).snapshot?.nextPage).toBe("opaque-page-4")
  })

  it("rejects a malformed continuation that does not advance its opaque cursor", async () => {
    await AsyncStorage.setItem(routeV2RoutesStorageKey(tenantId, agentId), JSON.stringify({
      version: 1,
      epoch,
      cursor: null,
      records: {},
      tombstoneRevisions: {},
      snapshot: { snapshotId: "snapshot-1", nextPage: "opaque-repeat", records: {} },
    }))
    mockedPull.mockResolvedValue(snapshot({
      nextPage: "opaque-repeat",
      complete: false,
    }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch })).rejects.toThrow("MOBILE_SYNC_V2_PROTOCOL_INVALID")
  })

  it("caps malformed repeated 413 reductions so one pass cannot hot-loop", async () => {
    mockedPull.mockRejectedValue(Object.assign(new Error("too large"), {
      status: 413,
      code: "MOBILE_SYNC_V2_PAYLOAD_TOO_LARGE",
      recommendedPageSize: 199,
    }))

    await expect(syncRouteV2Routes({ tenantId, agentId, epoch })).rejects.toThrow("too large")
    expect(mockedPull).toHaveBeenCalledTimes(ROUTE_V2_MAX_PAGE_REDUCTIONS + 1)
  })
})
