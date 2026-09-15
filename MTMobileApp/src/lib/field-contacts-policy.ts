/**
 * Whether the organization shows field contacts (doctors, pharmacists) to its
 * agents. Kept free of React Native imports so the rule is tested on its own.
 *
 * Only an explicit `false` hides them. Contacts were always visible before the
 * tenant switch existed, so a server that does not send the field yet, or a
 * bootstrap cached by an older build, must keep the app as it was — hiding a
 * working screen on a missing answer would look like data loss to the agent.
 */
export function fieldContactsEnabled(
  policies: { fieldContactsEnabled?: boolean } | null | undefined,
): boolean {
  return policies?.fieldContactsEnabled !== false
}

/**
 * Route target types the planner may offer. A DOCTOR type makes the planner
 * search people, so with contacts switched off it is dropped — otherwise the
 * planner would be the one door left open into hidden contacts. If the tenant
 * configured only doctor types, the places-only defaults take their place so
 * the planner is never left with nothing to choose.
 */
export function plannableTargetTypes<T extends { direction: string }>(
  configured: T[],
  defaults: T[],
  contactsEnabled: boolean,
): T[] {
  if (contactsEnabled) return configured
  const places = configured.filter((target) => target.direction !== "DOCTOR")
  return places.length > 0 ? places : defaults.filter((target) => target.direction !== "DOCTOR")
}

/**
 * Transferring contacts between agents is a contact screen too: it lists the
 * agent's people by name. With contacts switched off it has nothing to offer,
 * so neither the manager's entry nor the screen itself may open the list.
 */
export function contactTransferAvailable(
  policies: { fieldContactsEnabled?: boolean } | null | undefined,
): boolean {
  return fieldContactsEnabled(policies)
}
