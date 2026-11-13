/**
 * A doctor who works in two clinics (Zeytun, 2026-11-13: «чтоб агент сам уже
 * принимал решение где находится врач»). Standing in the doctor's other
 * clinic, the agent is asked whether the doctor is there today; on «yes» the
 * visit goes to that clinic. The stop stays planned where it was.
 */
import fs from "fs"
import path from "path"
import { doctorOtherClinicHere, parseDoctorOtherClinics } from "../../src/services/doctor-other-clinic"
import { toRoutePlanningTarget } from "../../src/services/route-planning-target"
import { carrySelfPlanBasket } from "../../src/screens/planning/self-plan-day"
import type { PlanningAssignedTarget, PlanningClinicChoice, PlanningTarget } from "../../src/services/manager-planning"

const STOP = { latitude: 40.4093, longitude: 49.8671 }
const CLINIC_B = { id: "clinic-b", name: "Clinic B", latitude: 40.4363, longitude: 49.8671, geofenceRadiusMeters: 300 } // 3 km north
const CLINIC_C = { id: "clinic-c", name: "Clinic C", latitude: 40.438, longitude: 49.8671 } // 190 m past B, the organization's zone
const near = (place: { latitude: number; longitude: number }) => ({ latitude: place.latitude + 0.0005, longitude: place.longitude }) // ~55 m

describe("which other clinic the agent stands in", () => {
  it("finds the doctor's other clinic the agent stands in, the nearest of two", () => {
    expect(doctorOtherClinicHere({ position: near(CLINIC_B), stop: STOP, stopRadiusMeters: 300, otherClinics: [{ ...CLINIC_C, geofenceRadiusMeters: 300 }, CLINIC_B], fallbackRadiusMeters: 100 })?.id).toBe("clinic-b")
  })

  it("asks nothing inside the stop's own zone — two clinics on one campus do not turn every visit into a question", () => {
    const campus = { ...CLINIC_B, latitude: STOP.latitude + 0.001, longitude: STOP.longitude }
    expect(doctorOtherClinicHere({ position: near(STOP), stop: STOP, stopRadiusMeters: 300, otherClinics: [campus], fallbackRadiusMeters: 100 })).toBeNull()
  })

  it("asks nothing far from every clinic, without a position, or for a stop without other clinics", () => {
    const far = { latitude: 40.5, longitude: 49.9 }
    expect(doctorOtherClinicHere({ position: far, stop: STOP, stopRadiusMeters: 300, otherClinics: [CLINIC_B], fallbackRadiusMeters: 100 })).toBeNull()
    expect(doctorOtherClinicHere({ position: null, stop: STOP, stopRadiusMeters: 300, otherClinics: [CLINIC_B], fallbackRadiusMeters: 100 })).toBeNull()
    expect(doctorOtherClinicHere({ position: near(CLINIC_B), stop: STOP, stopRadiusMeters: 300, otherClinics: [], fallbackRadiusMeters: 100 })).toBeNull()
  })

  it("measures a clinic without its own zone by the organization's", () => {
    const sixtyMetres = near(CLINIC_C)
    expect(doctorOtherClinicHere({ position: sixtyMetres, stop: STOP, stopRadiusMeters: 300, otherClinics: [CLINIC_C], fallbackRadiusMeters: 100 })?.id).toBe("clinic-c")
    expect(doctorOtherClinicHere({ position: sixtyMetres, stop: STOP, stopRadiusMeters: 300, otherClinics: [CLINIC_C], fallbackRadiusMeters: 30 })).toBeNull()
  })

  it("keeps only clinics that can be measured", () => {
    expect(parseDoctorOtherClinics([
      CLINIC_B,
      { id: "no-pin", name: "No pin", latitude: null, longitude: null },
      { id: "zero", name: "Zero", latitude: 0, longitude: 0 },
      { name: "No id", latitude: 40, longitude: 49 },
      "junk",
    ]).map((clinic) => clinic.id)).toEqual(["clinic-b"])
    expect(parseDoctorOtherClinics(undefined)).toEqual([]) // an older server
  })
})

