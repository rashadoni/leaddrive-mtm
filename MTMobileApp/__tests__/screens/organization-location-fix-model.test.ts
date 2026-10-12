import {
  LOCATION_FIX_MAX_ACCURACY_METERS,
  LOCATION_FIX_MAX_FIX_AGE_SECONDS,
  LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS,
  LOCATION_FIX_MIN_MOVE_METERS,
  LOCATION_FIX_OFFER_FROM_METERS,
  LOCATION_FIX_OFFER_TO_METERS,
  formatLocationFixDistance,
  locationFixAgeSeconds,
  locationFixDistanceMeters,
  locationFixFailure,
  locationFixOffer,
  locationFixPayload,
  locationFixProblem,
  toLocationFixRequest,
  usablePoint,
} from "../../src/screens/base/organization-location-fix-model"

/**
 * «Клиент здесь». The owner, 12 October 2026: «агент приходит на тот адрес,
 * но видит, что не те координаты. У него должна быть возможность отправить
 * запрос на корректировку, отправляя с места, где клиент, координаты».
 *
 * These are the app's own readings of the server's rules — said to the agent
 * before he presses the button, not after.
 */
const NOW = Date.parse("2026-10-12T08:00:00.000Z")
/** About this many metres north of a latitude. */
const north = (latitude: number, meters: number) => latitude + meters / 111_195
const PIN = { latitude: 40.4, longitude: 49.85 }
// Where the customer really is: 1.2 km north of its pin.
const DOOR = { latitude: north(40.4, 1_200), longitude: 49.85 }
const fix = (over: Partial<{ latitude: number; longitude: number; accuracy: number | undefined; timestamp: number; mocked: boolean }> = {}) => ({
  ...DOOR, accuracy: 8, timestamp: NOW - 4_000, ...over,
})

describe("the server's numbers, repeated", () => {
  // leaddrive-v2 src/lib/mtm/customer-location-request.ts. If these drift, the
  // app says «можно отправить» and the server refuses.
  it("are the server's", () => {
    expect(LOCATION_FIX_MAX_ACCURACY_METERS).toBe(100)
    expect(LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS).toBe(150)
    expect(LOCATION_FIX_MIN_MOVE_METERS).toBe(20)
    expect(LOCATION_FIX_MAX_FIX_AGE_SECONDS).toBe(120)
  })
})

describe("a place a map can show", () => {
  it("is two numbers in range, and never 0,0", () => {
    expect(usablePoint({ latitude: 40.4, longitude: 49.85 })).toEqual({ latitude: 40.4, longitude: 49.85 })
    for (const junk of [null, undefined, {}, { latitude: 0, longitude: 0 }, { latitude: 40.4 }, { latitude: "40.4", longitude: 49.85 }, { latitude: 91, longitude: 0 }, { latitude: NaN, longitude: 1 }]) {
      expect(usablePoint(junk as never)).toBeNull()
    }
  })
})

describe("what the customer's card offers by itself", () => {
  it("offers a first pin to a customer that has none, wherever the agent is", () => {
    expect(locationFixOffer(null, null)).toEqual({ kind: "no-pin" })
    expect(locationFixOffer(null, DOOR)).toEqual({ kind: "no-pin" })
  })

  it("offers a correction when the agent is near the pin but not at it", () => {
    expect(locationFixOffer(PIN, DOOR)).toEqual({ kind: "pin-far", distanceMeters: 1_200 })
  })

  it("says nothing when he is at the customer, far away altogether, or nowhere known", () => {
    expect(locationFixOffer(PIN, { latitude: north(40.4, LOCATION_FIX_OFFER_FROM_METERS - 20), longitude: 49.85 })).toEqual({ kind: "none" })
    expect(locationFixOffer(PIN, { latitude: north(40.4, LOCATION_FIX_OFFER_TO_METERS + 200), longitude: 49.85 })).toEqual({ kind: "none" })
    expect(locationFixOffer(PIN, null)).toEqual({ kind: "none" })
  })
})

describe("why a request cannot be sent as it stands", () => {
  it("is nothing when the phone knows where it is and the pin is where the agent stands", () => {
    expect(locationFixProblem(DOOR, fix(), PIN, NOW)).toBeNull()
    // A customer with no pin yet: there is nothing for the new one to be «the same» as.
    expect(locationFixProblem(DOOR, fix(), null, NOW)).toBeNull()
  })

  it("waits for a fix and for a pin", () => {
    expect(locationFixProblem(null, fix(), PIN, NOW)).toBe("noFix")
    expect(locationFixProblem(DOOR, null, PIN, NOW)).toBe("noFix")
  })

  it("names a mocked position before anything else", () => {
    expect(locationFixProblem(DOOR, fix({ mocked: true, accuracy: 900 }), PIN, NOW)).toBe("mock")
    expect(locationFixProblem(DOOR, fix({ mocked: false }), PIN, NOW)).toBeNull()
  })

  it("names a phone that does not know where it is — and accuses none that did not say", () => {
    expect(locationFixProblem(DOOR, fix({ accuracy: LOCATION_FIX_MAX_ACCURACY_METERS }), PIN, NOW)).toBeNull()
    expect(locationFixProblem(DOOR, fix({ accuracy: 240 }), PIN, NOW)).toBe("accuracy")
    expect(locationFixProblem(DOOR, fix({ accuracy: undefined }), PIN, NOW)).toBeNull()
  })

  it("names a place the phone was at earlier", () => {
    expect(locationFixProblem(DOOR, fix({ timestamp: NOW - LOCATION_FIX_MAX_FIX_AGE_SECONDS * 1000 }), PIN, NOW)).toBeNull()
    expect(locationFixProblem(DOOR, fix({ timestamp: NOW - 10 * 60_000 }), PIN, NOW)).toBe("stale")
  })

  it("names a pin moved streets away from the agent — the entrance round the corner is fine", () => {
    const corner = { latitude: north(DOOR.latitude, LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS - 10), longitude: 49.85 }
    expect(locationFixProblem(corner, fix(), PIN, NOW)).toBeNull()
    const street = { latitude: north(DOOR.latitude, LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS + 30), longitude: 49.85 }
    expect(locationFixProblem(street, fix(), PIN, NOW)).toBe("pinTooFar")
  })

  it("names a pin that is already there", () => {
    const beside = { latitude: north(40.4, LOCATION_FIX_MIN_MOVE_METERS - 8), longitude: 49.85 }
    expect(locationFixProblem(beside, fix(beside), PIN, NOW)).toBe("unchanged")
  })
})

