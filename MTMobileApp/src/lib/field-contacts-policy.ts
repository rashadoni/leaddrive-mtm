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
 * Route target types are a separate, administrator-owned planning taxonomy.
 * Hiding the general contacts directory must not silently remove doctors from
 * route planning: an organization may intentionally let agents visit assigned
 * doctors without exposing the whole contact catalogue.
 */
export function plannableTargetTypes<T extends { direction: string }>(
  configured: T[],
  _defaults: T[],
  _contactsEnabled: boolean,
): T[] {
  return configured
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
