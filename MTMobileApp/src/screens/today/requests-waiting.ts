/**
 * How many of the agent's own requests still wait for the manager, for the
 * «Müraciətlərim» row under the workday card: those the server lists as
 * pending, and those this phone has written but not sent yet. A cancellation
 * waiting in the queue is not a new request.
 */
export function requestsWaitingCount(
  requests: ReadonlyArray<{ status: string }>,
  queued: ReadonlyArray<{ op: string }>,
): number {
  return requests.filter((request) => request.status === "PENDING").length + queued.filter((row) => row.op === "create").length
}
