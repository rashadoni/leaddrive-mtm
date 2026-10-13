jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/api", () => ({ api: { getBootstrap: jest.fn() } }))
import { api } from "../../src/services/api"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { setOfflineScope } from "../../src/services/offline-scope"
import { officeAgent, officeBootstrapPayload } from "../../test-support/office-attendance"
import { hasOfficeAttendanceAccess } from "../../src/services/attendance-access"
beforeEach(() => { jest.clearAllMocks(); useBootstrapStore.getState().clear(); setOfflineScope(officeAgent.organizationId, officeAgent.id) })
it("discards a late bootstrap after logout/clear or account switching", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementation(() => new Promise(done => { resolve = done }))
  const loading = useBootstrapStore.getState().fetchBootstrap()
  useBootstrapStore.getState().clear(); setOfflineScope("other", "person")
  resolve({ success: true, data: officeBootstrapPayload() }); await loading
  expect(useBootstrapStore.getState().data).toBeNull()
})
it("an earlier grant cannot overwrite a newer explicit denial", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ success: false })
  const earlier = useBootstrapStore.getState().fetchBootstrap(); await useBootstrapStore.getState().fetchBootstrap()
  resolve({ success: true, data: officeBootstrapPayload() }); await earlier
  expect(useBootstrapStore.getState().data).toBeNull(); expect(useBootstrapStore.getState().routeFieldAccess).toBe("unavailable")
})
it("admits a current office-only bootstrap and closes immediately when its own grant is withdrawn", async () => {
  const granted = officeBootstrapPayload(), denied = officeBootstrapPayload()
  denied.policies.agentPermissions.attendanceWorkday = false
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: true, data: granted })
    .mockResolvedValueOnce({ success: true, data: denied })
  await useBootstrapStore.getState().fetchBootstrap()
  expect(hasOfficeAttendanceAccess(useBootstrapStore.getState().data, officeAgent)).toBe(true)
  expect(useBootstrapStore.getState().routeFieldAccess).toBe("disabled")
  expect(useBootstrapStore.getState().capabilities).toEqual([])
  await useBootstrapStore.getState().fetchBootstrap()
  expect(hasOfficeAttendanceAccess(useBootstrapStore.getState().data, officeAgent)).toBe(false)
  expect(useBootstrapStore.getState().routeFieldAccess).toBe("disabled")
})
