import {
  assignPlanningTarget,
  buildPlanningRouteWrites,
  editablePlanningTargets,
  invalidPlanningAssignmentDates,
  lockedPlanningDates,
  planningDateKeys,
  planningLocalTimeToIso,
  normalizePlanningTimeSlot,
  planningTimeLabel,
  nextPlanningTime,
  movePlanningTarget,
  planningDraftConflictDates,
  planningPublishConflictDates,
  planningTargetForDate,
  planningTodayKey,
  planningWriteConflictDates,
  publishablePlanningDrafts,
  removePlanningTarget,
  updatePlanningTargetTime,
  toPlanningAgent,
  toPlanningContactTarget,
  toPlanningDetailedRoute,
  toPlanningOrganizationTarget,
  type PlanningAssignedTarget,
  type PlanningDetailedRoute,
  type PlanningTarget,
} from "../../src/services/manager-planning"

const clinic: PlanningTarget = {
  key: "organization:org-1",
  kind: "organization",
  customerId: "org-1",
  name: "Central Clinic",
  eligible: true,
}

const doctor: PlanningTarget = {
  key: "contact:contact-1",
  kind: "contact",
  customerId: "org-1",
  contactId: "contact-1",
  name: "Dr A",
  organizationName: "Central Clinic",
  eligible: true,
  contactStatus: "ACTIVE",
  workplaces: [{ customerId: "org-1", organizationName: "Central Clinic", isPrimary: true }],
}

function route(overrides: Partial<PlanningDetailedRoute> = {}): PlanningDetailedRoute {
  return {
    id: "route-1",
    date: "2026-08-24",
    name: "Monday route",
    notes: "Keep this note",
    version: 3,
    agentId: "agent-1",
    primaryAgentId: "agent-1",
    primaryIdentityConsistent: true,
    agentName: "Rep A",
    status: "DRAFT",
    visited: 0,
    total: 0,
    assignments: [{ agentId: "agent-1", role: "PRIMARY" }],
    points: [],
    ...overrides,
  }
}

