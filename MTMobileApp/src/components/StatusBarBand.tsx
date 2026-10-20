import React from "react"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { fieldTheme, themed } from "../theme/fieldTheme"

/**
 * A green strip under the status bar for screens whose header scrolls away.
 *
 * Android 15+ draws apps edge-to-edge, so once the green header has scrolled
 * off, cards pass under the clock and the app-wide light icons sit white on
 * white. Found on a Redmi Pad SE on 2026-09-14 after «Ziyarətlər» and
 * «Tapşırıqlar» became single scrolling pages; «Bu gün» and «Marşrut» had it on
 * the phone already. Render it last in the screen's root so it stays on top.
 */
export default function StatusBarBand({ tone = "green" }: { tone?: "green" | "light" } = {}) {
  const insets = useSafeAreaInsets()
  if (insets.top <= 0) return null
  return <View pointerEvents="none" style={[styles.band, tone === "light" && styles.light, { height: insets.top }]} />
}

const styles = themed(() => StyleSheet.create({
  band: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: fieldTheme.color.primaryStrong },
  // The white tab headers (owner-approved colours, 2026-10-18): the band is
  // white too, and the screen's LightScreenStatusBar turns the icons dark.
  light: { backgroundColor: fieldTheme.color.surface },
}))
