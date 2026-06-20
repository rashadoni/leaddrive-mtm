import piexifLib from "piexifjs"
import RNFS from "react-native-fs"
import { APP_SOFTWARE } from "./provenance-constants"

// Minimal hand-rolled type for the piexifjs surface this module uses — the
// shipped @types/piexifjs is incomplete (mirrors the wrapper in
// photo-watermark-pipeline.ts).
interface PiexifModule {
  load: (jpegDataUrl: string) => { "0th"?: Record<number, unknown> }
  dump: (exif: unknown) => string
  insert: (exifBytes: string, jpegDataUrl: string) => string
  TagValues: { ImageIFD: { Software: number } }
}
const piexif = piexifLib as unknown as PiexifModule

const stripScheme = (p: string) => p.replace(/^file:\/\//, "")
const toDataUrl = (b64: string) => "data:image/jpeg;base64," + b64
const fromDataUrl = (dataUrl: string) => dataUrl.replace(/^data:image\/jpeg;base64,/, "")

/**
 * Copy the EXIF metadata block from `srcPath` into `destPath`, in place.
 *
 * Why this exists (C4a, anti-fraud): the capture pipeline burns a visible
 * watermark AND re-injects EXIF provenance (Software/Make/Model app-version,
 * DateTimeOriginal, GPS) via `photoWatermarkPipeline`. But the shelf-scan upload
 * path then resizes that photo with `react-native-image-resizer` to shrink the
 * base64 — and the resizer RE-ENCODES the JPEG WITHOUT EXIF, silently dropping
 * every provenance tag before the image reaches the server. The backend's
 * `parseExifFromBuffer` then sees nothing ("client-side resize usually strips
 * it"), so the machine-readable anti-fraud chain is broken end-to-end even though
 * the visible watermark survives in pixels. Re-applying the source EXIF onto the
 * resized file closes that gap.
 *
 * TRUSTED-only: EXIF is carried ONLY when the source bears our `Software` provenance
 * tag (i.e. it actually came through `photoWatermarkPipeline`, which resets GPS to
 * the trusted effectiveLocation and stamps agent/visit/customer). A fallback
 * raw-camera photo — produced when the watermark pipeline failed — carries the
 * camera's UNTRUSTED native EXIF (incl. device GPS); that is deliberately NOT
 * carried, so the upload goes EXIF-less and the backend marks it PENDING, exactly
 * as before this feature existed. This keeps the anti-fraud chain honest.
 *
 * No-op-safe: if the source isn't trusted-watermarked, carries no EXIF, or any
 * read/parse/write throws, the destination is left exactly as the resizer produced
 * it and `false` is returned — so a failure here never loses the scan (the visible
 * watermark still proves presence; the backend marks a missing-tag photo PENDING).
 *
 * @returns true if EXIF was re-applied to destPath, false if it was left as-is.
 */
export async function preserveExifAcrossResize(srcPath: string, destPath: string): Promise<boolean> {
  try {
    const srcB64 = await RNFS.readFile(stripScheme(srcPath), "base64")
    const exifObj = piexif.load(toDataUrl(srcB64))

    // Trust gate: only OUR watermark pipeline stamps Software=APP_SOFTWARE (and
    // resets GPS to the trusted location). Anything else is a raw-camera fallback
    // whose native EXIF must NOT be propagated as provenance.
    if (exifObj?.["0th"]?.[piexif.TagValues.ImageIFD.Software] !== APP_SOFTWARE) return false

    const exifBytes = piexif.dump(exifObj)
    // An empty EXIF block dumps to a tiny header-only string; inserting it is
    // harmless, but skip the dest rewrite when there's genuinely nothing to carry.
    if (!exifBytes) return false

    const dest = stripScheme(destPath)
    const destB64 = await RNFS.readFile(dest, "base64")
    const merged = piexif.insert(exifBytes, toDataUrl(destB64))
    await RNFS.writeFile(dest, fromDataUrl(merged), "base64")
    return true
  } catch (e) {
    console.warn(
      "[preserveExifAcrossResize] failed — uploading resized image without re-injected EXIF:",
      e instanceof Error ? e.message : e,
    )
    return false
  }
}
