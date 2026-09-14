import fs from "fs"
import path from "path"

/**
 * Device report 2026-09-14 (Galaxy S23): after a reinstall the active visit had
 * 3 photos on the server and both visit screens showed «Foto: 0»; on «Marşrut»
 * the 0 also made «Foto çək» the main button instead of «Ziyarəti bitir». The
 * count was a `useState(0)` bumped on each shot. It now comes from the visit
 * workspace + media outbox (`services/visit-photo-count.ts`).
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const route = read("screens/route/RouteScreen.tsx")
const visits = read("screens/visit/VisitScreen.tsx")
const hook = read("hooks/useActiveVisitProgress.ts")

function handler(source: string) {
  const start = source.indexOf("const handlePhotoTaken = async")
  return source.slice(start, source.indexOf("\n  }\n", start))
}

describe("«Foto: N» on an active visit survives a restart", () => {
  it.each([["route", route], ["visits", visits]])("%s screen shows the shared count, not a local counter", (_name, source) => {
    expect(source).not.toMatch(/\[\s*photo\w*,\s*set\w*\s*\]\s*=\s*useState/i)
    expect(source).not.toContain("setPhotoCount")
    expect(source).toContain("useActiveVisitProgress(activeVisit)")
    expect(source).toMatch(/photoCount(=\{|: )photos\.count/)
  })

  it.each([["route", route], ["visits", visits]])("%s screen reconciles the count after an upload and after queueing", (_name, source) => {
    const body = handler(source)
    expect(body).toContain("await api.uploadPhoto(")
    expect(body.indexOf("photos.recordUpload(activeVisit.id)")).toBeGreaterThan(body.indexOf("await api.uploadPhoto("))
    // The queued photo is remembered by its outbox id, so the other tab counts
    // it even if the sync sends it before that tab looks at the outbox.
    const queued = body.indexOf("const queuedPhoto = await enqueueMediaUpload(")
    expect(queued).toBeGreaterThanOrEqual(0)
    expect(body.indexOf("photos.recordQueued(activeVisit.id, queuedPhoto.id)")).toBeGreaterThan(queued)
  })

  it("the route panel still picks the main button from that count", () => {
    expect(route).toContain("const photoFirst = photoCount === 0")
    expect(route).toContain("photoCount={photos.count}")
  })

  it("the hook counts server, outbox and session uploads from one workspace read", () => {
    expect(hook.match(/api\.getVisitWorkspace\(/g)).toHaveLength(1)
    expect(hook).toContain("workspace.photosCount")
    expect(hook).toContain("mediaUploadIdsForVisit(visitId)")
    expect(hook).toContain("visitPhotoCount(")
    expect(hook).toContain("needsServerPhotoRead(")
    // The local queue is shown before the workspace call can hang in weak
    // coverage; only a server answer makes older reads stale.
    const load = hook.slice(hook.indexOf("const load = useCallback"), hook.indexOf("const loadRef = useRef(load)"))
    const localApply = load.indexOf("applyPhotos(read, visitId, { ...local, serverCount: null })")
    expect(localApply).toBeGreaterThanOrEqual(0)
    expect(load.indexOf("api.getVisitWorkspace(")).toBeGreaterThan(localApply)
    expect(hook).toContain("foldPhotoRead(")
    // The retry-on-fresh-visit signal the signature relied on stays.
    expect(hook).toContain("}, [load, visit])")
  })

  it("the pure counting module stays free of React Native", () => {
    const pure = read("services/visit-photo-count.ts")
    expect(pure).not.toMatch(/from ["'](react|react-native|@react-native)/)
  })
})
