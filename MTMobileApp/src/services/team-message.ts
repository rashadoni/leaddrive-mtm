/**
 * «Komandaya yaz» — the manager writes to the whole team or to one employee
 * (owner-approved mockup, 2026-10-17). The server (leaddrive-v2,
 * /api/v1/mtm/mobile/manager/messages) decides who is in the team: the same
 * scope «Komanda» shows, active cards only, the manager left out. The phone
 * only shows that list and sends to it.
 */

export type TeamMessageRecipient = { id: string; name: string }

export type TeamMessageTarget = { to: "TEAM" } | { to: "AGENT"; agentId: string }

/** What went wrong, in the words the screen has for it. */
export type TeamMessageFailure =
  | "offline"
  | "notInTeam"
  | "noRecipients"
  | "empty"
  | "notEnabled"
  | "noRight"
  | "session"
  | "failed"

export const TEAM_MESSAGE_MAX_LENGTH = 4000

/** The recipients as the server listed them; a row without an id or a name is dropped. */
export function toTeamRecipients(response: unknown): TeamMessageRecipient[] {
  const rows = (response as { data?: { recipients?: unknown } } | null)?.data?.recipients
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    const id = typeof row?.id === "string" ? row.id : ""
    const name = typeof row?.name === "string" ? row.name.trim() : ""
    return id && name ? [{ id, name }] : []
  })
}

/**
 * One id per message the manager means to send. A resend after a lost answer
 * keeps it — the server then answers with the first message instead of
 * delivering a second one; a new message gets a new id.
 */
export function newTeamMessageId(now = Date.now(), random = Math.random()): string {
  return `team-message-${now}-${random.toString(36).slice(2, 10)}`
}

/** The request body for a target and a text; null while there is nothing to send. */
export function teamMessageRequest(target: TeamMessageTarget | null, text: string, clientMessageId: string) {
  const body = text.trim()
  if (!target || !body) return null
  return target.to === "TEAM"
    ? { to: "TEAM" as const, body, clientMessageId }
    : { to: "AGENT" as const, agentId: target.agentId, body, clientMessageId }
}

const SERVER_CODES: Record<string, TeamMessageFailure> = {
  MTM_TEAM_MESSAGE_RECIPIENT_FORBIDDEN: "notInTeam",
  MTM_TEAM_MESSAGE_NO_RECIPIENTS: "noRecipients",
  MTM_TEAM_MESSAGE_EMPTY: "empty",
  TENANT_CAPABILITY_DISABLED: "notEnabled",
  MTM_MOBILE_CAPABILITY_REQUIRED: "noRight",
}

export function teamMessageFailure(error: unknown): TeamMessageFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string" && SERVER_CODES[code]) return SERVER_CODES[code]
  const message = error instanceof Error ? error.message : ""
  if (message === "SESSION_EXPIRED") return "session"
  if (message === "REQUEST_TIMEOUT" || message === "Network request failed" || message === "ABORTED") return "offline"
  return "failed"
}

/** «Elvin Həsənov» → «EH»; one word gives its first two letters. */
export function recipientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const letters = words.length === 1 ? Array.from(words[0]).slice(0, 2) : [Array.from(words[0])[0], Array.from(words[words.length - 1])[0]]
  return letters.join("").toLocaleUpperCase()
}
