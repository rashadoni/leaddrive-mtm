import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  acknowledgeMediaUpload,
  deferMediaUpload,
  enqueueMediaUpload,
  flushMediaOutbox,
  pendingMediaUploads,
} from "../../src/services/media-outbox"
import { setOfflineScope } from "../../src/services/offline-scope"

describe("durable media outbox", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("persists media metadata and removes an acknowledged upload", async () => {
    const item = await enqueueMediaUpload({
      filePath: "/cache/visit-1.jpg",
      fileName: "visit-1.jpg",
      visitId: "visit-1",
      category: "shelf",
      latitude: 40.4,
      longitude: 49.8,
    })

    expect((await pendingMediaUploads()).map((entry) => entry.id)).toEqual([item.id])
    await acknowledgeMediaUpload(item.id)
    expect(await pendingMediaUploads()).toEqual([])
  })

  it("serializes concurrent enqueues without losing either upload", async () => {
    await Promise.all([
      enqueueMediaUpload({ filePath: "/cache/first.jpg" }),
      enqueueMediaUpload({ filePath: "/cache/second.jpg" }),
    ])

    expect((await pendingMediaUploads()).map((item) => item.filePath).sort()).toEqual([
      "/cache/first.jpg",
      "/cache/second.jpg",
    ])
  })

  it("defers an upload with exponential backoff", async () => {
    const item = await enqueueMediaUpload({ filePath: "/cache/photo.jpg" })

    await deferMediaUpload(item.id, 1_000)

    expect(await pendingMediaUploads(2_000)).toEqual([])
    expect((await pendingMediaUploads(4_000))[0]).toMatchObject({
      id: item.id,
      attempts: 1,
      nextAttemptAt: 3_000,
    })
  })

  it("acknowledges successful uploads and defers failures in one flush", async () => {
    const successful = await enqueueMediaUpload({ filePath: "/cache/ok.jpg" })
    const failed = await enqueueMediaUpload({ filePath: "/cache/retry.jpg" })

    const result = await flushMediaOutbox(async (item) => {
      if (item.id === failed.id) throw new Error("network unavailable")
    })

    expect(result).toEqual({ sent: 1, deferred: 1 })
    const retryableAt = Date.now() + 2_000
    expect((await pendingMediaUploads(retryableAt)).map((item) => item.id)).toEqual([failed.id])
    expect((await pendingMediaUploads(retryableAt))[0].attempts).toBe(1)
    expect(successful.id).not.toBe(failed.id)
  })
})
