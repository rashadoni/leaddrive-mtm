jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  allRouteCommandJournalEntries,
  enqueueRouteCommand,
  flushRouteCommandJournal,
} from "../../src/services/route-command-journal"
import { setOfflineScope } from "../../src/services/offline-scope"
import type {
  MobileRouteCommandInput,
  MobileRouteCommandRequest,
  RouteCommandJournalItem,
  RouteCommandSender,
} from "../../src/services/route-command-journal"
import {
  isDefinitiveRouteCommandRejection,
  submitPublishedRouteUpdate,
  type PublishedRouteUpdateDeps,
} from "../../src/services/published-route-update"
import { publishedRouteEditErrorOutcome } from "../../src/services/published-route-edit"

/**
 * UPDATE_PUBLISHED goes through the durable route-command journal like every
 * route command, but a change the server refused is removed from it: the
 * agent is looking at the answer and composes a new change, and a parked
 * refusal would hold back every later route command, START included.
 */

const input = {
  routeId: "route-1",
  expectedVersion: 3,
  points: [{ customerId: "org-1", contactId: null, plannedTime: "2026-09-15T05:00:00.000Z" }],
}

function harness(sendResult: (request: MobileRouteCommandRequest) => Promise<unknown>) {
  const enqueued: MobileRouteCommandInput[] = []
  const discarded: string[] = []
  const deps: PublishedRouteUpdateDeps = {
    enqueue: async (command) => {
      enqueued.push(command)
      return { operationId: "op-1" } as unknown as RouteCommandJournalItem
    },
    // The real submit() sends the queued envelope and turns a failure into a
    // conflict or a MOBILE_ROUTE_COMMAND_QUEUED error; this stand-in does the same.
    submit: async (command, send: RouteCommandSender) => {
      if (command.command !== "UPDATE_PUBLISHED") throw new Error("unexpected command")
      const request: MobileRouteCommandRequest = { ...command, operationId: "op-1" }
      try {
        return (await send(request)) as { success: true; data: { id: string; version: number } }
      } catch (error) {
        const status = (error as { status?: number }).status
        if (status === 409 || status === 400) {
          throw Object.assign(new Error("conflict"), { code: (error as { code?: string }).code, status })
        }
        throw Object.assign(new Error("queued"), { code: "MOBILE_ROUTE_COMMAND_QUEUED" })
      }
    },
    discard: async (operationId) => {
      discarded.push(operationId)
      return true
    },
    conflicts: async () => [],
  }
  return { deps, enqueued, discarded, send: sendResult }
}

async function failure(run: Promise<unknown>) {
  try {
    await run
  } catch (error) {
    return error as { code: string; status?: number; pointIds: string[]; currentVersion?: number }
  }
  throw new Error("expected the update to fail")
}

describe("submitPublishedRouteUpdate", () => {
  it("persists the exact UPDATE_PUBLISHED envelope and returns the applied route", async () => {
    const sent: MobileRouteCommandRequest[] = []
    const h = harness(async (request) => {
      sent.push(request)
      return { success: true, data: { id: "route-1", version: 4, status: "PLANNED" } }
    })
    const response = await submitPublishedRouteUpdate(input, h.send, h.deps)
    expect(response.data.version).toBe(4)
    expect(h.enqueued).toEqual([{
      command: "UPDATE_PUBLISHED",
      routeId: "route-1",
      payload: { expectedVersion: 3, points: input.points },
    }])
    expect(sent.map((request) => request.operationId)).toEqual(["op-1"])
    expect(h.discarded).toEqual([])
  })

  it("removes a refused change from the journal and keeps the stops the server named", async () => {
    const h = harness(async () => {
      throw Object.assign(new Error("locked"), {
        code: "ROUTE_VISITED_POINTS_LOCKED",
        status: 409,
        pointIds: ["p1", 7],
        currentVersion: 3,
      })
    })
    const error = await failure(submitPublishedRouteUpdate(input, h.send, h.deps))
    expect(error.code).toBe("ROUTE_VISITED_POINTS_LOCKED")
    expect(error.status).toBe(409)
    expect(error.pointIds).toEqual(["p1"])
    expect(error.currentVersion).toBe(3)
    expect(h.discarded).toEqual(["op-1"])
  })

  it("does not let a 403 retry in the background: the code reaches the screen and the envelope is dropped", async () => {
    const h = harness(async () => {
      throw Object.assign(new Error("forbidden"), { code: "ROUTE_EDIT_FORBIDDEN", status: 403 })
    })
    const error = await failure(submitPublishedRouteUpdate(input, h.send, h.deps))
    expect(error.code).toBe("ROUTE_EDIT_FORBIDDEN")
    expect(h.discarded).toEqual(["op-1"])
  })

  it("reports an old server's invalid-command answer by its code", async () => {
    const h = harness(async () => {
      throw Object.assign(new Error("invalid"), { code: "MOBILE_ROUTE_COMMAND_INVALID", status: 400 })
    })
    const error = await failure(submitPublishedRouteUpdate(input, h.send, h.deps))
    expect(error.code).toBe("MOBILE_ROUTE_COMMAND_INVALID")
    expect(h.discarded).toEqual(["op-1"])
  })

  it("keeps an unanswered change queued under the same operation id", async () => {
    const h = harness(async () => { throw new Error("REQUEST_TIMEOUT") })
    const error = await failure(submitPublishedRouteUpdate(input, h.send, h.deps))
    expect(error.code).toBe("MOBILE_ROUTE_COMMAND_QUEUED")
    expect(h.discarded).toEqual([])
  })

  it("treats 5xx, 408 and 429 as no answer, and every other 4xx as a decision", () => {
    expect([400, 403, 404, 409, 422].every(isDefinitiveRouteCommandRejection)).toBe(true)
    expect([408, 429, 500, 503, undefined].some(isDefinitiveRouteCommandRejection)).toBe(false)
  })
})

