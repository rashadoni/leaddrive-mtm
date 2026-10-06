import fs from "fs"
import path from "path"
import { nearestPendingStopId, routeStopState } from "../../src/screens/route/route-screen-state"

/**
 * Owner, 2026-10-07, about the route on the phone: «не отображается … по каким
 * клиентам будет идти последовательность, какой ближе, не показывает, в каком
 * клиенте уже был, закончил визит, в каком продолжает, в каком ещё не был».
 *
 * The order, «been there» and «not yet» were on the screen. The stop being
 * visited was not: the list dropped it for the length of the visit, leaving a
 * hole exactly where the agent stood. And nothing said which stop was closest.
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

/** A day in the field: two done, one being visited, three ahead. */
const day = [
  { id: "p-1", orderIndex: 0, status: "VISITED", distanceMeters: 5200 },
  { id: "p-2", orderIndex: 1, status: "SKIPPED", distanceMeters: 4100 },
  { id: "p-3", orderIndex: 2, status: "PENDING", distanceMeters: 40 },
  { id: "p-4", orderIndex: 3, status: "PENDING", distanceMeters: 2600 },
  { id: "p-5", orderIndex: 4, status: "PENDING", distanceMeters: 900 },
  { id: "p-6", orderIndex: 5, status: "PENDING", distanceMeters: null },
]

describe("route: every stop says where it stands in the day", () => {
  it("tells been-there, skipped, being-visited and not-yet apart", () => {
    expect(day.map((point) => routeStopState(point, "p-3"))).toEqual([
      "visited", "skipped", "visiting", "planned", "planned", "planned",
    ])
  })

  it("believes the open visit over what the server last said about the stop", () => {
    // The check-in may not have reached the server yet, or the stop was reopened.
    expect(routeStopState({ id: "p-1", status: "VISITED" }, "p-1")).toBe("visiting")
    expect(routeStopState({ id: "p-3", status: "PENDING" }, null)).toBe("planned")
    expect(routeStopState({ id: "p-3" }, undefined)).toBe("planned")
  })

  it("keeps the stop being visited in the list, in its place in the order", () => {
    expect(source).toContain("const displayedPoints = sortedPoints")
    expect(source).not.toContain("point.id !== activeVisit.routePointId")
    // A list that holds the whole day is not «the remaining stops».
    expect(source).not.toContain("remainingStops")
    expect((source.match(/visiting=\{visitingPointId === item\.id\}/g) ?? []).length).toBe(2)
  })

  it("has a word for it in every language", () => {
    const words = (source.match(/^    visiting: "[^"]+",$/gm) ?? [])
    expect(words).toEqual([
      '    visiting: "Идёт визит",', '    visiting: "Ziyarət davam edir",', '    visiting: "Visit in progress",',
    ])
  })
})

describe("route: which stop is closest", () => {
  it("is the closest of the stops still ahead — not one already done, not the one being visited", () => {
    // p-3 is 40 m away, but the agent is inside it; p-1 and p-2 are behind him.
    expect(nearestPendingStopId(day, "p-3")).toBe("p-5")
    // With no visit open, the stop he is standing next to is the nearest.
    expect(nearestPendingStopId(day, null)).toBe("p-3")
  })

  it("says nothing when there is no choice to make, or nothing to go by", () => {
    const oneAhead = [day[0], day[4]]
    const noDistances = day.map((point) => ({ ...point, distanceMeters: null }))
    const odd = [{ id: "a", status: "PENDING", distanceMeters: Number.NaN }, { id: "b", status: "PENDING", distanceMeters: -5 }, { id: "c", status: "PENDING", distanceMeters: 300 }]
    expect([nearestPendingStopId(oneAhead, null), nearestPendingStopId(noDistances, null), nearestPendingStopId(odd, null), nearestPendingStopId([], null)])
      .toEqual([null, null, null, null])
  })

  it("is marked on the row, beside the distance, on the phone list and the tablet pane", () => {
    expect((source.match(/nearest=\{nearestPointId === item\.id\}/g) ?? []).length).toBe(2)
    expect(source).toContain("nearestPendingStopId(sortedPoints, visitingPointId)")
    expect(source.match(/^    nearest: "[^"]+",$/gm)).toEqual([
      '    nearest: "Ближайшая",', '    nearest: "Ən yaxın",', '    nearest: "Nearest",',
    ])
  })
})
