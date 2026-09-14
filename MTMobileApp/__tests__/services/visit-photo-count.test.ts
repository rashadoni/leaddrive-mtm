import {
  applyPhotoRead,
  EMPTY_VISIT_PHOTOS,
  needsServerPhotoRead,
  visitPhotoCount,
  type VisitPhotoSnapshot,
} from "../../src/services/visit-photo-count"

/**
 * Device report 2026-09-14 (Galaxy S23): the visit had 3 photos on the server,
 * the app showed «Foto: 0» after a reinstall, and «Marşrut» offered «Foto çək»
 * as the main button instead of «Ziyarəti bitir». The count now comes from the
 * server, the media outbox and this session's direct uploads — each photo once.
 */
describe("visit photo count", () => {
  it("a fresh start shows the photos the server already has", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 3, queuedIds: [], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(snapshot, 0)).toBe(3)
  })

  it("adds photos still waiting in the outbox to the server's", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 2, queuedIds: ["media-a", "media-b"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(snapshot, 0)).toBe(4)
  })

  it("counts only the outbox while the server was never reached (visit checked in offline)", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: null, queuedIds: ["media-a"], uploadsAtReadStart: 0 })
    expect(snapshot.serverCount).toBeNull()
    expect(visitPhotoCount(snapshot, 0)).toBe(1)
    expect(needsServerPhotoRead(snapshot, ["media-a"], 0)).toBe(true)
  })

  it("counts a direct upload at once and not again once the server lists it", () => {
    const before = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 3, queuedIds: [], uploadsAtReadStart: 0 })
    // The upload finished: session uploads 1, the held server list is older.
    expect(visitPhotoCount(before, 1)).toBe(4)
    expect(needsServerPhotoRead(before, [], 1)).toBe(true)
    // The re-read started after that upload, so the server's 4 include it.
    const after = applyPhotoRead(before, { serverCount: 4, queuedIds: [], uploadsAtReadStart: 1 })
    expect(visitPhotoCount(after, 1)).toBe(4)
    expect(needsServerPhotoRead(after, [], 1)).toBe(false)
  })

  it("an upload that finishes while a read is under way is counted until the next read settles it", () => {
    const held = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 1, queuedIds: [], uploadsAtReadStart: 0 })
    // Read started with 0 uploads; the server may or may not list the photo.
    const raced = applyPhotoRead(held, { serverCount: 2, queuedIds: [], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(raced, 1)).toBe(3)
    expect(needsServerPhotoRead(raced, [], 1)).toBe(true)
    const settled = applyPhotoRead(raced, { serverCount: 2, queuedIds: [], uploadsAtReadStart: 1 })
    expect(visitPhotoCount(settled, 1)).toBe(2)
  })

  it("a queued photo that the sync uploaded moves from queue to server, not into both", () => {
    const queued = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 3, queuedIds: ["media-a"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(queued, 0)).toBe(4)
    // The outbox no longer has it: the held server count is stale.
    expect(needsServerPhotoRead(queued, [], 0)).toBe(true)
    const synced = applyPhotoRead(queued, { serverCount: 4, queuedIds: [], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(synced, 0)).toBe(4)
  })

  it("keeps counting an uploaded queued photo while the server cannot be re-read", () => {
    const queued = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 3, queuedIds: ["media-a"], uploadsAtReadStart: 0 })
    // Sync uploaded media-a, a new shot went to the queue, the workspace read failed.
    const offline = applyPhotoRead(queued, { serverCount: null, queuedIds: ["media-b"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(offline, 0)).toBe(5)
    expect(needsServerPhotoRead(offline, ["media-b"], 0)).toBe(true)
    const online = applyPhotoRead(offline, { serverCount: 4, queuedIds: ["media-b"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(online, 0)).toBe(5)
  })

  it("a new queued photo needs no server read; the local outbox is enough", () => {
    const held = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 3, queuedIds: [], uploadsAtReadStart: 0 })
    expect(needsServerPhotoRead(held, ["media-a"], 0)).toBe(false)
    const next = applyPhotoRead(held, { serverCount: null, queuedIds: ["media-a"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(next, 0)).toBe(4)
  })

  it("the same outbox id read twice is one photo", () => {
    const snapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: 0, queuedIds: ["media-a", "media-a"], uploadsAtReadStart: 0 })
    const again = applyPhotoRead(snapshot, { serverCount: null, queuedIds: ["media-a"], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(again, 0)).toBe(1)
  })

  it("never shows a negative or fractional count from a bad server value", () => {
    const snapshot: VisitPhotoSnapshot = applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: -2, queuedIds: [], uploadsAtReadStart: 0 })
    expect(visitPhotoCount(snapshot, 0)).toBe(0)
    expect(visitPhotoCount(applyPhotoRead(EMPTY_VISIT_PHOTOS, { serverCount: Number.NaN, queuedIds: [], uploadsAtReadStart: 0 }), 0)).toBe(0)
  })
})
