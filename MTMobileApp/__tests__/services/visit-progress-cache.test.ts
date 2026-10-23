jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/bootstrap-offline-cache", () => ({ readOfflineBootstrap: jest.fn() }))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { readOfflineBootstrap } from "../../src/services/bootstrap-offline-cache"
import { clearVisitProgressCache, nextVisitProgressRead, readOfflineVisitProgress, rememberVisitProgress,
  VISIT_PROGRESS_CACHE_KEY } from "../../src/services/visit-progress-cache"
import { applyPhotoRead, EMPTY_VISIT_PHOTOS, visitPhotoCount } from "../../src/services/visit-photo-count"

const NOW = Date.parse("2026-10-23T12:00:00Z"), WEEK = 604800000
const binding = { scope: "tenant:agent", server: "https://tenant.example", deviceId: "phone", sessionId: "login" }
const progress = { photosCount: 1, requirements: [{ actionKey: "SIGNATURE", mode: "REQUIRED", done: false, waived: false }] }
const photoRead = { serverCount: 1, queuedIds: ["pending-1"], uploadsAtReadStart: 1, sessionQueuedIds: ["pending-1"] }
const current = () => true
const admission = readOfflineBootstrap as jest.Mock
async function remember() { await rememberVisitProgress(binding, "visit", progress, photoRead, current) }
async function read() { return readOfflineVisitProgress(binding, "visit", ["pending-1"], current) }

beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(NOW); jest.clearAllMocks(); await AsyncStorage.clear()
  admission.mockResolvedValue({ validUntil: NOW + WEEK })
})
afterEach(() => { jest.useRealTimers() })

it("restores a previously confirmed photo and required signature with a valid offline grant", async () => {
  await remember()
  const cached = await read()
  expect(cached?.photosCount).toBe(1)
  expect(cached?.requirements).toEqual(progress.requirements)
  expect(visitPhotoCount(applyPhotoRead(EMPTY_VISIT_PHOTOS, cached!.photoRead), 1)).toBe(2) // one server + one queued
  expect(admission).toHaveBeenCalledWith(binding, current)
})
it("does not expose a stored projection without explicit current offline admission", async () => {
  await remember(); admission.mockResolvedValue(null)
  expect(await read()).toBeNull()
})
it.each(["scope", "server", "deviceId", "sessionId"] as const)("keeps a different %s out of the cache", async key => {
  await remember()
  expect(await readOfflineVisitProgress({ ...binding, [key]: "other" }, "visit", [], current)).toBeNull()
})
it("does not restore a different visit", async () => {
  await remember(); expect(await readOfflineVisitProgress(binding, "other", [], current)).toBeNull()
})
it.each([WEEK, WEEK + 1, -5001])("refuses stale or clock-reversed progress at offset %s", async offset => {
  await remember(); admission.mockResolvedValue({ validUntil: NOW + WEEK * 2 }); jest.setSystemTime(NOW + offset)
  expect(await read()).toBeNull()
})
it("rechecks grant expiry after the admission read", async () => {
  await remember()
  admission.mockImplementation(async () => { jest.setSystemTime(NOW + 20); return { validUntil: NOW + 10 } })
  expect(await read()).toBeNull()
})
it("uses a new process's zero upload baseline while preserving confirmed photos", async () => {
  await remember()
  const entry = JSON.parse((await AsyncStorage.getItem(VISIT_PROGRESS_CACHE_KEY))!)
  entry.processId = "previous-process"
  await AsyncStorage.setItem(VISIT_PROGRESS_CACHE_KEY, JSON.stringify(entry))
  const cached = await read()
  expect(cached?.photoRead.uploadsAtReadStart).toBe(0)
  expect(cached?.photoRead.sessionQueuedIds).toEqual([])
  const state = applyPhotoRead(EMPTY_VISIT_PHOTOS, cached!.photoRead)
  expect(visitPhotoCount(state, 0)).toBe(2)
  expect(visitPhotoCount(state, 1)).toBe(3) // a new direct upload must not disappear
})
it("does not double count a direct upload on a remounted screen in the same process", async () => {
  await remember()
  const cached = await read()
  expect(cached?.photoRead.uploadsAtReadStart).toBe(1)
  expect(visitPhotoCount(applyPhotoRead(EMPTY_VISIT_PHOTOS, cached!.photoRead), 1)).toBe(2)
})
it("deduplicates the durable and current photo outboxes", async () => {
  await remember()
  const cached = await readOfflineVisitProgress(binding, "visit", ["pending-1", "pending-2"], current)
  expect(cached?.photoRead.queuedIds).toEqual(["pending-1", "pending-2"])
})
it("ignores malformed private state", async () => {
  await AsyncStorage.setItem(VISIT_PROGRESS_CACHE_KEY, "{")
  expect(await read()).toBeNull()
})
it("whitelists progress rather than persisting arbitrary workspace payloads", async () => {
  await rememberVisitProgress(binding, "visit", { ...progress, token: "never-cache" } as typeof progress, photoRead, current)
  expect(await AsyncStorage.getItem(VISIT_PROGRESS_CACHE_KEY)).not.toContain("never-cache")
})
it("lets a newer denial clear an already queued older storage write", async () => {
  const old = rememberVisitProgress(binding, "visit", progress, photoRead, current)
  await clearVisitProgressCache(); await old
  expect(await AsyncStorage.getItem(VISIT_PROGRESS_CACHE_KEY)).toBeNull()
})
it("ignores a late read after the user or visit changed", async () => {
  await remember()
  expect(await readOfflineVisitProgress(binding, "visit", [], () => false)).toBeNull()
})
it("does not resurrect progress when an older server answer arrives after a newer denial", async () => {
  const old = nextVisitProgressRead(), denied = nextVisitProgressRead()
  await clearVisitProgressCache(current, denied)
  await rememberVisitProgress(binding, "visit", progress, photoRead, current, old)
  expect(await AsyncStorage.getItem(VISIT_PROGRESS_CACHE_KEY)).toBeNull()
})
it("orders responses shared by two screens by request order, not arrival order", async () => {
  const old = nextVisitProgressRead(), fresh = nextVisitProgressRead()
  await rememberVisitProgress(binding, "visit", { ...progress, photosCount: 2 }, photoRead, current, fresh)
  await rememberVisitProgress(binding, "visit", progress, photoRead, current, old)
  expect((await read())?.photosCount).toBe(2)
})
