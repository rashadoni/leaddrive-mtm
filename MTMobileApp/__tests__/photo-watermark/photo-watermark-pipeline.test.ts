// Mocks declared before importing the pipeline so the SUT picks them up.
// virtual:true was removed in the M1-2 green phase after the three deps
// were installed — leaving it would silently mask breaking-API changes in
// upstream releases.
jest.mock("react-native-image-marker", () => ({
  __esModule: true,
  default: {
    markText: jest.fn(),
  },
}))

jest.mock("piexifjs", () => ({
  __esModule: true,
  default: {
    load: jest.fn(() => ({ "0th": {}, Exif: {}, GPS: {} })),
    dump: jest.fn(() => "dumped-exif-bytes"),
    insert: jest.fn((_exif: string, jpeg: string) => jpeg),
    TagValues: {
      ImageIFD: {
        Software: 305,
        ImageDescription: 270,
        Make: 271,
        Model: 272,
        DateTime: 306,
      },
      ExifIFD: { DateTimeOriginal: 36867 },
      GPSIFD: {
        GPSLatitude: 2,
        GPSLongitude: 4,
        GPSLatitudeRef: 1,
        GPSLongitudeRef: 3,
      },
    },
  },
}))

// react-native-fs is the conventional bridge for reading/writing files on
// disk. The pipeline needs it to load the JPEG bytes for piexifjs.insert.
jest.mock("react-native-fs", () => ({
  __esModule: true,
  default: {
    readFile: jest.fn(() => Promise.resolve("base64-jpeg-data")),
    writeFile: jest.fn(() => Promise.resolve()),
    DocumentDirectoryPath: "/mock/docs",
  },
}))

import ImageMarker from "react-native-image-marker"
import piexif from "piexifjs"
import { version as packageVersion } from "../../package.json"
import { photoWatermarkPipeline, PhotoWatermarkPipelineInput } from "../../src/lib/photo-watermark"

const baseInput: PhotoWatermarkPipelineInput = {
  photoPath: "/tmp/photo.jpg",
  timestamp: new Date(2026, 4, 21, 10, 42, 0),
  agent: { id: "agent-1", name: "Айдын Мамедов", code: "A042" },
  visit: { id: "visit-1" },
  customer: { id: "customer-1", name: "Bravo Supermarket #15" },
  location: { latitude: 40.4093, longitude: 49.8671 },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(ImageMarker.markText as jest.Mock).mockResolvedValue(
    "/tmp/photo-watermarked.jpg",
  )
})

describe("photoWatermarkPipeline (mobile)", () => {
  it("C2: calls ImageMarker.markText with a 4-line watermark anchored bottomRight", async () => {
    await photoWatermarkPipeline(baseInput)

    expect(ImageMarker.markText).toHaveBeenCalledTimes(1)
    const call = (ImageMarker.markText as jest.Mock).mock.calls[0][0]
    const watermarkText = call.watermarkTexts[0].text as string
    const lines = watermarkText.split("\n")
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe("21.05.2026 10:42")
    expect(lines[1]).toBe("Айдын Мамедов (#A042)")
    expect(lines[2]).toBe("Bravo Supermarket #15")
    expect(lines[3]).toBe("40.4093°N 49.8671°E")
    expect(call.watermarkTexts[0].position.position).toBe("bottomRight")
  })

  it("C3: writes Software + Make + Model + ImageDescription EXIF tags via piexif.dump", async () => {
    await photoWatermarkPipeline(baseInput)

    expect(piexif.dump).toHaveBeenCalledTimes(1)
    const dumpArg = (piexif.dump as jest.Mock).mock.calls[0][0]
    const zeroth = dumpArg["0th"]
    // 305 = piexif.TagValues.ImageIFD.Software, 270 = ImageDescription.
    // Hard-coded here because @types/piexifjs (v1.0.x) is missing
    // `TagValues` on its declared shape — using the runtime constants by
    // number keeps the test type-safe without an `as any` cast.
    expect(zeroth[305]).toBe("LeadDrive MTM Mobile")
    // 271 = Make, 272 = Model. Model is the build-provenance claim: it must be
    // the version this APK actually is, not a literal someone forgot to bump.
    expect(zeroth[271]).toBe("LeadDrive MTM")
    expect(zeroth[272]).toBe(`v${packageVersion}`)
    const descRaw = zeroth[270]
    expect(typeof descRaw).toBe("string")
    expect(JSON.parse(descRaw)).toMatchObject({
      agentId: "agent-1",
      visitId: "visit-1",
      customerId: "customer-1",
      watermarked: true,
    })
    expect(piexif.insert).toHaveBeenCalled()
  })

  it("C4: falls back to lastKnownLocation when current is null and lastKnown is fresh (≤5 min)", async () => {
    await photoWatermarkPipeline({
      ...baseInput,
      location: null,
      lastKnownLocation: {
        latitude: 40.4093,
        longitude: 49.8671,
        capturedAt: new Date(baseInput.timestamp.getTime() - 2 * 60_000),
      },
    })

    const call = (ImageMarker.markText as jest.Mock).mock.calls[0][0]
    const text = call.watermarkTexts[0].text as string
    expect(text).toContain("40.4093°N 49.8671°E")
    expect(text).not.toContain("GPS unavailable")
  })

  it("C5: falls back to 'GPS unavailable' (and writes no GPS EXIF) when lastKnown is stale (>5 min)", async () => {
    await photoWatermarkPipeline({
      ...baseInput,
      location: null,
      lastKnownLocation: {
        latitude: 40.4093,
        longitude: 49.8671,
        capturedAt: new Date(baseInput.timestamp.getTime() - 10 * 60_000),
      },
    })

    const markCall = (ImageMarker.markText as jest.Mock).mock.calls[0][0]
    expect((markCall.watermarkTexts[0].text as string).split("\n")[3]).toBe(
      "GPS unavailable",
    )

    const dumpArg = (piexif.dump as jest.Mock).mock.calls[0][0]
    expect(Object.keys(dumpArg.GPS ?? {})).toHaveLength(0)
  })

  it("returns watermarkedPath from ImageMarker.markText (not the raw photoPath)", async () => {
    const result = await photoWatermarkPipeline(baseInput)
    expect(result.watermarkedPath).toBe("/tmp/photo-watermarked.jpg")
    expect(result.watermarkedPath).not.toBe(baseInput.photoPath)
  })
})
