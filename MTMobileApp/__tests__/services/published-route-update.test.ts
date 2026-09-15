jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

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
