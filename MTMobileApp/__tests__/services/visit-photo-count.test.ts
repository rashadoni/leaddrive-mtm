import {
  applyPhotoRead,
  EMPTY_VISIT_PHOTO_STATE,
  EMPTY_VISIT_PHOTOS,
  foldPhotoRead,
  needsServerPhotoRead,
  photosForVisit,
  visitPhotoCount,
  type VisitPhotoRead,
  type VisitPhotoSnapshot,
} from "../../src/services/visit-photo-count"

/**
 * Device report 2026-09-14 (Galaxy S23): the visit had 3 photos on the server,
 * the app showed «Foto: 0» after a reinstall, and «Marşrut» offered «Foto çək»
 * as the main button instead of «Ziyarəti bitir». The count now comes from the
 * server, the media outbox and this session's photos — each photo once.
 */
function read(serverCount: number | null, rest: Partial<Omit<VisitPhotoRead, "serverCount">> = {}): VisitPhotoRead {
  return { serverCount, queuedIds: [], uploadsAtReadStart: 0, sessionQueuedIds: [], ...rest }
}

describe("visit photo count", () => {
  it("a fresh start shows the photos the server already has", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(3))
    expect(visitPhotoCount(snapshot, 0)).toBe(3)
  })

  it("adds photos still waiting in the outbox to the server's", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(2, { queuedIds: ["media-a", "media-b"] }))
    expect(visitPhotoCount(snapshot, 0)).toBe(4)
  })

  it("counts only the outbox while the server was never reached (visit checked in offline)", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(null, { queuedIds: ["media-a"] }))
    expect(snapshot.serverCount).toBeNull()
    expect(visitPhotoCount(snapshot, 0)).toBe(1)
    expect(needsServerPhotoRead(snapshot, ["media-a"], 0)).toBe(true)
  })

  it("counts a direct upload at once and not again once the server lists it", () => {
    const before = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(3))
    // The upload finished: session uploads 1, the held server list is older.
    expect(visitPhotoCount(before, 1)).toBe(4)
    expect(needsServerPhotoRead(before, [], 1)).toBe(true)
    // The re-read started after that upload, so the server's 4 include it.
    const after = applyPhotoRead(before, read(4, { uploadsAtReadStart: 1 }))
    expect(visitPhotoCount(after, 1)).toBe(4)
    expect(needsServerPhotoRead(after, [], 1)).toBe(false)
  })

  it("an upload that finishes while a read is under way is counted until the next read settles it", () => {
    const held = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(1))
    // Read started with 0 uploads; the server may or may not list the photo.
    const raced = applyPhotoRead(held, read(2))
    expect(visitPhotoCount(raced, 1)).toBe(3)
    expect(needsServerPhotoRead(raced, [], 1)).toBe(true)
    const settled = applyPhotoRead(raced, read(2, { uploadsAtReadStart: 1 }))
    expect(visitPhotoCount(settled, 1)).toBe(2)
  })

  it("a queued photo that the sync uploaded moves from queue to server, not into both", () => {
    const queued = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(3, { queuedIds: ["media-a"] }))
    expect(visitPhotoCount(queued, 0)).toBe(4)
    // The outbox no longer has it: the held server count is stale.
    expect(needsServerPhotoRead(queued, [], 0)).toBe(true)
    const synced = applyPhotoRead(queued, read(4))
    expect(visitPhotoCount(synced, 0)).toBe(4)
  })

  it("keeps counting an uploaded queued photo while the server cannot be re-read", () => {
    const queued = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(3, { queuedIds: ["media-a"] }))
    // Sync uploaded media-a, a new shot went to the queue, the workspace read failed.
    const offline = applyPhotoRead(queued, read(null, { queuedIds: ["media-b"] }))
    expect(visitPhotoCount(offline, 0)).toBe(5)
    expect(needsServerPhotoRead(offline, ["media-b"], 0)).toBe(true)
    const online = applyPhotoRead(offline, read(4, { queuedIds: ["media-b"] }))
    expect(visitPhotoCount(online, 0)).toBe(5)
  })

  it("a new queued photo needs no server read; the local outbox is enough", () => {
    const held = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(3))
    expect(needsServerPhotoRead(held, ["media-a"], 0, ["media-a"])).toBe(false)
    const next = applyPhotoRead(held, read(null, { queuedIds: ["media-a"], sessionQueuedIds: ["media-a"] }))
    expect(visitPhotoCount(next, 0)).toBe(4)
  })

  it("a photo queued on the other tab and sent by the sync before this tab looked still counts", () => {
    // «Marşrut» read the server: 0 photos, empty queue. The agent then took a
    // photo on «Ziyarətlər» in weak coverage; it was queued and the sync sent
    // it. Back on «Marşrut» the outbox is empty again.
    const route = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(0))
    expect(needsServerPhotoRead(route, [], 0, ["media-a"])).toBe(true)
    const local = applyPhotoRead(route, read(null, { sessionQueuedIds: ["media-a"] }))
    expect(visitPhotoCount(local, 0)).toBe(1)
    // The re-read started with media-a already sent, so the server's 1 is it.
    const server = applyPhotoRead(local, read(1, { sessionQueuedIds: ["media-a"] }))
    expect(visitPhotoCount(server, 0)).toBe(1)
    expect(needsServerPhotoRead(server, [], 0, ["media-a"])).toBe(false)
    expect(visitPhotoCount(applyPhotoRead(server, read(null, { sessionQueuedIds: ["media-a"] })), 0)).toBe(1)
  })

  it("the same outbox id read twice is one photo", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(0, { queuedIds: ["media-a", "media-a"] }))
    const again = applyPhotoRead(snapshot, read(null, { queuedIds: ["media-a"], sessionQueuedIds: ["media-a"] }))
    expect(visitPhotoCount(again, 0)).toBe(1)
  })

  it("never shows a negative or fractional count from a bad server value", () => {
    const snapshot: VisitPhotoSnapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, read(-2))
    expect(visitPhotoCount(snapshot, 0)).toBe(0)
    expect(visitPhotoCount(applyPhotoRead(EMPTY_VISIT_PHOTOS, read(Number.NaN)), 0)).toBe(0)
  })
})

