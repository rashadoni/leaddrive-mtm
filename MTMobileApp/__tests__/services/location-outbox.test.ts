import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  OUTBOX_KEY,
  appendPoint,
  classifyUploadFailure,
  clearQueue,
  flushQueue,
  queuePoint,
  readQueue,
  type QueuedPoint,
} from "../../src/services/location-outbox"

function point(minute: number): QueuedPoint {
  return {
    latitude: 40.4011,
    longitude: 49.835,
    recordedAt: `2026-09-20T17:${String(minute).padStart(2, "0")}:00.000Z`,
    clientLocationId: `gps-${minute}`,
  }
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

/**
 * Which failures are worth keeping the point for. A 4xx is the server's
 * verdict on this exact coordinate — a point inside a workday break is
 * refused on purpose — and repeating it would clog the queue for ever.
 */
describe("deciding what a failed upload means", () => {
  it("keeps the point when the failure is about the minute, not the point", () => {
    expect(classifyUploadFailure({ message: "Network request failed" })).toBe("retry")
    expect(classifyUploadFailure({ message: "REQUEST_TIMEOUT" })).toBe("retry")
    expect(classifyUploadFailure({ status: 500 })).toBe("retry")
    expect(classifyUploadFailure({ status: 503 })).toBe("retry")
    expect(classifyUploadFailure({ status: 429 })).toBe("retry")
    expect(classifyUploadFailure(null)).toBe("retry")
  })

  it("drops a point the server refused on its own merits", () => {
    expect(classifyUploadFailure({ status: 400, code: "MTM_LOCATION_WORKDAY_PAUSED" })).toBe("drop")
    expect(classifyUploadFailure({ status: 403 })).toBe("drop")
    expect(classifyUploadFailure({ status: 422 })).toBe("drop")
  })

  it("stops tracking rather than queueing when the session is gone", () => {
    expect(classifyUploadFailure({ message: "SESSION_EXPIRED" })).toBe("stop")
  })
})

describe("the queue itself", () => {
  it("keeps the newest when it is full", () => {
    const full = [point(1), point(2), point(3)]
    expect(appendPoint(full, point(4), 3).map((item) => item.clientLocationId))
      .toEqual(["gps-2", "gps-3", "gps-4"])
  })

  it("survives a storage value that is not a queue", async () => {
    await AsyncStorage.setItem(OUTBOX_KEY, "{ not json")
    expect(await readQueue()).toEqual([])
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify([{ latitude: "x" }, point(5)]))
    expect((await readQueue()).map((item) => item.clientLocationId)).toEqual(["gps-5"])
  })
})

describe("carrying the queue when the line comes back", () => {
  it("sends the oldest first and empties the queue", async () => {
    await queuePoint(point(1))
    await queuePoint(point(2))
    const sent: string[] = []
    const result = await flushQueue(async (queued) => { sent.push(queued.clientLocationId) })
    expect(sent).toEqual(["gps-1", "gps-2"])
    expect(result).toMatchObject({ sent: 2, dropped: 0, remaining: 0 })
    expect(await readQueue()).toEqual([])
  })

  /**
   * One dead request per tick, not the whole backlog: a phone with no signal
   * must not spend the battery replaying two hundred points.
   */
  it("stops at the first point worth retrying and keeps the rest in order", async () => {
    for (const minute of [1, 2, 3]) await queuePoint(point(minute))
    const attempted: string[] = []
    const result = await flushQueue(async (queued) => {
      attempted.push(queued.clientLocationId)
      if (queued.clientLocationId === "gps-2") throw Object.assign(new Error("offline"), {})
    })
    expect(attempted).toEqual(["gps-1", "gps-2"])
    expect(result).toMatchObject({ sent: 1, remaining: 2 })
    expect((await readQueue()).map((item) => item.clientLocationId)).toEqual(["gps-2", "gps-3"])
  })

  it("throws away what the server refused and carries on", async () => {
    for (const minute of [1, 2, 3]) await queuePoint(point(minute))
    const result = await flushQueue(async (queued) => {
      if (queued.clientLocationId === "gps-2") {
        throw Object.assign(new Error("inside a break"), { status: 400 })
      }
    })
    expect(result).toMatchObject({ sent: 2, dropped: 1, remaining: 0 })
    expect(await readQueue()).toEqual([])
  })

  it("carries no more than the tick's share", async () => {
    for (const minute of [1, 2, 3, 4]) await queuePoint(point(minute))
    const result = await flushQueue(async () => {}, 2)
    expect(result).toMatchObject({ sent: 2, remaining: 2 })
    expect((await readQueue()).map((item) => item.clientLocationId)).toEqual(["gps-3", "gps-4"])
  })

  it("does nothing when there is nothing waiting", async () => {
    await clearQueue()
    const send = jest.fn()
    expect(await flushQueue(send)).toMatchObject({ sent: 0, remaining: 0 })
    expect(send).not.toHaveBeenCalled()
  })
})
