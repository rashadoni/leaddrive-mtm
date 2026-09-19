/**
 * Clients are people (doctors, pharmacists and other contacts) and are the
 * field application's primary directory for every tenant. Older server
 * bootstraps may still carry the retired `fieldContactsEnabled=false` switch;
 * ignoring it here prevents the app from reverting to the organization-only
 * "Places" experience and hiding assigned people from agents.
 */
export function fieldContactsEnabled(
  _policies: { fieldContactsEnabled?: boolean } | null | undefined,
): boolean {
  return true
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
 * Transferring clients between agents follows the same always-available client
 * directory rule.
 */
export function contactTransferAvailable(
  policies: { fieldContactsEnabled?: boolean } | null | undefined,
): boolean {
  return fieldContactsEnabled(policies)
}
