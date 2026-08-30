import { hasRouteFieldAccess, type RouteFieldAccess } from "../services/bootstrap"

export interface MobileRuntimePolicyInput {
  isLoggedIn: boolean
  routeFieldAccess: RouteFieldAccess
}

export interface MobileRuntimePolicy {
  heartbeat: boolean
  locationTracking: boolean
}

/**
 * Route Field sync and location are deliberately separate concerns.
 *
 * The rebuilt Route Field APK may sync only after its own manifest admission.
 * It never starts the inherited HRM workday background GPS service. A later
 * route/visit-specific GPS contract can add an explicit opt-in here.
 */
export function mobileRuntimePolicy(input: MobileRuntimePolicyInput): MobileRuntimePolicy {
  return {
    heartbeat: input.isLoggedIn && hasRouteFieldAccess(input.routeFieldAccess),
    locationTracking: false,
  }
}
