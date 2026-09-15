import { mobileResources } from "../../src/i18n/mobile-resources"
import type { PlanningAssignedTarget, PlanningDetailedRoute } from "../../src/services/manager-planning"
import { toPlanningDetailedRoute } from "../../src/services/manager-planning"
import {
  PUBLISHED_ROUTE_EDIT_MESSAGE_KEYS,
  buildUpdatePublishedPoints,
  isPublishedStopLocked,
  publishedRouteEditAvailability,
  publishedRouteEditChanged,
  publishedRouteEditErrorOutcome,
  publishedRouteEditStops,
  publishedRouteForDay,
  publishedStopKeysForPointIds,
  validatePublishedRouteEdit,
} from "../../src/services/published-route-edit"

/**
 * Owner, 2026-09-15: "I chose a route with these customers and published it,
 * and then I can't change it — can't pick another customer or remove one."
 * The rules below are the server's (leaddrive-v2 #218) as the planner applies
 * them before sending UPDATE_PUBLISHED.
 */

const DATE = "2026-09-15"

function stop(
  id: string,
  status: string | undefined,
  plannedTime: string | null,
  extra: Partial<PlanningAssignedTarget> = {},
): PlanningAssignedTarget {
  return {
    key: `organization:${id}`,
    kind: "organization",
    customerId: id,
    name: id,
    eligible: true,
    plannedTime,
    date: DATE,
    pointId: `point-${id}`,
    ...(status ? { pointStatus: status } : {}),
    ...extra,
  }
}

const visitedA = stop("a", "VISITED", "2026-09-15T05:00:00.000Z")
const pendingB = stop("b", "PENDING", "2026-09-15T05:30:00.000Z")
const visitedC = stop("c", "SKIPPED", "2026-09-15T06:00:00.000Z")
const pendingD = stop("d", "PENDING", "2026-09-15T06:30:00.000Z")
const original = [visitedA, pendingB, visitedC, pendingD]

function route(overrides: Partial<PlanningDetailedRoute> = {}): PlanningDetailedRoute {
  return {
    id: "route-1",
    date: DATE,
    name: null,
    notes: null,
    version: 3,
    agentId: "agent-1",
    primaryAgentId: "agent-1",
    primaryIdentityConsistent: true,
    agentName: "Agent",
    status: "PLANNED",
    visited: 1,
    total: 4,
    assignments: [],
    points: original,
    ...overrides,
  }
}

describe("«Planı dəyiş» availability", () => {
  const base = {
    role: "AGENT",
    canPlanOwnRoutes: true,
    agentId: "agent-1",
    routeAgentId: "agent-1",
    status: "PLANNED",
    version: 3,
    online: true,
  }

  it("is offered for the agent's own published or started route", () => {
    expect(publishedRouteEditAvailability(base)).toBe("available")
    expect(publishedRouteEditAvailability({ ...base, status: "IN_PROGRESS" })).toBe("available")
    // Connection not known yet is not "offline": the request itself answers.
    expect(publishedRouteEditAvailability({ ...base, online: null })).toBe("available")
  })

  it("is refused offline instead of queued", () => {
    expect(publishedRouteEditAvailability({ ...base, online: false })).toBe("offline")
  })

  it("is not offered to anyone else or for any other route state", () => {
    const refused = [
      { ...base, role: "MANAGER" },
      { ...base, canPlanOwnRoutes: false },
      { ...base, routeAgentId: "agent-2" },
      { ...base, routeAgentId: null },
      { ...base, status: "DRAFT" },
      { ...base, status: "COMPLETED" },
      { ...base, status: "CANCELLED" },
      { ...base, version: 0 },
      { ...base, version: null },
    ].map((input) => publishedRouteEditAvailability(input))
    expect(refused.every((value) => value === "unavailable")).toBe(true)
  })

  it("finds the one published route of the agent on the day and does not guess between two", () => {
    expect(publishedRouteForDay([route()], DATE, "agent-1")?.id).toBe("route-1")
    expect(publishedRouteForDay([route({ status: "DRAFT" })], DATE, "agent-1")).toBeNull()
    expect(publishedRouteForDay([route(), route({ id: "route-2" })], DATE, "agent-1")).toBeNull()
    expect(publishedRouteForDay([route({ agentId: "agent-2", primaryAgentId: "agent-2" })], DATE, "agent-1")).toBeNull()
  })
})

