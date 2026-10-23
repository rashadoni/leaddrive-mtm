jest.mock("../../src/services/api", () => ({ api: { getVisitWorkspace: jest.fn(), getOfflineBootstrapBinding: jest.fn() } }))
jest.mock("../../src/services/media-outbox", () => ({ mediaUploadIdsForVisit: jest.fn() }))
jest.mock("../../src/services/sync-engine", () => ({ runMobileSync: jest.fn() }))
jest.mock("../../src/services/visit-signature", () => ({ hasQueuedVisitSignature: jest.fn(), queueVisitSignature: jest.fn() }))
jest.mock("../../src/services/visit-progress-cache", () => ({
  readOfflineVisitProgress: jest.fn(), rememberVisitProgress: jest.fn(), clearVisitProgressCache: jest.fn(), nextVisitProgressRead: jest.fn(() => 1),
}))

import React from "react"
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer"
import { useActiveVisitProgress } from "../../src/hooks/useActiveVisitProgress"
import { api } from "../../src/services/api"
import { mediaUploadIdsForVisit } from "../../src/services/media-outbox"
import { hasQueuedVisitSignature } from "../../src/services/visit-signature"
import { clearVisitProgressCache, readOfflineVisitProgress, rememberVisitProgress } from "../../src/services/visit-progress-cache"
import { setOfflineScope } from "../../src/services/offline-scope"

let latest: ReturnType<typeof useActiveVisitProgress>
let tree: ReactTestRenderer
function Probe({ visit }: { visit: { id: string } }) { latest = useActiveVisitProgress(visit); return null }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const cached = { photosCount: 1, requirements: [{ actionKey: "SIGNATURE", mode: "REQUIRED", done: false, waived: false }],
  photoRead: { serverCount: 1, uploadsAtReadStart: 0, queuedIds: [], sessionQueuedIds: [] } }
const cacheRead = readOfflineVisitProgress as jest.Mock
const serverRead = api.getVisitWorkspace as jest.Mock
async function flush() { for (let n = 0; n < 20; n++) await Promise.resolve() }
async function mount() { await act(async () => { tree = TestRenderer.create(<Probe visit={{ id: "visit" }} />); await flush() }) }
function workspace(count: number) { return { success: true, data: { visit: { id: "visit", photos: Array.from({ length: count }, (_, n) => ({ id: String(n) })) } } } }

beforeEach(() => {
  jest.clearAllMocks(); setOfflineScope("tenant", "agent")
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  ;(api.getOfflineBootstrapBinding as jest.Mock).mockResolvedValue({ server: "https://tenant.example", deviceId: "phone", sessionId: "login" })
  ;(mediaUploadIdsForVisit as jest.Mock).mockResolvedValue([])
  ;(hasQueuedVisitSignature as jest.Mock).mockResolvedValue(false)
  cacheRead.mockReset().mockResolvedValue(cached)
  ;(rememberVisitProgress as jest.Mock).mockResolvedValue(undefined)
  ;(clearVisitProgressCache as jest.Mock).mockResolvedValue(undefined)
  serverRead.mockReset()
})
afterEach(async () => { await act(async () => { tree?.unmount(); await flush() }) })

it("restores the confirmed photo before an offline workspace request times out", async () => {
  const request = deferred<unknown>(); serverRead.mockReturnValue(request.promise)
  await mount()
  expect(latest.photos.count).toBe(1)
  expect(latest.signature.required).toBe(true)
  await act(async () => { request.reject({ message: "Network request failed" }); await flush() })
  expect(latest.photos.count).toBe(1)
  expect(clearVisitProgressCache).not.toHaveBeenCalled()
})
it("replaces the cached projection with the fresh canonical count and policy", async () => {
  const request = deferred<unknown>(); serverRead.mockReturnValue(request.promise)
  await mount(); expect(latest.photos.count).toBe(1)
  await act(async () => { request.resolve(workspace(2)); await flush() })
  expect(latest.photos.count).toBe(2)
  expect(latest.signature.required).toBe(false)
  expect(rememberVisitProgress).toHaveBeenCalledWith(expect.objectContaining({ scope: "tenant:agent" }), "visit",
    expect.objectContaining({ photosCount: 2 }), expect.objectContaining({ serverCount: 2 }), expect.any(Function), expect.any(Number))
})
it("drops a cached photo and policy after an answered permission denial", async () => {
  const request = deferred<unknown>(); serverRead.mockReturnValue(request.promise)
  await mount(); expect(latest.photos.count).toBe(1)
  await act(async () => { request.reject({ status: 403, message: "Forbidden" }); await flush() })
  expect(latest.photos.count).toBe(0)
  expect(latest.signature.required).toBe(false)
  expect(clearVisitProgressCache).toHaveBeenCalled()
})
it("does not manufacture a photo when no admissible projection was loaded", async () => {
  cacheRead.mockResolvedValue(null); serverRead.mockRejectedValue({ message: "Network request failed" })
  await mount(); expect(latest.photos.count).toBe(0)
})
it("ignores an old actor's late workspace response", async () => {
  const request = deferred<unknown>(); serverRead.mockReturnValue(request.promise)
  await mount(); setOfflineScope("other", "agent")
  await act(async () => { request.resolve(workspace(8)); await flush() })
  expect(latest.photos.count).toBe(1)
  expect(rememberVisitProgress).not.toHaveBeenCalled()
})
it("does not let an older cache read overwrite an already received server answer", async () => {
  const first = deferred<typeof cached>()
  cacheRead.mockReturnValueOnce(first.promise).mockResolvedValue(cached)
  serverRead.mockResolvedValue(workspace(2))
  await mount()
  await act(async () => { tree.update(<Probe visit={{ id: "visit" }} />); await flush() })
  expect(latest.photos.count).toBe(2)
  await act(async () => { first.resolve(cached); await flush() })
  expect(latest.photos.count).toBe(2)
  expect(latest.signature.required).toBe(false)
})
