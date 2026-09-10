/**
 * Why the planner's list of workable points came back empty.
 *
 * Field UX audit 2026-09-05, M-03 and task B8. The screen used to answer this
 * on its own: "no objects of this type in the available scope… assign the base
 * or territory in the web app". Both halves were wrong. The scope was not the
 * reason — the server accepted points the planner never offered (A2) — and the
 * advice named a screen a field agent cannot open, so the only way forward was
 * to call a manager about something that was not broken.
 *
 * The server now says which of five things happened. These are its wire
 * values; anything else is treated as "no reason given", because inventing one
 * is how the old hint got written.
 */
export const FIELD_ELIGIBILITY_REASONS = [
  "date",
  "weekend",
  "policy",
  "assignment",
  "territory",
] as const

export type FieldEligibilityReason = (typeof FIELD_ELIGIBILITY_REASONS)[number]

export function fieldEligibilityReason(value: unknown): FieldEligibilityReason | null {
  if (typeof value !== "string") return null
  return (FIELD_ELIGIBILITY_REASONS as readonly string[]).includes(value)
    ? (value as FieldEligibilityReason)
    : null
}

/** The i18n key carrying the sentence an agent reads for this reason. */
export function fieldEligibilityReasonKey(reason: FieldEligibilityReason): string {
  return `managerShell.planEmptyReason_${reason}`
}
