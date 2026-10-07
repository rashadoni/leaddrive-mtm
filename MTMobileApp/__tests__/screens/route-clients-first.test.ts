import fs from "fs"
import path from "path"
import { routeDockAction, type RouteActionPanelState } from "../../src/screens/route/route-screen-state"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const source = read("src/screens/route/RouteScreen.tsx")
const today = read("src/screens/today/TodayScreen.tsx")

/**
 * 7 October 2026, owner's phone. He had asked three times for «the path by
 * clients: who is visited, where the visit is going on, who is still planned,
 * in order». The stops were on the Route tab with all of that — under a
 * five-step stepper, a summary card and a «start the workday» card. Opening
 * the tab showed no client at all; the first name was a full screen of
 * scrolling away, and the road between the stops was a grey stub inside each
 * separate card. He read the screen as not having it, and he was right.
 */
describe("the one action under the clients", () => {
  it("is read off the panel's state, and offers nothing while that is not known", () => {
    const states: RouteActionPanelState[] = [
      "loading", "visit", "point", "gate-workday", "gate-route", "gate-paused", "route-unknown", "finished",
    ]
    expect(states.map((state) => [state, routeDockAction(state, true)])).toEqual([
      ["loading", null],
      ["visit", "open-visit"],
      ["point", "next-stop"],
      ["gate-workday", "start-workday"],
      ["gate-route", "start-route"],
      ["gate-paused", null],
      ["route-unknown", null],
      ["finished", null],
    ])
  })

  it("does not offer a next client when none is left", () => {
    expect(routeDockAction("point", false)).toBeNull()
  })
})

describe("the phone screen puts the clients first", () => {
  const phone = source.slice(
    source.indexOf("<FlatList", source.indexOf("  if (tablet) {") + 1),
    source.indexOf("<Modal visible={phonePanelVisible}"),
  )
  const listHeader = phone.slice(phone.indexOf("ListHeaderComponent={"), phone.indexOf("renderItem={"))

  it("only the route's name, date and progress stand above the first client", () => {
    expect(listHeader).toContain("<RoutePathHead route={route} done={visitedPoints} total={totalPoints}")
    for (const pushedTheClientsDown of ["<JourneySteps", "<RouteSummary", "actionPanel", "sectionHeading", "completeCard"]) {
      expect(listHeader).not.toContain(pushedTheClientsDown)
    }
  })

  it("keeps the action under the list, outside what scrolls", () => {
    expect(phone.indexOf("      />\n      {phoneDock}")).toBeGreaterThan(-1)
    expect(source).toContain("? <RouteDock caption={dockCaption} action={dockAction} secondary={changePlanAction} />")
    expect(source).toContain("const phoneDock = !tablet && route && (dockAction || dockCaption || changePlanAction)")
  })

  it("starts the day and the route with the panel's handlers and the panel's reasons to wait", () => {
    expect(source).toContain("const gateBusy = workdayActive ? startingRoute : startingWorkday || workdayTransitionPending")
    expect(source).toContain("const gateDisabled = workdayActive ? !routeStartReady : workdayTransitionPending")
    expect(source).toContain("onPress: () => { handleStartWorkday().catch(() => {}) },")
    expect(source).toContain("onPress: () => { handleStartRoute().catch(() => {}) },")
    expect(source.split("disabled: gateBusy || gateDisabled,").length - 1).toBe(2)
  })

  it("opens the full panel for the visit in progress and for the next client", () => {
    expect(source).toContain('? { label: copy.dockOpenVisit, icon: "radio-button-on", onPress: () => setPhonePanelVisible(true) }')
    expect(source).toContain('? { label: copy.dockNextStop, icon: "navigate", onPress: () => handlePointPress(nextPoint) }')
    expect(phone).not.toContain(") : route ? actionPanel : null}")
  })

  it("says the same in all three languages", () => {
    for (const key of ["pathProgress", "dockOpenVisit", "dockNextStop"]) {
      expect(source.split(`\n    ${key}: "`).length - 1).toBe(3)
    }
  })
})

describe("the clients are one road, each with its state", () => {
  const style = (name: string) => {
    const start = source.indexOf(`\n  ${name}: {`)
    return start < 0 ? "" : source.slice(start, source.indexOf("}", start) + 1)
  }

  it("a row leaves no gap above or below, so the line of one stop meets the next", () => {
    const row = style("stopRow")
    expect(row).toContain("paddingHorizontal: fieldTheme.space.md")
    expect(row).not.toMatch(/margin(Bottom|Top|Vertical)?:|paddingVertical:|padding:/)
    expect(source).toContain("stopRail: { alignItems: \"center\", alignSelf: \"stretch\" },")
  })

  it("names each client's state in words, on that state's own colour", () => {
    expect(source).toContain("<View style={[styles.stopStatus, { backgroundColor: status.soft }]}>")
    expect(source).toContain("label: copy.visited, icon: \"checkmark-circle\" as const, color: fieldTheme.color.success, soft: fieldTheme.color.successSoft }")
    expect(source).toContain("label: copy.visiting, icon: \"radio-button-on\" as const, color: fieldTheme.color.amber, soft: fieldTheme.color.amberSoft }")
    expect(source).toContain("label: copy.planned, icon: \"ellipse-outline\" as const, color: fieldTheme.color.inkMuted, soft: fieldTheme.color.surfaceStrong }")
  })

  it("the client being visited stands out as a whole row, and a visited one carries its time", () => {
    expect(source).toContain("visiting && styles.stopRowVisiting")
    expect(style("stopRowVisiting")).toContain("backgroundColor: fieldTheme.color.amberSoft")
    expect(source).toContain("? `${status.label} · ${new Date(point.visitedAt).toLocaleTimeString(language, { hour: \"2-digit\", minute: \"2-digit\" })}`")
  })

  it("marks the nearest of the clients still ahead, never one already visited", () => {
    expect(source).toContain("{nearest && point.status !== \"VISITED\" ? (")
  })
})

describe("smaller things seen in the same look at the phone", () => {
  it("the «start the workday» panel says its title once", () => {
    const gate = source.slice(source.indexOf("function RouteExecutionGate("), source.indexOf("function RouteFinishedPanel("))
    expect(gate.split("{title}").length - 1).toBe(1)
  })

  it("a route the agent planned is not called the manager's", () => {
    for (const phrase of ["менеджер включил", "Menecerin bu gün", "your manager included"]) {
      expect(source).not.toContain(phrase)
    }
  })

  it("Today's route card opens the route instead of repeating «start the day» from the card above it", () => {
    const routeCard = today.slice(today.indexOf('if (nextKind === "route") {'), today.indexOf('if (nextKind === "awaiting") {'))
    expect(routeCard).not.toContain('t("todayV2.startDay")')
    expect(routeCard).toContain("startWorkday: false,")
    expect(routeCard).toContain('destination: canStartRoute ? null : "Route" as Destination,')
  })
})
