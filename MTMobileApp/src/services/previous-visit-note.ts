/**
 * The note from the last visit to a stop's doctor or place (Zeytun
 * 2026-11-13, owner's mockup approved with «Давай»: «всё, что пишется в
 * заметки в конце визита, при следующем визите нужно, чтоб напоминало агенту
 * — в маршруте и в момент, когда он начинает визит»). The server sends it on
 * every route point as `previousNote` (GET /routes/[id]); an older server
 * sends nothing, and nothing is shown.
 */
import { formatLocalizedDate } from "../lib/format-localized-date"

export interface PreviousVisitNote {
  visitId: string
  text: string
  /** The visit's check-in, ISO. */
  at: string
  agentName: string | null
}

export function readPreviousVisitNote(raw: unknown): PreviousVisitNote | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const text = typeof value.text === "string" ? value.text.trim() : ""
  const at = typeof value.at === "string" && !Number.isNaN(Date.parse(value.at)) ? value.at : ""
  if (!text || !at) return null
  return {
    visitId: typeof value.visitId === "string" ? value.visitId : "",
    text,
    at,
    agentName: typeof value.agentName === "string" && value.agentName.trim() ? value.agentName.trim() : null,
  }
}

/** «6 нояб. · Rashad»: when, and who wrote it. */
export function previousVisitNoteByline(note: PreviousVisitNote, language: string): string {
  const day = formatLocalizedDate(new Date(note.at), language, { day: "numeric", month: "short" })
  return note.agentName ? `${day} · ${note.agentName}` : day
}

/**
 * The sheet shown when the agent starts the visit: only when there is a note,
 * once, with one button that closes it.
 */
export function previousNoteBeforeVisit(
  point: { previousNote?: unknown },
  who: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
): { title: string; message: string; buttons: Array<{ text: string; value: true }>; dismissValue: true } | null {
  const note = readPreviousVisitNote(point.previousNote)
  if (!note) return null
  return {
    title: t("previousNote.beforeVisit", { name: who }),
    message: `${t("previousNote.title")} · ${previousVisitNoteByline(note, language)}\n\n${note.text}`,
    buttons: [{ text: t("previousNote.gotIt"), value: true }],
    dismissValue: true,
  }
}
