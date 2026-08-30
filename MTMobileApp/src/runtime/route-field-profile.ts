/**
 * Immutable product boundary for the rebuilt Route Field APK.
 *
 * This is deliberately not a tenant setting.  A tenant can enable or disable
 * `routeField` in its server-authoritative manifest, but no tenant can turn
 * this APK into a Workforce/HRM or LeadShelf Commercial client by changing a
 * local preference.  Keeping the product boundary in one small, testable
 * module also makes a future dedicated HRM APK use a distinct profile instead
 * of conditionalising the Route Field bundle.
 */
export const ROUTE_FIELD_PROFILE = {
  /**
   * The shipping Route & Field APK already owns this Android id.  Keeping it
   * is intentional: an in-place upgrade preserves the encrypted local state
   * and, most importantly, never abandons an existing v1 mutation outbox.
   * A future HRM APK must use a different id.
   */
  applicationId: "com.mtmobileapp",
  displayName: "LeadDrive Route Field",
  /** Keep in sync with android/app/build.gradle versionName/versionCode. */
  apkVersion: "3.0.0+38",
  sentryProject: "LeadDriveRouteField",
  requiredModule: "routeField" as const,
  supportedStreams: ["routes", "routePoints", "visits", "customers", "contacts", "tasks", "notifications"] as const,
  excludedModules: ["workforceHrm", "commercial"] as const,
  protocol: {
    legacy: 1,
    readOnlyPilot: 2,
  },
} as const

export type RouteFieldStream = typeof ROUTE_FIELD_PROFILE.supportedStreams[number]

/**
 * This prefix is only for new Route Field v3 state (manifest and v2 stream
 * cursors).  It deliberately does not replace the existing v1 auth, cache or
 * outbox keys: an in-place update must retain those queues until the server
 * has acknowledged them.
 */
export const ROUTE_FIELD_STORAGE_PREFIX = "@leaddrive_route_field_v3"

export function routeFieldStorageKey(name: string): string {
  return `${ROUTE_FIELD_STORAGE_PREFIX}:${name}`
}
