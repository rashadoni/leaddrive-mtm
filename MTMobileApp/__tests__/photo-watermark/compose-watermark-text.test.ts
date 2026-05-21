// Direct import (not through barrel) so this test doesn't pull in the
// pipeline module's react-native-fs/piexifjs/image-marker imports, which
// would require Jest mocks for native modules just to run a pure-string
// helper test.
import { composeWatermarkText } from "../../src/lib/photo-watermark/compose-watermark-text"

// Mirrors backend Vitest cases in
// leaddrive-v2/src/__tests__/lib-mtm-photo-watermark-compose.test.ts.
// When you change one, update the other — the helper is duplicated across
// backend (Vitest) and mobile (Jest) until a shared library exists.
describe("composeWatermarkText (mobile)", () => {
  const baseTimestamp = new Date(2026, 4, 21, 10, 42, 0)
  const baseAgent = { name: "Айдын Мамедов", code: "A042" }
  const baseCustomer = { name: "Bravo Supermarket #15" }
  const baseLocation = { latitude: 40.4093, longitude: 49.8671 }

  it("returns 4 lines in spec order", () => {
    const text = composeWatermarkText({
      timestamp: baseTimestamp,
      agent: baseAgent,
      customer: baseCustomer,
      location: baseLocation,
    })
    const lines = text.split("\n")
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe("21.05.2026 10:42")
    expect(lines[1]).toBe("Айдын Мамедов (#A042)")
    expect(lines[2]).toBe("Bravo Supermarket #15")
    expect(lines[3]).toBe("40.4093°N 49.8671°E")
  })

  it("uses 'No customer' when customer is null", () => {
    const text = composeWatermarkText({
      timestamp: baseTimestamp,
      agent: baseAgent,
      customer: null,
      location: baseLocation,
    })
    expect(text.split("\n")[2]).toBe("No customer")
  })

  it("uses 'GPS unavailable' when location is null", () => {
    const text = composeWatermarkText({
      timestamp: baseTimestamp,
      agent: baseAgent,
      customer: baseCustomer,
      location: null,
    })
    expect(text.split("\n")[3]).toBe("GPS unavailable")
  })

  it("zero-pads single-digit hours and minutes", () => {
    const text = composeWatermarkText({
      timestamp: new Date(2026, 4, 21, 14, 5, 0),
      agent: baseAgent,
      customer: baseCustomer,
      location: baseLocation,
    })
    expect(text.split("\n")[0]).toBe("21.05.2026 14:05")
  })

  it("formats southern/western GPS with S/W suffixes", () => {
    const text = composeWatermarkText({
      timestamp: baseTimestamp,
      agent: baseAgent,
      customer: baseCustomer,
      location: { latitude: -33.8688, longitude: -70.6483 },
    })
    expect(text.split("\n")[3]).toBe("33.8688°S 70.6483°W")
  })

  // Spec §6 acceptance: "Snapshot тест watermark layout" — pixel snapshot of
  // the composited image is deferred to the photo-watermark-pipeline test
  // (where react-native-image-marker mock captures the call) and ultimately
  // to a manual visual check on-device. Kept as it.todo so the gap stays
  // visible in test output.
  it.todo("snapshot watermark image layout — covered by manual on-device check")
})
