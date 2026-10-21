import fs from "fs"
import path from "path"
import { directionsUrl } from "../../src/lib/directions"

const DIR = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination="

describe("«Yolu aç» builds the drive to the client", () => {
  it("to the client's pin, from where the phone is", () => {
    expect(directionsUrl({ latitude: 40.3925, longitude: 49.8521, address: "Nəsimi, Bakı ş., 389 məhəllə" }))
      .toBe(`${DIR}40.3925,49.8521`)
  })

  it("to the address only when there is no pin", () => {
    expect(directionsUrl({ latitude: null, longitude: null, address: "Bakı, Nizami küç. 10" }))
      .toBe(`${DIR}${encodeURIComponent("Bakı, Nizami küç. 10")}`)
    expect(directionsUrl({ latitude: 0, longitude: 0, address: "Bakı, Nizami küç. 10" }))
      .toBe(`${DIR}${encodeURIComponent("Bakı, Nizami küç. 10")}`)
    expect(directionsUrl({ latitude: 95, longitude: 49.8, address: "Bakı" })).toBe(`${DIR}Bak%C4%B1`)
  })

  it("nowhere when neither is known", () => {
    expect(directionsUrl({})).toBeNull()
    expect(directionsUrl({ latitude: 0, longitude: 0, address: "  " })).toBeNull()
  })
})

describe("the buttons use it", () => {
  const root = path.join(__dirname, "../..")
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

  it("on the route: a route, not a search, and «Yolu aç» stays after a trip to the map", () => {
    const route = read("src/screens/route/RouteScreen.tsx")
    expect(route).not.toContain("google.com/maps/search")
    expect(route).toContain("const url = directionsUrl({")
    // The button used to hide once navigation had started.
    expect(route).not.toContain("!navigationStarted && hasDirections")
    expect(route).toContain("const directionsFirst = hasDirections && !nearby")
    expect(route).toContain('{hasDirections ? <ActionButton label={copy.openMaps} icon="navigate" onPress={() => onNavigate(point)} tone="secondary" /> : null}')
  })

  it("on the organization card", () => {
    const card = read("src/screens/base/RouteOrganizationDetailScreen.android.tsx")
    expect(card).not.toContain("google.com/maps/search")
    expect(card).toContain("directionsUrl({ latitude: pin?.latitude, longitude: pin?.longitude, address })")
  })
})
