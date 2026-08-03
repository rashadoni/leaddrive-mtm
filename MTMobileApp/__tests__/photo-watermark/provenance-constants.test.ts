// APP_VERSION is stamped into every field photo's EXIF Model tag as provenance.
// It used to be a hand-written literal and drifted (stuck at "v1.5.5" long after
// the app shipped 1.7.0), so these tests pin BOTH ends of the contract: it must
// track package.json, and it must stay in the shape the server accepts.
import { version as packageVersion } from "../../package.json"
import { APP_VERSION, APP_MAKE, APP_SOFTWARE } from "../../src/lib/photo-watermark/provenance-constants"

// Mirrors MODEL_VERSION_REGEX in the server's validator
// (leaddrive-v2 src/lib/mtm/photo-watermark/validate-exif.ts). A Model tag that
// fails this is rejected on upload with reason `invalid_model`.
const SERVER_MODEL_VERSION_REGEX = /^v\d+\.\d+\.\d+$/

describe("provenance constants", () => {
  it("derives APP_VERSION from package.json so it can never drift from the shipped build", () => {
    expect(APP_VERSION).toBe(`v${packageVersion}`)
  })

  it("keeps APP_VERSION in the shape the server's validator accepts", () => {
    // Fails loudly in CI if package.json ever carries a prerelease/build suffix
    // (e.g. "1.8.0-rc.1"), which would make the server reject every upload as
    // `invalid_model`. Fix the version, not this test.
    expect(APP_VERSION).toMatch(SERVER_MODEL_VERSION_REGEX)
  })

  it("keeps the trusted-provenance markers exactly as the server expects", () => {
    // These two are matched by equality server-side (EXPECTED_SOFTWARE /
    // EXPECTED_MAKE) — unlike the version they must NOT track package.json.
    expect(APP_SOFTWARE).toBe("LeadDrive MTM Mobile")
    expect(APP_MAKE).toBe("LeadDrive MTM")
  })
})
