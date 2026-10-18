jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)

import fs from "fs"
import path from "path"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { mobileResources } from "../../src/i18n/mobile-resources"
import {
  GUIDE_HOME,
  GUIDE_PATH,
  GUIDE_TOURS,
  focusedRouteName,
  guideBubblePlacement,
  guideNavigation,
  guideRectVisible,
  guideStepDone,
  guideTourForShell,
  type GuideTourId,
} from "../../src/guide/tour"
import { armGuideAfterSignIn, guideDue, guideTargetSpot, useGuideStore } from "../../src/store/guide"

/**
 * Owner, 2026-10-18: «для пользователей, которые первый раз вошли, пошаговый
 * гид как в играх — для чего, куда нажимать, максимально интерактивно». The
 * mockup was approved the same day: the screen dimmed, the real control lit,
 * «Addım 2 / 8», «Keç» and «Növbəti», a step done by a real press.
 */

const TOURS: GuideTourId[] = ["field", "manager"]
const LOCALES = ["ru", "en", "az"] as const
const SRC = path.resolve(__dirname, "../../src")

function guideCopy(locale: typeof LOCALES[number]): Record<string, unknown> {
  return (mobileResources[locale] as unknown as Record<string, Record<string, unknown>>).guide
}

function leaf(copy: Record<string, unknown>, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), copy)
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe("the order of the tours", () => {
  it("walks the field agent through «Bu gün», the route, a visit, tasks, the bell and «Daha çox»", () => {
    expect(GUIDE_TOURS.field.map((step) => `${step.kind}:${step.screen}`)).toEqual([
      "look:Today",
      "tap:Today",
      "look:Route",
      "tap:Route",
      "tap:Tasks",
      "look:Notifications",
      "tap:Tasks",
      "look:MoreHome",
    ])
  })

  it("walks the manager through «Komanda», «Təsdiqlər», «Planlama», «Komandaya yaz» and the bell", () => {
    const ids = GUIDE_TOURS.manager.map((step) => step.id)
    expect(ids).toEqual(["tiles", "writeTeam", "approvalsTab", "approvals", "planningTab", "createRoute", "bell", "feed", "moreTab", "again"])
    expect(GUIDE_TOURS.manager.map((step) => step.screen)).toEqual([
      "Team", "Team", "Team", "Approvals", "Approvals", "Planning", "Planning", "Notifications", "Planning", "More",
    ])
  })

  it("opens on the tab each shell starts on", () => {
    for (const tour of TOURS) expect(GUIDE_TOURS[tour][0].screen).toBe(GUIDE_HOME[tour])
    expect(GUIDE_HOME).toEqual({ field: "Today", manager: "Team" })
  })

  it("lands every real press where the next step lives", () => {
    for (const tour of TOURS) {
      const steps = GUIDE_TOURS[tour]
      steps.forEach((step, index) => {
        if (step.kind !== "tap") return
        expect(step.goal).toBe(steps[index + 1].screen)
      })
    }
  })

  it("never asks for a press that changes data: those controls are only looked at", () => {
    const pressed = TOURS.flatMap((tour) => GUIDE_TOURS[tour].filter((step) => step.kind === "tap").map((step) => step.spot))
    expect(pressed).toEqual(["tab.Route", "tab.Tasks", "bell", "tab.More", "tab.Approvals", "tab.Planning", "bell", "tab.More"])
    expect(pressed).not.toContain("today.workday")
    expect(pressed).not.toContain("route.first")
    expect(pressed).not.toContain("approvals.first")
  })

  it("ends on «Bələdçi», where the tour opens again", () => {
    expect(GUIDE_TOURS.field[GUIDE_TOURS.field.length - 1].spot).toBe("more.guide")
    expect(GUIDE_TOURS.manager[GUIDE_TOURS.manager.length - 1].spot).toBe("profile.guide")
  })

  it("gives the field agent and the manager a tour, and office staff none", () => {
    expect(guideTourForShell("field")).toBe("field")
    expect(guideTourForShell("manager")).toBe("manager")
    expect(guideTourForShell("office")).toBeNull()
    expect(guideTourForShell("blocked")).toBeNull()
  })
})

