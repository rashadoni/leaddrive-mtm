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

interface Props {
  visible: boolean
  onClose: () => void
  onPhotoTaken: (path: string) => void
}

export default function PhotoCaptureModal({ visible, onClose, onPhotoTaken }: Props) {
  const device = useCameraDevice("back")
  const { hasPermission, requestPermission } = useCameraPermission()
  const camera = useRef<Camera>(null)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState<"off" | "on">("off")
  const [previewPath, setPreviewPath] = useState<string | null>(null)

  const handleCapture = async () => {
    if (!camera.current || capturing) return
    setCapturing(true)
    try {
      const photo = await camera.current.takePhoto({
        flash,
        enableShutterSound: true,
      })
      setPreviewPath(photo.path)
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
