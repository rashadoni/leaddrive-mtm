import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import type { PlanningAssignedTarget, PlanningDetailedRoute, PlanningTarget } from "../../src/services/manager-planning"
import {
  appendSelfPlanBasket,
  carrySelfPlanBasket,
  publishedEditCarriedStops,
  publishedEditLosesChanges,
  selfPlanDayAssignments,
  selfPlanDayChoice,
  selfPlanDayMode,
  selfPlanInitialDay,
  selfPlanRecheckQuery,
  selfPlanStopsToRecheck,
} from "../../src/screens/planning/self-plan-day"

/**
 * 17 October 2026, the owner on an agent's phone: «когда добавляю клиентов, он
 * сразу их добавляет в текущий день, нет возможности после выбора клиента
 * выбрать день». The date stood above the clients, and changing it threw the
 * chosen clients away. Decision («День в конце»): clients first, then «Today ·
 * Tomorrow · Another date» at the bottom; «Planı dəyiş» shows its day large
 * with «Plan another day» next to it.
 */
const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), "utf8")
const core = read("../../src/screens/planning/PlanningWorkspaceCore.android.tsx")
const week = read("../../src/screens/week/WeekScreen.tsx")
const routeScreen = read("../../src/screens/route/RouteScreen.tsx")

const TODAY = "2026-10-19"
const TOMORROW = "2026-10-20"

function doctor(id: string, date: string, extra: Partial<PlanningAssignedTarget> = {}): PlanningAssignedTarget {
  return {
    key: `contact:${id}`,
    kind: "contact",
    customerId: `clinic-${id}`,
    contactId: id,
    name: `Doctor ${id}`,
    eligible: true,
    contactStatus: "ACTIVE",
    validOnDate: date,
    plannedTime: null,
    date,
    ...extra,
  }
}

function pharmacy(id: string, date: string): PlanningAssignedTarget {
  return { key: `organization:${id}`, kind: "organization", customerId: id, name: `Pharmacy ${id}`, eligible: true, validOnDate: date, plannedTime: null, date }
}

/** A row as the server returns it for `date` (no `date` field: not yet placed). */
function serverRow(stop: PlanningAssignedTarget, date: string, extra: Partial<PlanningTarget> = {}): PlanningTarget {
  const target: Partial<PlanningAssignedTarget> = { ...stop }
  delete target.date
  return { ...(target as PlanningTarget), validOnDate: date, ...extra }
}

function route(date: string, status: string, points: PlanningTarget[], extra: Partial<PlanningDetailedRoute> = {}): PlanningDetailedRoute {
  return {
    id: `route-${date}-${status}`,
    date,
    name: null,
    notes: null,
    version: 3,
    agentId: "agent-1",
    primaryAgentId: "agent-1",
    primaryIdentityConsistent: true,
    agentName: "Agent",
    status,
    visited: 0,
    total: points.length,
    assignments: [],
    points,
    ...extra,
  }
}

describe("the day the planner opens with", () => {
  it("is none unless the agent already picked one", () => {
    expect(selfPlanInitialDay(undefined, TODAY)).toBeNull()
    expect(selfPlanInitialDay(null, TODAY)).toBeNull()
    expect(selfPlanInitialDay("not a date", TODAY)).toBeNull()
  })

  it("is the picked day, today included, and never a day in the past", () => {
    expect(selfPlanInitialDay(TOMORROW, TODAY)).toBe(TOMORROW)
    expect(selfPlanInitialDay(TODAY, TODAY)).toBe(TODAY)
    expect(selfPlanInitialDay("2026-10-18", TODAY)).toBeNull()
  })

  it("names the three answers to «which day?»", () => {
    expect(selfPlanDayChoice(null, TODAY)).toBeNull()
    expect(selfPlanDayChoice(TODAY, TODAY)).toBe("today")
    expect(selfPlanDayChoice(TOMORROW, TODAY)).toBe("tomorrow")
    expect(selfPlanDayChoice("2026-10-23", TODAY)).toBe("other")
  })
})