describe("friendly manager planning model", () => {
  it("uses the tenant day around midnight and builds one-day/seven-day horizons", () => {
    const instant = new Date("2026-08-20T21:30:00.000Z")
    expect(planningTodayKey(instant, "UTC")).toBe("2026-08-20")
    expect(planningTodayKey(instant, "Asia/Baku")).toBe("2026-08-21")
    expect(planningDateKeys("2026-08-30", 1)).toEqual(["2026-08-30"])
    expect(planningDateKeys("2026-08-30", 7)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ])
  })

  it("only offers field-agent rows from the manager team contract", () => {
    expect(toPlanningAgent({ id: "a1", name: "Rep A", role: "AGENT" })).toEqual({ id: "a1", name: "Rep A", role: "AGENT" })
    expect(toPlanningAgent({ id: "m1", name: "Manager", role: "MANAGER" })).toBeNull()
    expect(toPlanningAgent({ name: "Missing id", role: "AGENT" })).toBeNull()
  })

  it("allows every non-inactive contact but requires a date-valid workplace", () => {
    expect(toPlanningOrganizationTarget({ id: "org-1", name: "Clinic", address: "Main st" })).toMatchObject({
      key: "organization:org-1", customerId: "org-1", name: "Clinic", eligible: true,
    })
    expect(toPlanningContactTarget({ id: "c1", status: "ACTIVE", displayName: "Dr A", workplaces: [] })).toMatchObject({
      key: "contact:c1", customerId: "", eligible: false, unavailableReason: "NO_ACTIVE_WORKPLACE",
    })
    expect(toPlanningContactTarget({
      id: "c1", status: "INACTIVE", displayName: "Dr A",
      workplaces: [{ isPrimary: true, customer: { id: "org-1", name: "Clinic" } }],
    })).toMatchObject({ eligible: false, unavailableReason: "CONTACT_INACTIVE" })

    const prospect = toPlanningContactTarget({
      id: "c1",
      status: "PROSPECT",
      displayName: "Dr A",
      workplaces: [{
        isPrimary: true,
        startedOn: "2026-08-25",
        customer: { id: "org-1", name: "Clinic", city: "Baku" },
      }],
    })!
    expect(prospect.eligible).toBe(true)
    expect(planningTargetForDate(prospect, "2026-08-24")).toBeNull()
    expect(planningTargetForDate(prospect, "2026-08-25")).toMatchObject({
      customerId: "org-1", organizationName: "Clinic", address: "Baku", validOnDate: "2026-08-25",
    })
  })

  it("chooses one valid workplace or one unique primary and never guesses an ambiguous organization", () => {
    const contact = toPlanningContactTarget({
      id: "c1",
      status: "MERGED",
      displayName: "Dr A",
      workplaces: [
        { isPrimary: false, customer: { id: "org-1", name: "Clinic A" } },
        { isPrimary: true, startedOn: "2026-08-25", customer: { id: "org-2", name: "Clinic B" } },
      ],
    })!
    expect(planningTargetForDate(contact, "2026-08-24")).toMatchObject({ customerId: "org-1", organizationName: "Clinic A" })
    expect(planningTargetForDate(contact, "2026-08-25")).toMatchObject({ customerId: "org-2", organizationName: "Clinic B" })

    const ambiguous = toPlanningContactTarget({
      id: "c2",
      status: "DUPLICATE",
      workplaces: [
        { isPrimary: false, customer: { id: "org-1" } },
        { isPrimary: false, customer: { id: "org-2" } },
      ],
    })!
    expect(planningTargetForDate(ambiguous, "2026-08-25")).toBeNull()
    expect(invalidPlanningAssignmentDates([{ ...ambiguous, date: "2026-08-25" }])).toEqual(["2026-08-25"])
  })

  it("preserves route identity, version, notes, assignment and planned time", () => {
    expect(toPlanningDetailedRoute({
      id: "r1",
      date: "2026-08-24T00:00:00.000Z",
      name: "Morning calls",
      notes: "Bring samples",
      version: 7,
      status: "DRAFT",
      agentId: "a1",
      agent: { id: "a1", name: "Rep A" },
      assignments: [{ agentId: "a1", role: "PRIMARY" }],
      points: [{
        customerId: "org-1",
        contactId: "c1",
        plannedTime: "09:30",
        customer: { id: "org-1", name: "Clinic", address: "Main" },
        contact: { id: "c1", displayName: "Dr A" },
      }],
    })).toMatchObject({
      id: "r1",
      date: "2026-08-24",
      name: "Morning calls",
      notes: "Bring samples",
      version: 7,
      primaryAgentId: "a1",
      primaryIdentityConsistent: true,
      assignments: [{ agentId: "a1", role: "PRIMARY" }],
      points: [{ customerId: "org-1", contactId: "c1", organizationName: "Clinic", plannedTime: "09:30" }],
    })
  })

  it("edits only the selected agent's primary draft and blocks participant ambiguity", () => {
    const participant = route({
      id: "participant",
      agentId: "agent-2",
      primaryAgentId: "agent-2",
      assignments: [
        { agentId: "agent-2", role: "PRIMARY" },
        { agentId: "agent-1", role: "PARTICIPANT" },
      ],
      points: [clinic],
    })
    expect(editablePlanningTargets([participant], "agent-1")).toEqual([])
    expect(planningDraftConflictDates([participant], "agent-1")).toEqual(["2026-08-24"])

    const routes = [
      route({ id: "draft", points: [doctor] }),
      route({ id: "planned", date: "2026-08-25", status: "PLANNED", points: [clinic] }),
    ]
    expect(editablePlanningTargets(routes, "agent-1")).toEqual([{ ...doctor, date: "2026-08-24" }])
    expect(lockedPlanningDates(routes)).toEqual(["2026-08-25"])
  })

  it("assigns a contact on multiple days without duplicating one matrix cell", () => {
    const added = assignPlanningTarget([], doctor, "2026-08-24")
    const repeated = assignPlanningTarget(added, doctor, "2026-08-25")
    expect(assignPlanningTarget(repeated, doctor, "2026-08-25")).toEqual(repeated)
    expect(removePlanningTarget(repeated, doctor.key, "2026-08-24")).toEqual([{ ...doctor, date: "2026-08-25" }])
    expect(removePlanningTarget(repeated, doctor.key)).toEqual([])
  })

  it("stores tenant-local visit times and keeps a simple per-day order", () => {
    const nineBaku = planningLocalTimeToIso("2026-08-24", "09:00", "Asia/Baku")
    expect(nineBaku).toBe("2026-08-24T05:00:00.000Z")
    expect(planningTimeLabel(nineBaku, "Asia/Baku")).toBe("09:00")
    expect(planningLocalTimeToIso("2026-08-24", "25:00", "Asia/Baku")).toBeNull()
    expect(planningLocalTimeToIso("2026-08-24", "09:15", "Asia/Baku")).toBeNull()
    expect(normalizePlanningTimeSlot("14:27")).toBe("14:30")
    expect(normalizePlanningTimeSlot("14:44")).toBe("14:30")

    const rows: PlanningAssignedTarget[] = [
      { ...clinic, date: "2026-08-24", plannedTime: nineBaku },
      { ...doctor, date: "2026-08-24", plannedTime: planningLocalTimeToIso("2026-08-24", "09:30", "Asia/Baku") },
    ]
    expect(nextPlanningTime(rows, "2026-08-24", "Asia/Baku")).toBe("10:00")
    expect(nextPlanningTime([
      { ...clinic, date: "2026-08-24", plannedTime: "14:27" },
    ], "2026-08-24", "Asia/Baku")).toBe("15:00")
    expect(movePlanningTarget(rows, doctor.key, "2026-08-24", -1).map((target) => target.key)).toEqual([doctor.key, clinic.key])
    expect(updatePlanningTargetTime(rows, clinic.key, "2026-08-24", null)[0].plannedTime).toBeNull()
  })

  it("never defaults a new visit to a past time on the tenant's current day", () => {
    const eveningInBaku = new Date("2026-08-24T14:12:00.000Z")
    expect(nextPlanningTime([], "2026-08-24", "Asia/Baku", eveningInBaku)).toBe("19:00")
    expect(nextPlanningTime([
      { ...clinic, date: "2026-08-24", plannedTime: "17:30" },
    ], "2026-08-24", "Asia/Baku", eveningInBaku)).toBe("19:00")
    expect(nextPlanningTime([], "2026-08-25", "Asia/Baku", eveningInBaku)).toBe("09:00")
  })

  it("refuses to invent an expired same-day time slot", () => {
    const lateInBaku = new Date("2026-08-24T19:10:00.000Z")
    expect(nextPlanningTime([], "2026-08-24", "Asia/Baku", lateInBaku)).toBeNull()
  })

  it("writes only changed dirty days with expectedVersion and preserves plannedTime", () => {
    const existing = route({ id: "existing", points: [{ ...doctor, plannedTime: "09:00", validOnDate: "2026-08-24" }] })
    const targets: PlanningAssignedTarget[] = [
      { ...doctor, plannedTime: "10:00", date: "2026-08-24" },
      { ...clinic, date: "2026-08-25" },
    ]
    expect(buildPlanningRouteWrites(
      ["2026-08-24", "2026-08-25"],
      targets,
      [existing],
      "agent-1",
      new Set(["2026-08-24"]),
    )).toEqual([{
      date: "2026-08-24",
      existingRouteId: "existing",
      expectedVersion: 3,
      previousPointCount: 1,
      clearsExistingDraft: false,
      points: [{ customerId: "org-1", contactId: "contact-1", plannedTime: "10:00" }],
    }])

    expect(buildPlanningRouteWrites(
      ["2026-08-24"],
      [{ ...doctor, plannedTime: "09:00", date: "2026-08-24" }],
      [existing],
      "agent-1",
      new Set(["2026-08-24"]),
    )).toEqual([])
  })

  it("marks an intentional full-day clear and refuses multiple drafts", () => {
    expect(buildPlanningRouteWrites(
      ["2026-08-24"],
      [],
      [route({ id: "existing", points: [clinic] })],
      "agent-1",
      new Set(["2026-08-24"]),
    )).toEqual([{
      date: "2026-08-24",
      existingRouteId: "existing",
      expectedVersion: 3,
      previousPointCount: 1,
      clearsExistingDraft: true,
      points: [],
    }])
    expect(buildPlanningRouteWrites(
      ["2026-08-24"],
      [{ ...clinic, date: "2026-08-24" }],
      [route({ id: "a" }), route({ id: "b" })],
      "agent-1",
      new Set(["2026-08-24"]),
    )).toEqual([])
  })

  it("detects fresh create/update conflicts before writing", () => {
    const update = buildPlanningRouteWrites(
      ["2026-08-24"],
      [{ ...clinic, date: "2026-08-24" }],
      [route()],
      "agent-1",
      new Set(["2026-08-24"]),
    )
    expect(planningWriteConflictDates(update, [route()], "agent-1")).toEqual([])
    expect(planningWriteConflictDates(update, [route({ version: 4 })], "agent-1")).toEqual(["2026-08-24"])

    const create = buildPlanningRouteWrites(
      ["2026-08-25"],
      [{ ...clinic, date: "2026-08-25" }],
      [],
      "agent-1",
      new Set(["2026-08-25"]),
    )
    expect(planningWriteConflictDates(create, [route({ date: "2026-08-25" })], "agent-1")).toEqual(["2026-08-25"])
  })

  it("publishes unchanged primary drafts without PUT and validates their version", () => {
    const loaded = route({ id: "ready", version: 5, points: [doctor] })
    const drafts = publishablePlanningDrafts(
      ["2026-08-24"],
      [loaded],
      "agent-1",
      new Set(),
    )
    expect(drafts).toEqual([{ routeId: "ready", date: "2026-08-24", expectedVersion: 5 }])
    expect(planningPublishConflictDates(drafts, [loaded], "agent-1")).toEqual([])
    expect(planningPublishConflictDates(drafts, [route({ id: "ready", version: 6, points: [doctor] })], "agent-1")).toEqual(["2026-08-24"])
    expect(publishablePlanningDrafts(["2026-08-24"], [loaded], "agent-1", new Set(["2026-08-24"]))).toEqual([])
  })
})