describe("what the phone sends", () => {
  it("is the pin, the phone's own place and how OLD the fix is — not when it was", () => {
    expect(locationFixPayload("key-12345678", DOOR, fix({ mocked: false }), "  Вход со двора  ", NOW)).toEqual({
      idempotencyKey: "key-12345678",
      proposed: DOOR,
      agent: { ...DOOR, accuracyMeters: 8, fixAgeSeconds: 4, isMock: false },
      comment: "Вход со двора",
    })
  })

  it("leaves out a comment nobody wrote and a mock flag nobody gave, and never sends a negative age", () => {
    const sent = locationFixPayload("key-12345678", DOOR, fix({ timestamp: NOW + 5_000, accuracy: undefined }), "   ", NOW)
    expect(sent).not.toHaveProperty("comment")
    expect(sent.agent).not.toHaveProperty("isMock")
    expect(sent.agent.fixAgeSeconds).toBe(0)
    // A phone that did not say how sure it is has not said «exactly here».
    expect(sent.agent.accuracyMeters).toBe(LOCATION_FIX_MAX_ACCURACY_METERS)
    expect(locationFixAgeSeconds({ timestamp: NOW - 61_400 }, NOW)).toBe(61)
  })

  it("cuts a comment at what the server takes", () => {
    expect(locationFixPayload("key-12345678", DOOR, fix(), "я".repeat(400), NOW).comment).toHaveLength(300)
  })
})

describe("what went wrong with a sending", () => {
  it("is named by the server's own code", () => {
    const failure = (code: string) => locationFixFailure(Object.assign(new Error("x"), { code }))
    expect(failure("MTM_LOCATION_REQUEST_MOCK_LOCATION")).toBe("mock")
    expect(failure("MTM_LOCATION_REQUEST_ACCURACY_TOO_LOW")).toBe("accuracy")
    expect(failure("MTM_LOCATION_REQUEST_FIX_TOO_OLD")).toBe("stale")
    expect(failure("MTM_LOCATION_REQUEST_PIN_TOO_FAR")).toBe("pinTooFar")
    expect(failure("MTM_LOCATION_REQUEST_UNCHANGED")).toBe("unchanged")
    expect(failure("MTM_LOCATION_REQUEST_PENDING")).toBe("pending")
    expect(failure("MTM_LOCATION_REQUEST_RATE_LIMITED")).toBe("tooMany")
    expect(failure("MTM_AGENT_PERMISSION_DISABLED")).toBe("switchedOff")
    expect(failure("MTM_ROUTE_FIELD_ORGANIZATION_NOT_FOUND")).toBe("notFound")
  })

  it("is «нет связи» for a request that did not get through, and plain «не получилось» for the rest", () => {
    expect(locationFixFailure(new Error("REQUEST_TIMEOUT"))).toBe("offline")
    expect(locationFixFailure(new Error("Network request failed"))).toBe("offline")
    expect(locationFixFailure(new Error("Request failed: 500"))).toBe("failed")
    expect(locationFixFailure(Object.assign(new Error("x"), { code: "SOMETHING_NEW" }))).toBe("failed")
    expect(locationFixFailure(null)).toBe("failed")
  })
})

describe("the request as the card was told it", () => {
  it("is read with its place and the manager's word", () => {
    expect(toLocationFixRequest({
      id: "r1", status: "REJECTED", mine: true, proposedLatitude: 40.41, proposedLongitude: 49.85,
      decisionComment: "  Это склад  ", submittedAt: "2026-10-12T08:00:00.000Z",
    })).toEqual({ id: "r1", status: "REJECTED", mine: true, proposed: { latitude: 40.41, longitude: 49.85 }, decisionComment: "Это склад" })
  })

  it("is somebody else's unless the server says «mine»", () => {
    expect(toLocationFixRequest({ id: "r1", status: "SUBMITTED", proposedLatitude: 40.41, proposedLongitude: 49.85 })?.mine).toBe(false)
  })

  it("is nothing for junk, for no request, and for a status the app has no words for", () => {
    for (const junk of [null, undefined, "r1", {}, { id: "r1" }, { id: "", status: "SUBMITTED" }, { id: "r1", status: "CANCELLED" }]) {
      expect(toLocationFixRequest(junk)).toBeNull()
    }
  })
})

describe("a distance as a person says it", () => {
  const units = { m: "м", km: "км" }
  it("is metres up to a kilometre and kilometres with one decimal after", () => {
    expect(formatLocationFixDistance(349.6, "ru", units)).toBe("350 м")
    expect(formatLocationFixDistance(999, "ru", units)).toBe("999 м")
    expect(formatLocationFixDistance(1_213, "en", units)).toBe("1.2 км")
    expect(formatLocationFixDistance(12_000, "en", units)).toBe("12 км")
  })
  it("measures the way the server does", () => {
    expect(Math.round(locationFixDistanceMeters(PIN, DOOR))).toBe(1_200)
  })
})
