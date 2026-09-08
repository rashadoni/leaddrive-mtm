import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { useSyncStatusStore } from "../../src/store/sync-status"

describe("per-pipeline sync status", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    useSyncStatusStore.getState().clear()
  })

  it("persists a stream-local backoff and does not run it early", async () => {
    const scopeKey = "tenant-1:agent-1"
    await useSyncStatusStore.getState().hydrate(scopeKey)

    expect(useSyncStatusStore.getState().beginPipeline(scopeKey, "routePull", 1_000)).toBe(true)
    const retryAt = await useSyncStatusStore.getState().deferPipeline({
      scopeKey,
      pipeline: "routePull",
      error: "MOBILE_SYNC_V2_UNAVAILABLE",
      retryAfterMs: 5_000,
      now: 1_000,
      random: () => 0,
    })

    expect(retryAt).toBe(6_000)
    expect(useSyncStatusStore.getState().pipelines.routePull).toMatchObject({
      phase: "backoff",
      attempts: 1,
      retryAt: 6_000,
      lastError: "MOBILE_SYNC_V2_UNAVAILABLE",
    })
    expect(useSyncStatusStore.getState().beginPipeline(scopeKey, "routePull", 5_999)).toBe(false)
    expect(useSyncStatusStore.getState().beginPipeline(scopeKey, "routeCommands", 5_999)).toBe(true)
    expect(useSyncStatusStore.getState().beginPipeline(scopeKey, "routeOutbox", 5_999)).toBe(true)

    useSyncStatusStore.getState().clear()
    await useSyncStatusStore.getState().hydrate(scopeKey)
    expect(useSyncStatusStore.getState().pipelines.routePull).toMatchObject({ phase: "backoff", retryAt: 6_000 })
  })

  it("does not re-arm a cohort-disabled v2 stream until the manifest epoch changes", async () => {
    const scopeKey = "tenant-1:agent-1"
    await useSyncStatusStore.getState().hydrate(scopeKey)

    await useSyncStatusStore.getState().disablePipeline(
      scopeKey,
      "routeV2Pull",
      "MOBILE_SYNC_V2_COHORT_DISABLED",
      "routes-epoch-1",
    )
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "disabled",
      disabledEpoch: "routes-epoch-1",
    })
    await expect(useSyncStatusStore.getState().enablePipeline(scopeKey, "routeV2Pull", "routes-epoch-1")).resolves.toBe(false)
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull.phase).toBe("disabled")

    await expect(useSyncStatusStore.getState().enablePipeline(scopeKey, "routeV2Pull", "routes-epoch-2")).resolves.toBe(true)
    expect(useSyncStatusStore.getState().pipelines.routeV2Pull).toMatchObject({
      phase: "idle",
      disabledEpoch: null,
    })
  })
})

describe("device connectivity (field UX audit M-06 / B4)", () => {
  it("starts unknown and follows NetInfo without touching sync counters", () => {
    useSyncStatusStore.getState().clear()
    expect(useSyncStatusStore.getState().online).toBeNull()
    useSyncStatusStore.getState().setOnline(false)
    expect(useSyncStatusStore.getState().online).toBe(false)
    expect(useSyncStatusStore.getState().phase).toBe("idle")
    useSyncStatusStore.getState().setOnline(true)
    expect(useSyncStatusStore.getState().online).toBe(true)
  })

  describe("the chip after the network comes back (audit B4, task T6)", () => {
    it("drops the stale offline phase when the radio returns", () => {
      // The offline phase is a memory of the last failed attempt. Nothing
      // else clears it: refreshRouteFieldSession returns early when bootstrap
      // says unavailable, so no sync runs, and the chip said "Офлайн" with
      // full signal until the app was restarted.
      useSyncStatusStore.getState().setOffline({ pending: 2, conflicts: 0, mediaPending: 0 })
      expect(useSyncStatusStore.getState().phase).toBe("offline")

      useSyncStatusStore.getState().setOnline(true)

      expect(useSyncStatusStore.getState().phase).toBe("idle")
      expect(useSyncStatusStore.getState().online).toBe(true)
      // What is queued is a fact about the queue, not about the radio.
      expect(useSyncStatusStore.getState().pending).toBe(2)
    })

    it("keeps the offline phase while connectivity is unknown", () => {
      useSyncStatusStore.getState().setOffline()
      useSyncStatusStore.getState().setOnline(null)
      expect(useSyncStatusStore.getState().phase).toBe("offline")
    })

    it("keeps the offline phase when the radio is confirmed off", () => {
      useSyncStatusStore.getState().setOffline()
      useSyncStatusStore.getState().setOnline(false)
      expect(useSyncStatusStore.getState().phase).toBe("offline")
    })

    it("never overwrites a phase that describes something real", () => {
      // syncing, backoff and error are not memories of lost connectivity;
      // clearing them on a network event would hide a live problem.
      // SyncPhase is idle | syncing | offline | error: only these can appear
      // at the top level, whatever the per-pipeline phases allow.
      for (const phase of ["syncing", "error"] as const) {
        useSyncStatusStore.setState({ phase })
        useSyncStatusStore.getState().setOnline(true)
        expect(useSyncStatusStore.getState().phase).toBe(phase)
      }
    })
  })
})
