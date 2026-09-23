import fs from "fs"
import path from "path"
import { ASK_AGAIN_AFTER_DAYS, shouldAskBatterySleepExemption } from "../../src/services/battery-sleep-prompt"

/**
 * Owner 2026-09-23: «does every new person have to do this by hand? can it not
 * be automatic?». Android only grants this on a tap, so the app asks on the
 * first run, then daily while a day is open, and keeps the tap on screen.
 */
const DAY = 24 * 60 * 60 * 1_000
const now = Date.parse("2026-09-23T08:00:00.000Z")

describe("asking to be left awake", () => {
  it("asks on the first run, before any workday", () => {
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: false, lastAskedAt: null, now })).toBe(true)
  })

  it("asks again a day later while a day is open, and never once granted", () => {
    expect(ASK_AGAIN_AFTER_DAYS).toBe(1)
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: true, lastAskedAt: now - DAY, now })).toBe(true)
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: true, lastAskedAt: now - DAY / 2, now })).toBe(false)
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: false, lastAskedAt: now - DAY, now })).toBe(false)
    expect(shouldAskBatterySleepExemption({ exempt: true, workdayActive: true, lastAskedAt: null, now })).toBe(false)
    // A clock jumped backwards is not a reason to ask every morning.
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: true, lastAskedAt: now + DAY, now })).toBe(false)
  })

  it("keeps the one tap on the route screen while the phone may sleep", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
    expect(screen).toContain("function BatterySleepNotice(")
    expect(screen).toContain("visible={!batteryExempt}")
    expect(screen).toContain("void askBatteryExemptionOnce(false)")
    expect(screen).toContain("await askBatteryExemptionOnce(true)")
    for (const key of ["batterySleepTitle", "batterySleepBody", "batterySleepAction"]) {
      expect(screen.match(new RegExp(`${key}: "`, "g"))?.length).toBe(3)
    }
  })
})
