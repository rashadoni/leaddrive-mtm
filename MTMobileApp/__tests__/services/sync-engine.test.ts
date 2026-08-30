import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

jest.mock("../../src/services/api", () => ({
  api: {
    syncPush: jest.fn(),
    syncPull: jest.fn(),
    uploadPhoto: jest.fn(),
  },
}))

jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn(),
  flushOutbox: jest.fn(),
}))

jest.mock("../../src/services/media-outbox", () => ({
  allMediaUploads: jest.fn(),
  flushMediaOutbox: jest.fn(),
}))

jest.mock("../../src/services/sync-cache", () => ({
  pullAndApplySync: jest.fn(),
}))

jest.mock("../../src/services/sync-v2-routes", () => ({
  clearRouteV2RoutesState: jest.fn(),
  syncRouteV2Routes: jest.fn(),
}))

jest.mock("../../src/store/auth", () => ({
  useAuthStore: { getState: jest.fn() },
}))

jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: { getState: jest.fn() },
}))

import { allOutboxOperations, flushOutbox } from "../../src/services/outbox"
import { allMediaUploads, flushMediaOutbox } from "../../src/services/media-outbox"
import { pullAndApplySync } from "../../src/services/sync-cache"
import { clearRouteV2RoutesState, syncRouteV2Routes } from "../../src/services/sync-v2-routes"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import {
  flushRouteFieldOutbox,
  runMobileSync,
  withdrawRouteFieldV2ShadowState,
} from "../../src/services/sync-engine"
import { useSyncStatusStore } from "../../src/store/sync-status"

const mockedAuth = useAuthStore.getState as jest.Mock
const mockedBootstrap = useBootstrapStore.getState as jest.Mock
const mockedOperations = allOutboxOperations as jest.Mock
const mockedFlush = flushOutbox as jest.Mock
const mockedMedia = allMediaUploads as jest.Mock
const mockedMediaFlush = flushMediaOutbox as jest.Mock
const mockedPull = pullAndApplySync as jest.Mock
const mockedClearRouteV2 = clearRouteV2RoutesState as jest.Mock
const mockedRouteV2 = syncRouteV2Routes as jest.Mock

function enrolledBootstrap(epoch = "routes-epoch-1") {
  return {
    routeFieldAccess: "enabled",
    data: {
      manifest: {
        protocol: { min: 1, preferred: 2 },
        syncV2: { routes: true, routesEpoch: epoch },
      },
    },
  }
}

