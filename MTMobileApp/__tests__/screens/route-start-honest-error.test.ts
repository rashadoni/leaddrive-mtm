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
    expect(source).toContain('if (useSyncStatusStore.getState().online === false) {\n          Alert.alert(copy.routeStartQueuedTitle, copy.routeStartQueuedBody)')
    expect(source).toContain("Alert.alert(copy.routeStartDeferredTitle, copy.routeStartDeferredBody)")
  })

  it("has the server-refusal message in all three languages", () => {
    expect(source.match(/routeStartDeferredBody: "/g)).toHaveLength(3)
    expect(source).not.toMatch(/routeStartDeferredBody: "[^"]*(Bağlantı yoxdur|Нет связи|no connection)/)
  })
})
