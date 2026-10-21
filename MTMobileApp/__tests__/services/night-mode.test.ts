import fs from "fs"
import path from "path"
import ts from "typescript"
import { followPhoneColorScheme } from "../../src/services/follow-phone-color-scheme"
import {
  FIELD_CARDS,
  FIELD_PALETTES,
  currentFieldColorScheme,
  fieldColorSchemeOf,
  fieldTheme,
  setFieldColorScheme,
  subscribeFieldColorScheme,
  themed,
} from "../../src/theme/fieldTheme"

/**
 * Night mode (owner, 2026-10-18: «он адаптироваться должен под режим
 * смартфонов и планшетов, ночной режим»; mockup approved with «давай»).
 *
 * The app takes the phone's theme, and follows it while open (owner,
 * 2026-10-20: «если я меняю тему на телефоне на светлую, то приложение не
 * меняется на светлую тему»). The first build fixed the colours when the JS
 * started and restarted the JS on a switch — never during a workday, so an
 * agent's phone kept the old theme all day. Now a switch redraws the screens
 * in place: no restart, nothing typed or recorded is lost.
 */

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

/** Runs a check in the night palette and leaves the module in the day one. */
function atNight(check: () => void) {
  setFieldColorScheme("dark")
  try {
    check()
  } finally {
    setFieldColorScheme("light")
  }
}

describe("the palette follows the phone", () => {
  it("reads only «dark» as the night palette", () => {
    expect(fieldColorSchemeOf("dark")).toBe("dark")
    expect(fieldColorSchemeOf("light")).toBe("light")
    expect(fieldColorSchemeOf(null)).toBe("light")
    expect(fieldColorSchemeOf(undefined)).toBe("light")
  })

  it("has every colour in both palettes, and the night one is dark", () => {
    expect(Object.keys(FIELD_PALETTES.dark).sort()).toEqual(Object.keys(FIELD_PALETTES.light).sort())
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(luminance(FIELD_PALETTES.dark.canvas)).toBeLessThan(0.1)
    expect(luminance(FIELD_PALETTES.dark.ink)).toBeGreaterThan(0.8)
    expect(luminance(FIELD_PALETTES.light.canvas)).toBeGreaterThan(0.9)
    // Text on a filled button stays light in both.
    expect(FIELD_PALETTES.dark.onColor).toBe(FIELD_PALETTES.light.onColor)
  })

  /** 3.11.27 on the S23: white «Marşrut yarat» on the night green read at 2.5:1. */
  it("keeps white button text and accent text readable at night", () => {
    const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const dark = FIELD_PALETTES.dark
    expect(contrast(dark.onColor, dark.primaryStrong)).toBeGreaterThanOrEqual(4.5)
    for (const fill of [dark.primary, dark.danger]) {
      expect(contrast(dark.onColor, fill)).toBeGreaterThanOrEqual(3.9)
      expect(contrast(fill, dark.surface)).toBeGreaterThanOrEqual(3.9)
    }
  })
})

describe("a switch while the app is open", () => {
  it("changes every colour read after it, and back", () => {
    setFieldColorScheme("light")
    expect(fieldTheme.color.canvas).toBe(FIELD_PALETTES.light.canvas)
    expect(fieldTheme.card).toEqual(FIELD_CARDS.light)
    atNight(() => {
      expect(currentFieldColorScheme()).toBe("dark")
      expect(fieldTheme.color.canvas).toBe(FIELD_PALETTES.dark.canvas)
      expect(fieldTheme.color.ink).toBe(FIELD_PALETTES.dark.ink)
      expect(fieldTheme.card).toEqual(FIELD_CARDS.dark)
    })
    expect(fieldTheme.color.canvas).toBe(FIELD_PALETTES.light.canvas)
  })

  it("hands out the sheet of the theme the phone is in, built once at import for both", () => {
    let builds = 0
    const styles = themed(() => {
      builds += 1
      return { screen: { backgroundColor: fieldTheme.color.canvas }, card: { ...fieldTheme.card, padding: 12 } }
    })
    expect(builds).toBe(2)
    expect(styles.screen.backgroundColor).toBe(FIELD_PALETTES.light.canvas)
    atNight(() => {
      expect(styles.screen.backgroundColor).toBe(FIELD_PALETTES.dark.canvas)
      expect(styles.card.backgroundColor).toBe(FIELD_CARDS.dark.backgroundColor)
      expect(styles.card.padding).toBe(12)
    })
    expect(styles.screen.backgroundColor).toBe(FIELD_PALETTES.light.canvas)
    // Nothing is built again on a switch.
    expect(builds).toBe(2)
    expect(Object.keys(styles).sort()).toEqual(["card", "screen"])
  })

  /** feedback-tone's colour map inside PhotoCaptureModal's sheet, for one. */
  it("builds a sheet that reads another themed map in the theme being built", () => {
    const tones = themed(() => ({ error: { background: fieldTheme.color.dangerSoft } }))
    const styles = themed(() => ({ failed: { backgroundColor: tones.error.background } }))
    atNight(() => expect(styles.failed.backgroundColor).toBe(FIELD_PALETTES.dark.dangerSoft))
    expect(styles.failed.backgroundColor).toBe(FIELD_PALETTES.light.dangerSoft)
  })

  it("tells the screens once per real switch", () => {
    let told = 0
    const stop = subscribeFieldColorScheme(() => {
      told += 1
    })
    try {
      setFieldColorScheme("light")
      expect(told).toBe(0)
      setFieldColorScheme("dark")
      setFieldColorScheme("dark")
      expect(told).toBe(1)
      setFieldColorScheme("light")
      expect(told).toBe(2)
    } finally {
      stop()
      setFieldColorScheme("light")
    }
  })
})

