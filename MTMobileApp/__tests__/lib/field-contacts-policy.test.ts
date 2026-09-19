import { contactTransferAvailable, fieldContactsEnabled, plannableTargetTypes } from "../../src/lib/field-contacts-policy"

describe("fieldContactsEnabled", () => {
  it("shows contacts when the answer is missing (older server, cached bootstrap)", () => {
    expect(fieldContactsEnabled(undefined)).toBe(true)
    expect(fieldContactsEnabled(null)).toBe(true)
    expect(fieldContactsEnabled({})).toBe(true)
    expect(fieldContactsEnabled({ fieldContactsEnabled: undefined })).toBe(true)
  })

  it("keeps clients available when an older bootstrap explicitly disables contacts", () => {
    expect(fieldContactsEnabled({ fieldContactsEnabled: true })).toBe(true)
    expect(fieldContactsEnabled({ fieldContactsEnabled: false })).toBe(true)
  })
})

describe("plannableTargetTypes", () => {
  const doctors = { id: "doctors", direction: "DOCTOR" }
  const pharmacies = { id: "pharmacies", direction: "PHARMACY" }
  const clinics = { id: "clinics", direction: "ORGANIZATION" }
  const defaults = [doctors, pharmacies, clinics]

  it("leaves the configured types alone while contacts are shown", () => {
    expect(plannableTargetTypes([doctors, pharmacies], defaults, true)).toEqual([doctors, pharmacies])
  })

  it("keeps doctor route types when the general contacts directory is hidden", () => {
    expect(plannableTargetTypes([doctors, pharmacies], defaults, false)).toEqual([doctors, pharmacies])
  })

  it("keeps an administrator's doctor-only planning taxonomy", () => {
    expect(plannableTargetTypes([doctors], defaults, false)).toEqual([doctors])
  })
})

describe("contactTransferAvailable", () => {
  it("keeps client transfer available for old and new bootstraps", () => {
    expect(contactTransferAvailable(undefined)).toBe(true)
    expect(contactTransferAvailable({})).toBe(true)
    expect(contactTransferAvailable({ fieldContactsEnabled: true })).toBe(true)
    expect(contactTransferAvailable({ fieldContactsEnabled: false })).toBe(true)
  })
})
