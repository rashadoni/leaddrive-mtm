// In-memory AsyncStorage so enqueue→drain round-trips through real (de)serialization.
const memStore: Record<string, string> = {}
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(memStore[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      memStore[k] = v
      return Promise.resolve()
    }),
    removeItem: jest.fn((k: string) => {
      delete memStore[k]
      return Promise.resolve()
    }),
  },
}))

jest.mock("react-native-fs", () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: "/docs",
    mkdir: jest.fn(() => Promise.resolve()),
    copyFile: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(() => Promise.resolve("base64-bytes")),
    unlink: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock("../src/services/api", () => ({
  __esModule: true,
  api: { analyzeShelf: jest.fn(() => Promise.resolve({ success: true, data: { status: "COMPLETED" } })) },
}))

import RNFS from "react-native-fs"
import { api } from "../src/services/api"
import {
  enqueueScan,
  drainScanQueue,
  getQueuedScanCount,
  isConnectivityError,
} from "../src/services/scan-queue"

const analyzeMock = api.analyzeShelf as jest.Mock

const baseScan = (over: Partial<Parameters<typeof enqueueScan>[0]> = {}) => ({
  clientScanId: "scan-1",
  planogramId: "pg-1",
  visitId: "v-1",
  latitude: 40.4,
  longitude: 49.8,
  imageMediaType: "image/jpeg",
  srcImagePath: "file:///cache/resized.jpg",
  ...over,
})

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k]
  jest.clearAllMocks()
  analyzeMock.mockResolvedValue({ success: true, data: { status: "COMPLETED" } })
})

describe("enqueueScan", () => {
  it("copies the resized JPEG into the durable dir and records metadata", async () => {
    await enqueueScan(baseScan())
    expect(RNFS.mkdir).toHaveBeenCalledWith("/docs/scan-queue")
    expect(RNFS.copyFile).toHaveBeenCalledWith("/cache/resized.jpg", "/docs/scan-queue/scan-1.jpg")
    expect(await getQueuedScanCount()).toBe(1)
  })

  it("is idempotent on clientScanId (re-enqueue replaces, not duplicates)", async () => {
    await enqueueScan(baseScan())
    await enqueueScan(baseScan({ planogramId: "pg-2" }))
    expect(await getQueuedScanCount()).toBe(1)
  })

  it("uses a .png extension for png media", async () => {
    await enqueueScan(baseScan({ clientScanId: "s2", imageMediaType: "image/png" }))
    expect(RNFS.copyFile).toHaveBeenCalledWith(expect.any(String), "/docs/scan-queue/s2.png")
  })

  it("unlinks the copied file if the queue write fails (no orphan)", async () => {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk full"))
    await expect(enqueueScan(baseScan())).rejects.toThrow("disk full")
    expect(RNFS.unlink).toHaveBeenCalledWith("/docs/scan-queue/scan-1.jpg")
    expect(await getQueuedScanCount()).toBe(0)
  })
})

describe("drainScanQueue", () => {
  it("empty queue → all zeros, no API call", async () => {
    expect(await drainScanQueue()).toEqual({ uploaded: 0, remaining: 0, failed: 0 })
    expect(analyzeMock).not.toHaveBeenCalled()
  })

  it("an accepted (resolved 2xx/202) replay is uploaded and its file deleted", async () => {
    await enqueueScan(baseScan())
    const r = await drainScanQueue()
    expect(analyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientScanId: "scan-1", planogramId: "pg-1", imageBase64: "base64-bytes" }),
    )
    expect(RNFS.unlink).toHaveBeenCalledWith("/docs/scan-queue/scan-1.jpg")
    expect(r).toEqual({ uploaded: 1, remaining: 0, failed: 0 })
    expect(await getQueuedScanCount()).toBe(0)
  })

  it("a connectivity error keeps the scan and stops draining the rest", async () => {
    await enqueueScan(baseScan({ clientScanId: "a", srcImagePath: "file:///c/a.jpg" }))
    await enqueueScan(baseScan({ clientScanId: "b", srcImagePath: "file:///c/b.jpg" }))
    analyzeMock.mockRejectedValueOnce(new Error("Network request failed"))
    const r = await drainScanQueue()
    expect(r.uploaded).toBe(0)
    expect(r.remaining).toBe(2) // current + the rest, untouched
    expect(analyzeMock).toHaveBeenCalledTimes(1) // stopped after the first failure
  })

  it("a SESSION_EXPIRED error stops the drain and keeps the queue", async () => {
    await enqueueScan(baseScan())
    analyzeMock.mockRejectedValueOnce(new Error("SESSION_EXPIRED"))
    const r = await drainScanQueue()
    expect(r).toEqual({ uploaded: 0, remaining: 1, failed: 0 })
  })

  it("a server error bumps attempts and keeps the scan (below the cap)", async () => {
    await enqueueScan(baseScan())
    analyzeMock.mockRejectedValueOnce(new Error("Request failed: 500"))
    const r = await drainScanQueue()
    expect(r).toEqual({ uploaded: 0, remaining: 1, failed: 0 })
    // next drain succeeds → uploaded
    analyzeMock.mockResolvedValueOnce({ success: true, data: {} })
    expect((await drainScanQueue()).uploaded).toBe(1)
  })

  it("abandons a poison scan after MAX_ATTEMPTS server rejections", async () => {
    await enqueueScan(baseScan())
    analyzeMock.mockRejectedValue(new Error("Request failed: 400"))
    let last
    for (let i = 0; i < 6; i++) last = await drainScanQueue()
    expect(last).toEqual({ uploaded: 0, remaining: 0, failed: 1 })
    expect(await getQueuedScanCount()).toBe(0)
  })

  it("drops an orphan whose durable file vanished", async () => {
    await enqueueScan(baseScan())
    ;(RNFS.readFile as jest.Mock).mockRejectedValueOnce(new Error("ENOENT"))
    const r = await drainScanQueue()
    expect(r).toEqual({ uploaded: 0, remaining: 0, failed: 1 })
    expect(analyzeMock).not.toHaveBeenCalled()
  })
})

describe("isConnectivityError", () => {
  it("classifies network/timeout/abort/unconfigured as connectivity, server errors as not", () => {
    expect(isConnectivityError(new Error("Network request failed"))).toBe(true)
    expect(isConnectivityError(new Error("REQUEST_TIMEOUT"))).toBe(true)
    expect(isConnectivityError(new Error("ABORTED"))).toBe(true)
    expect(isConnectivityError(new Error("Server not configured"))).toBe(true)
    expect(isConnectivityError(new Error("Request failed: 500"))).toBe(false)
    expect(isConnectivityError(new Error("SESSION_EXPIRED"))).toBe(false)
  })
})
