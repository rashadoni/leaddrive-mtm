import fs from "fs"
import path from "path"
import { DAY_STRIP_MAX_STOPS, dayStopState, dayStripStops } from "../../src/components/day-line"
import { FIELD_CARDS, FIELD_PALETTES } from "../../src/theme/fieldTheme"

/**
 * Owner, 2026-10-18: «приложение слишком простым выглядит, как будто А4
 * бумага и на ней менюшки». The mockup he accepted («принимаю рекомендации»):
 * a tinted ground under white cards with a soft shadow, the day drawn as a
 * line with its stops on it — on «Bu gün», in «Marşrut» and under every
 * agent in «Komanda» — colour that means something, and bold only for names
 * and numbers. The rules of the same day stay: white headers, one filled
 * button per screen, no pale pills.
 */

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const styleOf = (source: string, name: string) => {
  const body = source.slice(source.indexOf("StyleSheet.create("))
  const start = body.indexOf(`\n  ${name}: {`)
  if (start < 0) return ""
  let depth = 0
  for (let i = body.indexOf("{", start); i < body.length; i++) {
    if (body[i] === "{") depth++
    if (body[i] === "}" && --depth === 0) return body.slice(start, i + 1)
  }
  return ""
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe("the ground and the cards", () => {
  it("puts the cards a visible step above the ground by day", () => {
    // #F1F6F3 under #FBFDFC was 0.03 apart: one white sheet.
    expect(luminance(FIELD_PALETTES.light.surface) - luminance(FIELD_PALETTES.light.canvas)).toBeGreaterThan(0.06)
  })

  it("lifts a card with a shadow by day and with a hairline at night", () => {
    expect(FIELD_CARDS.light.elevation).toBeGreaterThan(0)
    expect(FIELD_CARDS.light.borderWidth).toBe(0)
    expect(FIELD_CARDS.dark.borderWidth).toBe(1)
    expect(FIELD_CARDS.dark.borderColor).toBe(FIELD_PALETTES.dark.border)
  })

  it("has the day line's colour in both palettes", () => {
    expect(FIELD_PALETTES.light.line).toMatch(/^#[0-9A-F]{6}$/i)
    expect(FIELD_PALETTES.dark.line).toMatch(/^#[0-9A-F]{6}$/i)
  })
})

describe("the day line", () => {
  it("places a stop by what happened there", () => {
    expect(dayStopState("VISITED", false, false)).toBe("done")
    expect(dayStopState("VISITED", true, false)).toBe("visiting")
    expect(dayStopState("PLANNED", false, true)).toBe("next")
    expect(dayStopState("PLANNED", false, false)).toBe("planned")
    expect(dayStopState(undefined, false, false)).toBe("planned")
  })

  it("draws an agent's day from the two counts the server sends", () => {
    expect(dayStripStops(2, 5)).toEqual(["done", "done", "planned", "planned", "planned"])
    expect(dayStripStops(0, 3)).toEqual(["planned", "planned", "planned"])
    expect(dayStripStops(4, 4)).toEqual(["done", "done", "done", "done"])
    // Nothing for an empty plan, never more done than planned.
    expect(dayStripStops(3, 0)).toEqual([])
    expect(dayStripStops(9, 2)).toEqual(["done", "done"])
  })

  it("keeps a long plan readable: the line has at most twelve stops, in proportion", () => {
    const stops = dayStripStops(15, 30)
    expect(stops).toHaveLength(DAY_STRIP_MAX_STOPS)
    expect(stops.filter((stop) => stop === "done")).toHaveLength(6)
  })

  it("stands on «Bu gün», in «Marşrut» and under every agent in «Komanda»", () => {
    const today = read("src/screens/today/TodayScreen.tsx")
    expect(today).toContain("<DayLineRail")
    expect(today).toContain('filledAbove={index > 0 && route.points[index - 1].status === "VISITED"}')
    const route = read("src/screens/route/RouteScreen.tsx")
    expect(route).toContain("<DayLineStation state={dayStopState(point.status, visiting, recommended)} />")
    const team = read("src/screens/manager/ManagerWorkspaceScreen.android.tsx")
    expect(team).toContain("<DayLineStrip")
    // The team before the map: the map was 360 dp and a scroll above them.
    expect(team.indexOf('t("managerShell.teamNow")')).toBeGreaterThan(-1)
    expect(team.indexOf('t("managerShell.teamNow")')).toBeLessThan(team.indexOf("<ManagerLiveMap rows={teamRows}"))
  })

  it("shows the open visit's minutes and photos on its stop in «Marşrut»", () => {
    const route = read("src/screens/route/RouteScreen.tsx")
    expect(route.match(/visitFacts=\{visitingPointId === item\.id \? \{ minutes: elapsedMin, photos: photos\.count \} : undefined\}/g)).toHaveLength(2)
    for (const word of ['visitMinutesShort: "{{minutes}} мин"', 'visitMinutesShort: "{{minutes}} dəq"', 'visitMinutesShort: "{{minutes}} min"']) {
      expect(route).toContain(word)
    }
  })
})

describe("cards, not outlines", () => {
  const CARDS: Array<[string, string[]]> = [
    ["src/screens/today/TodayScreen.tsx", ["workdayPanel", "nextPanel", "attentionRow"]],
    ["src/screens/route/RouteScreen.tsx", ["stopCard"]],
    ["src/screens/manager/ManagerWorkspaceScreen.android.tsx", ["tile", "agentCard"]],
    ["src/screens/manager/ManagerLiveMap.android.tsx", ["section"]],
    ["src/screens/visit/VisitScreen.tsx", ["manualCard", "activeCard", "visitRow"]],
    ["src/screens/visit/VisitWorkspaceScreen.tsx", ["overviewCard", "sectionCard"]],
    ["src/screens/base/RouteContactDetailScreen.android.tsx", ["card"]],
    ["src/screens/week/WeekScreen.tsx", ["phoneDay", "summaryStrip", "monthCalendar"]],
  ]

  it.each(CARDS)("%s raises its blocks off the ground", (file, names) => {
    const source = read(file)
    for (const name of names) expect(styleOf(source, name)).toContain("...fieldTheme.card")
  })
})

describe("no pale fills where words do the job (owner's rule, 2026-10-18)", () => {
  it("«Günü bitir» is outlined like «Fasilə»", () => {
    expect(styleOf(read("src/screens/today/TodayScreen.tsx"), "workdayButtonActive")).not.toContain("primarySoft")
  })

  it("the calendar says «Bu gün», the route's state and the counts in words", () => {
    const week = read("src/screens/week/WeekScreen.tsx")
    for (const name of ["todayTag", "routeStatusChip", "agendaCount"]) expect(styleOf(week, name)).not.toContain("backgroundColor")
    expect(styleOf(week, "openRouteButton")).not.toContain("primarySoft")
  })

  it("an agent's presence and GPS are a dot and words, not a tinted panel", () => {
    const team = read("src/screens/manager/ManagerWorkspaceScreen.android.tsx")
    expect(team).not.toContain("gpsConfig.tint")
    expect(team).toContain("<View style={styles.presencePill}>")
    expect(styleOf(team, "presencePill")).not.toContain("backgroundColor")
  })

  it("the sync chip on the white header is outlined, not filled with the ground's tint", () => {
    expect(styleOf(read("src/components/SyncStatusChip.tsx"), "chipDefault")).toContain("backgroundColor: fieldTheme.color.surface")
  })
})

describe("bold only for names and numbers", () => {
  // 800 renders as Black on Android's Roboto: with it on labels, meta and
  // buttons alike, nothing stood out.
  const FILES = [
    "src/screens/today/TodayScreen.tsx",
    "src/screens/route/RouteScreen.tsx",
    "src/screens/manager/ManagerWorkspaceScreen.android.tsx",
    "src/screens/manager/ManagerLiveMap.android.tsx",
    "src/screens/visit/VisitWorkspaceScreen.tsx",
    "src/screens/base/RouteContactDetailScreen.android.tsx",
    "src/screens/week/WeekScreen.tsx",
  ]

  it.each(FILES)("%s sets no style in the black weights", (file) => {
    const source = read(file)
    const styles = source.slice(source.indexOf("StyleSheet.create("))
    expect(styles.split("\n").filter((line) => /fontWeight: "(800|900)"/.test(line))).toEqual([])
  })
})