describe("moving the marked clients to the chosen day", () => {
  const confirmedToday = doctor("a", TODAY)
  const pharmacyToday = pharmacy("p", TODAY)
  const goneTomorrow = doctor("b", TODAY)

  it("asks the server about every client not yet confirmed for that day, by id", () => {
    expect(selfPlanStopsToRecheck([confirmedToday, doctor("c", TOMORROW)], TOMORROW).map((stop) => stop.key)).toEqual(["contact:a"])
    expect(selfPlanRecheckQuery(confirmedToday, TOMORROW)).toEqual({ kind: "contact", date: TOMORROW, targetId: "a" })
    expect(selfPlanRecheckQuery(pharmacyToday, TOMORROW)).toEqual({ kind: "organization", date: TOMORROW, targetId: "p" })
  })

  it("keeps the ones the server returned for the day, dated and resolved for it", () => {
    const confirmed = new Map<string, PlanningTarget | null>([
      ["contact:a", serverRow(confirmedToday, TOMORROW, { customerId: "clinic-moved" })],
      ["organization:p", serverRow(pharmacyToday, TOMORROW)],
      ["contact:b", null],
    ])
    const { kept, dropped } = carrySelfPlanBasket([confirmedToday, goneTomorrow, pharmacyToday], TOMORROW, confirmed)
    expect(kept.map((stop) => [stop.key, stop.date, stop.validOnDate])).toEqual([
      ["contact:a", TOMORROW, TOMORROW],
      ["organization:p", TOMORROW, TOMORROW],
    ])
    // The server's workplace for the new day wins over the old one.
    expect(kept[0].customerId).toBe("clinic-moved")
    expect(dropped.map((stop) => stop.name)).toEqual(["Doctor b"])
  })

  it("never carries a client on the strength of the old day's answer", () => {
    // The server row is still the one for today: it does not count for tomorrow.
    const stale = new Map<string, PlanningTarget | null>([["contact:a", serverRow(confirmedToday, TODAY)]])
    const { kept, dropped } = carrySelfPlanBasket([confirmedToday], TOMORROW, stale)
    expect(kept).toEqual([])
    expect(dropped.map((stop) => stop.key)).toEqual(["contact:a"])
  })

  it("drops a client the server returned as not eligible", () => {
    const confirmed = new Map<string, PlanningTarget | null>([["contact:a", serverRow(confirmedToday, TOMORROW, { eligible: false })]])
    expect(carrySelfPlanBasket([confirmedToday], TOMORROW, confirmed).dropped).toHaveLength(1)
  })

  it("keeps a client already confirmed for the day without asking again", () => {
    const { kept, dropped } = carrySelfPlanBasket([confirmedToday], TODAY, new Map())
    expect(kept).toEqual([confirmedToday])
    expect(dropped).toEqual([])
  })
})

describe("what saving does on the chosen day", () => {
  const base = { loading: false, routes: [] as PlanningDetailedRoute[], publishedAvailability: null, conflictDates: [] as string[] }

  it("saves nothing before a day is chosen or while the day is being checked", () => {
    expect(selfPlanDayMode({ ...base, day: null })).toBe("none")
    expect(selfPlanDayMode({ ...base, day: TODAY, loading: true })).toBe("loading")
  })

  it("writes a route, or the day's draft, on an open day", () => {
    expect(selfPlanDayMode({ ...base, day: TOMORROW })).toBe("draft")
    expect(selfPlanDayMode({ ...base, day: TOMORROW, routes: [route(TOMORROW, "DRAFT", [doctor("x", TOMORROW)])] })).toBe("draft")
  })

  it("adds to a live route its agent may change, and refuses one he may not", () => {
    const live = [route(TODAY, "IN_PROGRESS", [doctor("x", TODAY)])]
    expect(selfPlanDayMode({ ...base, day: TODAY, routes: live, publishedAvailability: "available" })).toBe("published")
    expect(selfPlanDayMode({ ...base, day: TODAY, routes: live, publishedAvailability: "offline" })).toBe("published")
    expect(selfPlanDayMode({ ...base, day: TODAY, routes: live, publishedAvailability: "unavailable" })).toBe("blocked")
    expect(selfPlanDayMode({ ...base, day: TODAY, routes: live, publishedAvailability: null })).toBe("blocked")
  })

  it("refuses a day whose drafts are not this agent's one draft", () => {
    expect(selfPlanDayMode({ ...base, day: TOMORROW, conflictDates: [TOMORROW] })).toBe("blocked")
  })
})

