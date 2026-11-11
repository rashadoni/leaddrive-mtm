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
    stat: jest.fn(),
    readDir: jest.fn(),
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
    ;(RNFS.readDir as jest.Mock).mockResolvedValue([])
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
    })

    const options = (RNFS.downloadFile as jest.Mock).mock.calls[0][0]
    expect(options.fromUrl).toBe("https://demo.example/api/document")
    expect(options.headers).toEqual({ Authorization: "Bearer test-token" })
    expect(options.toFile).toMatch(/^\/cache\/presentations\/doc-document-1-bbbbbbbbbbbbbbbb\.pdf\.\d+\.part$/)
    expect(RNFS.hash).toHaveBeenCalledWith(options.toFile, "sha256")
    expect(RNFS.moveFile).toHaveBeenCalledWith(options.toFile, filePath)
    // One file per document and content, kept for the next opening.
    expect(filePath).toBe("/cache/presentations/doc-document-1-bbbbbbbbbbbbbbbb.pdf")
  })

  it("rejects a truncated response before publishing it", async () => {
    ;(RNFS.downloadFile as jest.Mock).mockReturnValueOnce({
      jobId: 2,
      promise: Promise.resolve({ statusCode: 200, bytesWritten: 1_024 }),
    })

    await expect(downloadPresentationFile({
      source: { uri: "https://demo.example/api/document", headers: { Authorization: "Bearer test-token" } },
      document: { id: "document-1", fileName: "approved.pdf", mimeType: "application/pdf", sizeBytes: 2_048 },
    })).rejects.toThrow("PRESENTATION_SIZE_MISMATCH")
    expect(RNFS.moveFile).not.toHaveBeenCalled()
  })

  // Owner's client, 2026-11-11: «медленно открывает» — every opening downloaded the deck again.
  it("opens the same deck a second time from the device, without the network", async () => {
    ;(RNFS.exists as jest.Mock).mockResolvedValue(true)
    ;(RNFS.stat as jest.Mock).mockResolvedValue({ size: 2_048 })
    const filePath = await downloadPresentationFile({
      source: { uri: "https://demo.example/api/document", headers: { Authorization: "Bearer test-token" } },
      document: { id: "document-1", fileName: "approved.pdf", mimeType: "application/pdf", sizeBytes: 2_048, checksumSha256: checksum },
    })
    expect(filePath).toBe("/cache/presentations/doc-document-1-bbbbbbbbbbbbbbbb.pdf")
    expect(RNFS.downloadFile).not.toHaveBeenCalled()
  })

  it("downloads again when the copy on the device is not the whole file, and drops the earlier version", async () => {
    ;(RNFS.exists as jest.Mock).mockImplementation(async (path: string) => path.endsWith("doc-document-1-s2048.pdf") || path.endsWith("doc-document-1-s1024.pdf"))
    ;(RNFS.stat as jest.Mock).mockResolvedValue({ size: 100 })
    ;(RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: "doc-document-1-s1024.pdf", path: "/cache/presentations/doc-document-1-s1024.pdf", isFile: () => true },
      { name: "doc-document-2-s2048.pdf", path: "/cache/presentations/doc-document-2-s2048.pdf", isFile: () => true },
    ])
    const filePath = await downloadPresentationFile({
      source: { uri: "https://demo.example/api/document", headers: {} },
      document: { id: "document-1", fileName: "approved.pdf", mimeType: "application/pdf", sizeBytes: 2_048 },
    })
    expect(filePath).toBe("/cache/presentations/doc-document-1-s2048.pdf")
    expect(RNFS.downloadFile).toHaveBeenCalledTimes(1)
    const removed = (RNFS.unlink as jest.Mock).mock.calls.map((call) => call[0])
    expect(removed).toContain("/cache/presentations/doc-document-1-s1024.pdf")
    expect(removed).not.toContain("/cache/presentations/doc-document-2-s2048.pdf")
  })
})
