import {
  ROUTE_FIELD_PROFILE,
  ROUTE_FIELD_STORAGE_PREFIX,
  routeFieldStorageKey,
} from "../../src/runtime/route-field-profile"

describe("Route Field product profile", () => {
  it("has a standalone Android identity and storage namespace", () => {
    expect(ROUTE_FIELD_PROFILE.applicationId).toBe("com.leaddrive.routefield")
    expect(ROUTE_FIELD_STORAGE_PREFIX).toBe("@leaddrive_route_field_v3")
    expect(routeFieldStorageKey("manifest")).toBe("@leaddrive_route_field_v3:manifest")
  })

  it("cannot be configured into an HRM or commercial client", () => {
    expect(ROUTE_FIELD_PROFILE.requiredModule).toBe("routeField")
    expect(ROUTE_FIELD_PROFILE.excludedModules).toEqual(["workforceHrm", "commercial"])
    expect(ROUTE_FIELD_PROFILE.supportedStreams).not.toContain("workforce")
    expect(ROUTE_FIELD_PROFILE.supportedStreams).not.toContain("commercial")
  })

  it("keeps v2 explicitly read-only until server cohort admission", () => {
    expect(ROUTE_FIELD_PROFILE.protocol).toEqual({ legacy: 1, readOnlyPilot: 2 })
  })
})
