import fs from "fs"
import path from "path"
import { visitOpenSinceEarlierDay } from "../../src/services/stale-visit"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

/**
 * Owner's phone, 2026-10-17: a visit left open on 12 October was shown on the
 * 17th as «Ziyarət davam edir»; today's photo and check-out went into it.
 */
describe("a visit left open from an earlier day", () => {
  const baku = "Asia/Baku"
  const now = new Date("2026-10-17T19:22:00Z") // 23:22 in Baku

  it("is told apart from today's visit by the company's calendar day", () => {
    expect(visitOpenSinceEarlierDay("2026-10-12T17:21:51Z", now, baku)).toBe("2026-10-12")
    expect(visitOpenSinceEarlierDay("2026-10-17T05:00:00Z", now, baku)).toBeNull()
    // 21:00 UTC on the 16th is already the 17th in Baku: today's, not stale.
    expect(visitOpenSinceEarlierDay("2026-10-16T21:00:00Z", now, baku)).toBeNull()
    // …and 19:00 UTC on the 16th is still the 16th there.
    expect(visitOpenSinceEarlierDay("2026-10-16T19:00:00Z", now, baku)).toBe("2026-10-16")
  })

  it("says nothing it cannot read", () => {
    expect(visitOpenSinceEarlierDay(null, now, baku)).toBeNull()
    expect(visitOpenSinceEarlierDay("not a date", now, baku)).toBeNull()
  })

  it("on the route screen: a red card with the date and one button, no photo or presentation", () => {
    const route = read("screens/route/RouteScreen.tsx")
    const panel = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("if (!point) {", route.indexOf("function PointActionPanel(")))
    const stale = panel.slice(panel.indexOf("if (activeVisit && staleSinceLabel) {"), panel.indexOf("const pending = activeVisit.pendingCheckOut"))
    expect(stale).toContain('testID="route-stale-visit"')
    expect(stale).toContain("renderTemplate(copy.staleVisitTitle, { date: staleSinceLabel })")
    expect(stale).toContain("onPress={onCheckOut}")
    expect(stale).not.toContain("onPhoto")
    expect(stale).not.toContain("onOpenPresentations")
    expect(route).toContain("visitOpenSinceEarlierDay(activeVisit?.checkInAt, new Date(), timezone)")
  })

  it("on «Vizitlər»: the same date and warning, the visit can be closed but takes no photo", () => {
    const visits = read("screens/visit/VisitScreen.tsx")
    const panel = visits.slice(visits.indexOf("function VisitActionPanel("), visits.indexOf("function HistoryPanel("))
    expect(panel).toContain('copy.staleEyebrow.replace("{{date}}", staleSinceLabel)')
    expect(panel).toContain("{staleSinceLabel ? null : <Pressable")
    expect(panel).toContain("onPress={onCheckOut}")
    expect(visits).toContain("visitOpenSinceEarlierDay(activeVisit?.checkInAt, new Date(), timezone)")
  })

  it("in the visit's own screen: only its summary, with the same warning", () => {
    const workspace = read("screens/visit/VisitWorkspaceScreen.tsx")
    expect(workspace).toContain("const liveVisit = data?.status === \"CHECKED_IN\" && !staleSince")
    expect(workspace).toContain("const visibleSection = liveVisit ? section : \"summary\"")
    expect(workspace).toContain('testID="visit-workspace-stale"')
    expect(workspace).not.toMatch(/data\.status === "CHECKED_IN" \?/)
  })
})
