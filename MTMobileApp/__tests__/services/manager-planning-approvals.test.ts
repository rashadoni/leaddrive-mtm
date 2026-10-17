import { toPlanningRoutes } from "../../src/services/manager-planning"
import {
  doctorDecisionRefusal,
  routeDraftsAwaitingPublish,
  routeDraftWindow,
  routePublishRefusal,
  toApprovals,
  toDoctorRequestApprovals,
} from "../../src/services/manager-approvals"
import { mobileResources } from "../../src/i18n/mobile-resources"

describe("manager planning mapping", () => {
  it("flattens routes with agent + progress", () => {
    const routes = toPlanningRoutes({
      routes: [
        { id: "r1", name: "North", status: "IN_PROGRESS", totalPoints: 8, visitedPoints: 3, agent: { name: "Rep A" } },
      ],
    })
    expect(routes[0]).toEqual({ id: "r1", name: "North", agentName: "Rep A", status: "IN_PROGRESS", visited: 3, total: 8 })
  })

  it("defaults to [] on an empty payload", () => {
    expect(toPlanningRoutes({})).toEqual([])
  })
})

describe("manager approvals mapping", () => {
  it("flattens the four categories and totals them", () => {
    const a = toApprovals({
      hrm: [{ id: "h1", type: "VACATION", reason: "trip", submittedAt: "2026-07-19T09:00:00.000Z", agent: { name: "Rep A" } }],
      routeChanges: [{ id: "rc1", changeType: "ADD_POINT", reason: "new clinic", requestedByAgent: { name: "Rep B" } }],
      customers: [{ id: "c1", name: "Clinic X", objectType: "CLINIC", requestedByAgent: { name: "Rep C" } }],
      contactChanges: [{ id: "cc1", kind: "CONTACT_UPDATE", reason: "Phone", payload: { mobilePhone: "+99450", consentStatus: "GRANTED" }, contact: { displayName: "Dr X" }, requestedByAgent: { name: "Rep D" } }],
    })
    expect(a.total).toBe(4)
    expect(a.hrm[0]).toMatchObject({ id: "h1", agentName: "Rep A", primary: "VACATION", reason: "trip" })
    expect(a.routeChanges[0]).toMatchObject({ agentName: "Rep B", primary: "ADD_POINT" })
    expect(a.customers[0].primary).toBe("Clinic X · CLINIC")
    expect(a.contactChanges[0]).toMatchObject({ agentName: "Rep D", primary: "Dr X · CONTACT_UPDATE", reason: "Phone", details: "mobilePhone: +99450 · consentStatus: GRANTED" })
  })

  it("defaults to empty categories on an empty payload", () => {
    expect(toApprovals({})).toEqual({ hrm: [], routeChanges: [], customers: [], contactChanges: [], total: 0 })
  })
})

describe("agents' route drafts awaiting publish", () => {
  const route = (over: Record<string, unknown>) => ({
    id: "r", status: "DRAFT", version: 3, date: "2026-10-18T00:00:00.000Z", agent: { name: "Rep A" }, points: [{ id: "p1" }], ...over,
  })

  it("keeps drafts from today on that have stops, nearest day first", () => {
    const drafts = routeDraftsAwaitingPublish({
      routes: [
        route({ id: "later", date: "2026-10-20T00:00:00.000Z", agent: { name: "Rep A" } }),
        route({ id: "yesterday", date: "2026-10-16T00:00:00.000Z" }),
        route({ id: "empty", points: [], totalPoints: 0 }),
        route({ id: "planned", status: "PLANNED" }),
        route({ id: "today-b", date: "2026-10-17T00:00:00.000Z", agent: { name: "Rep B" } }),
        route({ id: "today-a", date: "2026-10-17T00:00:00.000Z", agent: { name: "Rep A" }, points: [], totalPoints: 2, name: "North" }),
      ],
    }, "2026-10-17")
    expect(drafts.map((draft) => draft.id)).toEqual(["today-a", "today-b", "later"])
    expect(drafts[0]).toEqual({ id: "today-a", version: 3, date: "2026-10-17", agentName: "Rep A", stops: 2, name: "North" })
  })

  it("drops a draft without a version: publishing it could only be refused", () => {
    expect(routeDraftsAwaitingPublish({ routes: [route({ version: undefined })] }, "2026-10-17")).toEqual([])
    expect(routeDraftsAwaitingPublish({}, "2026-10-17")).toEqual([])
  })

  it("asks the server from today, within its one-read range", () => {
    expect(routeDraftWindow("2026-10-17")).toEqual({ start: "2026-10-17", endExclusive: "2027-10-18" })
  })

  it("says each publish refusal in words and reloads when the list is stale", () => {
    expect(routePublishRefusal({ code: "ROUTE_VERSION_CONFLICT", status: 409 })).toEqual({ key: "managerShell.publishVersionConflict", reload: true })
    expect(routePublishRefusal({ code: "ROUTE_TRANSITION_INVALID", status: 409 })).toEqual({ key: "managerShell.publishNotDraft", reload: true })
    expect(routePublishRefusal({ code: "ROUTE_CONFLICT", status: 409 }).key).toBe("managerShell.publishScheduleConflict")
    expect(routePublishRefusal({ code: "ROUTE_POINT_TIME_CONFLICT", status: 409 }).key).toBe("managerShell.publishTimeConflict")
    expect(routePublishRefusal({ code: "ROUTE_EMPTY", status: 409 }).key).toBe("managerShell.publishEmpty")
    expect(routePublishRefusal({ code: "MTM_ROUTE_SCOPE_DENIED", status: 403 }).key).toBe("managerShell.publishForbidden")
    expect(routePublishRefusal({ status: 404 })).toEqual({ key: "managerShell.decisionGone", reload: true })
    expect(routePublishRefusal({ message: "REQUEST_TIMEOUT" })).toEqual({ key: "managerShell.decisionFailed", reload: false })
  })
})

