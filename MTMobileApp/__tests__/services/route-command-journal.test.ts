import AsyncStorage from "@react-native-async-storage/async-storage"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  allRouteCommandJournalEntries,
  conflictRouteCommands,
  enqueueRouteCommand,
  flushRouteCommandJournal,
  pendingRouteCommands,
} from "../../src/services/route-command-journal"
import { setOfflineScope } from "../../src/services/offline-scope"

const createDraft = {
  command: "CREATE_DRAFT" as const,
  payload: {
    date: "2026-08-31",
    points: [{ customerId: "customer-1", plannedTime: "2026-08-31T09:00:00.000Z" }],
  },
}

function appliedResponse(id = "route-1", version = 1) {
  return { success: true as const, data: { id, version, status: "DRAFT" } }
}

describe("durable Route Field route-command journal", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("persists the exact command before its first request and removes it only after a valid receipt response", async () => {
    const item = await enqueueRouteCommand(createDraft)
    const result = await flushRouteCommandJournal(async (request) => {
      expect(request).toEqual({ ...createDraft, operationId: item.operationId })
      expect(await allRouteCommandJournalEntries()).toEqual([
        expect.objectContaining({ operationId: item.operationId, status: "pending" }),
      ])
      return appliedResponse()
    })

    expect(result).toMatchObject({ sent: 1, deferred: 0, conflicted: 0 })
    expect(result.acknowledgements).toEqual([
      expect.objectContaining({ operationId: item.operationId, response: appliedResponse() }),
    ])
    expect(await allRouteCommandJournalEntries()).toEqual([])
  })

  it("scopes commands to the authenticated tenant and agent", async () => {
    await enqueueRouteCommand(createDraft)
    setOfflineScope("org-2", "agent-2")
    expect(await allRouteCommandJournalEntries()).toEqual([])
    await enqueueRouteCommand({ ...createDraft, payload: { ...createDraft.payload, date: "2026-09-01" } })
    expect((await allRouteCommandJournalEntries()).map((item) => item.payload)).toEqual([
      expect.objectContaining({ date: "2026-09-01" }),
    ])

    setOfflineScope("org-1", "agent-1")
    expect((await allRouteCommandJournalEntries()).map((item) => item.payload)).toEqual([
      expect.objectContaining({ date: "2026-08-31" }),
    ])
  })

  it("reuses one operation ID after an ambiguous failure instead of creating a second route write", async () => {
    const original = await enqueueRouteCommand(createDraft)
    const first = await flushRouteCommandJournal(
      async () => { throw Object.assign(new Error("timeout"), { retryAfterMs: 5_000 }) },
      { now: () => 1_000, random: () => 0 },
    )
    expect(first).toMatchObject({ sent: 0, deferred: 1, conflicted: 0, retryAfterMs: 5_000 })

    const repeated = await enqueueRouteCommand(createDraft)
    expect(repeated.operationId).toBe(original.operationId)
    expect(await pendingRouteCommands(5_999)).toEqual([])

    const requests: string[] = []
    await expect(flushRouteCommandJournal(async (request) => {
      requests.push(request.operationId)
      return appliedResponse()
    }, { now: () => 6_000 })).resolves.toMatchObject({ sent: 1 })
    expect(requests).toEqual([original.operationId])
    expect(await allRouteCommandJournalEntries()).toEqual([])
  })

  it("pins a terminal route conflict locally and never lets a later command leapfrog it", async () => {
    const first = await enqueueRouteCommand(createDraft)
    const second = await enqueueRouteCommand({
      command: "PUBLISH",
      routeId: "route-1",
      payload: { expectedVersion: 1 },
    })
    const attempted: string[] = []

    const result = await flushRouteCommandJournal(async (request) => {
      attempted.push(request.operationId)
      throw Object.assign(new Error("version conflict"), { code: "ROUTE_VERSION_CONFLICT", status: 409 })
    })

    expect(result).toMatchObject({ sent: 0, deferred: 0, conflicted: 1 })
    expect(attempted).toEqual([first.operationId])
    expect(await conflictRouteCommands()).toEqual([
      expect.objectContaining({ operationId: first.operationId, conflict: expect.objectContaining({ code: "ROUTE_VERSION_CONFLICT" }) }),
    ])
    expect(await pendingRouteCommands()).toEqual([
      expect.objectContaining({ operationId: second.operationId }),
    ])

    await expect(flushRouteCommandJournal(async (request) => {
      attempted.push(request.operationId)
      return appliedResponse()
    })).resolves.toMatchObject({ sent: 0, deferred: 0, conflicted: 0 })
    expect(attempted).toEqual([first.operationId])
  })

  it("defers unpinned authorization responses and preserves the legacy v1 outbox key", async () => {
    const legacyKey = "@mtm_sync_outbox_v1"
    const legacyValue = JSON.stringify([{ operationId: "legacy-op", entity: "visits" }])
    await AsyncStorage.setItem(legacyKey, legacyValue)
    const item = await enqueueRouteCommand(createDraft)

    const result = await flushRouteCommandJournal(async () => {
      throw Object.assign(new Error("temporarily not allowed"), { code: "MTM_ROUTE_SCOPE_DENIED", status: 403 })
    }, { now: () => 1_000, random: () => 0 })

    expect(result).toMatchObject({ sent: 0, deferred: 1, conflicted: 0 })
    expect(await AsyncStorage.getItem(legacyKey)).toBe(legacyValue)
    expect(await allRouteCommandJournalEntries()).toEqual([
      expect.objectContaining({ operationId: item.operationId, status: "pending", attempts: 1 }),
    ])
  })
})