describe("mobile sync engine", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    await AsyncStorage.clear()
    useSyncStatusStore.getState().clear()
    mockedAuth.mockReturnValue({
      agent: { id: "agent-1", organizationId: "org-1" },
    })
    mockedBootstrap.mockReturnValue({ routeFieldAccess: "enabled" })
    mockedOperations.mockResolvedValue([])
    mockedMedia.mockResolvedValue([])
    mockedFlush.mockResolvedValue({ sent: 2, deferred: 0, conflicted: 1 })
    mockedMediaFlush.mockResolvedValue({ sent: 1, deferred: 0 })
    mockedPull.mockResolvedValue(undefined)
    mockedClearRouteV2.mockResolvedValue(undefined)
    mockedRouteV2.mockResolvedValue({ status: "synced", pages: 1, complete: true })
  })

  it("runs independent Route Field pipelines and records a successful sync", async () => {
    const result = await runMobileSync()

    expect(result).toEqual({
      success: true,
      sent: 2,
      deferred: 0,
      conflicted: 1,
      mediaSent: 1,
    })
    expect(mockedFlush).toHaveBeenCalledTimes(1)
    expect(mockedPull).toHaveBeenCalledTimes(1)
    expect(mockedRouteV2).not.toHaveBeenCalled()
    expect(mockedClearRouteV2).toHaveBeenCalledWith("org-1", "agent-1")
    expect(mockedMediaFlush).toHaveBeenCalledTimes(1)
    expect(useSyncStatusStore.getState()).toMatchObject({
      scopeKey: "org-1:agent-1",
      phase: "idle",
      lastError: null,
    })
    expect(useSyncStatusStore.getState().lastSyncedAt).toEqual(expect.any(String))
  })

  it("coalesces concurrent sync requests into one flight", async () => {
    let releasePull: (() => void) | undefined
    mockedPull.mockImplementation(() => new Promise<void>((resolve) => { releasePull = resolve }))

    const first = runMobileSync()
    const second = runMobileSync()
    expect(first).toBe(second)
    await new Promise<void>((resolve) => setImmediate(resolve))
    releasePull?.()
    await first

    expect(mockedFlush).toHaveBeenCalledTimes(1)
    expect(mockedPull).toHaveBeenCalledTimes(1)
  })

  it("keeps pending counts visible when pull fails", async () => {
    mockedPull.mockRejectedValue(new Error("network unavailable"))
    mockedOperations.mockResolvedValue([
      { status: "pending" },
      { status: "conflict" },
    ])
    mockedMedia.mockResolvedValue([{ id: "media-1" }])

    await expect(runMobileSync()).resolves.toMatchObject({ success: false })
    // A failed reference pull never prevents the unrelated media pipeline
    // from flushing. The critical v1 outbox was already drained first.
    expect(mockedFlush).toHaveBeenCalledTimes(1)
    expect(mockedMediaFlush).toHaveBeenCalledTimes(1)
    expect(useSyncStatusStore.getState()).toMatchObject({
      phase: "error",
      pending: 1,
      conflicts: 1,
      mediaPending: 1,
      lastError: "network unavailable",
    })
    expect(useSyncStatusStore.getState().pipelines).toMatchObject({
      routeOutbox: { phase: "idle" },
      routePull: { phase: "backoff", lastError: "network unavailable" },
      media: { phase: "idle" },
    })

    // The route-pull circuit is local to that stream. A second supervisor
    // pass may still drain other queues, but it must not hammer the same 503
    // endpoint before its persisted backoff has elapsed.
    await runMobileSync()
    expect(mockedPull).toHaveBeenCalledTimes(1)
    expect(mockedFlush).toHaveBeenCalledTimes(2)
    expect(mockedMediaFlush).toHaveBeenCalledTimes(2)
  })

  it("keeps the v1 outbox, v1 pull and media independent when the enrolled v2 route shadow fails", async () => {
    mockedBootstrap.mockReturnValue(enrolledBootstrap())
    mockedRouteV2.mockRejectedValue(Object.assign(new Error("v2 temporarily unavailable"), { retryAfterMs: 5_000 }))

    await expect(runMobileSync()).resolves.toMatchObject({ success: false, sent: 2, mediaSent: 1 })
    expect(mockedFlush).toHaveBeenCalledTimes(1)
    expect(mockedPull).toHaveBeenCalledTimes(1)
    expect(mockedMediaFlush).toHaveBeenCalledTimes(1)
    expect(mockedRouteV2).toHaveBeenCalledWith({
      tenantId: "org-1",
      agentId: "agent-1",
      epoch: "routes-epoch-1",
    })
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "backoff",
      lastError: "v2 temporarily unavailable",
    })
  })

  it("continues the enrolled v2 shadow and media after a v1 pull failure", async () => {
    mockedBootstrap.mockReturnValue(enrolledBootstrap())
    mockedPull.mockRejectedValue(new Error("v1 temporarily unavailable"))

    await expect(runMobileSync()).resolves.toMatchObject({ success: false })
    expect(mockedRouteV2).toHaveBeenCalledTimes(1)
    expect(mockedMediaFlush).toHaveBeenCalledTimes(1)
    expect(useSyncStatusStore.getState().pipelines).toMatchObject({
      routePull: { phase: "backoff", lastError: "v1 temporarily unavailable" },
      routeV2Pull: { phase: "idle" },
      media: { phase: "idle" },
    })
  })

  it("does not let v2 bookkeeping storage failure block the v1 outbox, pull or media", async () => {
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error("status storage unavailable"))
    mockedClearRouteV2.mockRejectedValue(new Error("v2 cache storage unavailable"))

    await expect(runMobileSync()).resolves.toMatchObject({
      success: true,
      sent: 2,
      mediaSent: 1,
    })
    expect(mockedFlush).toHaveBeenCalledTimes(1)
    expect(mockedPull).toHaveBeenCalledTimes(1)
    expect(mockedMediaFlush).toHaveBeenCalledTimes(1)
    expect(mockedRouteV2).not.toHaveBeenCalled()
  })

  it("does not repoll a server-withdrawn cohort until bootstrap supplies a new epoch", async () => {
    mockedBootstrap.mockReturnValue(enrolledBootstrap("routes-epoch-1"))
    mockedRouteV2
      .mockResolvedValueOnce({
        status: "disabled",
        pages: 0,
        complete: false,
        disabledReason: "MOBILE_SYNC_V2_COHORT_DISABLED",
      })
      .mockResolvedValueOnce({ status: "synced", pages: 1, complete: true })

    await expect(runMobileSync()).resolves.toMatchObject({ success: true })
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "disabled",
      disabledEpoch: "routes-epoch-1",
    })

    await expect(runMobileSync()).resolves.toMatchObject({ success: true })
    expect(mockedRouteV2).toHaveBeenCalledTimes(1)

    mockedBootstrap.mockReturnValue(enrolledBootstrap("routes-epoch-2"))
    await expect(runMobileSync()).resolves.toMatchObject({ success: true })
    expect(mockedRouteV2).toHaveBeenCalledTimes(2)
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "idle",
      disabledEpoch: null,
    })
  })

  it("does not touch any v1 pipeline until Route Field admission succeeds and purges only v2 shadow state", async () => {
    mockedBootstrap.mockReturnValue({
      routeFieldAccess: "disabled",
      data: { routeFieldAccess: "disabled" },
    })

    await expect(runMobileSync()).resolves.toEqual({
      success: false,
      sent: 0,
      deferred: 0,
      conflicted: 0,
      mediaSent: 0,
    })

    expect(mockedFlush).not.toHaveBeenCalled()
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedMediaFlush).not.toHaveBeenCalled()
    expect(mockedClearRouteV2).toHaveBeenCalledWith("org-1", "agent-1")
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "disabled",
      lastError: "TENANT_CAPABILITY_DISABLED",
    })
  })

  it("retains the v2 shadow after a failed bootstrap request that only fails closed locally", async () => {
    mockedBootstrap.mockReturnValue({ routeFieldAccess: "unavailable", data: null })

    await expect(runMobileSync()).resolves.toEqual({
      success: false,
      sent: 0,
      deferred: 0,
      conflicted: 0,
      mediaSent: 0,
    })

    expect(mockedClearRouteV2).not.toHaveBeenCalled()
    expect(mockedFlush).not.toHaveBeenCalled()
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedMediaFlush).not.toHaveBeenCalled()
  })

  it("withdraws only the routes-v2 shadow status without resetting v1 pipeline state", async () => {
    const scopeKey = "org-1:agent-1"
    await useSyncStatusStore.getState().hydrate(scopeKey)
    await useSyncStatusStore.getState().deferPipeline({
      scopeKey,
      pipeline: "routeOutbox",
      error: "v1 push pending",
      now: 1_000,
      random: () => 0,
    })
    await useSyncStatusStore.getState().deferPipeline({
      scopeKey,
      pipeline: "media",
      error: "media pending",
      now: 1_000,
      random: () => 0,
    })

    await withdrawRouteFieldV2ShadowState({
      tenantId: "org-1",
      agentId: "agent-1",
      reason: "ROUTE_FIELD_ADMISSION_UNAVAILABLE",
    })

    expect(mockedClearRouteV2).toHaveBeenCalledWith("org-1", "agent-1")
    expect(useSyncStatusStore.getState().pipelines).toMatchObject({
      routeOutbox: { phase: "backoff", lastError: "v1 push pending" },
      media: { phase: "backoff", lastError: "media pending" },
      routeV2Pull: {
        phase: "disabled",
        retryAt: null,
        lastError: "ROUTE_FIELD_ADMISSION_UNAVAILABLE",
      },
    })
  })

  it("leaves the v1 queue unchanged when a direct UI flush is not admitted", async () => {
    mockedBootstrap.mockReturnValue({ routeFieldAccess: "unavailable" })

    await expect(flushRouteFieldOutbox()).resolves.toEqual({ sent: 0, deferred: 0, conflicted: 0 })
    expect(mockedFlush).not.toHaveBeenCalled()
  })
})
