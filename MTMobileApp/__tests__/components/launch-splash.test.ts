import fs from "fs"
import path from "path"
import {
  HOLD_UNTIL,
  MAP_STEP_BACK,
  PINS,
  ROUTE_DURATION,
  ROUTE_START,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  STOPS,
  STREETS,
  TITLE,
  coverScene,
  routeLegs,
  segmentLength,
} from "../../src/components/launch-splash-scene"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * The opening animation the owner chose on 2026-11-01 (mockup «C2, фирменный
 * зелёный»): streets, pins, the route between them, the map steps back, the
 * name. What is held here is the order a person sees, and that it covers any
 * phone and gets out of the way.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

describe("the opening animation", () => {
  it("draws the route through the pins in order, one leg after the other, at one speed", () => {
    const legs = routeLegs()
    expect(legs).toHaveLength(STOPS.length - 1)
    legs.forEach((leg, index) => {
      expect(leg.from).toEqual(STOPS[index])
      expect(leg.to).toEqual(STOPS[index + 1])
      if (index > 0) expect(leg.delay).toBe(legs[index - 1].delay + legs[index - 1].duration)
    })
    expect(legs[0].delay).toBe(ROUTE_START)
    const drawn = legs.reduce((sum, leg) => sum + leg.duration, 0)
    expect(Math.abs(drawn - ROUTE_DURATION)).toBeLessThanOrEqual(legs.length)
    const speeds = legs.map((leg) => segmentLength(leg) / leg.duration)
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.05)
  })

  it("has every pin on the map before the route reaches it, the last one in amber", () => {
    const legs = routeLegs()
    PINS.forEach((pin, index) => {
      const reached = index === 0 ? ROUTE_START : legs[index - 1].delay + legs[index - 1].duration
      expect(pin.delay + 450).toBeLessThanOrEqual(reached)
    })
    expect(PINS[PINS.length - 1].color).toBe("#FAC775")
    expect(new Set(PINS.slice(0, -1).map((pin) => pin.color))).toEqual(new Set(["#FFFFFF"]))
  })

  it("finishes the map before it steps back, and shows the name before the end", () => {
    const legs = routeLegs()
    const routeEnds = legs[legs.length - 1].delay + legs[legs.length - 1].duration
    expect(routeEnds).toBeLessThanOrEqual(MAP_STEP_BACK.delay)
    for (const street of STREETS) expect(street.delay + street.duration).toBeLessThanOrEqual(MAP_STEP_BACK.delay)
    expect(TITLE.delay + TITLE.duration).toBeLessThanOrEqual(HOLD_UNTIL)
    expect(HOLD_UNTIL).toBeLessThanOrEqual(4500)
  })

  it("covers the whole screen of a narrow phone, a wide phone and a tablet, centred", () => {
    for (const [width, height] of [[360, 780], [412, 915], [800, 1280], [915, 412]]) {
      const { scale, offsetX, offsetY } = coverScene(width, height)
      expect(SCENE_WIDTH * scale).toBeGreaterThanOrEqual(width - 0.001)
      expect(SCENE_HEIGHT * scale).toBeGreaterThanOrEqual(height - 0.001)
      expect(offsetX).toBeLessThanOrEqual(0)
      expect(offsetY).toBeLessThanOrEqual(0)
      expect(Math.abs(offsetX * 2 + SCENE_WIDTH * scale - width)).toBeLessThan(0.001)
    }
  })

  it("lies over the app, which starts underneath, and is gone once it has played", () => {
    const app = read("runtime/AndroidApp.tsx")
    expect(app).toContain("{i18nReady ? <AppContent /> : null}")
    expect(app).toContain("{splashDone ? null : <LaunchSplash ready={i18nReady} onDone={endSplash} />}")
    expect(app.indexOf("<LaunchSplash")).toBeGreaterThan(app.indexOf("<AppContent />"))
    const splash = read("components/LaunchSplash.tsx")
    // A tap skips it; «remove animations» gets the still picture.
    expect(splash).toContain("onPress={finish}")
    expect(splash).toContain("AccessibilityInfo.isReduceMotionEnabled()")
    expect(splash).toContain("useNativeDriver: true")
  })

  it("says its line in all three languages", () => {
    expect(mobileResources.ru.launchSplash.tagline).toBe("Ваш день на одной карте")
    expect(mobileResources.az.launchSplash.tagline).toBe("Gününüz bir xəritədə")
    expect(mobileResources.en.launchSplash.tagline).toBe("Your day on one map")
  })
})
