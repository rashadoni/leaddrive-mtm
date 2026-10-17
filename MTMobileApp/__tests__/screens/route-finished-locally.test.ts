import fs from "fs"
import path from "path"
import {
  checkInNoticeName,
  markStopFinishedLocally,
  withLocallyFinishedStops,
  withoutRefusedVisits,
} from "../../src/screens/route/route-screen-state"

const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

/** The owner's E2E route on 2026-10-17: two stops, the first just finished. */
const route = [
  { id: "p-1", orderIndex: 0, status: "PENDING", customer: { name: "Test E2E Klinika" }, contact: { displayName: "TestE2E Həkim Bir" } },
  { id: "p-2", orderIndex: 1, status: "PENDING", customer: { name: "Test E2E Aptek" } },
]
const nextOf = (points: typeof route) => points.find((point) => point.status === "PENDING") ?? null
const doneOf = (points: typeof route) => points.filter((point) => point.status === "VISITED").length

/**
 * After «Ziyarəti bitir» → «Təsdiq et» the Route tab showed the same stop as
 * «Növbəti nöqtə» with «Artıq buradayam» and 1/2 for about twenty seconds,
 * until the sync — an open invitation to check in twice.
 */
describe("route: a visit finished on the phone is done at once", () => {
  it("counts the stop as done and moves «next» on before the server knows", () => {
    const finished = markStopFinishedLocally({}, { id: "visit-1", routePointId: "p-1" })
    const points = withLocallyFinishedStops(route, finished)
    expect(doneOf(points)).toBe(1)
    expect(nextOf(points)?.id).toBe("p-2")
    // The server's own copy is not touched.
    expect(route[0].status).toBe("PENDING")
  })

  it("counts the visit whose check-out still waits to sync", () => {
    const points = withLocallyFinishedStops(route, {}, { routePointId: "p-1", pendingCheckOut: true })
    expect(nextOf(points)?.id).toBe("p-2")
    expect(withLocallyFinishedStops(route, {}, { routePointId: "p-1", pendingCheckOut: false })).toBe(route)
  })

  it("leaves what the server already said about a stop as it is", () => {
    const skipped = [{ ...route[0], status: "SKIPPED" }, route[1]]
    expect(withLocallyFinishedStops(skipped, { "p-1": "visit-1" })[0].status).toBe("SKIPPED")
  })

  it("gives the stop back when the server refused the visit or reopened it", () => {
    const finished = { "p-1": "visit-1", "p-2": "visit-2" }
    expect(withoutRefusedVisits(finished, new Set(["visit-1"]))).toEqual({ "p-2": "visit-2" })
    expect(withoutRefusedVisits(finished, new Set(), "visit-2")).toEqual({ "p-1": "visit-1" })
    expect(withoutRefusedVisits(finished, new Set())).toBe(finished)
  })

  it("is wired into the Route tab: the check-out marks the stop, the progress reads the marked list", () => {
    const checkOut = source.slice(source.indexOf("const performCheckOut"), source.indexOf("const routeStartReady"))
    expect(checkOut).toContain("setFinishedLocally((current) => markStopFinishedLocally(current, visit))")
    expect(source).toContain("withLocallyFinishedStops(\n          [...route.points].sort((left, right) => left.orderIndex - right.orderIndex),\n          finishedLocally,\n          activeVisit,\n        )")
    expect(source).toContain("const visitingPointId = activeVisit && !activeVisit.pendingCheckOut ? activeVisit.routePointId ?? null : null")
    expect(source).toContain("withoutRefusedVisits(current, refused,")
  })
})

describe("route: the check-in notice names who is visited", () => {
  it("says the doctor for a doctor's stop and the place otherwise", () => {
    expect(checkInNoticeName(route[0])).toBe("TestE2E Həkim Bir")
    expect(checkInNoticeName(route[1])).toBe("Test E2E Aptek")
  })
})
