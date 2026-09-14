import React, { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { photoWatermarkPipeline } from "../lib/photo-watermark"
import { useBootstrapStore } from "../store/bootstrap"
import { fieldTheme } from "../theme/fieldTheme"

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

// The viewfinder and the preview stay on black: a tint around the picture
// changes how the agent judges the shot. Controls on top use brand colors
// (2026-09-14: purple «Use Photo» and English labels on the Galaxy S23).
const VIEWFINDER_BLACK = "#000000"

export default function PhotoCaptureModal(props: Props) {
  if (!props.visible) return null
  // The modal is its own Android window, drawn under the system bars (target
  // SDK 36 is edge-to-edge), so the insets come from a provider inside it, as
  // in SignaturePadModal. On the Galaxy S23 on its side the camera cutout takes
  // 45 dp on one side and the navigation bar the other; «Bağla», the flash and
  // «Fotonu saxla», pinned 20-24 dp from the physical edge, sat in that space.
  //
  // The screen is mounted only while visible, so every opening starts on the
  // viewfinder with nothing pending: a shot still being processed when the
  // agent pressed «Bağla» is dropped instead of waiting as a preview for the
  // next opening.
  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        <PhotoCapture {...props} />
      </SafeAreaProvider>
    </Modal>
  )
}

function PhotoCapture({ onClose, onPhotoTaken, watermark }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const device = useCameraDevice("back")
  const { hasPermission, requestPermission } = useCameraPermission()
  const camera = useRef<Camera>(null)
  const mounted = useRef(true)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState<"off" | "on">("off")
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  // Tenant policy, server-authoritative. Null bootstrap (not yet loaded, or
  // the call failed) resolves to `false` — the direction that cannot leak a
  // customer name into a file we no longer control.
  const burnVisibleWatermark = useBootstrapStore(
    (state) => state.data?.policies.photoWatermark === true,
  )

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

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
      // GPS for the watermark can take up to 15 s on «Ziyarətlər»; the agent
      // may have closed the camera meanwhile. That shot was never confirmed.
      if (!mounted.current) return
      setPreviewPath(finalPath)
    } catch (e: any) {
      console.warn("[PhotoCaptureModal] capture failed:", e?.message ?? e)
      // Closing the camera mid-shot rejects takePhoto; nobody is looking.
      if (!mounted.current) return
      // The native message is English and technical; the agent needs a step.
      Alert.alert(t("photoCapture.captureFailedTitle"), t("photoCapture.captureFailedBody"))
    } finally {
      if (mounted.current) setCapturing(false)
    }
  }

  const handleRetake = () => {
    setPreviewPath(null)
  }

  // The only place a photo leaves this screen: the agent pressed «Fotonu
  // saxla» on the preview. «Bağla», the back button and «Yenidən çək» drop it.
  const handleUsePhoto = () => {
    if (previewPath) {
      onPhotoTaken(previewPath)
      setPreviewPath(null)
      onClose()
    }
  }

  const handleAllow = async () => {
    // After a second «Don't allow» Android answers «false» at once and never
    // shows its dialog again, so the same button would silently do nothing.
    // From any refusal on the screen points to Settings, which works always.
    const granted = await requestPermission()
    if (!granted && mounted.current) setPermissionDenied(true)
  }

  const edges = {
    paddingTop: insets.top + fieldTheme.space.lg,
    paddingBottom: insets.bottom + fieldTheme.space.lg,
    paddingLeft: insets.left + fieldTheme.space.xl,
    paddingRight: insets.right + fieldTheme.space.xl,
  }

  if (!hasPermission || !device) {
    const noCamera = hasPermission && !device
    const message = noCamera
      ? t("photoCapture.noCamera")
      : permissionDenied ? t("photoCapture.permissionDenied") : t("photoCapture.permissionBody")
    return (
      <View style={styles.infoScreen}>
        <View pointerEvents="none" style={[styles.statusBand, { height: insets.top }]} />
        <ScrollView contentContainerStyle={[styles.infoContent, edges]}>
          <View style={styles.infoIcon}>
            <Icon name={noCamera ? "camera-outline" : "camera"} size={36} color={fieldTheme.color.primary} />
          </View>
          <Text style={styles.infoText}>{message}</Text>
          {noCamera ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={permissionDenied ? () => { void Linking.openSettings() } : () => { void handleAllow() }}
              style={({ pressed }) => [styles.primaryButton, styles.infoButton, pressed && styles.pressed]}
            >
              <Icon name={permissionDenied ? "settings-outline" : "checkmark-circle"} size={22} color={fieldTheme.color.onColor} />
              <Text style={styles.primaryText}>
                {permissionDenied ? t("permission.openSettings") : t("photoCapture.allow")}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.secondaryButton, styles.infoButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{noCamera ? t("photoCapture.close") : t("photoCapture.cancel")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  const topBarPosition = {
    top: insets.top + fieldTheme.space.md,
    left: insets.left + fieldTheme.space.lg,
    right: insets.right + fieldTheme.space.lg,
  }

  const closeButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("photoCapture.close")}
      onPress={onClose}
      hitSlop={8}
      style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
    >
      <Icon name="close" size={22} color={fieldTheme.color.ink} />
      <Text style={styles.topButtonText}>{t("photoCapture.close")}</Text>
    </Pressable>
  )

  return (
    <View style={styles.container}>
      {previewPath ? (
        <>
          <Image
            source={{ uri: previewPath.startsWith("file://") ? previewPath : `file://${previewPath}` }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityLabel={t("photoCapture.preview")}
          />

          <View style={[styles.topBar, topBarPosition]}>{closeButton}</View>

          <View style={[styles.previewBar, { bottom: insets.bottom + fieldTheme.space.lg, left: insets.left + fieldTheme.space.lg, right: insets.right + fieldTheme.space.lg }]}>
            <View style={styles.previewActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleRetake}
                style={({ pressed }) => [styles.secondaryButton, styles.previewButton, pressed && styles.pressed]}
              >
                <Icon name="refresh-outline" size={21} color={fieldTheme.color.primary} />
                <Text style={styles.secondaryText}>{t("photoCapture.retake")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleUsePhoto}
                style={({ pressed }) => [styles.primaryButton, styles.previewButton, pressed && styles.pressed]}
              >
                <Icon name="checkmark-circle" size={22} color={fieldTheme.color.onColor} />
                <Text style={styles.primaryText}>{t("photoCapture.usePhoto")}</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            photo={true}
          />

          <View style={[styles.topBar, topBarPosition]}>
            {closeButton}
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t("photoCapture.flash")}
              accessibilityState={{ checked: flash === "on" }}
              onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
              hitSlop={8}
              style={({ pressed }) => [styles.topButton, flash === "on" && styles.topButtonOn, pressed && styles.pressed]}
            >
              <Icon
                name={flash === "on" ? "flash" : "flash-off"}
                size={20}
                color={flash === "on" ? fieldTheme.color.onColor : fieldTheme.color.ink}
              />
              <Text style={[styles.topButtonText, flash === "on" && styles.topButtonTextOn]}>
                {flash === "on" ? t("photoCapture.flashOn") : t("photoCapture.flashOff")}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.bottomBar, { bottom: insets.bottom + fieldTheme.space.xl, left: insets.left, right: insets.right }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("photoCapture.capture")}
              accessibilityState={{ disabled: capturing, busy: capturing }}
              onPress={handleCapture}
              disabled={capturing}
              style={({ pressed }) => [styles.captureBtn, (capturing || pressed) && styles.pressed]}
            >
              {capturing ? (
                <ActivityIndicator size="small" color={fieldTheme.color.primary} />
              ) : (
                <View style={styles.captureInner} />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VIEWFINDER_BLACK,
  },
  infoScreen: {
    flex: 1,
    backgroundColor: fieldTheme.color.canvas,
  },
  statusBand: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: fieldTheme.color.primaryStrong, zIndex: 1 },
  infoContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: fieldTheme.space.md,
  },
  infoIcon: {
    width: 64,
    height: 64,
    borderRadius: fieldTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: fieldTheme.color.primarySoft,
  },
  infoText: {
    maxWidth: 420,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
    color: fieldTheme.color.ink,
    marginBottom: fieldTheme.space.sm,
  },
  infoButton: { width: "100%", maxWidth: 420 },
  topBar: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: fieldTheme.space.md,
  },
  topButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.xs,
    borderRadius: fieldTheme.radius.pill,
    paddingHorizontal: fieldTheme.space.lg,
    backgroundColor: fieldTheme.color.surface,
  },
  topButtonOn: { backgroundColor: fieldTheme.color.primary },
  topButtonText: { fontSize: 15, fontWeight: "700", color: fieldTheme.color.ink },
  topButtonTextOn: { color: fieldTheme.color.onColor },
  bottomBar: {
    position: "absolute",
    alignItems: "center",
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: fieldTheme.color.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: fieldTheme.color.primary,
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 2,
    borderColor: fieldTheme.color.border,
  },
  previewBar: {
    position: "absolute",
    alignItems: "center",
  },
  previewActions: {
    width: "100%",
    maxWidth: 560,
    flexDirection: "row",
    gap: fieldTheme.space.md,
  },
  previewButton: { flex: 1 },
  secondaryButton: {
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1.5,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
  },
  secondaryText: { fontSize: 16, fontWeight: "700", color: fieldTheme.color.primary },
  primaryButton: {
    minHeight: 56,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
  },
  primaryText: { fontSize: 17, fontWeight: "800", color: fieldTheme.color.onColor },
  pressed: { opacity: 0.8 },
})
