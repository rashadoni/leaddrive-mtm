import { isShortWindow } from "../theme/layoutBreakpoints"

/** Android's minimum touch target; the dialog's buttons never go below it. */
export const NOTES_ACTION_MIN_HEIGHT = 48

/**
 * From this window width a short window has room for the note field and both
 * buttons in one row: a phone on its side is 823 dp wide, a phone upright or
 * split screen is not.
 */
export const NOTES_INLINE_MIN_WIDTH = 560

export const NOTES_INPUT_MIN_HEIGHT = { regular: 96, short: 56 } as const

export interface NotesModalLayout {
  /** The window is a phone on its side: every row of the card counts. */
  short: boolean
  /** Note field and buttons share one row instead of stacking. */
  inline: boolean
  inputMinHeight: number
}

/**
 * How the check-out note dialog fits the window it opens in.
 *
 * Galaxy S23 in landscape, 823×384 dp (2026-09-14): title, hint, a 96 dp
 * field and the button row stacked, with the keyboard up, pushed «Təsdiq et»
 * below the screen. On a short window the field starts two lines tall and, if
 * the width allows, the buttons stand next to it, so the card is about one
 * third of the height instead of more than half. The field still grows with
 * the text — it is the page that scrolls, never the field.
 */
export function notesModalLayout(width: number, height: number): NotesModalLayout {
  const short = isShortWindow(height)
  return {
    short,
    inline: short && width >= NOTES_INLINE_MIN_WIDTH,
    inputMinHeight: short ? NOTES_INPUT_MIN_HEIGHT.short : NOTES_INPUT_MIN_HEIGHT.regular,
  }
}
