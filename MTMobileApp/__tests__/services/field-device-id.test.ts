jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import {
  createFieldDeviceId,
  fieldDeviceIdStorageKey,
  isFieldDeviceId,
  readOrCreateFieldDeviceId,
} from "../../src/services/field-device-id"

function storageWith(value: string | null) {
  return {
    getItem: jest.fn().mockResolvedValue(value),
    setItem: jest.fn().mockResolvedValue(undefined),
  }
}

describe("Route Field device identity", () => {
  it("creates an opaque, server-safe installation id", () => {
    const id = createFieldDeviceId(() => 1_700_000_000_000, () => 0.5)
    expect(id).toMatch(/^rf-/)
    expect(id.length).toBeLessThanOrEqual(128)
    expect(isFieldDeviceId(id)).toBe(true)
    expect(id).not.toContain("agent")
  })

  it("retains a valid persisted id without deriving it from a login", async () => {
    const saved = "rf-install-0000001-0000002-0000003"
    const storage = storageWith(saved)
    await expect(readOrCreateFieldDeviceId(storage)).resolves.toBe(saved)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it("replaces malformed persisted data with one opaque id", async () => {
    const storage = storageWith("agent-123")
    const created = "rf-install-0000001-0000002-0000003"
    await expect(readOrCreateFieldDeviceId(storage, () => created)).resolves.toBe(created)
    expect(storage.setItem).toHaveBeenCalledWith(fieldDeviceIdStorageKey, created)
  })

  it("keeps the generated format below the server header limit", () => {
    expect(isFieldDeviceId(`rf-${"a".repeat(125)}`)).toBe(true)
    expect(isFieldDeviceId(`rf-${"a".repeat(126)}`)).toBe(false)
  })
})
