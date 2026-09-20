import fs from "fs"
import path from "path"

const androidRoot = path.resolve(__dirname, "../../android/app/src/main")
const moduleSource = fs.readFileSync(path.join(androidRoot, "java/com/mtmobileapp/PresentationFilesModule.kt"), "utf8")
const applicationSource = fs.readFileSync(path.join(androidRoot, "java/com/mtmobileapp/MainApplication.kt"), "utf8")
const providerSource = fs.readFileSync(path.join(androidRoot, "java/com/mtmobileapp/PresentationFileProvider.kt"), "utf8")
const manifest = fs.readFileSync(path.join(androidRoot, "AndroidManifest.xml"), "utf8")
const providerPaths = fs.readFileSync(path.join(androidRoot, "res/xml/presentation_file_paths.xml"), "utf8")

describe("private Android presentation viewer", () => {
  it("renders authenticated PDFs locally and registers the native bridge", () => {
    expect(moduleSource).toContain("PdfRenderer")
    expect(moduleSource).toContain("RENDER_MODE_FOR_DISPLAY")
    expect(moduleSource).toContain("Presentation file is unavailable")
    expect(applicationSource).toContain("add(PresentationFilesPackage())")
  })

  it("exposes only the private presentation cache through a dedicated non-exported provider", () => {
    expect(providerSource).toContain("class PresentationFileProvider")
    expect(manifest).toContain('android:name=".PresentationFileProvider"')
    expect(manifest).toContain('android:exported="false"')
    expect(providerPaths).toContain('path="presentations/"')
    expect(providerPaths).not.toContain("external-path")
    expect(providerPaths).not.toContain('path="."')
  })

  it("does not let a PDF bypass page evidence through an external viewer", () => {
    const externalAllowlist = moduleSource.slice(
      moduleSource.indexOf("allowedExternalMimeTypes"),
      moduleSource.indexOf("override fun getName"),
    )
    expect(externalAllowlist).not.toContain("application/pdf")
    expect(externalAllowlist).toContain("application/vnd.ms-powerpoint")
    expect(moduleSource).toContain("ClipData.newRawUri")
  })

  it("publishes rendered pages atomically under unique names", () => {
    expect(moduleSource).toContain("System.nanoTime()")
    expect(moduleSource).toContain(".part")
    expect(moduleSource).toContain("temporaryOutput.renameTo(output)")
  })
})