describe("which stops are locked", () => {
  it("locks every saved stop that left PENDING, and a saved stop with no status", () => {
    expect(isPublishedStopLocked(visitedA)).toBe(true)
    expect(isPublishedStopLocked(visitedC)).toBe(true)
    expect(isPublishedStopLocked(pendingB)).toBe(false)
    expect(isPublishedStopLocked(stop("x", undefined, null))).toBe(true)
  })

  it("never locks a stop added during the edit", () => {
    expect(isPublishedStopLocked({ pointId: undefined, pointStatus: undefined })).toBe(false)
  })

  it("reads the point id and status from the route the server returns", () => {
    const mapped = toPlanningDetailedRoute({
      id: "route-1",
      date: `${DATE}T00:00:00.000Z`,
      status: "IN_PROGRESS",
      version: 4,
      agentId: "agent-1",
      points: [
        { id: "p1", status: "VISITED", customerId: "org-1", plannedTime: "2026-09-15T05:00:00.000Z", customer: { id: "org-1", name: "Clinic" } },
        { id: "p2", status: "PENDING", customerId: "org-2", contactId: "c2", contact: { id: "c2", displayName: "Dr B" }, customer: { id: "org-2", name: "Pharmacy" } },
      ],
    })
    expect(mapped?.points.map((point) => [point.pointId, point.pointStatus])).toEqual([["p1", "VISITED"], ["p2", "PENDING"]])
    expect(publishedRouteEditStops(mapped as PlanningDetailedRoute).map((point) => point.date)).toEqual([DATE, DATE])
  })
})

describe("client-side check before UPDATE_PUBLISHED", () => {
  it("accepts removing, moving and retiming pending stops and adding new ones", () => {
    const added = stop("e", undefined, "2026-09-15T07:00:00.000Z", { pointId: undefined })
    const edited = [
      visitedA,
      { ...pendingD, plannedTime: "2026-09-15T05:30:00.000Z" },
      visitedC,
      added,
    ]
    expect(validatePublishedRouteEdit(original, edited)).toBeNull()
  })

  it("lets a pending stop move between visited ones", () => {
    expect(validatePublishedRouteEdit(original, [pendingB, visitedA, pendingD, visitedC])).toBeNull()
  })

  it("refuses removing a visited stop", () => {
    expect(validatePublishedRouteEdit(original, [pendingB, visitedC, pendingD])).toEqual({
      code: "LOCKED_REMOVED",
      keys: [visitedA.key],
    })
  })

  it("refuses swapping two visited stops", () => {
    expect(validatePublishedRouteEdit(original, [visitedC, pendingB, visitedA, pendingD])).toEqual({
      code: "LOCKED_REORDERED",
      keys: [visitedA.key, visitedC.key],
    })
  })

  it("refuses retiming a visited stop, including clearing its time", () => {
    expect(validatePublishedRouteEdit(original, [{ ...visitedA, plannedTime: null }, pendingB, visitedC, pendingD])).toEqual({
      code: "LOCKED_RETIMED",
      keys: [visitedA.key],
    })
  })

  it("refuses an empty day, a duplicate stop and more than 200 stops", () => {
    expect(validatePublishedRouteEdit([pendingB], [])?.code).toBe("ROUTE_EMPTY")
    expect(validatePublishedRouteEdit(original, [...original, { ...pendingB, key: "copy" }])?.code).toBe("DUPLICATE")
    const many = Array.from({ length: 201 }, (_, index) => stop(`n${index}`, undefined, null, { pointId: undefined }))
    expect(validatePublishedRouteEdit([], many)?.code).toBe("TOO_MANY")
  })
})

describe("UPDATE_PUBLISHED points", () => {
  it("keeps stop order and identity, carries no point id, and sends locked times exactly", () => {
    const doctor = stop("f", "PENDING", null, { kind: "contact", contactId: "doc-1", key: "contact:doc-1" })
    expect(buildUpdatePublishedPoints([visitedC, doctor, visitedA])).toEqual([
      { customerId: "c", contactId: null, plannedTime: "2026-09-15T06:00:00.000Z" },
      { customerId: "f", contactId: "doc-1", plannedTime: null },
      { customerId: "a", contactId: null, plannedTime: "2026-09-15T05:00:00.000Z" },
    ])
  })

  it("tells an unchanged day from a changed one", () => {
    expect(publishedRouteEditChanged(original, original.map((item) => ({ ...item })))).toBe(false)
    expect(publishedRouteEditChanged(original, [visitedA, visitedC, pendingB, pendingD])).toBe(true)
    expect(publishedRouteEditChanged(original, [visitedA, pendingB, visitedC])).toBe(true)
    expect(publishedRouteEditChanged(original, [visitedA, { ...pendingB, plannedTime: null }, visitedC, pendingD])).toBe(true)
  })

  it("maps the point ids the server names back to the rows on screen", () => {
    expect(publishedStopKeysForPointIds(original, ["point-c", "unknown"])).toEqual([visitedC.key])
  })
})

