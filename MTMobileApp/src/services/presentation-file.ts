import { NativeModules, Platform } from "react-native"
import RNFS from "react-native-fs"

const PDF_MIME = "application/pdf"
const PPT_MIME = "application/vnd.ms-powerpoint"
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const MAX_PRESENTATION_BYTES = 25 * 1024 * 1024

export type PresentationFormat = "pdf" | "powerpoint" | "unsupported"

export interface PresentationDocumentDescriptor {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256?: string
}

export interface AuthorizedDocumentSource {
  uri: string
  headers: Record<string, string>
}

export interface RenderedPdfPage {
  uri: string
  pageCount: number
  width: number
  height: number
}

interface PresentationFilesNativeModule {
  renderPdfPage(filePath: string, pageIndex: number, requestedWidth: number): Promise<RenderedPdfPage>
  openExternal(filePath: string, mimeType: string): Promise<boolean>
  setImmersive?(enabled: boolean): Promise<boolean>
}

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase()
}

export function presentationFormat(document: Pick<PresentationDocumentDescriptor, "mimeType" | "fileName">): PresentationFormat {
  const mimeType = normalizedMimeType(document.mimeType)
  const fileName = document.fileName.trim().toLowerCase()
  if (mimeType === PDF_MIME || fileName.endsWith(".pdf")) return "pdf"
  if (mimeType === PPT_MIME || mimeType === PPTX_MIME || fileName.endsWith(".ppt") || fileName.endsWith(".pptx")) {
    return "powerpoint"
  }
  return "unsupported"
}

function extensionFor(document: PresentationDocumentDescriptor): string {
  const format = presentationFormat(document)
  if (format === "pdf") return "pdf"
  return document.fileName.trim().toLowerCase().endsWith(".ppt") ? "ppt" : "pptx"
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file"
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path)
  } catch {}
}

export async function downloadPresentationFile(input: {
  source: AuthorizedDocumentSource
  document: PresentationDocumentDescriptor
  cacheKey: string
}): Promise<string> {
  const expectedSize = Math.max(0, Math.floor(input.document.sizeBytes || 0))
  if (expectedSize > MAX_PRESENTATION_BYTES) throw new Error("PRESENTATION_TOO_LARGE")

  const directory = `${RNFS.CachesDirectoryPath}/presentations`
  await RNFS.mkdir(directory)
  const unique = `${safeSegment(input.cacheKey)}-${safeSegment(input.document.id)}-${Date.now()}`
  const destination = `${directory}/${unique}.${extensionFor(input.document)}`
  const partial = `${destination}.part`
  await removeIfPresent(partial)

  try {
    const task = RNFS.downloadFile({
      fromUrl: input.source.uri,
      toFile: partial,
      headers: input.source.headers,
      background: false,
      discretionary: false,
    })
    const result = await task.promise
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`PRESENTATION_HTTP_${result.statusCode}`)
    if (result.bytesWritten <= 0 || result.bytesWritten > MAX_PRESENTATION_BYTES) throw new Error("PRESENTATION_INVALID_SIZE")
    if (expectedSize > 0 && result.bytesWritten !== expectedSize) throw new Error("PRESENTATION_SIZE_MISMATCH")

    const expectedChecksum = input.document.checksumSha256?.trim().toLowerCase()
    if (expectedChecksum && /^[a-f0-9]{64}$/.test(expectedChecksum)) {
      const actualChecksum = (await RNFS.hash(partial, "sha256")).toLowerCase()
      if (actualChecksum !== expectedChecksum) throw new Error("PRESENTATION_CHECKSUM_MISMATCH")
    }

    await RNFS.moveFile(partial, destination)
    return destination
  } catch (error) {
    await removeIfPresent(partial)
    await removeIfPresent(destination)
    throw error
  }
}

function presentationFilesModule(): PresentationFilesNativeModule {
  if (Platform.OS !== "android" || !NativeModules.PresentationFiles) {
    throw new Error("PRESENTATION_NATIVE_VIEWER_UNAVAILABLE")
  }
  return NativeModules.PresentationFiles as PresentationFilesNativeModule
}

export async function renderPdfPage(filePath: string, pageIndex: number, requestedWidth: number): Promise<RenderedPdfPage> {
  const result = await presentationFilesModule().renderPdfPage(filePath, pageIndex, Math.max(320, Math.round(requestedWidth)))
  if (!result?.uri || !Number.isInteger(result.pageCount) || result.pageCount < 1) {
    throw new Error("PRESENTATION_INVALID_PDF")
  }
  return result
}

export async function openExternalPresentation(filePath: string, mimeType: string): Promise<void> {
  const opened = await presentationFilesModule().openExternal(filePath, normalizedMimeType(mimeType))
  if (!opened) throw new Error("PRESENTATION_EXTERNAL_VIEWER_UNAVAILABLE")
}

/**
 * Hide the system bars while a slide is on screen. Best effort by design: an
 * older build without the native method, or a screen that is no longer the
 * current activity, must never break the presentation itself.
 */
export async function setPresentationImmersive(enabled: boolean): Promise<void> {
  try {
    const native = presentationFilesModule()
    if (typeof native.setImmersive !== "function") return
    await native.setImmersive(enabled)
  } catch {}
}

export async function cleanupPresentationFiles(filePath: string | null, renderedUris: Iterable<string>): Promise<void> {
  const paths = new Set<string>()
  if (filePath) paths.add(filePath)
  for (const uri of renderedUris) paths.add(uri.replace(/^file:\/\//, ""))
  await Promise.all([...paths].map(removeIfPresent))
}
