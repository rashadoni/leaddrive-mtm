import { cartoTileScript } from "../../src/screens/maps/carto-tiles"
import { toBootstrap } from "../../src/services/bootstrap"

/**
 * Field UX audit B16 / task T12 — the CARTO basemap key, end to end.
 *
 * The key travels server bootstrap → store → map HTML, and until now no test
 * touched any leg of that trip. It is the kind of path that breaks silently:
 * CARTO answers a keyless request with tiles that read "API KEY REQUIRED"
 * stamped across the map, which looks like a rendering bug, not a lost key.
 */
describe("CARTO basemap key path", () => {
  it("reads the key out of the bootstrap payload", () => {
    const data = toBootstrap({
      tenant: { id: "o1", name: "Acme", slug: "acme" },
      principal: { id: "a1", name: "Rep", email: "r@x.az", role: "AGENT" },
      capabilities: ["FIELD_EXECUTE"],
      timezone: "Asia/Baku",
      maps: { cartoBasemapsApiKey: "carto-key-1" },
    })
    expect(data.maps?.cartoBasemapsApiKey).toBe("carto-key-1")
  })

  it("reports no key rather than an empty one when the server sends none", () => {
    const missing = toBootstrap({
      tenant: { id: "o1", name: "Acme", slug: "acme" },
      principal: { id: "a1", name: "Rep", email: "r@x.az", role: "AGENT" },
      capabilities: [],
      timezone: "Asia/Baku",
    })
    expect(missing.maps?.cartoBasemapsApiKey).toBeNull()
  })

  it("puts the key on every tile request as ?key=", () => {
    const script = cartoTileScript({ apiKey: "carto-key-1" })
    expect(script).toContain('"?key=carto-key-1"')
    // The query is appended after the @2x.png suffix, not spliced into the path.
    expect(script).toContain('"@2x.png" + __cartoTileQuery')
  })

  it("escapes a key that would otherwise break out of the query", () => {
    const script = cartoTileScript({ apiKey: "a b&z=1" })
    expect(script).toContain("a%20b%26z%3D1")
    expect(script).not.toContain("a b&z=1")
  })

  it("asks for tiles without a key rather than sending ?key= empty", () => {
    for (const apiKey of [null, undefined, "", "   "]) {
      const script = cartoTileScript({ apiKey })
      expect(script).toContain('var __cartoTileQuery = "";')
      expect(script).not.toContain("?key=")
    }
    expect(cartoTileScript()).toContain('var __cartoTileQuery = "";')
  })

  it("lets the tenant origin reach CARTO so the key can be restricted to it", () => {
    // The screens set baseUrl to the tenant origin exactly so this request
    // carries it. "no-referrer" made that pointless and forced an unrestricted
    // key; "origin" sends the origin and never the map URL with its coordinates.
    const script = cartoTileScript({ apiKey: "carto-key-1" })
    expect(script).toContain('image.referrerPolicy = "origin"')
    expect(script).not.toContain("no-referrer")
  })
})
