jest.mock("react-native-fs", () => ({
  __esModule: true,
  default: {
    CachesDirectoryPath: "/cache",
    mkdir: jest.fn(),
    exists: jest.fn(),
    unlink: jest.fn(),
    downloadFile: jest.fn(),
    hash: jest.fn(),
    moveFile: jest.fn(),
  },
}))

import RNFS from "react-native-fs"
import { downloadPresentationFile, presentationFormat } from "../../src/services/presentation-file"

describe("presentation file format", () => {
  it.each([
    [{ mimeType: "application/pdf", fileName: "deck.bin" }, "pdf"],
    [{ mimeType: "application/octet-stream", fileName: "deck.PDF" }, "pdf"],
    [{ mimeType: "application/vnd.ms-powerpoint", fileName: "deck.ppt" }, "powerpoint"],
    [{ mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileName: "deck.pptx" }, "powerpoint"],
    [{ mimeType: "text/plain", fileName: "notes.txt" }, "unsupported"],
  ] as const)("classifies %o as %s", (document, expected) => {
    expect(presentationFormat(document)).toBe(expected)
  })
})

describe("authenticated presentation download", () => {
  const checksum = "b".repeat(64)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(RNFS.mkdir as jest.Mock).mockResolvedValue(undefined)
    ;(RNFS.exists as jest.Mock).mockResolvedValue(false)
    ;(RNFS.unlink as jest.Mock).mockResolvedValue(undefined)
    ;(RNFS.hash as jest.Mock).mockResolvedValue(checksum)
    ;(RNFS.moveFile as jest.Mock).mockResolvedValue(undefined)
    ;(RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 1,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 2_048 }),
    })
  })

  it("keeps the bearer token in a header and publishes only a verified complete file", async () => {
    const filePath = await downloadPresentationFile({
      source: { uri: "https://demo.example/api/document", headers: { Authorization: "Bearer test-token" } },
      document: {
        id: "document-1",
        fileName: "approved.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2_048,
        checksumSha256: checksum,
      },
      cacheKey: "session-1",
    })

    const options = (RNFS.downloadFile as jest.Mock).mock.calls[0][0]
    expect(options.fromUrl).toBe("https://demo.example/api/document")
    expect(options.headers).toEqual({ Authorization: "Bearer test-token" })
    expect(options.toFile).toMatch(/^\/cache\/presentations\/session-1-document-1-\d+\.pdf\.part$/)
    expect(RNFS.hash).toHaveBeenCalledWith(options.toFile, "sha256")
    expect(RNFS.moveFile).toHaveBeenCalledWith(options.toFile, filePath)
    expect(filePath).toBe(options.toFile.replace(/\.part$/, ""))
  })

  it("rejects a truncated response before publishing it", async () => {
    ;(RNFS.downloadFile as jest.Mock).mockReturnValueOnce({
      jobId: 2,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 1_024 }),
    })

    await expect(downloadPresentationFile({
      source: { uri: "https://demo.example/api/document", headers: { Authorization: "Bearer test-token" } },
      document: { id: "document-1", fileName: "approved.pdf", mimeType: "application/pdf", sizeBytes: 2_048 },
      cacheKey: "session-1",
    })).rejects.toThrow("PRESENTATION_SIZE_MISMATCH")
    expect(RNFS.moveFile).not.toHaveBeenCalled()
  })
})