describe("every control a step points at is marked on its screen", () => {
  const source = sourceFiles(SRC).map((file) => fs.readFileSync(file, "utf8")).join("\n")

  it("has a GuideSpot for every spot of both tours", () => {
    const missing: string[] = []
    for (const tour of TOURS) {
      for (const step of GUIDE_TOURS[tour]) {
        const marked = step.spot.startsWith("tab.")
          ? source.includes("spot={`tab.${name}`}")
          : source.includes(`id="${step.spot}"`) || source.includes(`spot="${step.spot}"`)
        if (!marked) missing.push(`${tour}.${step.id}: ${step.spot}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("lights the tab bar's own buttons and the bell of every screen", () => {
    const navigator = fs.readFileSync(path.join(SRC, "navigation/AppNavigatorAndroidV2.tsx"), "utf8")
    expect(navigator).toContain("tabBarButton: (props: BottomTabBarButtonProps) => <GuideTabButton {...props} spot={`tab.${name}`} />")
    // The tab bar puts each button in its own tab's focus: the spot ignores it (guide-spot-focus.test.tsx).
    expect(fs.readFileSync(path.join(SRC, "components/guide/GuideTabButton.tsx"), "utf8")).toContain("<GuideSpot id={spot} anyScreen />")
    const bell = fs.readFileSync(path.join(SRC, "components/NotificationBell.tsx"), "utf8")
    expect(bell).toContain('<GuideSpot id="bell" />')
  })

  it("lies over the navigator, follows its focused route and stays under the app's notices", () => {
    const navigator = fs.readFileSync(path.join(SRC, "navigation/AppNavigatorAndroidV2.tsx"), "utf8")
    expect(navigator).toContain("<NavigationContainer ref={navigationRef} onReady={followRoute} onStateChange={followRoute}>")
    expect(navigator.indexOf("{isLoggedIn ? <GuideOverlay /> : null}")).toBeGreaterThan(navigator.indexOf("</Stack.Navigator>"))
    const app = fs.readFileSync(path.join(SRC, "runtime/AndroidApp.tsx"), "utf8")
    expect(app.indexOf("<AppFeedbackHost />")).toBeGreaterThan(app.indexOf("<AppNavigatorAndroidV2 />"))
  })

  it("covers a control it only explains, so the tour never starts a day or a visit", () => {
    const overlay = fs.readFileSync(path.join(SRC, "components/guide/GuideOverlay.tsx"), "utf8")
    expect(overlay).toContain('{look ? <View testID="guide-block" onStartShouldSetResponder={block}')
    expect(overlay).toContain('BackHandler.addEventListener("hardwareBackPress", () => true)')
  })

  it("opens again from «Daha çox» and from the profile", () => {
    const more = fs.readFileSync(path.join(SRC, "screens/more/MoreScreen.tsx"), "utf8")
    const profile = fs.readFileSync(path.join(SRC, "screens/profile/ProfileScreen.tsx"), "utf8")
    expect(more).toContain('<GuideButton tour="field" spot="more.guide" />')
    expect(profile).toContain('<GuideButton tour="manager" spot="profile.guide" />')
    expect(profile).toContain('<GuideButton tour={guideTour} variant="card"')
  })
})

describe("the guide's words", () => {
  it("says every step in Azerbaijani, Russian and English", () => {
    const missing: string[] = []
    for (const locale of LOCALES) {
      const copy = guideCopy(locale)
      for (const tour of TOURS) {
        for (const step of GUIDE_TOURS[tour]) {
          const keys = ["title", "body", ...(step.kind === "tap" ? ["tap"] : []), ...Array.from({ length: step.lines ?? 0 }, (_, index) => `line${index + 1}`)]
          for (const key of keys) {
            const value = leaf(copy, `${tour}.${step.id}.${key}`)
            if (typeof value !== "string" || !value.trim()) missing.push(`${locale}.${tour}.${step.id}.${key}`)
          }
        }
      }
      for (const key of ["open", "openTitle", "openNote", "openAction", "welcomeTitle", "welcomeTitleNoName", "welcomeBody", "start", "skip", "next", "finish", "stepOf", "pathVisit", "pathBell", "missing"]) {
        const value = leaf(copy, key)
        if (typeof value !== "string" || !value.trim()) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("keeps the three dictionaries in step", () => {
    const keys = (node: unknown, prefix = ""): string[] => Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      value && typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key.replace(/_(one|few|many|other)$/, "")}`])
    const [ru, en, az] = LOCALES.map((locale) => [...new Set(keys(guideCopy(locale)))].sort())
    expect(en).toEqual(ru)
    expect(az).toEqual(ru)
  })

  it("numbers the step the way the approved mockup did", () => {
    expect(leaf(guideCopy("az"), "stepOf")).toBe("Addım {{step}} / {{total}}")
    expect(leaf(guideCopy("ru"), "stepOf")).toBe("Шаг {{step}} из {{total}}")
    expect(leaf(guideCopy("en"), "stepOf")).toBe("Step {{step}} of {{total}}")
    expect([leaf(guideCopy("az"), "skip"), leaf(guideCopy("az"), "next"), leaf(guideCopy("az"), "start")]).toEqual(["Keç", "Növbəti", "Başlayaq"])
  })

  it("declines the length of the tour in Russian", () => {
    const copy = guideCopy("ru")
    expect(leaf(copy, "welcomeLength_many")).toBe("{{count}} шагов · около минуты")
    expect(leaf(copy, "welcomeLength_few")).toBe("{{count}} шага · около минуты")
    expect(leaf(copy, "welcomeLength_one")).toBe("{{count}} шаг · около минуты")
  })

  it("names the welcome card's places with words the app already uses", () => {
    for (const locale of LOCALES) {
      for (const tour of TOURS) {
        for (const key of GUIDE_PATH[tour]) {
          const value = key.startsWith("guide.")
            ? leaf(guideCopy(locale), key.slice("guide.".length))
            : leaf(mobileResources[locale] as unknown as Record<string, unknown>, key)
          expect(typeof value).toBe("string")
        }
      }
    }
  })
})

describe("how the guide moves between screens", () => {
  it("counts a tap step only when its screen opened", () => {
    const routeTab = GUIDE_TOURS.field[1]
    expect(guideStepDone(routeTab, "Today")).toBe(false)
    expect(guideStepDone(routeTab, "Route")).toBe(true)
    expect(guideStepDone(GUIDE_TOURS.field[0], "Today")).toBe(false)
  })

  it("goes back to the tabs instead of stacking a second set of them", () => {
    expect(guideNavigation("Tasks")).toEqual({ name: "Main", params: { screen: "Tasks" }, pop: true })
    expect(guideNavigation("Team")).toEqual({ name: "Main", params: { screen: "Team" }, pop: true })
    expect(guideNavigation("MoreHome")).toEqual({ name: "Main", params: { screen: "More", params: { screen: "MoreHome", pop: true } }, pop: true })
    expect(guideNavigation("Notifications")).toEqual({ name: "Notifications" })
  })

  it("reads the deepest focused route", () => {
    const state = {
      index: 0,
      routes: [{ name: "Main", state: { index: 5, routes: [{ name: "Today" }, { name: "Calendar" }, { name: "Route" }, { name: "Clients" }, { name: "Tasks" }, { name: "More", state: { index: 0, routes: [{ name: "MoreHome" }] } }] } }],
    }
    expect(focusedRouteName(state)).toBe("MoreHome")
    expect(focusedRouteName({ index: 1, routes: [{ name: "Main" }, { name: "Notifications" }] })).toBe("Notifications")
    expect(focusedRouteName(undefined)).toBeNull()
  })
})

describe("where the bubble stands", () => {
  const phone = { width: 384, height: 823, top: 30, bottom: 16 }

  it("goes under a control at the top and points at it", () => {
    const bell = { x: 316, y: 40, width: 56, height: 56 }
    const placement = guideBubblePlacement(bell, phone, 220)
    expect(placement.side).toBe("below")
    expect(placement.top).toBe(96 + 14)
    expect(placement.left + placement.arrowX).toBe(344)
  })

  it("goes over a tab at the bottom", () => {
    const tab = { x: 128, y: 750, width: 64, height: 62 }
    const placement = guideBubblePlacement(tab, phone, 220)
    expect(placement.side).toBe("above")
    expect(placement.bottom).toBe(823 - 750 + 14)
    expect(placement.left + placement.arrowX).toBe(160)
  })

  it("leaves the finger room between a tab and the bubble", () => {
    const tab = { x: 128, y: 750, width: 64, height: 62 }
    expect(guideBubblePlacement(tab, phone, 220, 64).bottom).toBe(823 - 750 + 64)
  })

  it("stands in the middle when the control was not found", () => {
    const placement = guideBubblePlacement(null, phone, 200)
    expect(placement.side).toBe("center")
    expect(placement.top).toBe((823 - 200) / 2)
    expect(placement.left).toBe((384 - placement.width) / 2)
  })

  it("keeps the bubble inside a phone and a tablet", () => {
    expect(guideBubblePlacement(null, phone).width).toBe(384 - 28)
    expect(guideBubblePlacement(null, { width: 1280, height: 800, top: 24, bottom: 0 }).width).toBe(440)
  })

  it("only points at a control that is on the screen and has a size", () => {
    expect(guideRectVisible({ x: 10, y: 900, width: 100, height: 40 }, phone)).toBe(false)
    expect(guideRectVisible({ x: 10, y: 100, width: 0, height: 0 }, phone)).toBe(false)
    expect(guideRectVisible(null, phone)).toBe(false)
    expect(guideRectVisible({ x: 10, y: 100, width: 100, height: 40 }, phone)).toBe(true)
  })
})

describe("once per person, after a sign-in", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const stored = async (scope: string) => JSON.parse((await AsyncStorage.getItem(`@mtm_guide_v1:${scope}`)) ?? "{}")

  beforeEach(async () => {
    await AsyncStorage.clear()
    useGuideStore.setState({ scope: null, record: {}, loaded: false, armedScope: null, run: null, route: null, spots: {} })
  })

  it("is due for a person who just signed in", async () => {
    armGuideAfterSignIn("org-1:agent-1")
    await useGuideStore.getState().load("org-1:agent-1")
    expect(guideDue(useGuideStore.getState(), "org-1:agent-1", "field")).toBe(true)
    await settle()
    expect(await stored("org-1:agent-1")).toEqual({ pending: true })
  })

  it("is not due for a session restored at start: an update does not replay the tour", async () => {
    await useGuideStore.getState().load("org-1:agent-1")
    expect(guideDue(useGuideStore.getState(), "org-1:agent-1", "field")).toBe(false)
  })

  it("survives a restart between the sign-in and the tour", async () => {
    await AsyncStorage.setItem("@mtm_guide_v1:org-1:agent-1", JSON.stringify({ pending: true }))
    await useGuideStore.getState().load("org-1:agent-1")
    expect(guideDue(useGuideStore.getState(), "org-1:agent-1", "field")).toBe(true)
  })

  it("is not due again once finished or skipped, also after the next sign-in", async () => {
    for (const outcome of ["finished", "skipped"] as const) {
      const scope = `org-1:${outcome}`
      armGuideAfterSignIn(scope)
      await useGuideStore.getState().load(scope)
      useGuideStore.getState().start(scope, "field", { welcome: true })
      expect(guideDue(useGuideStore.getState(), scope, "field")).toBe(false)
      useGuideStore.getState().end(outcome)
      await settle()
      await settle()
      expect(await stored(scope)).toEqual({ field: outcome })
      armGuideAfterSignIn(scope)
      await useGuideStore.getState().load(scope)
      expect(guideDue(useGuideStore.getState(), scope, "field")).toBe(false)
    }
  })

  it("keeps each person apart on a shared phone", async () => {
    armGuideAfterSignIn("org-1:first")
    await useGuideStore.getState().load("org-1:first")
    useGuideStore.getState().start("org-1:first", "field")
    useGuideStore.getState().end("finished")
    await settle()
    await settle()
    armGuideAfterSignIn("org-1:second")
    await useGuideStore.getState().load("org-1:second")
    expect(guideDue(useGuideStore.getState(), "org-1:second", "field")).toBe(true)
    expect(guideDue(useGuideStore.getState(), "org-1:first", "field")).toBe(false)
  })

  it("keeps the sign-in's mark when storage answers after it", async () => {
    const loading = useGuideStore.getState().load("org-1:agent-1")
    armGuideAfterSignIn("org-1:agent-1")
    await loading
    expect(useGuideStore.getState().record.pending).toBe(true)
  })

  it("reads a broken record as none", async () => {
    await AsyncStorage.setItem("@mtm_guide_v1:org-1:agent-1", "{oops")
    await useGuideStore.getState().load("org-1:agent-1")
    expect(useGuideStore.getState().record).toEqual({})
  })
})

