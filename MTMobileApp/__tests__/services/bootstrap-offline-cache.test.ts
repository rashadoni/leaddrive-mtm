jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/api", () => ({ api: {
  agentRole: "AGENT", getBootstrap: jest.fn(), getOfflineBootstrapBinding: jest.fn(),
} }))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../../src/services/api"
import { hasRouteFieldAccess, toBootstrap } from "../../src/services/bootstrap"
import { clearOfflineBootstrap, OFFLINE_BOOTSTRAP_KEY, readOfflineBootstrap,
  rememberOfflineBootstrap } from "../../src/services/bootstrap-offline-cache"
import { setOfflineScope } from "../../src/services/offline-scope"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { useSyncStatusStore } from "../../src/store/sync-status"

const NOW = Date.parse("2026-10-23T12:00:00Z"), WEEK = 7 * 24 * 60 * 60 * 1000
const binding = { scope: "tenant:agent", server: "https://tenant.example/api/v1/mtm", deviceId: "device-1", sessionId: "login-1" }
const current = () => true
function payload() {
  return {
    tenant: { id: "tenant", name: "Fictional", slug: "test" },
    principal: { id: "agent", role: "AGENT", name: "Test agent", email: "qa@example.invalid" },
    capabilities: ["FIELD_EXECUTE"], timezone: "Asia/Baku", policies: { photoWatermark: false },
    manifest: { version: 1, protocol: { min: 1, preferred: 1 }, tenant: { id: "tenant", timezone: "Asia/Baku" },
      principal: { id: "agent", role: "AGENT" },
      modules: { routeField: { enabled: true, scopeVersion: null }, workforceHrm: { enabled: false, scopeVersion: null },
        commercial: { enabled: false, scopeVersion: null } },
      streams: ["routes", "routePoints", "visits", "customers", "contacts", "tasks", "notifications"],
      syncV2: { routes: false, routesEpoch: null } },
    offlineGrant: { version: 1, kind: "LOCAL_FIELD_DRAFTS", tenantId: "tenant", principalId: "agent", deviceId: "device-1",
      issuedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + WEEK).toISOString() },
  }
}
async function remember(grant: unknown = payload().offlineGrant) {
  await rememberOfflineBootstrap(toBootstrap(payload()), grant, binding, current)
}
async function admitOnline() {
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: true, data: payload() })
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("enabled")
}

beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(NOW)
  jest.clearAllMocks()
  useBootstrapStore.getState().clear()
  await clearOfflineBootstrap(); await AsyncStorage.clear()
  setOfflineScope("tenant", "agent")
  useSyncStatusStore.setState({ online: true })
  ;(api.getBootstrap as jest.Mock).mockReset()
  ;(api.getOfflineBootstrapBinding as jest.Mock).mockResolvedValue(binding)
})
afterEach(async () => {
  useBootstrapStore.getState().clear(); await clearOfflineBootstrap(); useSyncStatusStore.setState({ online: true }); jest.useRealTimers()
})

it("rechecks a field agent online even when the previous connectivity hint is offline", async () => {
  useSyncStatusStore.setState({ online: false })
  await admitOnline()
  expect(api.getBootstrap).toHaveBeenCalledTimes(1)
  expect(useBootstrapStore.getState().routeFieldAccess).toBe("enabled")
})

it("hydrates validated field data from private serialized state, without confirming a workday", async () => {
  await remember()
  const cached = await readOfflineBootstrap(binding, current)
  expect(cached?.data.routeFieldAccess).toBe("offline-enabled")
  expect(cached?.data.principal?.id).toBe("agent")
  expect(cached?.data.policies.photoWatermark).toBe(false)
  expect(cached?.data.workday).toBeNull()
  expect(cached?.validUntil).toBe(NOW + WEEK)
})

it("keeps an unconfirmed offline actor closed", async () => {
  expect(await readOfflineBootstrap(binding, current)).toBeNull()
  expect(hasRouteFieldAccess("offline")).toBe(false)
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("unavailable")
})

it.each(["scope", "server", "deviceId", "sessionId"] as const)("refuses a cache from another %s", async key => {
  await remember()
  expect(await readOfflineBootstrap({ ...binding, [key]: "other" }, current)).toBeNull()
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
})