describe("the marked clients join the day", () => {
  it("after the day's draft, without repeating a client already on it", () => {
    const draft = [doctor("x", TOMORROW), doctor("a", TOMORROW)]
    const merged = selfPlanDayAssignments(draft, [doctor("a", TOMORROW), pharmacy("p", TOMORROW)], TOMORROW)
    expect(merged.map((stop) => stop.key)).toEqual(["contact:x", "contact:a", "organization:p"])
  })

  it("only when confirmed for that very day", () => {
    expect(selfPlanDayAssignments([], [doctor("a", TODAY)], TOMORROW)).toEqual([])
  })

  it("at the end of a live route, new and untimed, its own stops untouched", () => {
    const visited = doctor("v", TODAY, { pointId: "pt-1", pointStatus: "VISITED", plannedTime: "09:00" })
    const pending = doctor("w", TODAY, { pointId: "pt-2", pointStatus: "PENDING" })
    const stops = appendSelfPlanBasket([visited, pending], [doctor("w", TODAY), doctor("n", TODAY, { plannedTime: "11:00" })], TODAY)
    expect(stops.map((stop) => [stop.key, stop.pointId ?? null, stop.plannedTime ?? null])).toEqual([
      ["contact:v", "pt-1", "09:00"],
      ["contact:w", "pt-2", null],
      ["contact:n", null, null],
    ])
  })
})

describe("«Plan another day» from a published day", () => {
  const original = [
    doctor("v", TODAY, { pointId: "pt-1", pointStatus: "VISITED" }),
    doctor("w", TODAY, { pointId: "pt-2", pointStatus: "PENDING" }),
  ]

  it("takes the clients added during the change to the new plan", () => {
    const edited = [...original, doctor("n", TODAY)]
    expect(publishedEditCarriedStops(original, edited).map((stop) => stop.key)).toEqual(["contact:n"])
    // Nothing else changed on the day: nothing to ask.
    expect(publishedEditLosesChanges(original, edited)).toBe(false)
  })

  it("does not move a client the published day already has", () => {
    // Removed and added again (the owner's own test): he is still on the day.
    const edited = [original[0], doctor("w", TODAY)]
    expect(publishedEditCarriedStops(original, edited)).toEqual([])
  })

  it("asks only when leaving drops a change of the day itself", () => {
    expect(publishedEditLosesChanges(original, [original[0], doctor("n", TODAY)])).toBe(true)
    expect(publishedEditLosesChanges(original, [original[1], original[0]])).toBe(true)
    expect(publishedEditLosesChanges(original, original)).toBe(false)
  })
})

