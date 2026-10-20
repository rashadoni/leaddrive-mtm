import React, { useState } from "react"
import { ActivityIndicator, Linking, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import { useTranslation } from "react-i18next"
import { fieldTheme, themed } from "../../theme/fieldTheme"
import { managerApi } from "../../services/manager-api"
import { hasCapability } from "../../services/bootstrap"
import { captureOneShotLocation } from "../../services/self-location-share"
import { useBootstrapStore } from "../../store/bootstrap"

type SelfShareState = "idle" | "locating" | "sending" | "success" | "permissionDenied" | "error"

/**
 * «Mövqeyimi paylaş» — one GPS point of the manager on the team map. It stood
 * at the top of «Komanda»; the owner (2026-10-17) found it of little use there
 * and it moved to «Daha çox», unchanged. The card says each state in its own
 * words, so it needs no toast of its own.
 */
export default function ManagerSelfLocationShare() {
  const { t } = useTranslation()
  const canShare = useBootstrapStore((state) => hasCapability(state.capabilities, "SELF_LOCATION_SHARE"))
  const [state, setState] = useState<SelfShareState>("idle")
  const busy = state === "locating" || state === "sending"
  if (!canShare) return null

  const requestForegroundLocation = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true
    try {
      const [fineGranted, coarseGranted] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION),
      ])
      if (fineGranted || coarseGranted) return true
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: t("managerShell.shareLocationPermissionTitle"),
        message: t("managerShell.shareLocationPermissionBody"),
        buttonPositive: t("permission.allow"),
        buttonNegative: t("permission.deny"),
      })
      if (result === PermissionsAndroid.RESULTS.GRANTED) return true
      // Android 12+ may grant approximate (COARSE) location when the user
      // declines precise (FINE). A one-shot approximate point is still useful
      // and must not be misreported as a total permission denial.
      return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION)
    } catch {
      return false
    }
  }

  const share = async () => {
    if (busy) return
    setState("locating")
    if (!(await requestForegroundLocation())) {
      setState("permissionDenied")
      return
    }
    try {
      const position = await captureOneShotLocation()
      setState("sending")
      const response = await managerApi.shareSelfLocation(position)
      if (!response?.success) throw new Error("SELF_LOCATION_SHARE_FAILED")
      setState("success")
    } catch (error: any) {
      if (error?.message === "SESSION_EXPIRED") return
      setState("error")
    }
  }

  return (
    <View style={styles.card} testID="manager-self-location-share">
      <View style={styles.icon}>
        <Icon name={state === "success" ? "checkmark" : "navigate"} size={24} color={fieldTheme.color.primaryStrong} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t("managerShell.shareLocationTitle")}</Text>
        <Text style={styles.body}>
          {state === "locating"
            ? t("managerShell.shareLocationLocating")
            : state === "sending"
              ? t("managerShell.shareLocationSending")
              : state === "success"
                ? t("managerShell.shareLocationSuccessBody")
                : state === "permissionDenied"
                  ? t("managerShell.shareLocationPermissionDeniedBody")
                  : state === "error"
                    ? t("managerShell.shareLocationErrorBody")
                    : t("managerShell.shareLocationBody")}
        </Text>
        {state === "permissionDenied" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("permission.openSettings")}
            style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
            onPress={() => { void Linking.openSettings() }}
          >
            <Icon name="settings-outline" size={17} color={fieldTheme.color.primaryStrong} />
            <Text style={styles.settingsLinkText}>{t("permission.openSettings")}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("managerShell.shareLocationTitle")}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}
        onPress={() => { void share() }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={fieldTheme.color.onColor} />
        ) : (
          <Icon name={state === "success" ? "refresh" : "location"} size={20} color={fieldTheme.color.onColor} />
        )}
        <Text style={styles.buttonText}>
          {state === "success"
            ? t("managerShell.shareLocationAgain")
            : state === "permissionDenied" || state === "error"
              ? t("managerShell.shareLocationRetry")
              : state === "locating"
                ? t("managerShell.shareLocationLocatingShort")
                : state === "sending"
                  ? t("managerShell.shareLocationSendingShort")
                  : t("managerShell.shareLocationAction")}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = themed(() => StyleSheet.create({
  // A white card; its button is the one fill (owner-approved colours, 2026-10-18).
  card: {
    gap: fieldTheme.space.md,
    padding: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.lg,
    backgroundColor: fieldTheme.color.surface,
    borderWidth: 1,
    borderColor: fieldTheme.color.border,
  },
  icon: {
    width: 28,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  copy: { gap: fieldTheme.space.xs },
  title: { color: fieldTheme.color.ink, fontSize: 17, fontWeight: "900" },
  body: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.lg,
    borderRadius: fieldTheme.radius.md,
    backgroundColor: fieldTheme.color.primary,
  },
  buttonText: { color: fieldTheme.color.onColor, fontSize: 14, fontWeight: "900" },
  settingsLink: {
    minHeight: 40,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.sm,
  },
  settingsLinkText: { color: fieldTheme.color.primaryStrong, fontSize: 13, fontWeight: "900", textDecorationLine: "underline" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
}))
