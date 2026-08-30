jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/api", () => ({ api: { getBootstrap: jest.fn() } }))

import { api } from "../../src/services/api"
import {
  toBootstrap,
  navGroupFromCapabilities,
  hasCapability,
  hasRouteFieldAccess,
  mobileRouteTargetLabel,
} from "../../src/services/bootstrap"
import { useBootstrapStore } from "../../src/store/bootstrap"

function routeManifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    protocol: { min: 1, preferred: 1 },
    tenant: { id: "o1", timezone: "Asia/Baku" },
    principal: { id: "a1", role: "AGENT" },
    modules: {
      routeField: { enabled: true, scopeVersion: null },
      workforceHrm: { enabled: false, scopeVersion: null },
      commercial: { enabled: false, scopeVersion: null },
    },
    streams: ["routes", "routePoints", "visits", "customers", "contacts", "tasks", "notifications"],
    syncV2: { routes: false, routesEpoch: null },
    ...overrides,
  }
}

describe("bootstrap mapping", () => {
  it("maps the payload and drops unknown capabilities", () => {
    const b = toBootstrap({
      tenant: { id: "o1", name: "Acme", slug: "acme" },
      principal: { id: "a1", name: "Rep", email: "r@x.az", role: "AGENT" },
      capabilities: ["FIELD_EXECUTE", "FIELD_TRACK", "SELF_LOCATION_SHARE", "BOGUS"],
      timezone: "Asia/Baku",
      workday: { id: "w1", status: "ACTIVE" },
    })
    expect(b.tenant).toEqual({ id: "o1", name: "Acme", slug: "acme" })
    expect(b.principal?.role).toBe("AGENT")
    expect(b.capabilities).toEqual(["FIELD_EXECUTE", "FIELD_TRACK", "SELF_LOCATION_SHARE"])
    expect(b.timezone).toBe("Asia/Baku")
    expect(b.workday).toEqual({ id: "w1", status: "ACTIVE" })
    expect(b.routeTargetTypes.map((target) => target.id)).toEqual(["doctors", "pharmacies", "clinics", "organizations"])
    expect(b.routeFieldAccess).toBe("unavailable")
  })

  it("defaults gracefully on an empty payload", () => {
    const b = toBootstrap({})
    expect(b.tenant).toBeNull()
    expect(b.principal).toBeNull()
    expect(b.capabilities).toEqual([])
    expect(b.timezone).toBeNull()
    expect(b.workday).toBeNull()
    expect(b.routeTargetTypes).toHaveLength(4)
    expect(b.routeFieldAccess).toBe("unavailable")
  })

  it("uses tenant-configured planner target labels and safely falls back when malformed", () => {
    const configured = toBootstrap({
      routeTargetTypes: [{
        id: "hospitals",
        labels: { az: "Xəstəxanalar", ru: "Больницы", en: "Hospitals" },
        direction: "ORGANIZATION",
        objectType: "CLINIC",
        organizationKind: "Hospital",
        enabled: true,
      }],
    })
    expect(configured.routeTargetTypes).toHaveLength(1)
    expect(mobileRouteTargetLabel(configured.routeTargetTypes[0], "az-AZ")).toBe("Xəstəxanalar")
    expect(toBootstrap({ routeTargetTypes: [{ id: "broken" }] }).routeTargetTypes).toHaveLength(4)
  })
})

describe("Route Field capability manifest", () => {
  const bootstrapBase = {
    tenant: { id: "o1", name: "Acme", slug: "acme" },
    principal: { id: "a1", name: "Rep", email: "r@x.az", role: "AGENT" },
    capabilities: ["FIELD_EXECUTE", "FIELD_TRACK"],
  }

  it("admits only an explicit, bound Route Field manifest", () => {
    const data = toBootstrap({ ...bootstrapBase, manifest: routeManifest() })
    expect(data.routeFieldAccess).toBe("enabled")
    expect(data.manifest).toMatchObject({
      tenant: { id: "o1" },
      principal: { id: "a1", role: "AGENT" },
      modules: { routeField: { enabled: true }, commercial: { enabled: false } },
    })
    expect(hasRouteFieldAccess(data.routeFieldAccess)).toBe(true)
  })

  it("blocks an HRM-only tenant instead of falling back to an agent role", () => {
    const data = toBootstrap({
      ...bootstrapBase,
      manifest: routeManifest({
        modules: {
          routeField: { enabled: false, scopeVersion: null },
          workforceHrm: { enabled: true, scopeVersion: null },
          commercial: { enabled: false, scopeVersion: null },
        },
        streams: ["workforce"],
      }),
    })
    expect(data.routeFieldAccess).toBe("disabled")
    expect(hasRouteFieldAccess(data.routeFieldAccess)).toBe(false)
  })

  it("fails closed for a manager manifest or a manifest without field execution", () => {
    const manager = toBootstrap({
      ...bootstrapBase,
      principal: { id: "m1", name: "Manager", email: "m@x.az", role: "MANAGER" },
      capabilities: ["TEAM_READ", "TEAM_DECIDE"],
      manifest: routeManifest({ principal: { id: "m1", role: "MANAGER" } }),
    })
    const missingFieldCapability = toBootstrap({
      ...bootstrapBase,
      capabilities: ["FIELD_TRACK"],
      manifest: routeManifest(),
    })
    expect(manager.routeFieldAccess).toBe("unavailable")
    expect(missingFieldCapability.routeFieldAccess).toBe("unavailable")
  })

  it("fails closed when a present manifest is malformed or bound to another principal", () => {
    const contradictoryEpoch = toBootstrap({
      ...bootstrapBase,
      manifest: routeManifest({ syncV2: { routes: false, routesEpoch: "old-epoch" } }),
    })
    const wrongPrincipal = toBootstrap({
      ...bootstrapBase,
      manifest: routeManifest({ principal: { id: "a2", role: "AGENT" } }),
    })
    const commercialEnabled = toBootstrap({
      ...bootstrapBase,
      manifest: routeManifest({
        modules: {
          routeField: { enabled: true, scopeVersion: null },
          workforceHrm: { enabled: false, scopeVersion: null },
          commercial: { enabled: true, scopeVersion: null },
        },
      }),
    })
    expect(contradictoryEpoch.routeFieldAccess).toBe("unavailable")
    expect(wrongPrincipal.routeFieldAccess).toBe("unavailable")
    expect(commercialEnabled.routeFieldAccess).toBe("unavailable")
  })

  it("uses legacy v1 only when both legacy routes and field capability are explicit", () => {
    expect(toBootstrap({
      ...bootstrapBase,
      modules: { routes: { enabled: true } },
    }).routeFieldAccess).toBe("legacy")
    expect(toBootstrap({
      ...bootstrapBase,
      capabilities: ["TEAM_READ"],
      modules: { routes: { enabled: true } },
    }).routeFieldAccess).toBe("unavailable")
  })

  it("fails closed for an enabled manifest that omits a legacy screen stream", () => {
    const data = toBootstrap({
      ...bootstrapBase,
      manifest: routeManifest({ streams: ["routes", "routePoints"] }),
    })
    expect(data.routeFieldAccess).toBe("unavailable")
  })
})