describe("the planner screen", () => {
  it("lists the clients before any day and asks for the day in the dock", () => {
    expect(core).toContain("const selfDayLast = selfPlanning && !editing")
    expect(core).toContain("top={selfDayLast ? (")
    expect(core).toContain("<SelfDayChooser")
    // The date field above the clients is gone from the agent's planner.
    expect(core).not.toContain("selfCopy.routeDate")
    expect(core).toContain("{selfPlanning ? null : (")
  })

  it("lets the agent mark clients whatever the day, and saves only once a day is chosen", () => {
    expect(core).toContain("const browseEditable = selfDayLast ? !checkingDay : activeDateEditable")
    expect(core).toContain('const canSave = (selfMode === null || selfMode === "draft") && Boolean(agentId)')
    expect(core).toContain('t("managerShell.planDayChooseHint", { count: basket.length })')
  })

  it("asks the server about the marked clients for the new day before moving them", () => {
    const choose = core.slice(core.indexOf("const chooseSelfDay = async"), core.indexOf("const planAnotherDay = async"))
    const asked = choose.indexOf("targetSource.loadTargets(selfPlanRecheckQuery(stop, day))")
    const carried = choose.indexOf("carrySelfPlanBasket(marked, day, confirmed)")
    const moved = choose.indexOf("setSelfDay(day)")
    expect([asked > -1, carried > asked, moved > carried]).toEqual([true, true, true])
    // The ones left behind are named, not silently lost.
    expect(choose).toContain("setDroppedNotice(dropped.length > 0")
    expect(core).toContain('t("managerShell.planDayDropped", { date: formatPlanDate(dropped.date, language, true), names: dropped.names.join(", ") })')
    // A failed check changes nothing.
    expect(choose).toContain("setDayCheckFailed(true)")
  })

  it("adds to a live day through the published-route change, and keeps the clients on a refusal", () => {
    const append = core.slice(core.indexOf("const appendToPublishedRoute = async"), core.indexOf("const publishPublishedEdit = async"))
    expect(append).toContain("appendSelfPlanBasket(original, basket, chosenDay)")
    expect(append).toContain("validatePublishedRouteEdit(original, stops)")
    expect(append).toContain("expectedVersion: route.version")
    const failure = append.slice(append.indexOf("} catch (error: unknown) {"), append.indexOf("} finally {"))
    expect(failure).not.toContain("setBasket")
    expect(core).toContain('label: saving ? t("managerShell.planAddingToRoute") : t("managerShell.planAddToRoute")')
  })

  it("shows the published day large with «Plan another day» next to it", () => {
    expect(core).toContain("prominent={selfPlanning && editingActiveDate}")
    expect(core).toContain('{ label: t("managerShell.planOtherDay"), onPress: () => { void planAnotherDay() } }')
    const other = core.slice(core.indexOf("const planAnotherDay = async"), core.indexOf("const appendToPublishedRoute = async"))
    expect(other).toContain("if (publishedEditLosesChanges(session.original, stops)) {")
    expect(other).toContain("setBasket(carried.map(")
    expect(other).toContain("setSelfDay(null)")
  })

  it("opens a client card's quick add marked, not placed, and never in the editor", () => {
    expect(core).toContain("const autoEditPending = useRef(initialEditPublished === true)")
    expect(core).toContain("setBasket((current) => [...current, { ...resolved, plannedTime: null, date: activeDate }])")
  })

  it("leaves the manager's planner as it was", () => {
    // The team planner has no agent basket: its writes, date field and save are unchanged.
    expect(core).toContain("() => chosenDay ? selfPlanDayAssignments(assignments, basket, chosenDay) : assignments")
    expect(core).toContain("const chosenDay = selfDayLast && selfDay && selfDay >= today ? selfDay : null")
    expect(core).toContain("onSelect={(date) => changeWindow(date)}")
  })
})

describe("where the planner is opened from", () => {
  it("passes the calendar's day only when the agent moved off today", () => {
    expect(week).toContain("const pickedDay = selectedDate && selectedDate !== data?.today ? selectedDate : null")
    expect(week).toContain("...(pickedDay ? { initialDate: pickedDay } : {}),")
  })

  it("opens the waiting draft of today on today", () => {
    expect(routeScreen).toContain('navigation.navigate("PlanningBuilder", emptyMode === "awaiting-approval" ? { initialDate: localRouteDateKey() } : undefined)')
  })
})

describe("the words, in three languages", () => {
  const keys = [
    "planDayQuestion", "planDayTomorrow", "planDayOther", "planDayMarked", "planDayChooseHint", "planDayMarkFirst", "planDayMarkToAdd",
    "planDayChecking", "planDayCheckFailed", "planDayDropped", "planDayHasDraft", "planDayHasPublished", "planDayBlocked",
    "planAddToRoute", "planAddingToRoute", "planInRoute", "planOtherDay", "planOtherDayDiscardTitle",
    "planOtherDayDiscardBody", "planPublishedRouteLabel",
  ]

  it("has every one", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const shell = mobileResources[locale].managerShell as Record<string, string>
      for (const key of keys) if (typeof shell[key] !== "string" || !shell[key].trim()) missing.push(`${locale}.${key}`)
    }
    expect(missing).toEqual([])
  })

  it("names the dropped clients and the date in every language", () => {
    for (const locale of ["ru", "en", "az"] as const) {
      const text = (mobileResources[locale].managerShell as Record<string, string>).planDayDropped
      expect(text).toContain("{{date}}")
      expect(text).toContain("{{names}}")
    }
  })

  it("says the owner's words on the agent's screen", () => {
    const az = mobileResources.az.managerShell as Record<string, string>
    expect([az.planToday, az.planDayTomorrow, az.planDayOther, az.planOtherDay]).toEqual(["Bu gün", "Sabah", "Başqa tarix", "Başqa günü planla"])
  })
})
