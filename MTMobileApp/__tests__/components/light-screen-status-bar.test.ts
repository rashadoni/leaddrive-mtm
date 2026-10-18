import fs from "fs"
import path from "path"

/**
 * On the owner's phone (2026-09-13) the status bar on "Təqvim" and "Daha çox"
 * was white on white: the app sets `light-content` for its green headers and,
 * edge-to-edge, the bar has no background of its own. Those two tabs are the
 * ones with a light top; every other tab measured green at y=30.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const component = read("components/LightScreenStatusBar.tsx")

describe("light screens get dark status bar icons", () => {
  it("renders dark-content only while the screen is focused", () => {
    expect(component).toContain("const focused = useIsFocused()")
    expect(component).toContain('return focused ? <StatusBar barStyle="dark-content" /> : null')
  })

  it("leaves the icons light over the rail layout's green status band", () => {
    // Landscape phone, 2026-09-14: the clock was white over the light rail.
    const navigator = read("navigation/AppNavigatorAndroidV2.tsx")
    expect(navigator).toContain("{rail && insets.top > 0 ? <View pointerEvents=\"none\" style={[styles.railStatusBand, { height: insets.top }]} /> : null}")
    expect(component).toContain("if (shouldUseNavigationRail(width, height)) return null")
  })

  /**
   * Since 2026-10-18 every tab's header is white (owner-approved colours: the
   * green stays the accent, not the surface), so every tab turns the icons dark.
   */
  it("is used on every tab of the agent and of the manager", () => {
    const missing: string[] = []
    for (const file of [
      "screens/today/TodayScreen.tsx",
      "screens/week/WeekScreen.tsx",
      "screens/route/RouteScreen.tsx",
      "screens/base/RouteBaseScreen.android.tsx",
      "screens/tasks/TasksScreen.tsx",
      "screens/more/MoreScreen.tsx",
      "screens/manager/ManagerWorkspaceScreen.android.tsx",
      "screens/manager/ManagerPlanningCalendarScreen.android.tsx",
      "screens/attendance/AttendanceWorkdayScreen.tsx",
      "screens/profile/ProfileScreen.tsx",
      "screens/more/NotificationsScreen.tsx",
    ]) {
      const source = read(file)
      if (!source.includes('import LightScreenStatusBar from "../../components/LightScreenStatusBar"')) missing.push(`${file}: import`)
      if (!source.includes("<LightScreenStatusBar />")) missing.push(`${file}: render`)
    }
    expect(missing).toEqual([])
  })

  it("paints no tab header green any more", () => {
    const green: string[] = []
    for (const file of [
      "screens/today/TodayScreen.tsx",
      "screens/route/RouteScreen.tsx",
      "screens/base/RouteBaseScreen.android.tsx",
      "screens/tasks/TasksScreen.tsx",
      "screens/manager/ManagerPlanningCalendarScreen.android.tsx",
      "screens/profile/ProfileScreen.tsx",
      "screens/more/NotificationsScreen.tsx",
    ]) {
      if (/\n  header: \{ ?\n?\s*backgroundColor: fieldTheme\.color\.primaryStrong/.test(read(file))) green.push(file)
    }
    expect(green).toEqual([])
    expect(read("screens/attendance/AttendanceWorkdayScreen.tsx")).toContain("header: { backgroundColor: fieldTheme.color.surface")
  })
})
