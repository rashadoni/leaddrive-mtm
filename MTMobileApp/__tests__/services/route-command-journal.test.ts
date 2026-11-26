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
  submitRouteCommand,
} from "../../src/services/route-command-journal"
import { setOfflineScope } from "../../src/services/offline-scope"

const createDraft = {
  command: "CREATE_DRAFT" as const,
  payload: {
    date: "2026-08-31",
    points: [{ customerId: "customer-1", plannedTime: "2026-08-31T09:00:00.000Z" }],
  },
}

const startRoute = {
  command: "START" as const,
  routeId: "route-1",
  payload: { expectedVersion: 4 },
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

  it("persists an explicit route start through the same receipt journal", async () => {
    const item = await enqueueRouteCommand(startRoute)
    await expect(flushRouteCommandJournal(async (request) => {
      expect(request).toEqual({ ...startRoute, operationId: item.operationId })
      return { success: true, data: { id: "route-1", status: "IN_PROGRESS", version: 5, startedAt: "2026-08-31T08:00:00.000Z" } }
    })).resolves.toMatchObject({ sent: 1, deferred: 0, conflicted: 0 })
    expect(await allRouteCommandJournalEntries()).toEqual([])
  })

  it("persists a published-route change and reads it back instead of calling the journal corrupt", async () => {
    // A journal entry the reader does not recognise makes the whole journal
    // ROUTE_COMMAND_JOURNAL_CORRUPT, which would stop every route command.
    const updatePublished = {
      command: "UPDATE_PUBLISHED" as const,
      routeId: "route-1",
      payload: {
        expectedVersion: 3,
        points: [
          { customerId: "customer-1", contactId: null, plannedTime: "2026-08-31T09:00:00.000Z" },
          { customerId: "customer-2", contactId: "contact-2", plannedTime: null },
        ],
      },
    }
    const item = await enqueueRouteCommand(updatePublished)
    expect(await allRouteCommandJournalEntries()).toEqual([
      expect.objectContaining({ operationId: item.operationId, command: "UPDATE_PUBLISHED", status: "pending" }),
    ])
    expect((await enqueueRouteCommand(updatePublished)).operationId).toBe(item.operationId)
    await expect(flushRouteCommandJournal(async (request) => {
      expect(request).toEqual({ ...updatePublished, operationId: item.operationId })
      return { success: true, data: { id: "route-1", status: "PLANNED", version: 4, publishedVersion: 4 } }
    })).resolves.toMatchObject({ sent: 1, deferred: 0, conflicted: 0 })
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

  describe("a save made without network publishes once it reaches the server (Zeytun, 2026-11-26)", () => {
    const offline = async () => { throw Object.assign(new Error("Network request failed"), { retryAfterMs: 1 }) }

    it("queues the save, then sends it and the publish its author meant", async () => {
      await expect(submitRouteCommand({ ...createDraft, thenPublish: true }, offline, { now: () => 0, random: () => 0 }))
        .rejects.toMatchObject({ code: "MOBILE_ROUTE_COMMAND_QUEUED" })

      const sent: unknown[] = []
      const result = await flushRouteCommandJournal(async (request) => {
        sent.push(request)
        return request.command === "PUBLISH"
          ? { success: true, data: { id: "route-1", version: 2, status: "PLANNED" } }
          : appliedResponse("route-1", 1)
      }, { now: () => 10_000 })

      expect(result).toMatchObject({ sent: 2, conflicted: 0 })
      expect(sent).toEqual([
        expect.objectContaining({ command: "CREATE_DRAFT" }),
        expect.objectContaining({ command: "PUBLISH", routeId: "route-1", payload: { expectedVersion: 1 } }),
      ])
      // The flag never reaches the server: the request is the command alone.
      expect(sent[0]).not.toHaveProperty("thenPublish")
      expect(await allRouteCommandJournalEntries()).toEqual([])
    })

    it("leaves the publish to the planner when the save went through at once", async () => {
      const sent: string[] = []
      const response = await submitRouteCommand({ ...createDraft, thenPublish: true }, async (request) => {
        sent.push(request.command)
        return appliedResponse("route-1", 1)
      })
      expect(response.data).toMatchObject({ id: "route-1", version: 1 })
      expect(sent).toEqual(["CREATE_DRAFT"])
      expect(await allRouteCommandJournalEntries()).toEqual([])
    })

    it("publishes the version of the last save when the agent saved again before the first one left", async () => {
      await expect(submitRouteCommand({ ...createDraft, thenPublish: true }, offline, { now: () => 0, random: () => 0 }))
        .rejects.toMatchObject({ code: "MOBILE_ROUTE_COMMAND_QUEUED" })

      // The second save names other clients; the server adds them to the same draft.
      const second = { ...createDraft, payload: { ...createDraft.payload, points: [{ customerId: "customer-2" }] } }
      const sent: Array<{ command: string; expectedVersion?: number }> = []
      const response = await submitRouteCommand({ ...second, thenPublish: true }, async (request) => {
        sent.push({ command: request.command, expectedVersion: "expectedVersion" in request.payload ? request.payload.expectedVersion : undefined })
        if (request.command === "PUBLISH") return { success: true, data: { id: "route-1", version: 3, status: "PLANNED" } }
        return sent.filter((entry) => entry.command === "CREATE_DRAFT").length === 1
          ? appliedResponse("route-1", 1)
          : appliedResponse("route-1", 2)
      }, { now: () => 10_000 })

      expect(response.data).toMatchObject({ id: "route-1", version: 2 })
      expect(sent).toEqual([
        { command: "CREATE_DRAFT", expectedVersion: undefined },
        { command: "CREATE_DRAFT", expectedVersion: undefined },
        { command: "PUBLISH", expectedVersion: 2 },
      ])
    })

    it("does not publish a save that was only a draft", async () => {
      await expect(submitRouteCommand(createDraft, offline, { now: () => 0, random: () => 0 }))
        .rejects.toMatchObject({ code: "MOBILE_ROUTE_COMMAND_QUEUED" })
      const sent: string[] = []
      await flushRouteCommandJournal(async (request) => {
        sent.push(request.command)
        return appliedResponse("route-1", 1)
      }, { now: () => 10_000 })
      expect(sent).toEqual(["CREATE_DRAFT"])
    })
  })
})
