jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { workdayKey } from "../../src/store/workday"

describe("workday identity", () => {
  it("isolates an active workday by tenant and user", () => {
    expect(workdayKey("tenant-a", "agent-a")).toBe("tenant-a:agent-a")
    expect(workdayKey("tenant-a", "agent-a")).not.toBe(workdayKey("tenant-b", "agent-a"))
    expect(workdayKey("tenant-a", "agent-a")).not.toBe(workdayKey("tenant-a", "agent-b"))
  })

  it("uses explicit safe placeholders for missing identity", () => {
    expect(workdayKey(null, undefined)).toBe("unknown-tenant:unknown-user")
  })
})
