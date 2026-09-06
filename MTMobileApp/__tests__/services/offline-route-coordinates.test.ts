import { mapCachedRoute } from "../../src/services/offline-reads"
import { hasUsableCoordinates } from "../../src/screens/visit/visit-checkin-model"

// offline-reads pulls in the durable cache, which reaches for the native
// AsyncStorage module; the same mock every other test of this layer uses.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

/**
 * B2 tail. The route projection the server sends embeds only id/name/address
 * for a point's customer — a frozen v1 contract — so the offline route arrived
 * with no coordinates at all. Once the screens started testing coordinates
 * before a check-in, every cached point looked like a customer whose card has
 * none: "координаты не заданы" on all of them, and a refused check-in with a
 * reason that was not true. Coordinates now come from the separately cached
 * customers, the same join the offline task list already used for names.
 */
const routeRecord = {
  id: "route-1",
  date: "2026-09-07",
  status: "IN_PROGRESS",
  points: [
    { id: "p1", orderIndex: 0, status: "PENDING", customer: { id: "c1", name: "Аптека 1", address: "Баку" } },
    { id: "p2", orderIndex: 1, status: "PENDING", customer: { id: "c2", name: "Аптека 2" } },
    { id: "p3", orderIndex: 2, status: "VISITED", customer: { id: "c-unknown", name: "Аптека 3" } },
  ],
}

const customers = new Map<string, Record<string, unknown>>([
  ["c1", { id: "c1", name: "Аптека 1", address: "Баку, Низами 10", latitude: 40.4093, longitude: 49.8671 }],
  ["c2", { id: "c2", name: "Аптека 2", address: "Баку, Хагани 5", latitude: null, longitude: null }],
])

describe("offline route points", () => {
  it("carries the coordinates the cached customer has, so a check-in is not refused offline", () => {
    const route = mapCachedRoute(routeRecord as never, customers as never)
    const first = route.points[0]

    expect(first.customer).toMatchObject({ id: "c1", name: "Аптека 1", latitude: 40.4093, longitude: 49.8671 })
    // The precise question the visit screen asks before allowing a check-in.
    expect(hasUsableCoordinates(first.customer)).toBe(true)
  })

  it("still reports a customer whose card genuinely has none", () => {
    const route = mapCachedRoute(routeRecord as never, customers as never)
    const second = route.points[1]

    expect(second.customer.latitude).toBeUndefined()
    expect(hasUsableCoordinates(second.customer)).toBe(false)
  })

  it("keeps the point when the customer is missing from the cache", () => {
    const route = mapCachedRoute(routeRecord as never, customers as never)
    const third = route.points[2]

    // A point the agent can still see and read, just without a distance.
    expect(third.customer).toMatchObject({ id: "c-unknown", name: "Аптека 3" })
    expect(hasUsableCoordinates(third.customer)).toBe(false)
    expect(route.points).toHaveLength(3)
  })

  it("prefers the embedded address and falls back to the cached one", () => {
    const route = mapCachedRoute(routeRecord as never, customers as never)

    expect(route.points[0].customer.address).toBe("Баку")
    expect(route.points[1].customer.address).toBe("Баку, Хагани 5")
  })

  it("works with no customer cache at all, without inventing coordinates", () => {
    const route = mapCachedRoute(routeRecord as never)

    expect(route.points).toHaveLength(3)
    expect(route.points.every((point) => !hasUsableCoordinates(point.customer))).toBe(true)
    expect(route.totalPoints).toBe(3)
    expect(route.visitedPoints).toBe(1)
  })
})
