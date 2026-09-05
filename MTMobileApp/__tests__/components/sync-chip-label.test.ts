import { syncChipLabel } from "../../src/components/sync-chip-label"

describe("syncChipLabel (field UX audit M-06 / B4)", () => {
  it("never says synced while the device is offline", () => {
    expect(syncChipLabel({ phase: "idle", online: false, conflicts: 0, outstanding: 0 })).toEqual({ key: "syncCenter.offline" })
    expect(syncChipLabel({ phase: "syncing", online: false, conflicts: 0, outstanding: 2 }))
      .toEqual({ key: "syncCenter.offlinePending", count: 2 })
  })

  it("keeps the previous priorities when online", () => {
    expect(syncChipLabel({ phase: "syncing", online: true, conflicts: 0, outstanding: 1 })).toEqual({ key: "syncCenter.syncing" })
    expect(syncChipLabel({ phase: "idle", online: true, conflicts: 3, outstanding: 1 })).toEqual({ key: "syncCenter.conflictsShort", count: 3 })
    expect(syncChipLabel({ phase: "idle", online: true, conflicts: 0, outstanding: 4 })).toEqual({ key: "syncCenter.pendingShort", count: 4 })
    expect(syncChipLabel({ phase: "idle", online: true, conflicts: 0, outstanding: 0 })).toEqual({ key: "syncCenter.synced" })
  })

  it("still honours a sync run that detected offline before NetInfo reported it", () => {
    expect(syncChipLabel({ phase: "offline", online: null, conflicts: 0, outstanding: 0 })).toEqual({ key: "syncCenter.offline" })
  })
})
