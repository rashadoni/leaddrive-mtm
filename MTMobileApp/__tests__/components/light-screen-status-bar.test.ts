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
    expect(navigator).toContain("{tablet && insets.top > 0 ? <View pointerEvents=\"none\" style={[styles.railStatusBand, { height: insets.top }]} /> : null}")
    expect(component).toContain("if (isTabletWidth(width)) return null")
  })

  it("is used on both light-topped tabs", () => {
    const missing: string[] = []
    for (const file of ["screens/week/WeekScreen.tsx", "screens/more/MoreScreen.tsx"]) {
      const source = read(file)
      if (!source.includes('import LightScreenStatusBar from "../../components/LightScreenStatusBar"')) missing.push(`${file}: import`)
      if (!source.includes("<LightScreenStatusBar />")) missing.push(`${file}: render`)
    }
    expect(missing).toEqual([])
  })
})
