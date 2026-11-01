import fs from "fs"
import path from "path"
import { DAY_STRIP_MOVEMENT_ICON, dayStripHereIndex, dayStripStops } from "../../src/components/day-line"
import { agentDayCard, agentInitials } from "../../src/screens/manager/agent-day-card"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * The agent's day as a parcel's way in a delivery app (owner, 2026-11-01:
 * «сделать красивее как на видео в инстаграме», mockup approved with
 * «Давай»): a ribbon with his state, the road with his marker, «started» and
 * «left» under it — for the manager in «Komanda», and the agent's own green
 * card of the day on «Bu gün».
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const NOW = new Date("2026-11-02T10:00:00.000Z")
const base = {
  workdayStatus: "STARTED",
  workdayStartedAt: "2026-11-02T05:10:00.000Z",
  route: { planned: 8, visited: 3, skipped: 0 },
  routeDay: null,
  liveMovement: null,
  now: NOW,
} as const

describe("the marker on the day's road", () => {
  it("stands after the stops behind him and before the next one, and is gone once the plan is done", () => {
    expect(dayStripHereIndex(dayStripStops(3, 8))).toBe(3)
    expect(dayStripHereIndex(dayStripStops(0, 4))).toBe(0)
    expect(dayStripHereIndex(dayStripStops(5, 5))).toBeNull()
    expect(dayStripHereIndex(dayStripStops(0, 0))).toBeNull()
  })

  it("has a picture for each way the server reads a live point", () => {
    expect(DAY_STRIP_MOVEMENT_ICON).toEqual({ DRIVE: "car", WALK: "walk", STAY: "stop" })
  })
})

describe("an agent's card for the manager", () => {
  it("on the way: a ribbon and the car on the road, from a live point of a day under way", () => {
    const card = agentDayCard({ ...base, liveMovement: "DRIVE" })
    expect(card.ribbon).toBe("onTheWay")
    expect(card.marker).toEqual({ kind: "moving", mode: "DRIVE" })
  })

  it("standing: the marker, but no «on the way» ribbon", () => {
    const card = agentDayCard({ ...base, liveMovement: "STAY" })
    expect(card.ribbon).toBeNull()
    expect(card.marker).toEqual({ kind: "moving", mode: "STAY" })
  })

  it("on a visit: the ribbon, the minutes in the bubble and the client as «now»", () => {
    const card = agentDayCard({
      ...base,
      liveMovement: "STAY",
      routeDay: { first: null, next: { name: "Др. Алиева", plannedTime: null }, visiting: { name: "Аптека 24", since: "2026-11-02T09:12:00.000Z" } },
    })
    expect(card.ribbon).toBe("visiting")
    expect(card.marker).toEqual({ kind: "visiting", minutes: 48, name: "Аптека 24" })
    expect(card.left).toEqual({ count: 5, now: "Аптека 24", next: "Др. Алиева" })
  })

  // Zeytun keeps no time: the server sends no workday, and every agent read
  // «İş günü başlamayıb» — the car would never have shown (phone, 3.11.66).
  it("without time-keeping, a live point is what says he is at work", () => {
    const card = agentDayCard({ ...base, workdayStatus: null, workdayKnown: false, workdayStartedAt: null, liveMovement: "WALK" })
    expect(card.ribbon).toBe("onTheWay")
    expect(card.marker).toEqual({ kind: "moving", mode: "WALK" })
    expect(agentDayCard({ ...base, workdayStatus: null, workdayKnown: false, liveMovement: null }).marker).toBeNull()
  })

  it("the day closed: the green ribbon and no marker", () => {
    const card = agentDayCard({ ...base, workdayStatus: "COMPLETED", liveMovement: "DRIVE" })
    expect(card.ribbon).toBe("closed")
    expect(card.marker).toBeNull()
  })

  it("a break, an old point or a day not started: no movement is claimed", () => {
    expect(agentDayCard({ ...base, workdayStatus: "PAUSED", liveMovement: null }).ribbon).toBe("break")
    expect(agentDayCard({ ...base, liveMovement: null }).marker).toBeNull()
    expect(agentDayCard({ ...base, workdayStatus: null, liveMovement: "DRIVE" }).marker).toBeNull()
  })

  it("started: the first client and his time, else the start of the day; left: what is not visited or skipped", () => {
    expect(agentDayCard({ ...base, routeDay: { first: { name: "Аптека «Шафа»", at: "2026-11-02T05:20:00.000Z" }, next: null, visiting: null } }).started)
      .toEqual({ at: "2026-11-02T05:20:00.000Z", name: "Аптека «Шафа»" })
    expect(agentDayCard(base).started).toEqual({ at: "2026-11-02T05:10:00.000Z", name: null })
    expect(agentDayCard({ ...base, route: { planned: 8, visited: 6, skipped: 2 } }).left?.count).toBe(0)
  })

  it("writes the avatar's letters in the language of the app", () => {
    expect(agentInitials("Seymur Məmmədov")).toBe("SM")
    expect(agentInitials("  саида  ")).toBe("С")
  })
})

describe("on the screens", () => {
  it("the manager's card is a ribbon, the road and «started / left»", () => {
    const team = read("src/screens/manager/ManagerWorkspaceScreen.android.tsx")
    expect(team).toContain('const moving = currentPosition && (!workdayKnown || agent.workday?.status === "STARTED") ? location?.movement?.mode ?? null : null')
    expect(team).toContain("{ribbon ? <DayTrackRibbon text={ribbon.text} color={ribbon.color} /> : null}")
    expect(team).toContain("<DayTrack")
    expect(team).toContain("<DayTrackFooter")
  })

  it("the agent's card of the day is green, with «you are here» only while his day is under way", () => {
    const today = read("src/screens/today/TodayScreen.tsx")
    expect(today).toContain('<View style={styles.routeDayCard} testID="today-route-strip">')
    expect(today).toContain("marker={workdayActive && route.remainingPoints > 0")
    // The list of every client stays under it.
    expect(today.indexOf('testID="today-route-strip"')).toBeLessThan(today.indexOf("<DayLineRail"))
  })

  it("the marker bobs on the native thread, and stands still with «remove animations»", () => {
    const track = read("src/components/DayTrack.tsx")
    expect(track).toContain("AccessibilityInfo.isReduceMotionEnabled()")
    expect(track).toContain("useNativeDriver: true")
  })

  it("says every word in all three languages", () => {
    const keys = Object.keys(mobileResources.en.dayTrack)
    for (const locale of ["ru", "az"] as const) {
      const present = Object.keys(mobileResources[locale].dayTrack).map((key) => key.replace(/_(one|few|many|other)$/, ""))
      for (const key of keys) expect(present).toContain(key.replace(/_(one|few|many|other)$/, ""))
    }
  })
})
