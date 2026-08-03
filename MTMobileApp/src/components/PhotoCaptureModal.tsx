import React, { useRef, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native"
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera"
import { photoWatermarkPipeline } from "../lib/photo-watermark"
import { useBootstrapStore } from "../store/bootstrap"

/**
 * M1-2: when this context is passed, every captured photo gets EXIF tags
 * (Software, Make, Model, ImageDescription, DateTimeOriginal, GPS) before
 * being handed to `onPhotoTaken`. Callers that don't need provenance (e.g.
 * debug screens) can simply omit the prop.
 *
 * The VISIBLE plaque (date / agent / customer / GPS drawn onto the image) is
 * a separate, tenant-controlled decision read from bootstrap policies — it is
 * off unless the organization enabled it, because the plaque leaves the CRM
 * inside the file. EXIF provenance is written either way.
 */
export interface WatermarkContext {
  agent: { id: string; name: string; code: string }
  visit: { id: string } | null
  customer: { id: string; name: string } | null
  /** Fetch current GPS. Should resolve quickly; null on permission denial / timeout. */
  getLocation: () => Promise<{ latitude: number; longitude: number } | null>
  /** Optional fallback when getLocation returns null (background-tracked position). */
  getLastKnownLocation?: () => { latitude: number; longitude: number; capturedAt: Date } | null
}

interface Props {
  visible: boolean
  onClose: () => void
  onPhotoTaken: (path: string) => void
  watermark?: WatermarkContext
}

export default function PhotoCaptureModal({ visible, onClose, onPhotoTaken, watermark }: Props) {
  const device = useCameraDevice("back")
  const { hasPermission, requestPermission } = useCameraPermission()
  const camera = useRef<Camera>(null)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState<"off" | "on">("off")
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  // Tenant policy, server-authoritative. Null bootstrap (not yet loaded, or
  // the call failed) resolves to `false` — the direction that cannot leak a
  // customer name into a file we no longer control.
  const burnVisibleWatermark = useBootstrapStore(
    (state) => state.data?.policies.photoWatermark === true,
  )

  const handleCapture = async () => {
    if (!camera.current || capturing) return
    setCapturing(true)
    try {
      // Fetch GPS in parallel with the shutter so the preview shows the
      // watermark with no perceptible extra delay.
      const [photo, currentLocation] = await Promise.all([
        camera.current.takePhoto({ flash, enableShutterSound: true }),
        watermark?.getLocation() ?? Promise.resolve(null),
      ])

      let finalPath = photo.path
      if (watermark) {
        try {
          const lastKnown = watermark.getLastKnownLocation?.() ?? undefined
          const { watermarkedPath } = await photoWatermarkPipeline({
            photoPath: photo.path,
            timestamp: new Date(),
            agent: watermark.agent,
            visit: watermark.visit,
            customer: watermark.customer,
            location: currentLocation,
            lastKnownLocation: lastKnown ?? undefined,
            burnVisibleWatermark,
          })
          finalPath = watermarkedPath
        } catch (e: any) {
          // Don't lose the photo if watermark fails — backend will mark it
          // PENDING (missing/invalid Software tag) so a supervisor sees it
          // in the review queue. Better than dropping the visit's only
          // proof of presence.
          console.warn("[PhotoCaptureModal] watermark pipeline failed:", e?.message ?? e)
        }
      }
      setPreviewPath(finalPath)
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to capture photo")
    } finally {
      setCapturing(false)
    }
  }

  const handleRetake = () => {
    setPreviewPath(null)
  }

  const handleUsePhoto = () => {
    if (previewPath) {
      onPhotoTaken(previewPath)
      setPreviewPath(null)
      onClose()
    }
  }

  if (!visible) return null

  if (!hasPermission) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Camera permission is required to take photos</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    )
  }

  if (!device) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>No camera device found</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { setPreviewPath(null); onClose() }}>
      <View style={styles.container}>
        {previewPath ? (
          <>
            {/* Photo preview */}
            <Image
              source={{ uri: previewPath.startsWith("file://") ? previewPath : `file://${previewPath}` }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />

            {/* Top bar - close */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.topBtn} onPress={() => { setPreviewPath(null); onClose() }}>
                <Text style={styles.topBtnText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Preview action buttons */}
            <View style={styles.previewBar}>
              <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.usePhotoBtn} onPress={handleUsePhoto}>
                <Text style={styles.usePhotoBtnText}>Use Photo</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Camera
              ref={camera}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={visible && !previewPath}
              photo={true}
            />

            {/* Top bar */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.topBtn} onPress={onClose}>
                <Text style={styles.topBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.topBtn}
                onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
              >
                <Text style={styles.topBtnText}>
                  Flash: {flash.toUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.captureBtn, capturing && { opacity: 0.5 }]}
                onPress={handleCapture}
                disabled={capturing}
              >
                {capturing ? (
                  <ActivityIndicator size="small" color="#6C63FF" />
                ) : (
                  <View style={styles.captureInner} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0B0B1E",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  permissionText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginBottom: 12,
  },
  permissionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  cancelBtnText: { color: "#94a3b8", fontSize: 14 },
  topBar: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  topBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  bottomBar: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  previewBar: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  retakeBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  retakeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  usePhotoBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#6C63FF",
  },
  usePhotoBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
})
