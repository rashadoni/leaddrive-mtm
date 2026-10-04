import fs from "fs"
import path from "path"
import {
  canProposeRouteContactChange,
  initialRouteContactChangeForm,
  isRouteContactChangePending,
  matchingSpecialties,
  routeContactChangeFailure,
  routeContactChangeProblem,
  routeContactChanges,
  routeContactChangeTone,
  toRouteContactChangeOffer,
} from "../../src/services/route-contact-change"
import { toRouteContactDetail } from "../../src/services/route-contact-detail"

/**
 * "Propose a change" on a client card. An agent never changes a client: they
 * tell a manager what they learned, and the card changes only after approval.
 * The server says what may be proposed; the app offers exactly that.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

const detail = toRouteContactDetail({
  id: "c1", name: "Aliyev Farid", firstName: "Farid", lastName: "Aliyev",
  updatedAt: "2026-10-01T08:00:00.000Z", specialty: "Kardioloq", category: "B", status: "ACTIVE",
})
const ALL = ["category", "specialtyName", "firstName", "lastName"] as const
const offer = (overrides: Record<string, unknown> = {}) => toRouteContactChangeOffer({
  allowed: true, fields: [...ALL], classes: ["A", "B", "C", "VIP"], specialties: ["Kardioloq", "Nevroloq"], latest: null,
  ...overrides,
})

describe("the card carries what the form needs", () => {
  it("maps the name parts and the version stamp", () => {
    expect(detail).toMatchObject({ firstName: "Farid", lastName: "Aliyev", updatedAt: "2026-10-01T08:00:00.000Z" })
  })

  it("stays as it was for a server that does not send them", () => {
    const old = toRouteContactDetail({ id: "c1", name: "Aliyev Farid" })
    expect([old.firstName, old.lastName, old.updatedAt]).toEqual([undefined, undefined, undefined])
  })
})

describe("toRouteContactChangeOffer", () => {
  it("allows nothing when the server does not send the block (older server)", () => {
    for (const raw of [undefined, null, {}, "yes", { allowed: "true", fields: [...ALL] }]) {
      expect(toRouteContactChangeOffer(raw)).toMatchObject({ allowed: false })
    }
  })

  it("keeps only the fields this build knows how to show", () => {
    const parsed = offer({ fields: ["category", "mobilePhone", "lastName", 7] })
    expect(parsed.fields).toEqual(["category", "lastName"])
    expect(parsed.allowed).toBe(true)
    // An offer with no field to change is not an offer.
    expect(offer({ fields: ["mobilePhone"] }).allowed).toBe(false)
  })

  it("reads the organization's lists and the agent's last request", () => {
    const parsed = offer({
      latest: { id: "r1", status: "REJECTED", reason: "Сказал врач", decisionComment: "Класс B подтверждён", submittedAt: "2026-10-01T09:00:00.000Z" },
    })
    expect(parsed.classes).toEqual(["A", "B", "C", "VIP"])
    expect(parsed.specialties).toEqual(["Kardioloq", "Nevroloq"])
    expect(parsed.latest).toEqual({
      id: "r1", status: "REJECTED", reason: "Сказал врач", decisionComment: "Класс B подтверждён",
      submittedAt: "2026-10-01T09:00:00.000Z", reviewedAt: undefined,
    })
    expect(offer().latest).toBeUndefined()
  })
})

describe("the way into the form", () => {
  it("is open while the organization allows it and nothing is waiting", () => {
    expect(canProposeRouteContactChange(offer(), detail)).toBe(true)
    expect(canProposeRouteContactChange(offer({ latest: { id: "r1", status: "APPROVED" } }), detail)).toBe(true)
    expect(canProposeRouteContactChange(offer({ latest: { id: "r1", status: "REJECTED" } }), detail)).toBe(true)
  })

  it("is closed while a request waits for the manager", () => {
    for (const status of ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"]) {
      expect([status, isRouteContactChangePending(status)]).toEqual([status, true])
      expect(canProposeRouteContactChange(offer({ latest: { id: "r1", status } }), detail)).toBe(false)
    }
  })

  it("is closed when the organization switched the request off or the card has no version", () => {
    expect(canProposeRouteContactChange(offer({ allowed: false }), detail)).toBe(false)
    expect(canProposeRouteContactChange(offer(), toRouteContactDetail({ id: "c1", name: "X" }))).toBe(false)
    expect(canProposeRouteContactChange(offer(), null)).toBe(false)
  })

  it("paints the last request, and says nothing about a draft or a cancelled one", () => {
    expect(["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED", "DRAFT", undefined].map(routeContactChangeTone))
      .toEqual(["pending", "approved", "declined", null, null, null])
  })
})

describe("what is sent", () => {
  const form = initialRouteContactChangeForm(detail)

  it("starts from the client as it is", () => {
    expect(form).toEqual({ category: "B", specialtyName: "Kardioloq", firstName: "Farid", lastName: "Aliyev" })
  })

  it("is only what the agent changed", () => {
    expect(routeContactChanges(detail, form, ALL)).toEqual({})
    expect(routeContactChanges(detail, { ...form, category: "VIP" }, ALL)).toEqual({ category: "VIP" })
    expect(routeContactChanges(detail, { ...form, lastName: "  Əliyev ", specialtyName: "Nevroloq" }, ALL))
      .toEqual({ specialtyName: "Nevroloq", lastName: "Əliyev" })
    // Spaces alone are not a change.
    expect(routeContactChanges(detail, { ...form, firstName: " Farid " }, ALL)).toEqual({})
  })

  it("never includes a field the organization does not offer", () => {
    expect(routeContactChanges(detail, { ...form, category: "A", specialtyName: "Nevroloq" }, ["category"]))
      .toEqual({ category: "A" })
  })

  it("names what stops the request, most useful first", () => {
    const changed = { ...form, category: "VIP" }
    expect(routeContactChangeProblem(detail, form, ALL, "Сказал врач")).toBe("nothing")
    expect(routeContactChangeProblem(detail, changed, ALL, "")).toBe("reason")
    expect(routeContactChangeProblem(detail, changed, ALL, " ok ")).toBe("reason")
    expect(routeContactChangeProblem(detail, { ...changed, lastName: "  " }, ALL, "Сказал врач")).toBe("name")
    expect(routeContactChangeProblem(detail, changed, ALL, "Сказал врач")).toBeNull()
    // A name the organization does not let the agent touch is not asked for.
    expect(routeContactChangeProblem(detail, { ...changed, lastName: "" }, ["category"], "Сказал врач")).toBeNull()
  })
})

describe("matchingSpecialties", () => {
  const list = ["Kardioloq", "Nevroloq", "Pediatr"]

  it("shows everything until the agent types", () => {
    expect(matchingSpecialties(list, "  ")).toEqual(list)
  })

  it("finds by any part of the name, whatever the case", () => {
    expect(matchingSpecialties(list, "LOQ")).toEqual(["Kardioloq", "Nevroloq"])
    expect(matchingSpecialties(list, "zzz")).toEqual([])
  })
})

describe("routeContactChangeFailure", () => {
  it("turns the server's refusal into what the agent can do about it", () => {
    const refusal = (code: string) => Object.assign(new Error("server text"), { code, status: 400 })
    expect(routeContactChangeFailure(refusal("MTM_AGENT_PERMISSION_DISABLED"))).toBe("disabled")
    expect(routeContactChangeFailure(refusal("MTM_CONTACT_CONFLICT"))).toBe("stale")
    expect(routeContactChangeFailure(refusal("MTM_CONTACT_REQUIRED_FIELDS"))).toBe("incomplete")
    expect(routeContactChangeFailure(refusal("MTM_CONTACT_CLASS_NOT_OFFERED"))).toBe("listChanged")
    expect(routeContactChangeFailure(refusal("MTM_CONTACT_SPECIALTY_NOT_OFFERED"))).toBe("listChanged")
    expect(routeContactChangeFailure(refusal("MTM_CONTACT_FIELD_NOT_OFFERED"))).toBe("listChanged")
    expect(routeContactChangeFailure(new Error("SERVER_INVALID_RESPONSE_500"))).toBe("failed")
    expect(routeContactChangeFailure(undefined)).toBe("failed")
  })
})

describe("the form is wired into the Route Field app", () => {
  const api = read("services/api.ts")
  const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
  const card = read("screens/base/RouteContactDetailScreen.android.tsx")
  const formScreen = read("screens/base/RouteContactChangeRequestScreen.android.tsx")

  it("sends through the app's own v2 door, never the broad website endpoint", () => {
    expect(api).toContain("async submitRouteContactChangeRequest(id: string, data: {")
    expect(api).toContain("/mobile/route-field/contacts/${encodeURIComponent(id)}/change-requests")
    expect(api).not.toContain("/contacts/${id}/change-requests")
    expect(formScreen).toContain("api.submitRouteContactChangeRequest(id, {")
    expect(formScreen).not.toContain("commercial-api")
  })

  it("is reachable from the client card in both places the card lives", () => {
    expect(navigator.split('name="ContactChangeRequest" component={RouteContactChangeRequestScreen}').length - 1).toBe(2)
    expect(card).toContain('navigation.navigate("ContactChangeRequest", { id, name: detail.name })')
  })

  it("shows the way in only when the server allows it and nothing is waiting", () => {
    expect(card).toContain("const canPropose = !!offer && canProposeRouteContactChange(offer, detail)")
    expect(card).toContain("{canPropose ? (")
    expect(card).toContain("setOffer(toRouteContactChangeOffer(response.data.changeRequest))")
  })

  it("re-reads the card when the agent comes back from the form", () => {
    expect(card).toContain("useFocusEffect(")
    expect(card).toContain("void load(true)")
  })
})
