/**
 * «Начать визит — секунд 6» (owner, 2026-11-13): the question «with a
 * manager?» waited up to 2.5 s for the server AFTER the GPS reading. The press
 * now starts that request first; the question takes its answer instead of
 * asking again — while it is younger than half a minute.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)
const mockGetJointVisitManagers = jest.fn(async () => ({ data: { managers: [] } }))
jest.mock("../../src/services/api", () => ({ api: { getJointVisitManagers: () => mockGetJointVisitManagers() } }))
jest.mock("../../src/services/app-feedback", () => ({ ask: jest.fn() }))
jest.mock("../../src/services/joint-visit", () => ({
  ...jest.requireActual("../../src/services/joint-visit"),
  jointManagersForCheckIn: async (fetchManagers: () => Promise<unknown>) => { await fetchManagers(); return [] },
  cachedJointPlans: async () => [],
  plannedManagersAt: () => [],
}))

import { askJointManagerForCheckIn, prefetchJointManagersForCheckIn } from "../../src/services/joint-visit-check-in"

const t = ((key: string) => key) as never

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date("2026-11-13T10:00:00.000Z"))
  mockGetJointVisitManagers.mockClear()
})
afterEach(() => jest.useRealTimers())

it("asks the server once per press: the prefetched answer is the question's", async () => {
  prefetchJointManagersForCheckIn()
  expect(mockGetJointVisitManagers).toHaveBeenCalledTimes(1)
  await expect(askJointManagerForCheckIn(t, { customerId: "c1" })).resolves.toEqual({ proceed: true })
  expect(mockGetJointVisitManagers).toHaveBeenCalledTimes(1)

  // Used once: the next check-in asks afresh.
  await askJointManagerForCheckIn(t, { customerId: "c1" })
  expect(mockGetJointVisitManagers).toHaveBeenCalledTimes(2)
})

it("does not trust a prefetch older than half a minute", async () => {
  prefetchJointManagersForCheckIn()
  jest.setSystemTime(new Date("2026-11-13T10:00:31.000Z"))
  await askJointManagerForCheckIn(t, { customerId: "c1" })
  expect(mockGetJointVisitManagers).toHaveBeenCalledTimes(2)
})
