// Mocks declared before importing the SUT so it picks them up (mirrors the
// photo-watermark-pipeline test setup).
// Software tag id = 305; our trusted marker is "LeadDrive MTM Mobile" (APP_SOFTWARE).
jest.mock("piexifjs", () => ({
  __esModule: true,
  default: {
    load: jest.fn(() => ({ "0th": { 305: "LeadDrive MTM Mobile" }, Exif: {}, GPS: {} })),
    dump: jest.fn(() => "dumped-exif-bytes"),
    insert: jest.fn((_exif: string, jpeg: string) => jpeg + "#withexif"),
    TagValues: { ImageIFD: { Software: 305 } },
  },
}))

jest.mock("react-native-fs", () => ({
  __esModule: true,
  default: {
    readFile: jest.fn(() => Promise.resolve("base64-jpeg-data")),
    writeFile: jest.fn(() => Promise.resolve()),
  },
}))

import piexif from "piexifjs"
import RNFS from "react-native-fs"
import { preserveExifAcrossResize } from "../../src/lib/photo-watermark/preserve-exif"

describe("preserveExifAcrossResize", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("reads EXIF from src, inserts it into dest, and writes dest back", async () => {
    const ok = await preserveExifAcrossResize("file:///tmp/watermarked.jpg", "file:///tmp/resized.jpg")

    expect(ok).toBe(true)
    // src read (scheme stripped) → piexif.load on its data URL
    expect(RNFS.readFile).toHaveBeenCalledWith("/tmp/watermarked.jpg", "base64")
    expect(piexif.load).toHaveBeenCalledWith("data:image/jpeg;base64,base64-jpeg-data")
    // dest read, then insert(dumped bytes, dest data url), then write dest back
    expect(RNFS.readFile).toHaveBeenCalledWith("/tmp/resized.jpg", "base64")
    expect(piexif.insert).toHaveBeenCalledWith("dumped-exif-bytes", "data:image/jpeg;base64,base64-jpeg-data")
    // written payload has the data-url prefix stripped again
    expect(RNFS.writeFile).toHaveBeenCalledWith("/tmp/resized.jpg", "base64-jpeg-data#withexif", "base64")
  })

  it("tolerates paths without a file:// scheme", async () => {
    await preserveExifAcrossResize("/tmp/a.jpg", "/tmp/b.jpg")
    expect(RNFS.readFile).toHaveBeenCalledWith("/tmp/a.jpg", "base64")
    expect(RNFS.writeFile).toHaveBeenCalledWith("/tmp/b.jpg", expect.any(String), "base64")
  })

  it("skips UNTRUSTED EXIF: a raw-camera photo (no APP_SOFTWARE tag) is not carried", async () => {
    ;(piexif.load as jest.Mock).mockReturnValueOnce({ "0th": { 305: "Apple iPhone 15" }, Exif: {}, GPS: { 2: "untrusted-gps" } })
    const ok = await preserveExifAcrossResize("/tmp/raw-camera.jpg", "/tmp/resized.jpg")
    expect(ok).toBe(false)
    expect(piexif.insert).not.toHaveBeenCalled()
    expect(RNFS.writeFile).not.toHaveBeenCalled()
  })

  it("skips when the source has no Software tag at all", async () => {
    ;(piexif.load as jest.Mock).mockReturnValueOnce({ "0th": {}, Exif: {}, GPS: {} })
    const ok = await preserveExifAcrossResize("/tmp/a.jpg", "/tmp/b.jpg")
    expect(ok).toBe(false)
    expect(RNFS.writeFile).not.toHaveBeenCalled()
  })

  it("returns false and does NOT write dest when piexif.dump yields nothing", async () => {
    ;(piexif.dump as jest.Mock).mockReturnValueOnce("")
    const ok = await preserveExifAcrossResize("/tmp/a.jpg", "/tmp/b.jpg")
    expect(ok).toBe(false)
    expect(RNFS.writeFile).not.toHaveBeenCalled()
  })

  it("is no-op-safe: a read/parse failure returns false and never throws", async () => {
    ;(RNFS.readFile as jest.Mock).mockRejectedValueOnce(new Error("disk gone"))
    const ok = await preserveExifAcrossResize("/tmp/a.jpg", "/tmp/b.jpg")
    expect(ok).toBe(false)
    expect(RNFS.writeFile).not.toHaveBeenCalled()
  })
})
