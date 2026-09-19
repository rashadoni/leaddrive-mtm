import fs from "fs"
import path from "path"
import { SHORT_WINDOW_HEIGHT, isShortWindow } from "../../src/theme/layoutBreakpoints"

/**
 * Galaxy S23 held in landscape, window 823×384 dp (2026-09-14). Four screens
 * kept a tall header pinned above their scroll, and the content scrolled in
 * what was left: «Təqvim» 46% header, «GPS tarixçəm» 51%, «Ziyarətin yekunu»
 * 36%, «Müştərilər» with its tabs 54%. The owner's rule is one scrolling page —
 * the header moves away with the content. On a short window each of them now
 * draws the header as the first thing inside its scroll container; taller
 * windows keep the pinned header exactly as before.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const between = (source: string, from: string, to: string) => {
  const start = source.indexOf(from)
  return start < 0 ? "" : source.slice(start, source.indexOf(to, start))
}

describe("a short window cannot spare a pinned header", () => {
  it("counts a phone on its side as short and anything upright as tall", () => {
    expect(isShortWindow(384)).toBe(true)
    expect(isShortWindow(686)).toBe(false)
    expect(isShortWindow(SHORT_WINDOW_HEIGHT - 1)).toBe(true)
    expect(isShortWindow(SHORT_WINDOW_HEIGHT)).toBe(false)
  })

  it.each([
    "screens/week/WeekScreen.tsx",
    "screens/gps/GpsHistoryScreen.tsx",
    "screens/visit/VisitWorkspaceScreen.tsx",
    "screens/base/RouteBaseScreen.android.tsx",
  ])("%s decides on the window height and pins the header only when tall", (file) => {
    const source = read(file)
    expect(source).toMatch(/import \{[^}]*\bisShortWindow\b[^}]*\} from "\.\.\/\.\.\/theme\/layoutBreakpoints"/)
    expect(source).toContain("const { width, height } = useWindowDimensions()")
    expect(source).toContain("const short = isShortWindow(height)")
    expect(source).toContain("{short ? null : header}")
  })
})

describe("route date picker fits a short landscape window", () => {
  const planner = read("screens/planning/PlanningWorkspaceCore.android.tsx")

  it("uses fixed-height calendar rows instead of seven wide squares", () => {
    expect(planner).toContain("const shortWindow = isShortWindow(height)")
    expect(planner).toContain("shortWindow && styles.dateSheetShort")
    expect(planner).toContain("shortWindow && styles.monthCellShort")
    expect(planner).toContain("monthCellShort: { height: 38, aspectRatio: undefined }")
  })
})

describe("Təqvim: the header is the first row of the week", () => {
  const week = read("screens/week/WeekScreen.tsx")

  it("puts the header inside the week's ScrollView, above the summary", () => {
    const scroll = between(week, "<ScrollView\n          ref={scrollRef}", "</ScrollView>")
    const header = scroll.indexOf("{short ? <View style={tablet ? styles.headerInScrollTablet : styles.headerInScroll}>{header}</View> : null}")
    expect(header).toBeGreaterThan(-1)
    expect(scroll.indexOf("<WeekSummary")).toBeGreaterThan(header)
  })

  it("keeps the header with the loading, error and empty panels", () => {
    expect(week.match(/<ShortWindowPage short=\{short\} header=\{header\}>/g)).toHaveLength(3)
  })
})

describe("GPS tarixçəm: the header and day switcher scroll with the day", () => {
  const gps = read("screens/gps/GpsHistoryScreen.tsx")

  it("puts the header at the top of the one list, above the map and summary", () => {
    const listHeader = between(gps, "ListHeaderComponent={(", ")}")
    const header = listHeader.indexOf("{short ? <View style={styles.headerInScroll}>{header}</View> : null}")
    expect(header).toBeGreaterThan(-1)
    expect(listHeader.indexOf("{overview}")).toBeGreaterThan(header)
  })

  it("keeps the header in the empty, failure and loading branches", () => {
    const empty = between(gps, "contentContainerStyle={styles.emptyScroll}", "</ScrollView>")
    expect(empty).toContain("{short ? <View style={styles.headerInScroll}>{header}</View> : null}")
    const failure = between(gps, "} else if (!data) {", "} else if (data.points.length === 0) {")
    expect(failure).toContain("{short ? header : null}")
    const loading = between(gps, "if (loading && !data) {", "} else if (!data) {")
    expect(loading).toContain("<ShortWindowPage short={short} header={header}>")
  })

  it("does not add a scroll around the map: the map stays in the list it was in", () => {
    const header = between(gps, "  const header = (", "  let content: React.ReactNode")
    expect(header).not.toContain("<WebView")
    expect(gps.match(/<WebView\b/g)).toHaveLength(1)
  })

  it("keeps the status bar readable once the green header has gone", () => {
    expect(gps).toContain('import StatusBarBand from "../../components/StatusBarBand"')
    expect(gps).toContain("{short ? <StatusBarBand /> : null}")
  })
})

describe("Ziyarətin yekunu: the header scrolls with the summary", () => {
  const visit = read("screens/visit/VisitWorkspaceScreen.tsx")

  it("puts the header inside the ScrollView, above the content", () => {
    const scroll = between(visit, "<ScrollView", "</ScrollView>")
    const header = scroll.indexOf("{short ? <View style={styles.headerInScroll}>{header}</View> : null}")
    expect(header).toBeGreaterThan(-1)
    expect(scroll.indexOf("<View style={styles.content}>")).toBeGreaterThan(header)
  })

  it("keeps the header with the loading and error panels", () => {
    expect(visit.match(/<ShortWindowPage short=\{short\} header=\{header\}>/g)).toHaveLength(2)
    expect(visit).toContain(") : short ? header : null}")
  })

  it("keeps the status bar readable once the green header has gone", () => {
    expect(visit).toContain('import StatusBarBand from "../../components/StatusBarBand"')
    expect(visit).toContain("{short ? <StatusBarBand /> : null}")
  })
})

describe("Müştərilər: header, tabs and search are the list's first rows", () => {
  const base = read("screens/base/RouteBaseScreen.android.tsx")
  const lists = [
    ["screens/base/RouteOrganizationExplorerScreen.android.tsx", "route-organizations-search"],
    ["screens/base/RouteContactsList.android.tsx", "route-contacts-search"],
  ] as const

  it("hands the header to the list on a short window", () => {
    expect(base).toContain("<RouteOrganizationExplorerScreen header={short ? header : undefined} />")
    expect(base).toContain("<RouteContactsList header={short ? header : undefined} />")
    const header = between(base, "  const header = (", "\n  return (")
    expect(header).toContain('accessibilityRole="tab"')
    expect(base).toContain("{short ? <StatusBarBand /> : null}")
  })

  it.each(lists)("%s draws the header and search in ListHeaderComponent", (file, searchId) => {
    const source = read(file)
    expect(source).toContain("ListHeaderComponent={header ? <View style={styles.headerInList}>{header}{topArea}</View> : null}")
    expect(source).toContain("{header ? null : topArea}")
    const topArea = between(source, "  const topArea = (", "\n  return (")
    expect(topArea).toContain(`testID="${searchId}"`)
  })

  it.each(lists)("%s passes elements, so the search keeps focus while typing", (file) => {
    // A component declared in render is a new type every keystroke: React
    // would remount the TextInput and close the keyboard after each letter.
    const source = read(file)
    expect(source).not.toMatch(/ListHeaderComponent=\{\(\) =>/)
    expect(source).not.toMatch(/const TopArea\b|function TopArea\b/)
  })
})
