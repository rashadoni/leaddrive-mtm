jest.mock("../../src/services/api", () => ({ api: {} }))
jest.mock("../../src/i18n/index.android", () => ({ initI18n: jest.fn(async () => {}) }))
jest.mock("../../src/services/location.android", () => ({
  forgetTrackingResume: jest.fn(),
  runTrackingUntilStopped: jest.fn(async () => {}),
  setTrackingWorkdayId: jest.fn(),
}))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn().mockResolvedValue([]),
  enqueueOutboxOperation: jest.fn().mockResolvedValue(undefined),
}))

import { resumableWorkdayId } from "../../src/services/tracking-resume"
import { workdayKey } from "../../src/store/workday"

/**
 * After a restart nothing of the app is loaded; the task decides from storage
 * with the app's own rule whether the day is still being recorded.
 */
describe("which workday a restart brings back", () => {
  const agent = { id: "a1", organizationId: "o1", role: "AGENT" }
  const workday = { key: workdayKey("o1", "a1"), workdayId: "wd-1", startedAt: "2026-09-20T01:48:00.000Z", syncState: "CONFIRMED" as const }

  it("is the agent's own confirmed workday that is not on a break", () => {
    expect(resumableWorkdayId({ loggedIn: true, agent, workday })).toBe("wd-1")
  })

  it("is none when signed out, not an agent, on a break, unconfirmed or someone else's", () => {
    expect(resumableWorkdayId({ loggedIn: false, agent, workday })).toBeNull()
    expect(resumableWorkdayId({ loggedIn: true, agent: { ...agent, role: "MANAGER" }, workday })).toBeNull()
    expect(resumableWorkdayId({ loggedIn: true, agent, workday: { ...workday, paused: true } })).toBeNull()
    expect(resumableWorkdayId({ loggedIn: true, agent, workday: { ...workday, syncState: "FINISH_PENDING" } })).toBeNull()
    expect(resumableWorkdayId({ loggedIn: true, agent: { ...agent, id: "a2" }, workday })).toBeNull()
    expect(resumableWorkdayId({ loggedIn: true, agent, workday: null })).toBeNull()
  })
})
