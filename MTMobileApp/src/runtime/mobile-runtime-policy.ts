export interface MobileRuntimePolicyInput {
  isLoggedIn: boolean
  canTrackFieldLocation: boolean
  workdayHydrated: boolean
  activeWorkdayMatches: boolean
}

export interface MobileRuntimePolicy {
  heartbeat: boolean
  locationTracking: boolean
}

/**
 * Presence and field tracking are deliberately separate concerns.
 *
 * Every authenticated mobile session keeps its server presence alive. GPS
 * remains restricted to field-capable agents with a hydrated, active workday.
 */
export function mobileRuntimePolicy(input: MobileRuntimePolicyInput): MobileRuntimePolicy {
  return {
    heartbeat: input.isLoggedIn,
    locationTracking:
      input.isLoggedIn &&
      input.canTrackFieldLocation &&
      input.workdayHydrated &&
      input.activeWorkdayMatches,
  }
}
