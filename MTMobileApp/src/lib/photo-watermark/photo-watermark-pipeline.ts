import ImageMarker from "react-native-image-marker"
import piexifLib from "piexifjs"
import RNFS from "react-native-fs"
import { composeWatermarkText } from "./compose-watermark-text"
import { APP_VERSION, APP_MAKE, APP_SOFTWARE } from "./provenance-constants"

// @types/piexifjs (as of v1.0.x) is missing `TagValues` — but the runtime
// module exposes it (it's the documented entry point for tag IDs). We
// wrap it in a hand-rolled type so the rest of this file is fully typed.
interface PiexifTagValues {
  ImageIFD: { Software: number; Make: number; Model: number; ImageDescription: number; DateTime: number }
  ExifIFD: { DateTimeOriginal: number }
  GPSIFD: { GPSLatitude: number; GPSLongitude: number; GPSLatitudeRef: number; GPSLongitudeRef: number }
}
interface PiexifModule {
  load: (jpegDataUrl: string) => { "0th"?: Record<number, unknown>; Exif?: Record<number, unknown>; GPS?: Record<number, unknown> }
  dump: (exif: unknown) => string
  insert: (exifBytes: string, jpegDataUrl: string) => string
  TagValues: PiexifTagValues
}
const piexif = piexifLib as unknown as PiexifModule

export interface PhotoWatermarkPipelineInput {
  photoPath: string
  timestamp: Date
  agent: { id: string; name: string; code: string }
  visit: { id: string } | null
  customer: { id: string; name: string } | null
  location: { latitude: number; longitude: number } | null
  lastKnownLocation?: {
    latitude: number
    longitude: number
    capturedAt: Date
  }
  maxLastKnownAgeMs?: number
}

export interface PhotoWatermarkPipelineOutput {
  watermarkedPath: string
  effectiveLocation: { latitude: number; longitude: number } | null
}

const MAX_LAST_KNOWN_AGE_MS_DEFAULT = 5 * 60_000 // spec §5 — 5 min

/**
 * End-to-end pipeline that converts a raw camera photo into a
 * server-acceptable upload:
 *
 *  1. Decide effective GPS: current → last-known (if fresh) → null.
 *  2. Compose the 4-line watermark text (composeWatermarkText).
 *  3. Burn visible watermark into the JPEG via react-native-image-marker.
 *  4. Re-inject EXIF tags via piexifjs (Software, Make, Model,
 *     ImageDescription with agent/visit/customer JSON, DateTimeOriginal,
 *     GPS lat/lng). image-marker resaves the JPEG without EXIF, so this
 *     step is required — without it the backend validator would flag
 *     every upload as `missing_required_tag`.
 *
 * Returns the path of the watermarked file and the effective location
 * that ended up in EXIF (null if GPS truly unavailable).
 */
export async function photoWatermarkPipeline(
  input: PhotoWatermarkPipelineInput,
): Promise<PhotoWatermarkPipelineOutput> {
  const {
    photoPath,
    timestamp,
    agent,
    visit,
    customer,
    location,
    lastKnownLocation,
    maxLastKnownAgeMs = MAX_LAST_KNOWN_AGE_MS_DEFAULT,
  } = input

  // 1. Effective location decision
  let effectiveLocation: { latitude: number; longitude: number } | null
  if (location) {
    effectiveLocation = location
  } else if (lastKnownLocation) {
    const ageMs = Math.abs(timestamp.getTime() - lastKnownLocation.capturedAt.getTime())
    effectiveLocation =
      ageMs <= maxLastKnownAgeMs
        ? { latitude: lastKnownLocation.latitude, longitude: lastKnownLocation.longitude }
        : null
  } else {
    effectiveLocation = null
  }

  // 2. Compose 4-line watermark text
  const watermarkText = composeWatermarkText({
    timestamp,
    agent: { name: agent.name, code: agent.code },
    customer: customer ? { name: customer.name } : null,
    location: effectiveLocation,
  })

  // 3. Burn visible watermark
  const uri = photoPath.startsWith("file://") ? photoPath : `file://${photoPath}`
  const watermarkedPath = await ImageMarker.markText({
    backgroundImage: { src: { uri } },
    watermarkTexts: [
      {
        text: watermarkText,
        position: { position: "bottomRight" },
        style: {
          color: "#FFFFFF",
          fontSize: 14,
          fontName: "Arial",
          textBackgroundStyle: {
            paddingX: 8,
            paddingY: 6,
            color: "rgba(0,0,0,0.6)",
          },
        },
      },
    ],
    quality: 90,
    saveFormat: "jpg",
  } as Parameters<typeof ImageMarker.markText>[0])

  // 4. Re-inject EXIF tags
  const watermarkedB64 = await RNFS.readFile(watermarkedPath, "base64")
  const jpegDataUrl = "data:image/jpeg;base64," + watermarkedB64

  const loaded = piexif.load(jpegDataUrl) ?? {}
  const exifObj: { "0th": Record<number, unknown>; Exif: Record<number, unknown>; GPS: Record<number, unknown> } = {
    "0th": loaded["0th"] ?? {},
    Exif: loaded.Exif ?? {},
    GPS: loaded.GPS ?? {},
  }

  const TV = piexif.TagValues
  exifObj["0th"][TV.ImageIFD.Software] = APP_SOFTWARE
  exifObj["0th"][TV.ImageIFD.Make] = APP_MAKE
  exifObj["0th"][TV.ImageIFD.Model] = APP_VERSION
  exifObj["0th"][TV.ImageIFD.ImageDescription] = JSON.stringify({
    agentId: agent.id,
    visitId: visit?.id ?? null,
    customerId: customer?.id ?? null,
    watermarked: true,
  })

  exifObj.Exif[TV.ExifIFD.DateTimeOriginal] = formatExifDateTime(timestamp)

  // Reset GPS to empty — historical or auto-injected GPS could lie. We
  // write only what we trust (effectiveLocation), or nothing at all.
  exifObj.GPS = {}
  if (effectiveLocation) {
    exifObj.GPS[TV.GPSIFD.GPSLatitude] = degToDms(effectiveLocation.latitude)
    exifObj.GPS[TV.GPSIFD.GPSLongitude] = degToDms(effectiveLocation.longitude)
    exifObj.GPS[TV.GPSIFD.GPSLatitudeRef] = effectiveLocation.latitude >= 0 ? "N" : "S"
    exifObj.GPS[TV.GPSIFD.GPSLongitudeRef] = effectiveLocation.longitude >= 0 ? "E" : "W"
  }

  const exifBytes = piexif.dump(exifObj)
  const finalJpegDataUrl = piexif.insert(exifBytes, jpegDataUrl)
  const finalB64 = finalJpegDataUrl.replace(/^data:image\/jpeg;base64,/, "")
  await RNFS.writeFile(watermarkedPath, finalB64, "base64")

  return { watermarkedPath, effectiveLocation }
}

function formatExifDateTime(d: Date): string {
  // EXIF DateTimeOriginal format: "YYYY:MM:DD HH:mm:ss"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function degToDms(deg: number): [number, number][] {
  // EXIF GPS stores degree/minute/second as 3 rational numbers
  // ([numerator, denominator] tuples), 100x precision on seconds.
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const minFloat = (abs - d) * 60
  const m = Math.floor(minFloat)
  const s = (minFloat - m) * 60
  return [
    [d, 1],
    [m, 1],
    [Math.round(s * 100), 100],
  ]
}
