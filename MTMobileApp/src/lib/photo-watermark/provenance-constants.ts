/**
 * Provenance constants burned into every watermarked photo's EXIF.
 *
 * Kept in a NATIVE-DEP-FREE module so both `photoWatermarkPipeline` (which writes
 * them) and `preserveExifAcrossResize` (which gates the upload re-injection on the
 * Software tag) can import them WITHOUT pulling in the image renderer / fs bridges.
 *
 * APP_SOFTWARE is the trusted-provenance marker: a photo whose EXIF Software tag
 * equals this value was processed by our pipeline (GPS reset to the trusted
 * effectiveLocation, agent/visit/customer stamped). Keep APP_VERSION in sync with
 * android/app/build.gradle versionName.
 */
export const APP_VERSION = "v1.5.4"
export const APP_MAKE = "LeadDrive MTM"
export const APP_SOFTWARE = "LeadDrive MTM Mobile"
