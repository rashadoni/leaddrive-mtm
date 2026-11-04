import {
  advancePlacePayload,
  normalizePlaceAddress,
  placeAddressChange,
  placeChange,
  placeChanged,
  placePinChange,
  placeProposedPoint,
} from "../../src/services/route-contact-place"

/**
 * «Адрес и точка» in «Предложить изменение» (owner, 2026-11-04): the street
 * address and the pin of a place the client works at, proposed in advance.
 */
const north = (latitude: number, meters: number) => latitude + meters / 111_195
const PIN = { latitude: 40.4, longitude: 49.85 }
const NEW_DOOR = { latitude: north(40.4, 1_200), longitude: 49.85 }

describe("the address the agent writes", () => {
  it("is words: trimmed, one space between them", () => {
    expect(normalizePlaceAddress("  Nizami   küç. 41 ")).toBe("Nizami küç. 41")
    expect(normalizePlaceAddress("   ")).toBeNull()
  })
  it("is a correction only when it says something other than the card", () => {
    expect(placeAddressChange("Füzuli küç. 12", "Nizami küç. 41")).toBe("Nizami küç. 41")
    expect(placeAddressChange("Füzuli küç. 12", " füzuli  KÜÇ. 12")).toBeNull()
    expect(placeAddressChange("Füzuli küç. 12", "")).toBeNull()
    expect(placeAddressChange(undefined, "Nizami küç. 41")).toBe("Nizami küç. 41")
  })
})

describe("the pin the agent puts", () => {
  it("is a correction when it moves the place, or gives one that had none", () => {
    expect(placePinChange(PIN, NEW_DOOR)).toEqual(NEW_DOOR)
    expect(placePinChange(PIN, { latitude: north(40.4, 8), longitude: 49.85 })).toBeNull()
    expect(placePinChange(null, NEW_DOOR)).toEqual(NEW_DOOR)
    expect(placePinChange(PIN, null)).toBeNull()
  })
})

describe("what the form sends", () => {
  it("is nothing when nothing changed", () => {
    expect(placeChanged(placeChange({ address: "Füzuli küç. 12", pin: PIN }, { address: "Füzuli küç. 12", picked: null }))).toBe(false)
  })

  it("sends the pin as it stands for an address-only correction, and needs one where there is none", () => {
    const addressOnly = placeChange({ address: "Füzuli küç. 12", pin: PIN }, { address: "Nizami küç. 41", picked: null })
    expect(placeProposedPoint(addressOnly, PIN)).toEqual(PIN)
    const pinless = placeChange({ address: null, pin: null }, { address: "Nizami küç. 41", picked: null })
    expect(placeProposedPoint(pinless, null)).toBeNull()
  })

  it("is the place's own request, marked as made in advance, with the reason as its comment", () => {
    const change = placeChange({ address: "Füzuli küç. 12", pin: PIN }, { address: "Nizami küç. 41", picked: NEW_DOOR })
    expect(advancePlacePayload("key-1", placeProposedPoint(change, PIN)!, change, "  Переехали ")).toEqual({
      idempotencyKey: "key-1",
      origin: "REMOTE",
      proposed: NEW_DOOR,
      address: "Nizami küç. 41",
      comment: "Переехали",
    })
    // No address of its own, no position of the phone: nothing about where the agent is.
    const pinOnly = placeChange({ address: "Füzuli küç. 12", pin: PIN }, { address: "Füzuli küç. 12", picked: NEW_DOOR })
    expect(advancePlacePayload("key-2", NEW_DOOR, pinOnly, "x")).not.toHaveProperty("address")
    expect(advancePlacePayload("key-2", NEW_DOOR, pinOnly, "x")).not.toHaveProperty("agent")
  })
})
