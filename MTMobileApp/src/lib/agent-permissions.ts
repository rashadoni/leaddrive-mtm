/**
 * What the organization lets its field agents do — the switches of the web
 * matrix "what an agent may do" (leaddrive-v2 `src/lib/mtm/agent-permissions.ts`),
 * delivered in the bootstrap as `policies.agentPermissions`. Kept free of React
 * Native imports so the rule is tested on its own.
 *
 * The app only hides the way in. The server refuses a switched-off function by
 * itself, with `MTM_AGENT_PERMISSION_DISABLED`, so an older build that still
 * shows the button gets a plain refusal instead of a silent success.
 */
export type AgentPermissionId =
  | "routeSelfPublish"
  | "teamSchedule"
  | "contactCreateRequest"
  | "contactChangeRequest"
  | "customerCreateRequest"
  | "taskSelfCreate"
  | "taskSelfRecurring"
  | "checkInOutsideZone"

/** The refusal code of a function the organization switched off. */
export const AGENT_PERMISSION_DISABLED_CODE = "MTM_AGENT_PERMISSION_DISABLED"

type PermissionPolicies = { agentPermissions?: Readonly<Record<string, boolean>> } | null | undefined

/**
 * The map as the server sent it: boolean answers only. `undefined` when there
 * is nothing usable — an older server, or junk — so nothing gets hidden.
 */
export function parseAgentPermissions(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/**
 * Whether to show the way into a function. Only an explicit `false` hides it:
 * every function here existed before the switches did, so a server that does
 * not send the map yet, or does not know this function, keeps the app as it was.
 */
export function agentMay(policies: PermissionPolicies, id: AgentPermissionId): boolean {
  return policies?.agentPermissions?.[id] !== false
}

/**
 * Whether the organization lets its agents check in while not at the client.
 *
 * The opposite kind of switch from the ones above: this function did not exist
 * before it, and what it lifts is a refusal. So it takes an explicit `true` —
 * a server that sends no map, or does not know the switch, keeps the client's
 * zone the hard rule it always was (owner, 7 October 2026: «возможность
 * отключения из настроек — если агент не на месте, но мог делать чек-ин, и
 * потом проверить»).
 */
export function agentMayCheckInOutsideZone(policies: PermissionPolicies): boolean {
  return policies?.agentPermissions?.checkInOutsideZone === true
}

/** True for the refusal of a switched-off function, whatever threw it. */
export function isAgentPermissionDisabled(error: unknown): boolean {
  return !!error && typeof error === "object"
    && (error as { code?: unknown }).code === AGENT_PERMISSION_DISABLED_CODE
}
