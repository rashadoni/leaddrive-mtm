import fs from "fs"
import path from "path"

const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const screenSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/base/RouteContactDetailScreen.android.tsx"),
  "utf8",
)

describe("Route Field contact v2 boundary", () => {
  it("uses the dedicated v2 contract and never reads the broad v1 detail cache", () => {
    expect(apiSource).toContain("async getRouteContactDetail(id: string, signal?: AbortSignal)")
    expect(apiSource).toContain("/mobile/route-field/contacts/${encodeURIComponent(id)}")
    expect(screenSource).toContain("api.getRouteContactDetail(id)")
    expect(screenSource).not.toContain("api.getContact(")
    expect(screenSource).not.toContain("readOfflineContactDetail")
  })
})
