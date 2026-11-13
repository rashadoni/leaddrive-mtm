import fs from "fs"
import path from "path"
import { clinicFollowUp, clinicGroups, nextDoctorInClinic, type ChainPoint } from "../../src/screens/route/clinic-chain"

/**
 * Zeytun 2026-11-13: «чтоб можно было делать один визит нескольким врачам,
 * которые находятся в одной клинике». Owner chose «А: подряд»: the doctors of
 * one clinic are one group and one arrival; after a doctor the next one of the
 * same clinic is offered at once; each doctor keeps a visit of his own.
 */
const clinic = { id: "clinic-3", name: "Klinika 3" }
const doctor = (id: string, status = "PENDING", place = clinic): ChainPoint => ({ id, status, customer: place, contact: { id: `d-${id}`, displayName: `Dr ${id}` } })
const pharmacy = (id: string, status = "PENDING"): ChainPoint => ({ id, status, customer: { id: `ph-${id}`, name: `Aptek ${id}` }, contact: null })

const DAY = [pharmacy("p0", "VISITED"), doctor("a"), doctor("b"), doctor("c"), pharmacy("p1"), doctor("lonely", "PENDING", { id: "clinic-7", name: "Klinika 7" })]

describe("which stops are one clinic", () => {
  it("groups two or more doctors in a row at the same place, and nothing else", () => {
    const groups = clinicGroups(DAY)
    expect(groups.get("a")).toEqual({ clinicName: "Klinika 3", pointIds: ["a", "b", "c"] })
    expect(groups.get("c")).toBe(groups.get("a"))
    // A pharmacy is a stop of its own; one doctor alone is just a stop.
    expect(groups.has("p0")).toBe(false)
    expect(groups.has("lonely")).toBe(false)
  })

  it("does not join doctors of the same clinic that the route visits apart", () => {
    const groups = clinicGroups([doctor("a"), pharmacy("p"), doctor("b")])
    expect(groups.size).toBe(0)
  })
})

describe("after a doctor's visit", () => {
  it("offers the next doctor of the same clinic, then one passed over earlier", () => {
    expect(nextDoctorInClinic(DAY, "a")?.id).toBe("b")
    const afterB = DAY.map((point) => (point.id === "b" ? { ...point, status: "VISITED" } : point))
    expect(nextDoctorInClinic(afterB, "a")?.id).toBe("c")
    const onlyAleft = DAY.map((point) => (point.id === "b" || point.id === "c" ? { ...point, status: "VISITED" } : point))
    expect(nextDoctorInClinic(onlyAleft, "c")?.id).toBe("a")
    // The clinic is done: the route goes on as before.
    const allDone = DAY.map((point) => (["a", "b", "c"].includes(point.id) ? { ...point, status: "VISITED" } : point))
    expect(nextDoctorInClinic(allDone, "c")).toBeNull()
    expect(nextDoctorInClinic(DAY, "p1")).toBeNull()
  })

  it("asks for no drive once a doctor of the clinic is done, and says how many are left", () => {
    expect(clinicFollowUp(DAY, DAY[1])).toBeNull()
    const afterA = DAY.map((point) => (point.id === "a" ? { ...point, status: "VISITED" } : point))
    expect(clinicFollowUp(afterA, afterA[2])).toEqual({ clinicName: "Klinika 3", doctorsLeft: 2 })
    // A doctor not found today is not offered again, nor counted as left.
    const notMet = afterA.map((point) => (point.id === "b" ? { ...point, status: "NOT_MET" } : point))
    expect(nextDoctorInClinic(notMet, "b")?.id).toBe("c")
    expect(clinicFollowUp(notMet, notMet[3])).toEqual({ clinicName: "Klinika 3", doctorsLeft: 1 })
  })
})

describe("the route screen", () => {
  const route = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

  it("moves to the next doctor of the clinic when a visit is finished", () => {
    const checkOut = route.slice(route.indexOf("const performCheckOut = async"), route.indexOf("const performCheckOut = async") + 2500)
    expect(checkOut).toContain("setSelectedPointId(nextDoctorInClinic(chainPoints, activeVisit.routePointId)?.id ?? null)")
  })

  it("offers «Начать визит к врачу» and «Не застал» without the drive, and names the clinic over its doctors", () => {
    const panel = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("export default function RouteScreen("))
    const chain = panel.slice(panel.indexOf("if (clinicNext && !visited && !skipped)"), panel.indexOf("if (clinicNext && !visited && !skipped)") + 1200)
    expect(chain).toContain("copy.clinicStartDoctor")
    expect(chain).toContain("copy.clinicNotMet")
    expect(chain).not.toContain("onNavigate")
    expect(route.match(/clinicHeader=\{clinicHeaderFor\(item\)\}/g)).toHaveLength(2)
    // Russian, Azerbaijani and English.
    expect(route.match(/clinicGroup: "\{\{clinic\}\}/g)).toHaveLength(3)
  })
})
