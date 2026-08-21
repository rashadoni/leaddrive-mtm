import { toPlanningRoutes } from "../../src/services/manager-planning"
import { toApprovals } from "../../src/services/manager-approvals"
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
