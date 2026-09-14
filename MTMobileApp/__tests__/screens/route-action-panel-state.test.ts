import fs from "fs"
import path from "path"
import { routeActionPanelState } from "../../src/screens/route/route-screen-state"

/**
 * Galaxy S23, 2026-09-14. Right after opening the Route tab the action panel
 * read «Marşrutun başlanması gözlənilir» and asked for «Marşruta başla» next to
 * «Marşrut və ziyarətlər yüklənir…» and «0 dayanacaq». The route was already
 * IN_PROGRESS; the gate had been chosen from a route that simply was not read
 * yet. While the facts are unknown the panel must wait, not instruct.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
  "utf8",
)

const settled = {
  loading: false,
  hasRoute: true,
  routeStatus: "IN_PROGRESS",
  workdayHydrated: true,
  workdayActive: true,
  workdayPaused: false,
  hasActiveVisit: false,
  activeVisitKnown: true,
}

describe("route action panel: no instruction before the facts are read", () => {
  it("waits while the first route request runs with no route in hand", () => {
    expect(routeActionPanelState({ ...settled, loading: true, hasRoute: false, routeStatus: undefined })).toBe("loading")
    // The exact S23 case: workday active, route not read yet.
    expect(routeActionPanelState({
      ...settled,
      loading: true,
      hasRoute: false,
      routeStatus: undefined,
      workdayActive: true,
    })).toBe("loading")
    // Nor may it tell an agent without a started day to start one yet.
    expect(routeActionPanelState({
      ...settled,
      loading: true,
      hasRoute: false,
      routeStatus: undefined,
      workdayActive: false,
    })).toBe("loading")
  })

  it("waits while the workday store is not read from storage", () => {
    expect(routeActionPanelState({
      ...settled,
      workdayHydrated: false,
      workdayActive: false,
    })).toBe("loading")
    expect(routeActionPanelState({
      ...settled,
      routeStatus: "PLANNED",
      workdayHydrated: false,
      workdayActive: false,
    })).toBe("loading")
  })

  it("waits while the first visit lookup has not settled", () => {
    expect(routeActionPanelState({ ...settled, activeVisitKnown: false })).toBe("loading")
    expect(routeActionPanelState({ ...settled, routeStatus: "PLANNED", activeVisitKnown: false })).toBe("loading")
  })

  it("shows the stop panel for a loaded IN_PROGRESS route on an active day", () => {
    expect(routeActionPanelState(settled)).toBe("point")
  })

  it("asks to start a loaded PLANNED route on an active day", () => {
    expect(routeActionPanelState({ ...settled, routeStatus: "PLANNED" })).toBe("gate-route")
  })

  it("keeps the workday and pause gates once the day is read", () => {
    expect(routeActionPanelState({ ...settled, workdayActive: false })).toBe("gate-workday")
    expect(routeActionPanelState({ ...settled, routeStatus: "PLANNED", workdayActive: false })).toBe("gate-workday")
    expect(routeActionPanelState({ ...settled, workdayActive: false, workdayPaused: true })).toBe("gate-paused")
  })

  it("keeps the open visit on screen even while anything else is refetching", () => {
    expect(routeActionPanelState({ ...settled, hasActiveVisit: true, loading: true, hasRoute: false, routeStatus: undefined })).toBe("visit")
    expect(routeActionPanelState({ ...settled, hasActiveVisit: true, workdayHydrated: false, workdayActive: false })).toBe("visit")
    expect(routeActionPanelState({ ...settled, hasActiveVisit: true, activeVisitKnown: false })).toBe("visit")
    expect(routeActionPanelState({ ...settled, hasActiveVisit: true, routeStatus: "PLANNED" })).toBe("visit")
  })

  it("keeps a refetch of a route already on screen from blanking the panel", () => {
    // fetchRoute keeps the previous route while it asks again.
    expect(routeActionPanelState({ ...settled, loading: true })).toBe("point")
  })

  it("behaves as before once a day without a route is loaded", () => {
    // Unchanged on purpose: the tablet pane showed these gates before the fix.
    expect(routeActionPanelState({ ...settled, hasRoute: false, routeStatus: undefined })).toBe("gate-route")
    expect(routeActionPanelState({ ...settled, hasRoute: false, routeStatus: undefined, workdayActive: false })).toBe("gate-workday")
  })

  it("wires the screen through the function, in both layouts, with a wait that has no button", () => {
    const call = source.slice(source.indexOf("const actionPanelState = routeActionPanelState({"), source.indexOf("const header = ("))
    expect(call).toContain("loading,")
    expect(call).toContain("workdayHydrated,")
    expect(call).toContain("activeVisitKnown,")
    expect(call).toContain('actionPanelState === "loading" ? (\n    <RouteActionPanelLoading copy={copy} />')
    expect(call).not.toContain("activeVisit || routeExecutionReady")

    const placeholder = source.slice(
      source.indexOf("function RouteActionPanelLoading("),
      source.indexOf("function JourneySteps("),
    )
    expect(placeholder).toContain("{copy.loading}")
    expect(placeholder).toContain("<ActivityIndicator")
    expect(placeholder).not.toContain("ActionButton")
    expect(placeholder).not.toContain("Pressable")
    expect(placeholder).not.toContain("onPress")

    // The visit lookup marks itself read whether it succeeded or not, so the
    // wait always ends.
    expect(source).toContain("fetchActiveVisit().catch(() => {}).then(() => setActiveVisitKnown(true))")
    expect(source).toContain("if (!workdayHydrated) useWorkdayStore.getState().hydrate().catch(() => {})")

    // The phone list header and the tablet action pane both draw actionPanel.
    const tablet = source.slice(source.indexOf("  if (tablet) {"), source.indexOf("<NotesModal", source.indexOf("  if (tablet) {")))
    expect(tablet).toContain(") : actionPanel}")
    const phone = source.slice(source.indexOf("<FlatList", source.indexOf("  if (tablet) {") + 1))
    expect(phone).toContain(") : route ? actionPanel : null}")
  })
})
