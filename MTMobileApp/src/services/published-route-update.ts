import {
  acknowledgeRouteCommand,
  enqueueRouteCommand,
  submitRouteCommand,
  type MobileRouteCommandAppliedResponse,
  type MobileRouteCommandInput,
  type MobileRouteCommandRequest,
  type RouteCommandJournalItem,
  type RouteCommandSender,
} from "./route-command-journal"
import type { PublishedRoutePoint } from "./published-route-edit"

export type PublishedRouteUpdateError = Error & {
  code: string
  status?: number
  pointIds: string[]
  currentVersion?: number
}

export type PublishedRouteUpdateDeps = {
  enqueue: (input: MobileRouteCommandInput) => Promise<RouteCommandJournalItem>
  submit: (input: MobileRouteCommandInput, send: RouteCommandSender) => Promise<MobileRouteCommandAppliedResponse>
  discard: (operationId: string) => Promise<boolean>
}

const DEFAULT_DEPS: PublishedRouteUpdateDeps = {
  enqueue: enqueueRouteCommand,
  submit: (input, send) => submitRouteCommand(input, send),
  discard: acknowledgeRouteCommand,
}

/**
 * A 4xx answer is the server's decision about this exact envelope; sending it
 * again cannot change it. 408 and 429 are "try later", not a decision.
 */
export function isDefinitiveRouteCommandRejection(status: unknown): boolean {
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * UPDATE_PUBLISHED through the durable route-command journal.
 *
 * The operation is persisted before the request (same as every other route
 * command), so a retry tap reuses the operation id and reaches the server
 * receipt. Unlike background commands, this one is interactive: when the
 * server refuses it, the agent sees why at once and composes a new change, so
 * the refused envelope is removed from the journal instead of parking there as
 * a conflict that would hold back every later route command (START included).
 * Without an answer (network, 5xx) it stays queued: the server may have
 * applied it, and only the receipt can say.
 */
export async function submitPublishedRouteUpdate(
  input: { routeId: string; expectedVersion: number; points: PublishedRoutePoint[] },
  send: RouteCommandSender,
  deps: PublishedRouteUpdateDeps = DEFAULT_DEPS,
): Promise<MobileRouteCommandAppliedResponse> {
  const command: MobileRouteCommandInput = {
    command: "UPDATE_PUBLISHED",
    routeId: input.routeId,
    payload: { expectedVersion: input.expectedVersion, points: input.points.map((point) => ({ ...point })) },
  }
  // Equal envelopes deduplicate in the journal, so this is the item that
  // submit() below sends.
  const item = await deps.enqueue(command)
  let ownFailure: unknown = null
  const trackingSend: RouteCommandSender = async (request: MobileRouteCommandRequest) => {
    try {
      return await send(request)
    } catch (error) {
      if (request.operationId === item.operationId) ownFailure = error
      throw error
    }
  }
  try {
    return await deps.submit(command, trackingSend)
  } catch (error) {
    // The journal keeps only a code for a parked command; the transport error
    // also carries the status and the stop ids the server named.
    const source = (ownFailure ?? error) as {
      message?: unknown
      code?: unknown
      status?: unknown
      pointIds?: unknown
      currentVersion?: unknown
    } | null
    const status = typeof source?.status === "number" ? source.status : undefined
    const definitive = isDefinitiveRouteCommandRejection(status)
    if (definitive) await deps.discard(item.operationId).catch(() => false)
    const errorCode = (error as { code?: unknown } | null)?.code
    let code: string
    if (source?.message === "SESSION_EXPIRED") code = "SESSION_EXPIRED"
    else if (definitive) code = typeof source?.code === "string" && source.code ? source.code : "MOBILE_ROUTE_COMMAND_FAILED"
    else if (typeof errorCode === "string" && errorCode) code = errorCode
    else code = "MOBILE_ROUTE_COMMAND_FAILED"
    const failure = new Error(typeof source?.message === "string" ? source.message : code) as PublishedRouteUpdateError
    failure.code = code
    if (status !== undefined) failure.status = status
    const rawPointIds: unknown = source?.pointIds
    failure.pointIds = Array.isArray(rawPointIds)
      ? rawPointIds.filter((id): id is string => typeof id === "string")
      : []
    if (typeof source?.currentVersion === "number") failure.currentVersion = source.currentVersion
    throw failure
  }
}