describe("capability navigation", () => {
  it("maps capabilities to the nav group", () => {
    expect(navGroupFromCapabilities(["FIELD_EXECUTE", "FIELD_TRACK"])).toBe("field")
    expect(navGroupFromCapabilities(["TEAM_READ", "TEAM_DECIDE"])).toBe("team")
    expect(navGroupFromCapabilities(["TEAM_READ", "SELF_LOCATION_SHARE"])).toBe("team")
    expect(navGroupFromCapabilities([])).toBe("none")
  })

  it("hasCapability checks membership", () => {
    expect(hasCapability(["FIELD_TRACK"], "FIELD_TRACK")).toBe(true)
    expect(hasCapability(["FIELD_TRACK"], "TEAM_DECIDE")).toBe(false)
    expect(hasCapability(["TEAM_READ", "SELF_LOCATION_SHARE"], "SELF_LOCATION_SHARE")).toBe(true)
  })
})

describe("bootstrap store", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useBootstrapStore.getState().clear()
  })

  it("stores capabilities on a successful fetch", async () => {
    ;(api.getBootstrap as jest.Mock).mockResolvedValue({
      success: true,
      data: { capabilities: ["FIELD_EXECUTE"], principal: { id: "a1", role: "AGENT" } },
    })
    await useBootstrapStore.getState().fetchBootstrap()
    expect(useBootstrapStore.getState().capabilities).toEqual(["FIELD_EXECUTE"])
    expect(useBootstrapStore.getState().routeFieldAccess).toBe("unavailable")
    expect(useBootstrapStore.getState().loading).toBe(false)
  })

  it("leaves capabilities empty and Route Field closed on a network failure", async () => {
    ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
    await useBootstrapStore.getState().fetchBootstrap()
    expect(useBootstrapStore.getState().capabilities).toEqual([])
    expect(useBootstrapStore.getState().routeFieldAccess).toBe("unavailable")
    expect(useBootstrapStore.getState().loading).toBe(false)
  })

  it("clear resets the store", async () => {
    ;(api.getBootstrap as jest.Mock).mockResolvedValue({ success: true, data: { capabilities: ["TEAM_READ"] } })
    await useBootstrapStore.getState().fetchBootstrap()
    useBootstrapStore.getState().clear()
    expect(useBootstrapStore.getState().capabilities).toEqual([])
    expect(useBootstrapStore.getState().data).toBeNull()
    expect(useBootstrapStore.getState().routeFieldAccess).toBe("pending")
  })
})

// The photo plaque burns a customer name and GPS into the image itself, so an
// unknown answer must resolve to "don't draw it". Anything other than an
// explicit `true` is treated as off.
describe("bootstrap policies — photo watermark", () => {
  it("reads an explicit opt-in", () => {
    expect(toBootstrap({ policies: { photoWatermark: true } }).policies.photoWatermark).toBe(true)
  })

  it("is off when the tenant disabled it", () => {
    expect(toBootstrap({ policies: { photoWatermark: false } }).policies.photoWatermark).toBe(false)
  })

  it("is off when an older server omits policies entirely", () => {
    expect(toBootstrap({ capabilities: [] }).policies.photoWatermark).toBe(false)
  })

  it.each([null, undefined, "true", 1, {}, []])("is off for a non-boolean value: %p", (value) => {
    expect(toBootstrap({ policies: { photoWatermark: value } }).policies.photoWatermark).toBe(false)
  })
})

describe("bootstrap policies — own route planning", () => {
  it("requires an explicit server permission", () => {
    expect(toBootstrap({ policies: { canPlanOwnRoutes: true } }).policies.canPlanOwnRoutes).toBe(true)
    expect(toBootstrap({ policies: { canPlanOwnRoutes: false } }).policies.canPlanOwnRoutes).toBe(false)
    expect(toBootstrap({ policies: {} }).policies.canPlanOwnRoutes).toBe(false)
  })
})
