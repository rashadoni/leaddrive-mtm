import fs from "fs"
import path from "path"

/**
 * Found on the phone while accepting B9 (2026-09-13), not in the audit's task
 * list. B9 took the second offer to refresh and the card pointing to Visits off
 * the empty route screen; two pieces of the same thing were left elsewhere.
 */
const route = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
const visits = fs.readFileSync(path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"), "utf8")

describe("B9 leftovers", () => {
  it("shows the route hint only with a route", () => {
    // «Yeniləmək üçün siyahını aşağı çəkin. Yaşıl kart…» — a list to pull and a
    // green panel that do not exist on the empty screen.
    expect(route.match(/<InlineHint text=\{copy\.hint\}/g)).toHaveLength(2)
    expect(route.match(/\{route \? <InlineHint text=\{copy\.hint\}/g)).toHaveLength(2)
  })

  it("does not send Visits back to Route with a card", () => {
    // The other half of the ring: «Ziyarət artıq plandadır? → Marşrutu aç».
    // The subtitle already says planned visits start from Route, and Route is
    // a tab.
    expect(["routeGuide", "plannedTitle", "onOpenRoute"].filter((name) => visits.includes(name))).toEqual([])
  })
})
