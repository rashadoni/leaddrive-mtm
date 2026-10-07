import fs from "fs"
import path from "path"
import { routeStopWho } from "../../src/screens/route/route-screen-state"
import { selectTodayRoute } from "../../src/screens/today/today-state"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const route = read("src/screens/route/RouteScreen.tsx")
const today = read("src/screens/today/TodayScreen.tsx")

/**
 * 7 October 2026, owner's phone, a visit just checked in. He had planned the
 * day by doctors. The route, the visit panel and Today all named the clinic
 * and nobody in it: «тут нет названия врача ни здесь, ни в маршруте, только
 * название места». The server sent the doctor with every stop; no screen
 * looked at him.
 */
describe("who a stop of the route is about", () => {
  it("is the doctor when the stop names one, with his specialty and clinic as the place", () => {
    expect(routeStopWho({
      customer: { name: "City Clinic", address: "1 Main street" },
      contact: { displayName: "Dr. Example", specialtyName: "Cardiologist" },
    })).toEqual({ name: "Dr. Example", place: "Cardiologist · City Clinic · 1 Main street" })
  })

  it("is the organization when the stop names nobody, and then the place is only the address", () => {
    expect(routeStopWho({ customer: { name: "Corner Pharmacy", address: "2 Side street" }, contact: null }))
      .toEqual({ name: "Corner Pharmacy", place: "2 Side street" })
  })

  it("does not invent a person out of an empty name, nor a place out of nothing", () => {
    expect(routeStopWho({ customer: { name: "City Clinic" }, contact: { displayName: "   ", specialtyName: "Cardiologist" } }))
      .toEqual({ name: "City Clinic", place: "" })
    expect(routeStopWho(null)).toEqual({ name: "", place: "" })
  })

  it("is what the list, both panels and the bottom line print", () => {
    const row = route.slice(route.indexOf("function StopRow("), route.indexOf("function ChangePlanButton("))
    expect(row).toContain("const who = routeStopWho(point)")
    expect(row).toContain("{who.name}")
    expect(row).toContain("{who.place ? <Text style={styles.stopAddress} numberOfLines={2}>{who.place}</Text> : null}")
    expect(row).not.toContain("{point.customer.name}")

    const panel = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("export default function RouteScreen("))
    expect(panel).toContain("routeStopWho(point && point.id === activeVisit.routePointId ? point : { customer: activeVisit.customer })")
    expect(panel.split("<Text style={styles.actionTitle}>{who.name}</Text>").length - 1).toBe(2)
    expect(panel).not.toContain("<Text style={styles.actionTitle}>{activeVisit.customer?.name}</Text>")
    expect(panel).not.toContain("<Text style={styles.actionTitle}>{point.customer.name}</Text>")

    expect(route).toContain("const activeVisitWho = routeStopWho(activeRoutePoint ?? { customer: activeVisit?.customer })")
    expect(route).toContain('? [copy.visiting, activeVisitWho.name].filter(Boolean).join(" · ")')
    expect(route).toContain("? routeStopWho(nextPoint).name")
  })

  it("still tells an agent that a stop has no address to navigate to", () => {
    expect(route).toContain("{point.customer.address ? null : <Text style={styles.actionAddress}>{copy.noAddress}</Text>}")
  })

  it("keeps the place, not the person, in what is said about distance and coordinates", () => {
    expect(route).toContain('message: t("route.noCoordinatesBody", { name: point.customer.name }),')
    expect(route).toContain('t("visit.tooFarBody", { distance: formatDistance(measuredDistance), name: point.customer.name, max: pointCheckInRadius(point) })')
  })
})

describe("Today's route card", () => {
  const server = [{
    id: "route-1",
    date: "2026-10-07",
    status: "PLANNED",
    version: 3,
    points: [
      { id: "p1", orderIndex: 0, status: "PENDING", customer: { id: "c1", name: "City Clinic" }, contact: { id: "d1", displayName: "Dr. Example", specialtyName: "Cardiologist" } },
      { id: "p2", orderIndex: 1, status: "PENDING", customer: { id: "c2", name: "Corner Pharmacy" }, contact: null },
    ],
  }]

  it("keeps the doctor of a stop when it reads the route", () => {
    const summary = selectTodayRoute(server, "2026-10-07")
    expect(summary?.points.map((point) => [point.contact?.displayName, point.customer?.name])).toEqual([
      ["Dr. Example", "City Clinic"],
      [undefined, "Corner Pharmacy"],
    ])
  })

  it("prints the doctor first and the clinic after him, on the one line a stop has there", () => {
    expect(today.split('{[point.contact?.displayName, point.customer?.name].filter(Boolean).join(" · ") || t("todayV2.routeTitle")}').length - 1).toBe(2)
    expect(today).not.toContain('{point.customer?.name || t("todayV2.routeTitle")}')
  })
})

/**
 * The same visit: no way to take a photo and no tasks on the panel — «нет тут
 * функции фотографии, нет функции задачи; даже если нет задач, должно
 * показываться: задачи 0». Both rows existed and were drawn only when the
 * visit had tasks or required a photo.
 */
describe("what a visit in progress always offers", () => {
  const visit = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("  if (!point) {", route.indexOf("function PointActionPanel(")))

  it("tasks, with their number even when it is zero", () => {
    expect(visit).toContain('detail={taskStepTotal > 0 ? `${taskStepDone} / ${taskStepTotal}` : "0"}')
    expect(visit).not.toContain("{taskStepTotal > 0 ? (")
    expect(visit).toContain("onPress={onOpenTasks}")
  })

  it("the camera, whether or not a photo is required", () => {
    expect(visit).not.toContain("showPhoto")
    expect(visit).toContain("label={photoCount > 0 ? copy.takeAnotherPhoto : copy.takePhoto}")
    expect(visit).toContain("onPress={onPhoto}")
  })

  it("in one order: presentation, tasks, photo, then finishing the visit", () => {
    const order = ["label={copy.presentations}", "label={copy.visitTasks}", "copy.takePhoto}", "label={mutating ? copy.finishingVisit : copy.finishVisit}"]
      .map((mark) => visit.indexOf(mark))
    expect(order.every((at) => at > -1)).toBe(true)
    expect([...order].sort((left, right) => left - right)).toEqual(order)
  })
})
