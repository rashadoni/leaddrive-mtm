import fs from "fs"
import path from "path"

const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const routeListSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteContactsList.android.tsx"),
  "utf8",
)

describe("Route Field contact list v2 boundary", () => {
  it("uses only the dedicated v2 catalog and avoids the broad v1 offline cache", () => {
    expect(apiSource).toContain("async getRouteContacts(")
    expect(apiSource).toContain("/mobile/route-field/contacts${qs ? `?${qs}` : \"\"}")
    expect(routeListSource).toContain("api.getRouteContacts")
    expect(routeListSource).not.toContain("api.getContacts")
    expect(routeListSource).not.toContain("readOfflineContacts")
  })
})
