import fs from "fs"
import path from "path"

/**
 * Google Play, 2026-10-18: Android's location sheet may open only after the
 * app's own disclosure (services/location-disclosure.ts). Until then «Начать
 * день» went straight to the sheet, and the geolocation library brought it up
 * by itself when «Маршрут» or «Визиты» read a position. This keeps the list
 * of places that open the sheet: a new one has to be added here, with the
 * reason it is disclosed.
 */

const root = path.resolve(__dirname, "../..")
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sources(file)
    return /\.tsx?$/.test(entry.name) ? [file] : []
  })
}

const SHEET_OPENERS: Record<string, string> = {
  // requestFieldLocationSheet, called after the disclosure only.
  "src/services/field-location-permission.ts": "after the disclosure",
  // Check-in on «Визиты»: askLocationDisclosure, then the sheet with its rationale.
  "src/screens/visit/VisitScreen.tsx": "after the disclosure",
  // Office attendance only; a field agent's mark passes mayAsk: false.
  "src/services/attendance-location-fix.ts": "office staff, not recorded in the background",
  // «All the time», from the Today card that is itself the disclosure.
  "src/services/background-location.ts": "after the Today card",
  // A manager's one point on a tap of their own; managers are not tracked.
  "src/screens/manager/ManagerSelfLocationShare.android.tsx": "a manager's own single point",
}

describe("Android's location sheet opens only after the app's disclosure", () => {
  it("is opened from the known places only", () => {
    const openers = sources("src").filter((file) => {
      const text = read(file)
      return /PermissionsAndroid\.(request|requestMultiple)\(/.test(text) && /ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION/.test(text)
    })
    expect(openers.sort()).toEqual(Object.keys(SHEET_OPENERS).sort())
  })

  it("never lets the geolocation library ask by itself", () => {
    const offenders = sources("src").filter((file) => {
      const text = read(file)
      return /skipPermissionRequests:\s*false/.test(text) || /Geolocation\.requestAuthorization\(/.test(text)
    })
    expect(offenders).toEqual([])
    const app = read("src/runtime/AndroidApp.tsx")
    expect(app).toContain("stopLibraryLocationPrompts()")
    expect(read("src/services/field-location-permission.ts")).toContain("skipPermissionRequests: true")
  })

  it("the workday's GPS goes through the disclosure", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    expect(app).toContain("disclose: discloseFieldLocation")
    expect(app).not.toMatch(/PermissionsAndroid\.requestMultiple\(/)
    const users = sources("src").filter((file) => read(file).includes("requestFieldLocationSheet"))
    expect(users.sort()).toEqual(["src/runtime/AndroidApp.tsx", "src/services/field-location-permission.ts"])
  })

  it("a check-in on «Визиты» shows the disclosure before the sheet", () => {
    const visit = read("src/screens/visit/VisitScreen.tsx")
    const start = visit.indexOf("const requestLocationPermission = async")
    const disclosure = visit.indexOf("askLocationDisclosure(", start)
    const sheet = visit.indexOf("PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION", start)
    expect(start).toBeGreaterThan(-1)
    expect(disclosure).toBeGreaterThan(start)
    expect(sheet).toBeGreaterThan(disclosure)
  })

  it("a check-in on «Маршрут» asks through the disclosure before it reads a position", () => {
    const route = read("src/screens/route/RouteScreen.tsx")
    const start = route.indexOf("const handleCheckIn = async")
    const ask = route.indexOf("await ensureFieldLocation()", start)
    const reading = route.indexOf("Geolocation.getCurrentPosition(", start)
    expect(start).toBeGreaterThan(-1)
    expect(ask).toBeGreaterThan(start)
    expect(reading).toBeGreaterThan(ask)
  })
})
