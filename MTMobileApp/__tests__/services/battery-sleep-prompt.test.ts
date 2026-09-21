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

  /** Out of context the dialog is dismissed, and dismissed answers are final. */
  it("stays quiet before the day starts", () => {
    expect(shouldAskBatterySleepExemption({ exempt: false, workdayActive: false, lastAskedAt: null, now })).toBe(false)
  })

  it("never asks again once the exemption is granted", () => {
    expect(shouldAskBatterySleepExemption({ exempt: true, workdayActive: true, lastAskedAt: null, now })).toBe(false)
  })

  it("respects a refusal for a week and then asks once more", () => {
    expect(shouldAskBatterySleepExemption({
      exempt: false, workdayActive: true, lastAskedAt: now - DAY, now,
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
 * does not need a lecture about Android power management. The ask now happens
 * once, silently, where the agent has just said "I am working".
 */
describe("where the ask lives", () => {
  const screen = require("fs").readFileSync(
    require("path").resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
    "utf8",
  )

  it("has no card and no copy explaining Doze to the agent", () => {
    expect(screen).not.toContain("BatterySleepCard")
    expect(screen).not.toContain("batterySleepTitle")
    expect(screen).not.toContain("batteryCard:")
  })

  it("asks once, right after the workday starts", () => {
    const handler = screen.slice(screen.indexOf("const handleStartWorkday"), screen.indexOf("const handleStartWorkday") + 700)
    expect(handler).toContain("await askBatteryExemptionOnce()")
    expect(screen).toContain("shouldAskBatterySleepExemption({ exempt, workdayActive: true, lastAskedAt, now: Date.now() })")
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