/**
 * Server review of #218: a 409 is stored as a receipt under its operation id,
 * and the same id with another payload is MOBILE_ROUTE_COMMAND_IDEMPOTENCY_MISMATCH.
 * These run against the real journal to prove every attempt after a refusal
 * carries a new id.
 */
describe("operation ids after a refusal (real journal)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  function recordingServer(answers: Array<(request: MobileRouteCommandRequest) => unknown>) {
    const ids: string[] = []
    const send: RouteCommandSender = async (request) => {
      ids.push(request.operationId)
      const answer = answers[ids.length - 1]
      if (!answer) throw new Error("no answer scripted")
      return answer(request)
    }
    return { ids, send }
  }

  const refuse = (code: string, extra: Record<string, unknown> = {}) => () => {
    throw Object.assign(new Error(code), { code, status: 409, ...extra })
  }
  const apply = (version: number) => () => ({ success: true, data: { id: "route-1", version, status: "PLANNED" } })

  it("sends the same change again under a new id after ROUTE_VISITED_POINTS_LOCKED", async () => {
    const server = recordingServer([refuse("ROUTE_VISITED_POINTS_LOCKED", { pointIds: ["p1"], currentVersion: 3 }), apply(4)])
    await failure(submitPublishedRouteUpdate(input, server.send))
    expect(await allRouteCommandJournalEntries()).toEqual([])
    await expect(submitPublishedRouteUpdate(input, server.send)).resolves.toMatchObject({ data: { version: 4 } })
    expect(server.ids).toHaveLength(2)
    expect(server.ids[1]).not.toBe(server.ids[0])
  })

  it("starts «Yenidən başla» on a fresh version under a new id after a version conflict", async () => {
    const server = recordingServer([refuse("ROUTE_VERSION_CONFLICT", { currentVersion: 5 }), apply(6)])
    const error = await failure(submitPublishedRouteUpdate(input, server.send))
    expect(error.code).toBe("ROUTE_VERSION_CONFLICT")
    await submitPublishedRouteUpdate({ ...input, expectedVersion: 5 }, server.send)
    expect(new Set(server.ids).size).toBe(2)
    expect(await allRouteCommandJournalEntries()).toEqual([])
  })

  it("reloads after the server's unstored race conflict that carries no currentVersion", async () => {
    const server = recordingServer([refuse("ROUTE_VERSION_CONFLICT"), apply(4)])
    const error = await failure(submitPublishedRouteUpdate(input, server.send))
    expect(error.currentVersion).toBeUndefined()
    expect(publishedRouteEditErrorOutcome(error).action).toBe("reload-and-ask")
    await submitPublishedRouteUpdate(input, server.send)
    expect(server.ids[1]).not.toBe(server.ids[0])
  })

  it("drops the entry on MOBILE_ROUTE_COMMAND_IDEMPOTENCY_MISMATCH and reloads before a new id", async () => {
    const server = recordingServer([refuse("MOBILE_ROUTE_COMMAND_IDEMPOTENCY_MISMATCH"), apply(4)])
    const error = await failure(submitPublishedRouteUpdate(input, server.send))
    expect(publishedRouteEditErrorOutcome(error)).toMatchObject({
      action: "reload-and-ask",
      messageKey: "managerShell.planEditReloaded",
    })
    expect(await allRouteCommandJournalEntries()).toEqual([])
    await submitPublishedRouteUpdate(input, server.send)
    expect(server.ids[1]).not.toBe(server.ids[0])
  })

  it("never resends a refused id left in the journal by an earlier failed removal", async () => {
    // A background flush pins the refusal as a conflict entry.
    await enqueueRouteCommand({ command: "UPDATE_PUBLISHED", routeId: "route-1", payload: { expectedVersion: 3, points: input.points } })
    const pinned = recordingServer([refuse("ROUTE_POINT_CHANGE_PENDING", { pointIds: ["p2"], currentVersion: 3 })])
    await flushRouteCommandJournal(pinned.send)
    expect((await allRouteCommandJournalEntries()).map((entry) => entry.status)).toEqual(["conflict"])

    const server = recordingServer([apply(4)])
    await submitPublishedRouteUpdate(input, server.send)
    expect(server.ids).toHaveLength(1)
    expect(server.ids[0]).not.toBe(pinned.ids[0])
    expect(await allRouteCommandJournalEntries()).toEqual([])
  })

  it("treats any other 409 it has no rule for as a reason to reload", () => {
    expect(publishedRouteEditErrorOutcome({ code: "SOMETHING_NEW", status: 409 })).toMatchObject({ action: "reload-and-ask", code: "SOMETHING_NEW" })
  })
})