describe("agents' new-doctor requests", () => {
  it("lists the open requests with who asked and where the doctor works", () => {
    const requests = toDoctorRequestApprovals({
      requests: [
        { id: "d1", status: "SUBMITTED", displayName: " TestE2E Həkim Bir ", specialtyName: "Kardioloq", clinicName: "Test E2E Klinika", address: "Bakı", phone: "+994", notes: "new", submittedAt: "2026-10-17T08:00:00.000Z", requestedByAgent: { name: "Rep A" } },
        { id: "d2", status: "APPROVED", displayName: "Decided", clinicName: "X" },
        { id: "d3", status: "NEEDS_INFO", displayName: "Needs info", clinicName: "Y", requestedByAgent: { name: "Rep B" } },
        { id: "", status: "SUBMITTED", displayName: "No id", clinicName: "Z" },
      ],
    })
    expect(requests.map((request) => request.id)).toEqual(["d1", "d3"])
    expect(requests[0]).toEqual({
      id: "d1", agentName: "Rep A", displayName: "TestE2E Həkim Bir", specialtyName: "Kardioloq", clinicName: "Test E2E Klinika",
      address: "Bakı", phone: "+994", notes: "new", submittedAt: "2026-10-17T08:00:00.000Z",
    })
    expect(toDoctorRequestApprovals({})).toEqual([])
  })

  it("says «such a doctor already exists» instead of a code, and reloads only a stale list", () => {
    expect(doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_DUPLICATE", status: 409 })).toEqual({ key: "managerShell.doctorDuplicate", reload: false })
    expect(doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_ALREADY_DECIDED", status: 409 })).toEqual({ key: "managerShell.doctorAlreadyDecided", reload: true })
    expect(doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_CONFLICT", status: 409 }).reload).toBe(true)
    expect(doctorDecisionRefusal({ code: "MTM_SELF_REVIEW_DENIED", status: 403 }).key).toBe("managerShell.doctorOwnRequest")
    expect(doctorDecisionRefusal({ status: 403 }).key).toBe("managerShell.doctorForbidden")
    expect(doctorDecisionRefusal({ status: 500 }).key).toBe("managerShell.decisionFailed")
  })

  it.each([["en"], ["ru"], ["az"]])("has a sentence for every refusal in %s", (lang) => {
    const ms = (mobileResources as Record<string, { managerShell: Record<string, unknown> }>)[lang].managerShell
    const keys = [
      routePublishRefusal({ code: "ROUTE_VERSION_CONFLICT" }), routePublishRefusal({ code: "ROUTE_TRANSITION_INVALID" }),
      routePublishRefusal({ code: "ROUTE_EMPTY" }), routePublishRefusal({ code: "ROUTE_CONFLICT" }),
      routePublishRefusal({ code: "ROUTE_POINT_TIME_CONFLICT" }), routePublishRefusal({ code: "MTM_ROUTE_SCOPE_DENIED" }),
      routePublishRefusal({ status: 404 }), routePublishRefusal({}),
      doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_DUPLICATE" }), doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_ALREADY_DECIDED" }),
      doctorDecisionRefusal({ code: "MTM_CONTACT_CREATE_CONFLICT" }), doctorDecisionRefusal({ code: "MTM_SELF_REVIEW_DENIED" }),
      doctorDecisionRefusal({ status: 403 }),
    ].map((refusal) => refusal.key.replace("managerShell.", ""))
    for (const key of [...keys, "approvalsRouteDrafts", "approvalsDoctors", "approvalsLoadError", "publish", "published", "draftStops_one", "draftStops_other"]) {
      expect(typeof ms[key]).toBe("string")
      expect((ms[key] as string).length).toBeGreaterThan(0)
    }
  })
})

describe("managerShell i18n contract", () => {
  it.each([["en"], ["ru"], ["az"]])("has empty-state + approval-section keys in %s", (lang) => {
    const ms = (mobileResources as Record<string, { managerShell: Record<string, unknown> }>)[lang].managerShell
    for (const k of [
      "planningEmpty",
      "approvalsEmpty",
      "approvalsHrm",
      "approvalsRouteChanges",
      "approvalsCustomers",
      "approvalsContactChanges",
      "routeFallback",
      "liveMapTitle",
      "liveMapBody",
      "liveMapCurrentLegend",
      "liveMapLastKnownLegend",
      "liveMapStaleLegend",
      "liveMapNoCoordinatesBody",
      "shareLocationTitle",
      "shareLocationBody",
      "shareLocationAction",
      "shareLocationSuccess",
      "shareLocationError",
      "shareLocationPermissionDenied",
    ]) {
      expect(typeof ms[k]).toBe("string")
      expect((ms[k] as string).length).toBeGreaterThan(0)
    }
  })
})
