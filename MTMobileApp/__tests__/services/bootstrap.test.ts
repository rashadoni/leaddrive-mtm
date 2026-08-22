jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/api", () => ({ api: { getBootstrap: jest.fn() } }))

import { api } from "../../src/services/api"
import { toBootstrap, navGroupFromCapabilities, hasCapability } from "../../src/services/bootstrap"
import { useBootstrapStore } from "../../src/store/bootstrap"

describe("bootstrap mapping", () => {
  it("maps the payload and drops unknown capabilities", () => {
    const b = toBootstrap({
      tenant: { id: "o1", name: "Acme", slug: "acme" },
      principal: { id: "a1", name: "Rep", email: "r@x.az", role: "AGENT" },
      capabilities: ["FIELD_EXECUTE", "FIELD_TRACK", "BOGUS"],
      timezone: "Asia/Baku",
      workday: { id: "w1", status: "ACTIVE" },
    })
    expect(b.tenant).toEqual({ id: "o1", name: "Acme", slug: "acme" })
    expect(b.principal?.role).toBe("AGENT")
    expect(b.capabilities).toEqual(["FIELD_EXECUTE", "FIELD_TRACK"])
    expect(b.timezone).toBe("Asia/Baku")
    expect(b.workday).toEqual({ id: "w1", status: "ACTIVE" })
  })

  it("defaults gracefully on an empty payload", () => {
    const b = toBootstrap({})
    expect(b.tenant).toBeNull()
    expect(b.principal).toBeNull()
    expect(b.capabilities).toEqual([])
    expect(b.timezone).toBeNull()
    expect(b.workday).toBeNull()
  })
})

describe("capability navigation", () => {
  it("maps capabilities to the nav group", () => {
    expect(navGroupFromCapabilities(["FIELD_EXECUTE", "FIELD_TRACK"])).toBe("field")
    expect(navGroupFromCapabilities(["TEAM_READ", "TEAM_DECIDE"])).toBe("team")
    expect(navGroupFromCapabilities([])).toBe("none")
  })

  it("hasCapability checks membership", () => {
    expect(hasCapability(["FIELD_TRACK"], "FIELD_TRACK")).toBe(true)
    expect(hasCapability(["FIELD_TRACK"], "TEAM_DECIDE")).toBe(false)
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
    expect(useBootstrapStore.getState().loading).toBe(false)
  })

  it("leaves capabilities empty on a network failure (nav falls back to role)", async () => {
    ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
    await useBootstrapStore.getState().fetchBootstrap()
    expect(useBootstrapStore.getState().capabilities).toEqual([])
    expect(useBootstrapStore.getState().loading).toBe(false)
  })

  it("clear resets the store", async () => {
    ;(api.getBootstrap as jest.Mock).mockResolvedValue({ success: true, data: { capabilities: ["TEAM_READ"] } })
    await useBootstrapStore.getState().fetchBootstrap()
    useBootstrapStore.getState().clear()
    expect(useBootstrapStore.getState().capabilities).toEqual([])
    expect(useBootstrapStore.getState().data).toBeNull()
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
