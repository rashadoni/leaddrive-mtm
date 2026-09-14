import { isShortWindow, isTabletWidth, NAV_RAIL_WIDTH } from "../theme/layoutBreakpoints"
import type { AppChoiceButtonStyle } from "../services/app-feedback"

/** Android's minimum touch target; the sheet's buttons never go below it. */
export const APP_CHOICE_BUTTON_MIN_HEIGHT = 48

/** The card does not stretch across a tablet or a phone on its side. */
export const APP_CHOICE_MAX_WIDTH = 560

/** Two buttons side by side stay readable from this window width. */
export const APP_CHOICE_ROW_MIN_WIDTH = 340

export interface AppChoiceLayout {
  /** A phone on its side (~384 dp tall): tighter padding, card centred. */
  short: boolean
  /** Buttons in one row instead of a column. */
  row: boolean
}

/**
 * How the choice sheet fits the window.
 *
 * Galaxy S23 on its side, 823×384 dp: stacked buttons (3 × 48 dp plus gaps)
 * under a title and a three-line message leave no room, so on a wide window
 * all buttons share one row. An upright phone (360–412 dp) keeps two short
 * buttons in a row and stacks three, where «Rəhbərə bildir» would otherwise
 * wrap into a column of syllables.
 */
export function appChoiceLayout(width: number, height: number, buttonCount: number): AppChoiceLayout {
  const short = isShortWindow(height)
  const row = width >= APP_CHOICE_MAX_WIDTH || (buttonCount <= 2 && width >= APP_CHOICE_ROW_MIN_WIDTH)
  return { short, row }
}

export type AppChoiceButtonLook = "quiet" | "danger" | "primary" | "outline"

/**
 * Cancel-styled buttons go first: left in a row, bottom in a column (the
 * column is drawn reversed), so the way back is never the control under the
 * thumb on the right (audit B17). The rest keep the caller's order.
 */
export function orderChoiceButtons<B extends { style: AppChoiceButtonStyle }>(
  buttons: ReadonlyArray<B>,
): Array<{ button: B; index: number }> {
  const indexed = buttons.map((button, index) => ({ button, index }))
  return [
    ...indexed.filter((entry) => entry.button.style === "cancel"),
    ...indexed.filter((entry) => entry.button.style !== "cancel"),
  ]
}

/**
 * One filled button per sheet: destructive is red, the last default is the
 * brand green, an earlier default is outlined, cancel is quiet.
 */
export function choiceButtonLook(style: AppChoiceButtonStyle, isLast: boolean): AppChoiceButtonLook {
  if (style === "cancel") return "quiet"
  if (style === "destructive") return "danger"
  return isLast ? "primary" : "outline"
}

/**
 * Where the notice may lie: below the status bar and, from 600 dp where tab
 * screens get the navigation rail, right of the rail so it never covers a tab.
 */
export function noticeFrame(input: {
  width: number
  insets: { top: number; left: number; right: number }
  gap: number
}): { top: number; left: number; right: number } {
  const railLeft = isTabletWidth(input.width) ? NAV_RAIL_WIDTH : 0
  return {
    top: input.insets.top + input.gap,
    left: input.insets.left + railLeft + input.gap,
    right: input.insets.right + input.gap,
  }
}
