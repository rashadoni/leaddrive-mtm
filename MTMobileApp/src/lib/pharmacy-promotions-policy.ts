/**
 * Whether the organization shows pharmacy promotions to its agents. Kept free
 * of React Native imports so the rule is tested on its own.
 *
 * Only an explicit `false` hides them. Promotions were always visible before
 * the tenant switch existed, so a server that does not send the field yet, or
 * a bootstrap cached by an older build, must keep the app as it was.
 */
export function pharmacyPromotionsEnabled(
  policies: { pharmacyPromotionsEnabled?: boolean } | null | undefined,
): boolean {
  return policies?.pharmacyPromotionsEnabled !== false
}