describe("the planner's clinic choice", () => {
  it("reads the doctor's clinics from the server row, and none for a doctor of one clinic", () => {
    const row = toRoutePlanningTarget({
      kind: "contact", contactId: "two", customerId: "clinic-a", name: "Doctor two", organizationName: "Clinic A",
      workplaces: [
        { customerId: "clinic-a", name: "Clinic A", address: "Yasamal", lastVisited: true },
        { customerId: "clinic-b", name: "Clinic B", address: null, lastVisited: false },
      ],
    }, "2026-11-14")
    expect(row?.clinicChoices).toEqual([
      { customerId: "clinic-a", organizationName: "Clinic A", address: "Yasamal", lastVisited: true },
      { customerId: "clinic-b", organizationName: "Clinic B", address: undefined, lastVisited: false },
    ])
    // The legacy picker's field stays empty: it refuses a doctor without a unique primary.
    expect(row?.workplaces).toBeUndefined()
    expect(toRoutePlanningTarget({ kind: "contact", contactId: "one", customerId: "clinic-c", name: "Doctor one" }, "2026-11-14")?.clinicChoices).toBeUndefined()
  })

  it("keeps the clinic the agent picked when the day changes, while the server still offers it", () => {
    const choices: PlanningClinicChoice[] = [
      { customerId: "clinic-a", organizationName: "Clinic A", lastVisited: true },
      { customerId: "clinic-b", organizationName: "Clinic B", lastVisited: false },
    ]
    const server = (date: string, offered = choices): PlanningTarget => ({
      key: "contact:two", kind: "contact", customerId: "clinic-a", contactId: "two", name: "Doctor two",
      organizationName: "Clinic A", eligible: true, contactStatus: "ACTIVE", validOnDate: date, clinicChoices: offered,
    })
    const picked: PlanningAssignedTarget = { ...server("2026-11-14"), customerId: "clinic-b", organizationName: "Clinic B", plannedTime: null, date: "2026-11-14" }

    const moved = carrySelfPlanBasket([picked], "2026-11-15", new Map([["contact:two", server("2026-11-15")]]))
    expect(moved.kept[0]).toMatchObject({ customerId: "clinic-b", organizationName: "Clinic B", date: "2026-11-15" })

    // Not offered on the new day any more: the server's clinic, not a guess.
    const gone = carrySelfPlanBasket([picked], "2026-11-15", new Map([["contact:two", server("2026-11-15", [choices[0], { customerId: "clinic-d", lastVisited: false }])]]))
    expect(gone.kept[0]).toMatchObject({ customerId: "clinic-a" })
  })
})

describe("the route screen", () => {
  const route = fs.readFileSync(path.join(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
  const checkIn = route.slice(route.indexOf("const handleCheckIn = async"), route.indexOf("const handleCheckOut = "))

  it("asks before measuring the distance, and measures against the clinic the agent named", () => {
    expect(checkIn).toContain("doctorOtherClinicHere({")
    expect(checkIn.indexOf("copy.doctorHereTitle")).toBeGreaterThan(-1)
    expect(checkIn.indexOf("copy.doctorHereTitle")).toBeLessThan(checkIn.indexOf("const measuredDistance"))
    expect(checkIn).toContain("measuredDistance > placeRadius")
  })

  it("queues the visit at that clinic, for the stop's own doctor, and tells the joint question the same place", () => {
    expect(checkIn).toContain("customer: placeCustomer,")
    expect(checkIn).toContain("routePointId: point.id,")
    expect(checkIn).toContain("...(visitPlace && point.contact?.id ? { contactId: point.contact.id } : {}),")
    expect(checkIn).toContain("askJointManagerForCheckIn(t, { routePointId: point.id, customerId: placeCustomer.id })")
  })

  it("speaks every language", () => {
    for (const key of ["doctorHereTitle", "doctorHereBody", "doctorHereYes", "doctorHereNo"]) {
      expect(route.match(new RegExp(`\\n    ${key}: "`, "g"))).toHaveLength(3)
    }
  })
})
