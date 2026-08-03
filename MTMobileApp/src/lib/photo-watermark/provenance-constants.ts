/**
 * Provenance constants burned into every watermarked photo's EXIF.
 *
 * Kept in a NATIVE-DEP-FREE module so both `photoWatermarkPipeline` (which writes
 * them) and `preserveExifAcrossResize` (which gates the upload re-injection on the
 * Software tag) can import them WITHOUT pulling in the image renderer / fs bridges.
 *
 * APP_SOFTWARE is the trusted-provenance marker: a photo whose EXIF Software tag
 * equals this value was processed by our pipeline (GPS reset to the trusted
 * effectiveLocation, agent/visit/customer stamped).
 *
 * APP_VERSION is DERIVED from package.json, never hand-written: as a literal it
 * sat at "v1.5.5" while the app shipped 1.7.0, so every field photo carried a
 * false build claim. package.json is the same source the release flow already
 * keeps aligned with android/app/build.gradle versionName, and it is plain JSON
 * — importing it keeps this module native-dep-free.
 *
 * The server validates this tag against /^v\d+\.\d+\.\d+$/ (leaddrive-v2
 * src/lib/mtm/photo-watermark/validate-exif.ts) and rejects the upload as
 * `invalid_model` otherwise, so package.json's version must stay a plain
 * major.minor.patch. We add the "v" but deliberately do NOT strip a prerelease
 * suffix: reporting "1.8.0-rc.1" as "v1.8.0" would be the same false claim this
 * module exists to prevent. provenance-constants.test.ts guards the format.
 */
import { version as packageVersion } from "../../../package.json"

export const APP_VERSION = `v${packageVersion}`
export const APP_MAKE = "LeadDrive MTM"
export const APP_SOFTWARE = "LeadDrive MTM Mobile"
