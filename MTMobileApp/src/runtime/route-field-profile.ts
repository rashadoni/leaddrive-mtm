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
  applicationId: "com.leaddrive.routefield",
  displayName: "LeadDrive Route Field",
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
 * A new Android application id has its own Android sandbox.  This prefix is
 * still explicit so an accidental package-id reuse in a development build
 * cannot share credentials, cache cursors or an outbox with the retired MTM
 * client.
 */
export const ROUTE_FIELD_STORAGE_PREFIX = "@leaddrive_route_field_v3"

export function routeFieldStorageKey(name: string): string {
  return `${ROUTE_FIELD_STORAGE_PREFIX}:${name}`
}
