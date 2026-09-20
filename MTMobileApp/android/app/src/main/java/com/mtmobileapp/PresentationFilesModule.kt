package com.mtmobileapp

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Renders private, authenticated PDF downloads without uploading them to a
 * third-party document viewer. Only files under the app's presentation cache
 * are accepted; arbitrary device paths cannot be opened through this bridge.
 */
class PresentationFilesModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()
  private val allowedExternalMimeTypes = setOf(
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )

  override fun getName(): String = "PresentationFiles"

  private fun presentationCache(): File =
    File(reactContext.cacheDir, "presentations").canonicalFile

  private fun checkedPresentationFile(filePath: String): File {
    val root = presentationCache()
    val file = File(filePath).canonicalFile
    val insideRoot = file.path.startsWith(root.path + File.separator)
    require(insideRoot && file.isFile) { "Presentation file is unavailable" }
    return file
  }

  @ReactMethod
  fun renderPdfPage(filePath: String, pageIndex: Int, requestedWidth: Int, promise: Promise) {
    executor.execute {
      try {
        val input = checkedPresentationFile(filePath)
        ParcelFileDescriptor.open(input, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
          PdfRenderer(descriptor).use { renderer ->
            require(pageIndex in 0 until renderer.pageCount) { "PDF page is out of range" }
            renderer.openPage(pageIndex).use { page ->
              // The page is rendered above screen resolution because the viewer
              // lets the agent pinch into it; at 1_600 px a zoomed price table
              // turned to mush. The ceiling still bounds one ARGB bitmap.
              val maxWidth = requestedWidth.coerceIn(320, 2_600)
              val widthScale = maxWidth.toDouble() / page.width.toDouble()
              val heightScale = 3_600.0 / page.height.toDouble()
              val scale = min(widthScale, heightScale)
              val bitmapWidth = (page.width * scale).roundToInt().coerceAtLeast(1)
              val bitmapHeight = (page.height * scale).roundToInt().coerceAtLeast(1)
              val bitmap = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ARGB_8888)
              try {
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val outputDirectory = File(reactContext.cacheDir, "presentation-pages").apply {
                  check(mkdirs() || isDirectory) { "Rendered-page cache is unavailable" }
                }
                val fileKey = Integer.toHexString(input.absolutePath.hashCode())
                val generation = System.nanoTime()
                val output = File(outputDirectory, "$fileKey-$pageIndex-$bitmapWidth-$generation.png")
                val temporaryOutput = File(outputDirectory, ".${output.name}.part")
                try {
                  FileOutputStream(temporaryOutput).use { stream ->
                    check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                      "Rendered PDF page could not be saved"
                    }
                    stream.fd.sync()
                  }
                  check(temporaryOutput.renameTo(output)) { "Rendered PDF page could not be published" }
                } finally {
                  temporaryOutput.delete()
                }
                val result = Arguments.createMap().apply {
                  putString("uri", Uri.fromFile(output).toString())
                  putInt("pageCount", renderer.pageCount)
                  putInt("width", bitmapWidth)
                  putInt("height", bitmapHeight)
                }
                promise.resolve(result)
              } finally {
                bitmap.recycle()
              }
            }
          }
        }
      } catch (error: Throwable) {
        promise.reject("PRESENTATION_PDF_RENDER_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun openExternal(filePath: String, mimeType: String, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val normalizedMimeType = mimeType.lowercase()
        require(normalizedMimeType in allowedExternalMimeTypes) { "Presentation format is not supported" }
        val input = checkedPresentationFile(filePath)
        val uri = FileProvider.getUriForFile(
          reactContext,
          "${reactContext.packageName}.presentation-files",
          input,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, normalizedMimeType)
          clipData = ClipData.newRawUri("presentation", uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(intent, input.name).apply {
          clipData = ClipData.newRawUri("presentation", uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val activity = reactContext.getCurrentActivity()
        if (activity != null) {
          activity.startActivity(chooser)
        } else {
          chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          reactContext.startActivity(chooser)
        }
        promise.resolve(true)
      } catch (error: ActivityNotFoundException) {
        promise.reject("PRESENTATION_VIEWER_UNAVAILABLE", "No application can open this presentation", error)
      } catch (error: Throwable) {
        promise.reject("PRESENTATION_EXTERNAL_OPEN_FAILED", error.message, error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdownNow()
    super.invalidate()
  }
}
