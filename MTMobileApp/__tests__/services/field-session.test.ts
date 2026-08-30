jest.mock("../../src/store/auth", () => ({
  useAuthStore: { getState: jest.fn() },
}))
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: { getState: jest.fn() },
}))
jest.mock("../../src/store/workday", () => ({
  useWorkdayStore: { getState: jest.fn() },
  workdayKey: (tenantId?: string, agentId?: string) => `${tenantId}:${agentId}`,
}))
jest.mock("../../src/services/bootstrap", () => ({
  hasRouteFieldAccess: jest.fn((access: string) => access === "enabled" || access === "legacy"),
  isConfirmedRouteFieldWithdrawal: jest.fn(() => false),
}))
jest.mock("../../src/services/sync-engine", () => ({
  runMobileSync: jest.fn(),
  withdrawRouteFieldV2ShadowState: jest.fn(),
}))

import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { useWorkdayStore } from "../../src/store/workday"
import { runMobileSync } from "../../src/services/sync-engine"
import { refreshRouteFieldSession } from "../../src/services/field-session"

const authState = {
  isLoggedIn: true,
  agent: { organizationId: "tenant-1", id: "agent-1", role: "AGENT" },
}

describe("Route Field session refresh", () => {
  const hydrate = jest.fn()
  const reconcileFromServer = jest.fn()
  const fetchBootstrap = jest.fn()
  const bootstrapState: { data: { workday?: unknown } | null; fetchBootstrap: jest.Mock } = {
    data: null,
    fetchBootstrap,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    bootstrapState.data = null
    ;(useAuthStore.getState as jest.Mock).mockReturnValue(authState)
    ;(useWorkdayStore.getState as jest.Mock).mockReturnValue({ hydrate, reconcileFromServer })
    ;(useBootstrapStore.getState as jest.Mock).mockReturnValue(bootstrapState)
    hydrate.mockResolvedValue(undefined)
    reconcileFromServer.mockResolvedValue(undefined)
    ;(runMobileSync as jest.Mock).mockResolvedValue({ success: true, sent: 1, deferred: 0, conflicted: 0, mediaSent: 0 })
  })

  it("reconciles server state before and after the existing isolated sync lanes", async () => {
    fetchBootstrap
      .mockImplementationOnce(async () => {
        bootstrapState.data = { workday: { id: "wd-1", status: "STARTED", startedAt: "2026-08-30T07:00:00.000Z" } }
        return "enabled"
      })
      .mockImplementationOnce(async () => {
        bootstrapState.data = { workday: { id: "wd-1", status: "STARTED", startedAt: "2026-08-30T07:00:00.000Z" } }
        return "enabled"
      })

    await expect(refreshRouteFieldSession()).resolves.toBe("enabled")

    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(reconcileFromServer).toHaveBeenNthCalledWith(
      1,
      "tenant-1:agent-1",
      expect.objectContaining({ id: "wd-1", status: "STARTED" }),
    )
    expect(runMobileSync).toHaveBeenCalledTimes(1)
    expect(reconcileFromServer).toHaveBeenCalledTimes(2)
    expect(fetchBootstrap).toHaveBeenCalledTimes(2)
    expect(reconcileFromServer.mock.invocationCallOrder[0]).toBeLessThan(runMobileSync.mock.invocationCallOrder[0])
    expect(runMobileSync.mock.invocationCallOrder[0]).toBeLessThan(reconcileFromServer.mock.invocationCallOrder[1])
  })

  it("keeps the durable queue untouched when server admission is unavailable", async () => {
    fetchBootstrap.mockResolvedValueOnce("unavailable")

    await expect(refreshRouteFieldSession()).resolves.toBe("unavailable")

    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(reconcileFromServer).not.toHaveBeenCalled()
    expect(runMobileSync).not.toHaveBeenCalled()
  })
})