describe("what tells the app of a switch", () => {
  function fakePhone(start: "light" | "dark") {
    let scheme: "light" | "dark" = start
    let android: "light" | "dark" = start
    const appearanceListeners: ((preferences: { colorScheme: "light" | "dark" | null | undefined }) => void)[] = []
    const appStateListeners: ((state: string) => void)[] = []
    let asked = 0
    return {
      phone: {
        appearance: {
          getColorScheme: () => scheme,
          addChangeListener: (listener: (preferences: { colorScheme: "light" | "dark" | null | undefined }) => void) => {
            appearanceListeners.push(listener)
            return { remove: () => appearanceListeners.splice(appearanceListeners.indexOf(listener), 1) }
          },
        },
        appState: {
          addEventListener: (_event: string, listener: (state: string) => void) => {
            appStateListeners.push(listener)
            return { remove: () => appStateListeners.splice(appStateListeners.indexOf(listener), 1) }
          },
        },
        android: {
          colorScheme: () => {
            asked += 1
            return Promise.resolve(android)
          },
        },
      },
      /** Android told React Native, and Appearance passed it on. */
      switchHeard(next: "light" | "dark") {
        scheme = next
        android = next
        for (const listener of [...appearanceListeners]) listener({ colorScheme: next })
      },
      /** Switched while the app was away, and Appearance never heard of it. */
      switchMissed(next: "light" | "dark") {
        android = next
      },
      returnToApp() {
        for (const listener of [...appStateListeners]) listener("active")
      },
      get asked() {
        return asked
      },
      get listening() {
        return appearanceListeners.length + appStateListeners.length
      },
    }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it("follows a switch the moment Android reports it — no restart, no wait for the workday", () => {
    const phone = fakePhone("light")
    const stop = followPhoneColorScheme(phone.phone as any)
    try {
      expect(currentFieldColorScheme()).toBe("light")
      phone.switchHeard("dark")
      expect(currentFieldColorScheme()).toBe("dark")
      phone.switchHeard("light")
      expect(currentFieldColorScheme()).toBe("light")
    } finally {
      stop()
      setFieldColorScheme("light")
    }
    expect(phone.listening).toBe(0)
  })

  it("starts in the phone's theme", () => {
    const phone = fakePhone("dark")
    const stop = followPhoneColorScheme(phone.phone as any)
    try {
      expect(currentFieldColorScheme()).toBe("dark")
    } finally {
      stop()
      setFieldColorScheme("light")
    }
  })

  it("asks Android again on every return to the app, for a switch Appearance missed", async () => {
    const phone = fakePhone("light")
    const stop = followPhoneColorScheme(phone.phone as any)
    try {
      await settle()
      const before = phone.asked
      phone.switchMissed("dark")
      expect(currentFieldColorScheme()).toBe("light")
      phone.returnToApp()
      await settle()
      expect(phone.asked).toBe(before + 1)
      expect(currentFieldColorScheme()).toBe("dark")
    } finally {
      stop()
      setFieldColorScheme("light")
    }
  })
})

/**
 * What makes a switch reach every screen. A colour read once at import, a
 * screen the navigator holds still, or a list row that is not drawn again
 * would stay in the old theme beside the new one.
 */
describe("the wiring", () => {
  const SRC = path.resolve(__dirname, "../../src")
  const sources: { file: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) sources.push({ file: path.relative(SRC, full), text: fs.readFileSync(full, "utf8") })
    }
  }
  walk(SRC)
  const isFunction = (node: ts.Node) =>
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node)
  /** Calls `visit` for every node evaluated at import, outside a function and outside themed(). */
  const atImport = (text: string, file: string, visit: (node: ts.Node, sf: ts.SourceFile) => void) => {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const walkNode = (node: ts.Node) => {
      if (isFunction(node)) return
      visit(node, sf)
      ts.forEachChild(node, walkNode)
    }
    walkNode(sf)
  }
  const usesTheme = (text: string) => /from "(?:\.\.?\/)+(?:theme\/fieldTheme|components\/feedback-tone|feedback-tone)"/.test(text)

  it("reads no day-or-night colour at import outside themed()", () => {
    const found: string[] = []
    for (const { file, text } of sources) {
      if (file === path.join("theme", "fieldTheme.ts")) continue
      atImport(text, file, (node, sf) => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fieldTheme" && ["color", "card"].includes(node.name.text)) {
          found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
      })
    }
    expect(found).toEqual([])
  })

  it("builds every sheet of a themed file in themed(), so it has a night version", () => {
    const found: string[] = []
    for (const { file, text } of sources) {
      if (!usesTheme(text)) continue
      atImport(text, file, (node, sf) => {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === "StyleSheet.create") {
          found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
      })
    }
    expect(found).toEqual([])
  })

  it("redraws every screen the navigator holds", () => {
    const navigator = read("src/navigation/AppNavigatorAndroidV2.tsx")
    const registered = navigator.match(/component=\{[^}]*\}/g) ?? []
    expect(registered.length).toBeGreaterThan(30)
    expect(registered.filter((entry) => !entry.startsWith("component={withFieldColorScheme("))).toEqual([])
    // The first-run guide follows the navigator through its ref and state callbacks after the theme.
    expect(navigator).toContain("<NavigationContainer theme={NAVIGATION_THEMES[colorScheme]} ")
    expect(navigator).toContain("background: fieldTheme.color.canvas")
  })

  it("redraws the rows of every themed list", () => {
    const found: string[] = []
    let lists = 0
    for (const { file, text } of sources) {
      if (!usesTheme(text) || !file.endsWith("x")) continue
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^(FlatList|SectionList)$/.test(node.tagName.getText(sf))) {
          lists += 1
          const extraData = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sf) === "extraData")
          if (!extraData || !/colorScheme/.test(extraData.getText(sf))) found.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    expect(lists).toBeGreaterThan(5)
    expect(found).toEqual([])
  })

  it("follows the phone from the start of the app, and restarts nothing", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    expect(app).toContain("useEffect(() => followPhoneColorScheme(), [])")
    expect(fs.existsSync(path.resolve(__dirname, "../../src/services/color-scheme-reload.ts"))).toBe(false)
    const native = read("android/app/src/main/java/com/mtmobileapp/FieldAppearanceModule.kt")
    expect(native).not.toContain("reload(")
    expect(native).toContain("Configuration.UI_MODE_NIGHT_MASK")
    expect(read("android/app/src/main/java/com/mtmobileapp/PresentationFilesPackage.kt")).toContain("FieldAppearanceModule(reactContext),")
  })

  it("keeps the activity through a switch, and lets Android not darken the app twice", () => {
    expect(read("android/app/src/main/res/values/styles.xml")).toContain('<item name="android:forceDarkAllowed">false</item>')
    // Android hands the switch to the running activity instead of recreating it.
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain("|uiMode")
  })

  it("keeps the status bar icons light on the night palette, and turns them as the phone switches", () => {
    const bar = read("src/components/LightScreenStatusBar.tsx")
    expect(bar).toContain("const colorScheme = useFieldColorScheme()")
    expect(bar).toContain('if (colorScheme === "dark") return null')
    expect(read("src/runtime/AndroidApp.tsx")).toContain('backgroundColor={colorScheme === "dark" ? fieldTheme.color.surface : fieldTheme.color.primaryStrong}')
  })
})