describe("server answers to UPDATE_PUBLISHED", () => {
  const outcome = (code: string) => publishedRouteEditErrorOutcome({ code })

  it("reloads and offers to start again after a version conflict", () => {
    expect(outcome("ROUTE_VERSION_CONFLICT")).toMatchObject({ action: "reload-and-ask", messageKey: "managerShell.planEditVersionConflict" })
  })

  it("reopens the editor on fresh stops when a stop turned out to be visited", () => {
    expect(outcome("ROUTE_VISITED_POINTS_LOCKED")).toMatchObject({ action: "restart-edit", messageKey: "managerShell.planEditVisitedLocked" })
  })

  it("keeps the change on screen when only a stop with a pending request is in the way", () => {
    expect(outcome("ROUTE_POINT_CHANGE_PENDING")).toMatchObject({ action: "keep-edit", messageKey: "managerShell.planEditChangePending" })
  })

  it("sends a refused agent to the manager", () => {
    expect(outcome("ROUTE_EDIT_FORBIDDEN")).toMatchObject({ action: "exit-edit", messageKey: "managerShell.planEditForbidden" })
    expect(outcome("MTM_ROUTE_SCOPE_DENIED").messageKey).toBe("managerShell.planEditForbidden")
  })

  it("says the server is not updated yet when it does not know the command", () => {
    expect(outcome("MOBILE_ROUTE_COMMAND_INVALID")).toMatchObject({ action: "exit-edit", messageKey: "managerShell.planEditServerOutdated" })
  })

  it("keeps an unconfirmed change for an idempotent retry", () => {
    expect(outcome("MOBILE_ROUTE_COMMAND_QUEUED")).toMatchObject({ action: "keep-edit", messageKey: "managerShell.planEditNotConfirmed" })
  })

  it("falls back to a generic message and keeps the code for the log", () => {
    expect(outcome("SOMETHING_NEW")).toEqual({
      messageKey: "managerShell.planEditFailed",
      tone: "error",
      action: "keep-edit",
      code: "SOMETHING_NEW",
    })
    expect(publishedRouteEditErrorOutcome(new Error("boom")).code).toBe("UNKNOWN")
  })

  it("has every message in Azerbaijani, Russian and English", () => {
    const keys = [
      ...PUBLISHED_ROUTE_EDIT_MESSAGE_KEYS,
      "managerShell.planChangePublished",
      "managerShell.planPublishEdit",
      "managerShell.planCancelEdit",
      "managerShell.planVisitedStop",
      "managerShell.planEditUpdated",
      "managerShell.planEditProblemTitle",
      "managerShell.planPublishedReadOnlyBody",
      "managerShell.planEditSaveDraftsFirst",
    ]
    const missing: string[] = []
    for (const locale of ["az", "ru", "en"] as const) {
      const shell = mobileResources[locale].managerShell as Record<string, string>
      for (const key of keys) {
        const name = key.replace("managerShell.", "")
        if (typeof shell[name] !== "string" || !shell[name].trim()) missing.push(`${locale}.${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("uses the owner's words", () => {
    const az = mobileResources.az.managerShell as Record<string, string>
    expect(az.planChangePublished).toBe("Planı dəyiş")
    expect(az.planPublishEdit).toBe("Dəyişiklikləri dərc et")
    expect(az.planEditUpdated).toBe("Plan yeniləndi")
    expect(az.planVisitedStop).toBe("Ziyarət edilib")
    expect(az.planEditForbidden).toBe("Bu marşrutu dəyişmək icazəniz yoxdur — rəhbərinizə yazın.")
    expect((mobileResources.ru.managerShell as Record<string, string>).planChangePublished).toBe("Изменить план")
    expect((mobileResources.en.managerShell as Record<string, string>).planChangePublished).toBe("Change plan")
  })

  it("no longer tells the agent to save a draft to change a published day", () => {
    const az = mobileResources.az.managerShell as Record<string, string>
    expect(az.planPublishedDateLockedBody).not.toContain("Qaralama saxlayın")
    expect(az.planPublishedDateLockedBody).toContain("Planı dəyiş")
  })
})
