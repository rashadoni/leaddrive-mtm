import { canExecuteFieldWork, canTrackFieldLocation, isManagerRole, normalizeRole } from "../../src/auth/roles"

describe("mobile roles", () => {
  it("normalizes known roles and fails closed for unknown values", () => {
    expect(normalizeRole(" agent ")).toBe("AGENT")
    expect(normalizeRole("manager")).toBe("MANAGER")
    expect(normalizeRole("regional-director")).toBe("UNKNOWN")
    expect(normalizeRole(null)).toBe("UNKNOWN")
  })

  it("opens manager workspace only for privileged roles", () => {
    expect(isManagerRole("SUPERVISOR")).toBe(true)
    expect(isManagerRole("MANAGER")).toBe(true)
    expect(isManagerRole("ADMIN")).toBe(true)
    expect(isManagerRole("AGENT")).toBe(false)
    expect(isManagerRole("unknown")).toBe(false)
  })

  it("allows field tracking only for an agent", () => {
    expect(canTrackFieldLocation("AGENT")).toBe(true)
    expect(canTrackFieldLocation("SUPERVISOR")).toBe(false)
    expect(canTrackFieldLocation("MANAGER")).toBe(false)
    expect(canTrackFieldLocation("ADMIN")).toBe(false)
    expect(canTrackFieldLocation(undefined)).toBe(false)
  })

  it("allows offline field sync only for an agent", () => {
    expect(canExecuteFieldWork("AGENT")).toBe(true)
    expect(canExecuteFieldWork("SUPERVISOR")).toBe(false)
    expect(canExecuteFieldWork("MANAGER")).toBe(false)
    expect(canExecuteFieldWork("ADMIN")).toBe(false)
    expect(canExecuteFieldWork(undefined)).toBe(false)
  })
})
