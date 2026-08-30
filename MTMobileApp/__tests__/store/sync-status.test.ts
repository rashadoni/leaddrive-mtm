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
    expect(useSyncStatusStore.getState().beginPipeline(scopeKey, "routeOutbox", 5_999)).toBe(true)

    useSyncStatusStore.getState().clear()
    await useSyncStatusStore.getState().hydrate(scopeKey)
    expect(useSyncStatusStore.getState().pipelines.routePull).toMatchObject({ phase: "backoff", retryAt: 6_000 })
  })
})
