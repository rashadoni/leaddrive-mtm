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

jest.mock("../../src/store/auth", () => ({
  useAuthStore: { getState: jest.fn() },
}))

import { allOutboxOperations, flushOutbox } from "../../src/services/outbox"
import { allMediaUploads, flushMediaOutbox } from "../../src/services/media-outbox"
import { pullAndApplySync } from "../../src/services/sync-cache"
import { useAuthStore } from "../../src/store/auth"
import { runMobileSync } from "../../src/services/sync-engine"
import { useSyncStatusStore } from "../../src/store/sync-status"

const mockedAuth = useAuthStore.getState as jest.Mock
const mockedOperations = allOutboxOperations as jest.Mock
const mockedFlush = flushOutbox as jest.Mock
const mockedMedia = allMediaUploads as jest.Mock
const mockedMediaFlush = flushMediaOutbox as jest.Mock
const mockedPull = pullAndApplySync as jest.Mock

describe("mobile sync engine", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
    useSyncStatusStore.getState().clear()
    mockedAuth.mockReturnValue({
      agent: { id: "agent-1", organizationId: "org-1" },
    })
    mockedOperations.mockResolvedValue([])
    mockedMedia.mockResolvedValue([])
    mockedFlush.mockResolvedValue({ sent: 2, deferred: 0, conflicted: 1 })
    mockedMediaFlush.mockResolvedValue({ sent: 1, deferred: 0 })
    mockedPull.mockResolvedValue(undefined)
  })

  it("runs outbox, pull and media in order and records a successful sync", async () => {
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
    expect(useSyncStatusStore.getState()).toMatchObject({
      phase: "error",
      pending: 1,
      conflicts: 1,
      mediaPending: 1,
      lastError: "network unavailable",
    })
  })
})