it("rejects expiry and a backwards clock without renewing the lease on a read", async () => {
  await remember()
  expect((await readOfflineBootstrap(binding, current, NOW + 86_400_000))?.validUntil).toBe(NOW + WEEK)
  expect(await readOfflineBootstrap(binding, current, NOW + 86_394_000)).toBeNull()
  await remember()
  expect(await readOfflineBootstrap(binding, current, NOW + WEEK)).toBeNull()
})

it.each(["missing", "too-long", "other-principal", "other-device"])("does not invent authority from a %s grant", async variant => {
  const grant = payload().offlineGrant
  if (variant === "too-long") grant.expiresAt = new Date(NOW + WEEK + 1).toISOString()
  if (variant === "other-principal") grant.principalId = "other"
  if (variant === "other-device") grant.deviceId = "other"
  await remember(variant === "missing" ? null : grant)
  expect(await readOfflineBootstrap(binding, current)).toBeNull()
})

it("keeps admitted warm and empty-state clients usable on transport failure, then closes at expiry", async () => {
  await admitOnline()
  useBootstrapStore.setState({ data: null, capabilities: [], routeFieldAccess: "pending" })
  ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("offline-enabled")
  expect(useBootstrapStore.getState().data?.principal?.id).toBe("agent")
  expect(hasRouteFieldAccess(useBootstrapStore.getState().routeFieldAccess)).toBe(true)
  jest.advanceTimersByTime(WEEK)
  expect(useBootstrapStore.getState().routeFieldAccess).toBe("offline")
  expect(useBootstrapStore.getState().data).toBeNull()
})

it("does not extend offline validity by the time spent waiting for the server", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const request = useBootstrapStore.getState().fetchBootstrap()
  jest.setSystemTime(NOW + 60_000)
  resolve({ success: true, data: payload() }); await request
  ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("offline-enabled")
  expect(useBootstrapStore.getState().offlineValidUntil).toBe(NOW + WEEK)
})

it.each([401, 403])("evicts a previous grant after an answered %s and never revives it on a later outage", async status => {
  await admitOnline()
  ;(api.getBootstrap as jest.Mock).mockRejectedValue(Object.assign(new Error("Forbidden"), { status }))
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("unavailable")
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
  ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("offline")
})

it("evicts an older grant when the current server omits or rejects its contract", async () => {
  await admitOnline()
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: false })
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("unavailable")
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
})

it("withdraws cached permission when a valid online server stops issuing offline grants", async () => {
  await admitOnline()
  const data = { ...payload(), offlineGrant: undefined }
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: true, data })
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("enabled")
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
  ;(api.getBootstrap as jest.Mock).mockRejectedValue(new Error("Network request failed"))
  expect(await useBootstrapStore.getState().fetchBootstrap()).toBe("offline")
})

it("retains only field data, without an HRM workday or location/attendance authority", async () => {
  const raw = payload()
  const data = toBootstrap({ ...raw, workday: { id: "must-not-cache", status: "STARTED" },
    policies: { attendanceMarkVersion: 1, agentPermissions: { attendanceLocation: true, attendanceWorkday: true } },
    manifest: { ...raw.manifest, modules: { ...raw.manifest.modules, workforceHrm: { enabled: true, scopeVersion: null } } } })
  await rememberOfflineBootstrap(data, raw.offlineGrant, binding, current)
  const cached = await readOfflineBootstrap(binding, current)
  expect(cached?.data.workday).toBeNull()
  expect(cached?.data.manifest?.modules.workforceHrm.enabled).toBe(false)
  expect(cached?.data.policies.attendanceMarkVersion).toBeUndefined()
  expect(cached?.data.policies.agentPermissions?.attendanceLocation).toBe(false)
})

it("does not let a late earlier response overwrite a newer denial or a logout", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    .mockResolvedValueOnce({ success: false })
  const earlier = useBootstrapStore.getState().fetchBootstrap()
  await useBootstrapStore.getState().fetchBootstrap()
  resolve({ success: true, data: payload() }); await earlier
  expect(useBootstrapStore.getState().routeFieldAccess).toBe("unavailable")
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
  ;(api.getBootstrap as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = useBootstrapStore.getState().fetchBootstrap()
  useBootstrapStore.getState().clear(); setOfflineScope("other", "person")
  resolve({ success: true, data: payload() }); await pending
  expect(useBootstrapStore.getState().data).toBeNull()
  expect(await AsyncStorage.getItem(OFFLINE_BOOTSTRAP_KEY)).toBeNull()
})
