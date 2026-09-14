import fs from "fs"
import path from "path"

/**
 * E2E on a Redmi Pad SE, 2026-09-14: "Marşruta başla" answered «Bağlantı
 * yoxdur» on a tablet that was online. Production rejected START with a
 * database error; the command was parked, and a parked command was always
 * reported as no connection.
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

describe("route start tells offline apart from a server refusal", () => {
  it("says no connection only when the device is offline", () => {
    expect(source).toContain('if (useSyncStatusStore.getState().online === false) {\n          notify({ tone: "success", title: copy.routeStartQueuedTitle, message: copy.routeStartQueuedBody })')
    // A refusal is not a saved start: it reads as a warning, not in green.
    expect(source).toContain('} else {\n          notify({ tone: "warning", title: copy.routeStartDeferredTitle, message: copy.routeStartDeferredBody })')
  })

  it("has the server-refusal message in all three languages", () => {
    expect(source.match(/routeStartDeferredBody: "/g)).toHaveLength(3)
    expect(source).not.toMatch(/routeStartDeferredBody: "[^"]*(Bağlantı yoxdur|Нет связи|no connection)/)
  })
})
