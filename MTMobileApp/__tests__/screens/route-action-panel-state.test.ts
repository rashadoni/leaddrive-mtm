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
  routeKnownAbsent: false,
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

  it("behaves as before once the server said today has no route", () => {
    // Unchanged on purpose: the tablet pane showed these gates before the fix.
    const noRoute = { ...settled, hasRoute: false, routeStatus: undefined, routeKnownAbsent: true }
    expect(routeActionPanelState(noRoute)).toBe("gate-route")
    expect(routeActionPanelState({ ...noRoute, workdayActive: false })).toBe("gate-workday")
    expect(routeActionPanelState({ ...noRoute, workdayActive: false, workdayPaused: true })).toBe("gate-paused")
    // A timed refetch of that empty day keeps saying what was last read.
    expect(routeActionPanelState({ ...noRoute, loading: false })).toBe("gate-route")
  })

  it("does not ask to start a route that failed to load with no saved copy", () => {
    // Offline or after the 20 s timeout: the route may be IN_PROGRESS on the
    // server. The tablet pane (and the S23 sideways, 823 dp) draws the panel
    // beside the «Marşrut yüklənmədi» retry card.
    const unread = { ...settled, hasRoute: false, routeStatus: undefined, routeKnownAbsent: false }
    expect(routeActionPanelState(unread)).toBe("route-unknown")
    // The same while a timed refetch runs without the loading flag.
    expect(routeActionPanelState({ ...unread, loading: false })).toBe("route-unknown")
    // A retry pressed by hand shows the wait again.
    expect(routeActionPanelState({ ...unread, loading: true })).toBe("loading")
    // The workday and pause gates come from the device, not the route.
    expect(routeActionPanelState({ ...unread, workdayActive: false })).toBe("gate-workday")
    expect(routeActionPanelState({ ...unread, workdayActive: false, workdayPaused: true })).toBe("gate-paused")
    // An open visit still wins.
    expect(routeActionPanelState({ ...unread, hasActiveVisit: true })).toBe("visit")
  })

  it("keeps a route that is on screen deciding the panel whatever the last read did", () => {
    // A retained or saved route after a failed read still shows its own gate.
    expect(routeActionPanelState({ ...settled, routeStatus: "PLANNED", routeKnownAbsent: false })).toBe("gate-route")
    expect(routeActionPanelState({ ...settled, routeKnownAbsent: false })).toBe("point")
  })

  it("wires the screen through the function, in both layouts, with a wait that has no button", () => {
    const call = source.slice(source.indexOf("const actionPanelState = routeActionPanelState({"), source.indexOf("const header = ("))
    expect(call).toContain("loading,")
    expect(call).toContain("routeKnownAbsent,")
    expect(call).toContain("workdayHydrated,")
    expect(call).toContain("activeVisitKnown,")
    expect(call).toContain('actionPanelState === "loading" ? (\n    <RouteActionPanelLoading copy={copy} />')
    expect(call).not.toContain("activeVisit || routeExecutionReady")
    expect(call).toContain('actionPanelState === "route-unknown" ? (')

    // Only a read that finished with no route for today confirms absence; a
    // failed read clears it, so a timeout never turns into «Marşruta başla».
    const fetchRouteSource = source.slice(
      source.indexOf("const fetchRoute = useCallback("),
      source.indexOf("useAutoRefresh(", source.indexOf("const fetchRoute = useCallback(")),
    )
    expect(fetchRouteSource.split("setRouteKnownAbsent(true)").length - 1).toBe(2)
    const catchBlock = fetchRouteSource.slice(fetchRouteSource.indexOf("} catch (error: any) {"))
    expect(catchBlock).toContain('return\n      setRouteKnownAbsent(false)')
    expect(catchBlock).not.toContain("setRouteKnownAbsent(true)")

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
