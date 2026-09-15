import { contactTransferAvailable, fieldContactsEnabled, plannableTargetTypes } from "../../src/lib/field-contacts-policy"

describe("fieldContactsEnabled", () => {
  it("shows contacts when the answer is missing (older server, cached bootstrap)", () => {
    expect(fieldContactsEnabled(undefined)).toBe(true)
    expect(fieldContactsEnabled(null)).toBe(true)
    expect(fieldContactsEnabled({})).toBe(true)
    expect(fieldContactsEnabled({ fieldContactsEnabled: undefined })).toBe(true)
  })

  it("follows an explicit answer", () => {
    expect(fieldContactsEnabled({ fieldContactsEnabled: true })).toBe(true)
    expect(fieldContactsEnabled({ fieldContactsEnabled: false })).toBe(false)
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

  it("drops doctor types when contacts are hidden", () => {
    expect(plannableTargetTypes([doctors, pharmacies], defaults, false)).toEqual([pharmacies])
  })

  it("falls back to places-only defaults when only doctor types were configured", () => {
    expect(plannableTargetTypes([doctors], defaults, false)).toEqual([pharmacies, clinics])
  })
})

describe("contactTransferAvailable", () => {
  it("follows the contacts switch, keeping transfer on when the answer is missing", () => {
    expect(contactTransferAvailable(undefined)).toBe(true)
    expect(contactTransferAvailable({})).toBe(true)
    expect(contactTransferAvailable({ fieldContactsEnabled: true })).toBe(true)
    expect(contactTransferAvailable({ fieldContactsEnabled: false })).toBe(false)
  })
})
