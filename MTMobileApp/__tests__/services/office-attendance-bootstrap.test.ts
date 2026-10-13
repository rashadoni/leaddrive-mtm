jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/api", () => ({ api: { getBootstrap: jest.fn() } }))
import { api } from "../../src/services/api"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { setOfflineScope } from "../../src/services/offline-scope"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
beforeEach(() => { jest.clearAllMocks(); useBootstrapStore.getState().clear(); setOfflineScope(officeAgent.organizationId, officeAgent.id) })
it("discards a late bootstrap after logout/clear or account switching", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementation(() => new Promise(done => { resolve = done }))
  const loading = useBootstrapStore.getState().fetchBootstrap()
  useBootstrapStore.getState().clear(); setOfflineScope("other", "person")
  resolve({ success: true, data: officeBootstrap() }); await loading
  expect(useBootstrapStore.getState().data).toBeNull()
})
it("an earlier grant cannot overwrite a newer explicit denial", async () => {
  let resolve!: (value: unknown) => void
  ;(api.getBootstrap as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ success: false })
  const earlier = useBootstrapStore.getState().fetchBootstrap(); await useBootstrapStore.getState().fetchBootstrap()
  resolve({ success: true, data: officeBootstrap() }); await earlier
  expect(useBootstrapStore.getState().data).toBeNull(); expect(useBootstrapStore.getState().routeFieldAccess).toBe("unavailable")
})