describe("a run of the tour", () => {
  beforeEach(() => {
    useGuideStore.setState({ scope: "org-1:agent-1", record: {}, loaded: true, armedScope: null, run: null, route: null, spots: {} })
  })

  it("starts on the welcome card when it opens by itself and on step one from «Bələdçi»", () => {
    useGuideStore.getState().start("org-1:agent-1", "field", { welcome: true })
    expect(useGuideStore.getState().run?.step).toBe(-1)
    expect(guideTargetSpot(useGuideStore.getState())).toBeNull()
    useGuideStore.getState().start("org-1:agent-1", "manager")
    expect(useGuideStore.getState().run?.step).toBe(0)
    expect(guideTargetSpot(useGuideStore.getState())).toBe("team.tiles")
  })

  it("finishes after the last step", () => {
    useGuideStore.getState().start("org-1:agent-1", "field")
    for (let step = 0; step < GUIDE_TOURS.field.length; step++) useGuideStore.getState().next()
    expect(useGuideStore.getState().run).toBeNull()
    expect(useGuideStore.getState().record.field).toBe("finished")
  })

  it("keeps the place of the control that reported it last, and forgets it only for that one", () => {
    useGuideStore.getState().reportSpot("bell", 1, { x: 1, y: 2, width: 3, height: 4 })
    useGuideStore.getState().reportSpot("bell", 2, { x: 5, y: 6, width: 7, height: 8 })
    useGuideStore.getState().dropSpot("bell", 1)
    expect(useGuideStore.getState().spots.bell).toEqual({ x: 5, y: 6, width: 7, height: 8, owner: 2 })
    useGuideStore.getState().dropSpot("bell", 2)
    expect(useGuideStore.getState().spots.bell).toBeUndefined()
  })
})
