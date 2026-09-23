import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  ASK_AGAIN_AFTER_DAYS,
  lastBatteryPromptAt,
  rememberBatteryPrompt,
  shouldAskBatterySleepExemption,
} from "../../src/services/battery-sleep-prompt"

const DAY = 24 * 60 * 60 * 1_000
const now = Date.parse("2026-09-21T09:00:00.000Z")

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe("when the app may ask to stay awake", () => {
  it("asks once a workday is open and the phone still sleeps", () => {
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: true, lastAskedAt: null, now })).toBe(true)
  })

  /**
   * Owner 2026-09-23: «does every new person have to do this by hand?». The
   * first ask is the setup moment — the first run, before any route.
   */
  it("asks on the very first run, before a day is open", () => {
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: false, lastAskedAt: null, now })).toBe(true)
  })

  it("does not repeat outside a workday once it has asked", () => {
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: false, lastAskedAt: now - 5 * DAY, now })).toBe(false)
  })

  it("never asks again once the exemption is granted", () => {
    expect(shouldAskBatterySleepExemption({ exempt: true, workdayActive: true, lastAskedAt: null, now })).toBe(false)
  })

  /**
   * A week of silence is how the owner's own phone slept for two days
   * (2026-09-22). A refusal now holds for one day, not seven.
   */
  it("asks again the next day while the phone still sleeps", () => {
    expect(ASK_AGAIN_AFTER_DAYS).toBe(1)
    expect(shouldAskBatterySleepExemption({
      exempt: false, workdayActive: true, lastAskedAt: now - DAY / 2, now,
    })).toBe(false)
    expect(shouldAskBatterySleepExemption({
      exempt: false, workdayActive: true, lastAskedAt: now - ASK_AGAIN_AFTER_DAYS * DAY, now,
    })).toBe(true)
  })

  /** A phone whose clock jumped back must not nag every morning. */
  it("is not fooled by a clock that moved backwards", () => {
    expect(shouldAskBatterySleepExemption({
      exempt: false, workdayActive: true, lastAskedAt: now + 5 * DAY, now,
    })).toBe(false)
  })
})

/**
 * The owner removed the explanatory card on 2026-09-21: an agent in a clinic
 * does not need a lecture about Android power management. What stays is one
 * line with the tap that fixes it, shown only while the phone may still sleep
 * (owner 2026-09-23).
 */
describe("where the ask lives", () => {
  const screen = require("fs").readFileSync(
    require("path").resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
    "utf8",
  )

  it("has no explanatory card, only the line with the tap", () => {
    expect(screen).not.toContain("BatterySleepCard")
    expect(screen).not.toContain("batteryCard:")
    expect(screen).toContain("function BatterySleepNotice(")
    expect(screen).toContain("visible={!batteryExempt}")
    for (const key of ["batterySleepTitle", "batterySleepBody", "batterySleepAction"]) {
      expect(screen.match(new RegExp(`${key}: "`, "g"))).toHaveLength(3)
    }
  })

  it("asks on the first screen and again when the workday starts", () => {
    expect(screen).toContain("void askBatteryExemptionOnce(false)")
    const handler = screen.slice(screen.indexOf("const handleStartWorkday"), screen.indexOf("const handleStartWorkday") + 700)
    expect(handler).toContain("await askBatteryExemptionOnce(true)")
    expect(screen).toContain("shouldAskBatterySleepExemption({ exempt, workdayActive, lastAskedAt, now: Date.now() })")
  })
})

describe("remembering the answer", () => {
  it("keeps the moment it asked", async () => {
    expect(await lastBatteryPromptAt()).toBeNull()
    await rememberBatteryPrompt(now)
    expect(await lastBatteryPromptAt()).toBe(now)
  })

  it("treats a damaged value as never asked", async () => {
    await AsyncStorage.setItem("@mtm_battery_prompt_v1", "не число")
    expect(await lastBatteryPromptAt()).toBeNull()
  })
})