/**
 * A literal colour in a StyleSheet stays light in the night palette. The
 * tabs of both shells and the parts every screen shares take theirs from
 * fieldTheme; the two kept on purpose are named.
 */
describe("the main screens take every colour from the palette", () => {
  const FILES = [
    "src/screens/today/TodayScreen.tsx",
    "src/screens/week/WeekScreen.tsx",
    "src/screens/tasks/TasksScreen.tsx",
    "src/screens/base/RouteBaseScreen.android.tsx",
    "src/screens/more/MoreScreen.tsx",
    "src/screens/more/NotificationsScreen.tsx",
    "src/screens/manager/ManagerWorkspaceScreen.android.tsx",
    "src/screens/manager/ManagerPlanningCalendarScreen.android.tsx",
    "src/screens/manager/ManagerTeamMessageScreen.android.tsx",
    "src/screens/attendance/AttendanceWorkdayScreen.tsx",
    "src/screens/profile/ProfileScreen.tsx",
    "src/components/SyncStatusChip.tsx",
    "src/components/ConfirmSheet.tsx",
    "src/components/NotificationBell.tsx",
    "src/components/ErrorBoundary.tsx",
    "src/navigation/AppNavigatorAndroidV2.tsx",
  ]
  /** The chip on a green header of the legacy dashboard; the WhatsApp mark is white by brand. */
  const KEPT = ["chipInverse:", "whatsappMark:"]

  it("has no colour literal in their styles", () => {
    const found: string[] = []
    for (const file of FILES) {
      read(file).split("\n").forEach((line, index) => {
        if (/(?:olor|Color)\s*:\s*"(?:#|rgb)/.test(line) && !KEPT.some((kept) => line.includes(kept))) found.push(`${file}:${index + 1}`)
      })
    }
    expect(found).toEqual([])
  })
})
