import { fieldTheme } from "../theme/fieldTheme"

/**
 * Client classes — the letter a company grades a doctor with: A, B, C, D, VIP.
 * Kept free of React Native imports so the rules are tested on their own.
 *
 * The values mirror the server (leaddrive-v2 `src/lib/mtm/contact-classes.ts`).
 * WHICH of them an organization uses is its MTM setting `contactClasses`, and
 * it arrives as `policies.contactClasses` in the bootstrap. The app listed a
 * hard-coded A–D instead, so an agent of an organization grading "A, B, C, VIP"
 * could not propose VIP, and a VIP doctor opened with no class selected.
 *
 * The order here is the order a person reads the list in — the one the web
 * card offers — so the app and the web show the same sequence.
 */
export const CONTACT_CLASS_VALUES = ["A", "B", "C", "D", "VIP"] as const
export type ContactClass = typeof CONTACT_CLASS_VALUES[number]

/** What every organization had before the setting existed. */
export const CONTACT_CLASS_DEFAULTS: readonly ContactClass[] = ["A", "B", "C", "D"]

type ClassPolicies = { contactClasses?: readonly string[] } | null | undefined

function isContactClass(value: unknown): value is ContactClass {
  return typeof value === "string" && (CONTACT_CLASS_VALUES as readonly string[]).includes(value)
}

/**
 * The list as the server sent it: known classes only, in reading order.
 * `undefined` when there is no usable answer — an older server, or junk — so
 * the caller falls back instead of offering nothing.
 */
export function parseContactClasses(raw: unknown): ContactClass[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const sent = new Set(raw.filter(isContactClass))
  const classes = CONTACT_CLASS_VALUES.filter((value) => sent.has(value))
  return classes.length > 0 ? classes : undefined
}

/** The organization's classes; A–D until the server says otherwise. */
export function tenantContactClasses(policies: ClassPolicies): ContactClass[] {
  return parseContactClasses(policies?.contactClasses) ?? [...CONTACT_CLASS_DEFAULTS]
}

/**
 * What the class choice offers for one client: the organization's classes plus
 * the class this client already has. Without the second part a doctor graded
 * "D" before the organization switched to "A, B, C, VIP" — or a VIP doctor on
 * a server that does not send the list yet — would open with nothing selected.
 * A class this build has never heard of is kept too, at the end.
 */
export function contactClassOptions(policies: ClassPolicies, current?: string | null): string[] {
  const classes = tenantContactClasses(policies)
  if (!current || (classes as string[]).includes(current)) return classes
  if (!isContactClass(current)) return [...classes, current]
  return CONTACT_CLASS_VALUES.filter((value) => value === current || classes.includes(value))
}

/**
 * What an organization filter offers. Organizations carry the same letters,
 * but the web grades them A–D whatever the client-card setting says, so the
 * filter keeps A–D and adds what the organization enabled on top. Dropping "D"
 * here would leave places graded D impossible to find.
 */
export function organizationClassFilterOptions(policies: ClassPolicies): ContactClass[] {
  const classes = tenantContactClasses(policies)
  return CONTACT_CLASS_VALUES.filter((value) => CONTACT_CLASS_DEFAULTS.includes(value) || classes.includes(value))
}

/**
 * The badge colours of a class, most important first. VIP has its own pair:
 * it used to fall through to the grey of "no particular class", which read as
 * the least important client on the list.
 */
export function contactClassColors(category?: string | null): { strong: string; soft: string } {
  switch (category) {
    case "VIP": return { strong: fieldTheme.color.violet, soft: fieldTheme.color.violetSoft }
    case "A": return { strong: fieldTheme.color.success, soft: fieldTheme.color.successSoft }
    case "B": return { strong: fieldTheme.color.blue, soft: fieldTheme.color.blueSoft }
    case "C": return { strong: fieldTheme.color.amber, soft: fieldTheme.color.amberSoft }
    default: return { strong: fieldTheme.color.inkMuted, soft: fieldTheme.color.surfaceStrong }
  }
}
