import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  acknowledgeMediaUpload,
  deferMediaUpload,
  enqueueMediaUpload,
  flushMediaOutbox,
  mediaUploadIdsForVisit,
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

  it("lists one visit's waiting photos, deferred ones included, for «Foto: N»", async () => {
    const first = await enqueueMediaUpload({ filePath: "/cache/a.jpg", visitId: "visit-1" })
    const deferred = await enqueueMediaUpload({ filePath: "/cache/b.jpg", visitId: "visit-1" })
    await enqueueMediaUpload({ filePath: "/cache/c.jpg", visitId: "visit-2" })
    await enqueueMediaUpload({ filePath: "/cache/d.jpg" })
    await deferMediaUpload(deferred.id, Date.now())

    expect((await mediaUploadIdsForVisit("visit-1")).sort()).toEqual([first.id, deferred.id].sort())
    await acknowledgeMediaUpload(first.id)
    expect(await mediaUploadIdsForVisit("visit-1")).toEqual([deferred.id])

    // Another agent's queue on the same phone is not this visit's photos.
    setOfflineScope("org-1", "agent-2")
    expect(await mediaUploadIdsForVisit("visit-1")).toEqual([])
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

    const result = await flushMediaOutbox(
      async (item) => {
        if (item.id === failed.id) throw new Error("network unavailable")
      },
      { now: () => 1_000, random: () => 0 },
    )

    expect(result).toMatchObject({ sent: 1, deferred: 1, error: "network unavailable" })
    expect(result.retryAfterMs).toBe(2_000)
    expect(await pendingMediaUploads(2_999)).toEqual([])
    expect((await pendingMediaUploads(3_000)).map((item) => item.id)).toEqual([failed.id])
    expect((await pendingMediaUploads(3_000))[0].attempts).toBe(1)
    expect(successful.id).not.toBe(failed.id)
  })

  it("honours Retry-After for a failed upload while allowing later uploads to continue", async () => {
    const delayed = await enqueueMediaUpload({ filePath: "/cache/retry-after.jpg" })
    const error = Object.assign(new Error("media unavailable"), { retryAfterMs: 5_000 })

    const result = await flushMediaOutbox(
      async () => { throw error },
      { now: () => 1_000, random: () => 0 },
    )

    expect(result).toMatchObject({ sent: 0, deferred: 1, retryAfterMs: 5_000 })
    expect(await pendingMediaUploads(5_999)).toEqual([])
    expect((await pendingMediaUploads(6_000)).map((item) => item.id)).toEqual([delayed.id])
  })
})