describe("visit photo reads arriving out of order", () => {
  const count = (state: typeof EMPTY_VISIT_PHOTO_STATE) => visitPhotoCount(photosForVisit(state, "visit-1"), 0)

  it("a newer read whose server call failed does not throw away an older one that succeeded", () => {
    let state = foldPhotoRead(EMPTY_VISIT_PHOTO_STATE, "visit-1", 1, read(null))
    state = foldPhotoRead(state, "visit-1", 2, read(null))
    // Read 1 got through after read 2 had already given up.
    state = foldPhotoRead(state, "visit-1", 1, read(3))
    expect(count(state)).toBe(3)
  })

  it("an older server answer is dropped once a newer one is held", () => {
    let state = foldPhotoRead(EMPTY_VISIT_PHOTO_STATE, "visit-1", 2, read(4))
    const stale = foldPhotoRead(state, "visit-1", 1, read(3))
    expect(stale).toBe(state)
    // So is a queue read that started before the held server count.
    expect(foldPhotoRead(state, "visit-1", 1, read(null, { queuedIds: ["media-old"] }))).toBe(state)
    state = foldPhotoRead(state, "visit-1", 3, read(null))
    expect(count(state)).toBe(4)
  })

  it("an older server answer keeps the photo a newer queue read already counted", () => {
    let state = foldPhotoRead(EMPTY_VISIT_PHOTO_STATE, "visit-1", 1, read(null))
    state = foldPhotoRead(state, "visit-1", 2, read(null, { queuedIds: ["media-a"], sessionQueuedIds: ["media-a"] }))
    expect(count(state)).toBe(1)
    state = foldPhotoRead(state, "visit-1", 1, read(2))
    expect(count(state)).toBe(3)
  })

  it("the queue shows before the server answers (weak coverage, 20 s timeout)", () => {
    const state = foldPhotoRead(EMPTY_VISIT_PHOTO_STATE, "visit-1", 1, read(null, { queuedIds: ["media-a"] }))
    expect(count(state)).toBe(1)
  })

  it("another visit starts from nothing", () => {
    const first = foldPhotoRead(EMPTY_VISIT_PHOTO_STATE, "visit-1", 5, read(3))
    const second = foldPhotoRead(first, "visit-2", 6, read(null))
    expect(visitPhotoCount(photosForVisit(second, "visit-2"), 0)).toBe(0)
    expect(visitPhotoCount(photosForVisit(second, "visit-1"), 0)).toBe(0)
  })
})
