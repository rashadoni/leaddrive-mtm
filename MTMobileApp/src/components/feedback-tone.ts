import { fieldTheme } from "../theme/fieldTheme"
import type { FeedbackTone } from "../services/app-feedback"

export interface FeedbackToneColors {
  /** Fill of the notice card. */
  background: string
  /** Icon and the card's leading edge. */
  accent: string
  /** Hairline around the card, the accent at a third. */
  border: string
  /** Ionicons glyph name. */
  icon: string
}

/**
 * The four tones in the app's own palette. The old toast used Tailwind's
 * green/red/amber/blue 500, colours nothing else in the field app wears
 * (2026-09-14). Success is the brand green rather than a second green.
 * Text on every tone is `ink`: the accents are for the icon, since blue and
 * red on their soft fills stay under 4.5:1 for body text.
 */
export const FEEDBACK_TONE_COLORS: Record<FeedbackTone, FeedbackToneColors> = {
  success: {
    background: fieldTheme.color.primarySoft,
    accent: fieldTheme.color.primary,
    border: fieldTheme.color.primary + "55",
    icon: "checkmark-circle",
  },
  error: {
    background: fieldTheme.color.dangerSoft,
    accent: fieldTheme.color.danger,
    border: fieldTheme.color.danger + "55",
    icon: "alert-circle",
  },
  warning: {
    background: fieldTheme.color.amberSoft,
    accent: fieldTheme.color.amber,
    border: fieldTheme.color.amber + "55",
    icon: "warning",
  },
  info: {
    background: fieldTheme.color.blueSoft,
    accent: fieldTheme.color.blue,
    border: fieldTheme.color.blue + "55",
    icon: "information-circle",
  },
}
