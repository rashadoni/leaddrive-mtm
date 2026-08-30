import fs from "fs"
import path from "path"

const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const routeListSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteOrganizationExplorerScreen.android.tsx"),
  "utf8",
)

describe("Route Field organization list v2 boundary", () => {
  it("uses only the dedicated v2 catalog and avoids the broad v1 offline cache", () => {
    expect(apiSource).toContain("async getRouteOrganizations(")
    expect(apiSource).toContain("/mobile/route-field/organizations${qs ? `?${qs}` : \"\"}")
    expect(routeListSource).toContain("api.getRouteOrganizations")
    expect(routeListSource).not.toContain("api.getOrganizations")
    expect(routeListSource).not.toContain("readOfflineOrganizations")
    expect(routeListSource).not.toContain("data?.total")
  })
})
