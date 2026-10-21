import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../../store/auth"
import { useGuideStore } from "../../store/guide"
import { offlineScopeKey } from "../../services/offline-scope"
import type { GuideTourId } from "../../guide/tour"
import { fieldTheme, themed, useFieldColorScheme } from "../../theme/fieldTheme"
import GuideSpot from "./GuideSpot"

/**
 * «Bələdçi»: the tour again, from «Daha çox» and the profile (owner,
 * 2026-10-18: «запускается заново из профиля или „Daha çox"»). A word on the
 * button, not an icon alone.
 *
 * - `pill` sits in a screen's heading.
 * - `card` is a row of the profile's hints card, with what it is and how long.
 */
export default function GuideButton({
  tour,
  variant = "pill",
  spot,
  onBeforeStart,
}: {
  tour: GuideTourId
  variant?: "pill" | "card"
  spot?: string
  /** E.g. back to the top of «Daha çox», so the tour's way back finds it there. */
  onBeforeStart?: () => void
}) {
  const { t } = useTranslation()
  useFieldColorScheme()
  const organizationId = useAuthStore((state) => state.agent?.organizationId)
  const agentId = useAuthStore((state) => state.agent?.id)
  const scope = offlineScopeKey(organizationId, agentId)
  if (!scope) return null
  const open = () => {
    onBeforeStart?.()
    useGuideStore.getState().start(scope, tour)
  }

  if (variant === "card") {
    return (
      <View style={styles.card}>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{t("guide.openTitle")}</Text>
          <Text style={styles.cardNote}>{t("guide.openNote")}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          testID="guide-open-card"
          onPress={open}
          style={({ pressed }) => [styles.cardButton, pressed && styles.pressed]}
        >
          <Icon name="compass-outline" size={20} color={fieldTheme.color.primaryStrong} />
          <Text style={styles.cardButtonText}>{t("guide.openAction")}</Text>
          {spot ? <GuideSpot id={spot} /> : null}
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      testID="guide-open"
      hitSlop={6}
      onPress={open}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Icon name="compass-outline" size={19} color={fieldTheme.color.primaryStrong} />
      <Text style={styles.pillText} numberOfLines={1}>{t("guide.open")}</Text>
      {spot ? <GuideSpot id={spot} /> : null}
    </Pressable>
  )
}

const styles = themed(() => StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: fieldTheme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    // Outlined, like «Komandaya yaz» (owner-approved colours, 2026-10-18).
    backgroundColor: fieldTheme.color.surface,
    borderColor: fieldTheme.color.primary,
  },
  pillText: { color: fieldTheme.color.primaryStrong, fontSize: 14.5, fontWeight: "900" },
  card: {
    marginTop: fieldTheme.space.md,
    paddingTop: fieldTheme.space.md,
    borderTopWidth: 1,
    borderTopColor: fieldTheme.color.border,
    gap: fieldTheme.space.sm,
  },
  cardCopy: { gap: 2 },
  cardTitle: { color: fieldTheme.color.ink, fontSize: 15, fontWeight: "800" },
  cardNote: { color: fieldTheme.color.inkMuted, fontSize: 13, lineHeight: 18 },
  cardButton: {
    minHeight: 46,
    borderRadius: fieldTheme.radius.md,
    borderWidth: 1,
    borderColor: fieldTheme.color.primary,
    backgroundColor: fieldTheme.color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: fieldTheme.space.sm,
    paddingHorizontal: fieldTheme.space.md,
  },
  cardButtonText: { color: fieldTheme.color.primaryStrong, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.8 },
}))
