/**
 * Swiping between the pages of the in-app PDF presentation (client of the
 * owner, 2026-11-11, on a tablet video: the page stayed «Səhifə 1/7» under the
 * finger — «когда внутри планшета открывает как файл, то легче, надо
 * симитировать такое пролистывание»). The page follows the finger, and on
 * release it either settles on the neighbour or springs back, as the system
 * gallery does. Pure, like presentation-zoom.ts: the screen wires the gesture.
 */

/** The dark gap between two neighbouring pages while one slides in. */
export const PRESENTATION_PAGE_GAP = 24

/** A drag shorter than this is not a swipe, whatever its speed: a finger resting on the page wobbles. */
export const PRESENTATION_SWIPE_MIN_PX = 24

/** A fling faster than this (px per ms, as PanResponder reports it) turns the page even when short. */
export const PRESENTATION_SWIPE_FLING = 0.45

/** How far a drag must go to turn the page: a fifth of the stage, never more than 160 px on a tablet. */
export function swipeDistance(stageWidth: number): number {
  return Math.min(160, Math.max(60, stageWidth * 0.2))
}

/**
 * Where the strip of pages stands under the finger. Past the first or the last
 * page there is nothing to show: the page gives a little and comes back, so
 * the agent feels the end instead of thinking the swipe did not register.
 */
export function swipeOffset(dx: number, hasPrevious: boolean, hasNext: boolean): number {
  if ((dx > 0 && !hasPrevious) || (dx < 0 && !hasNext)) return dx * 0.25
  return dx
}

/** -1: to the previous page, 1: to the next, 0: back to where it was. */
export function swipeTurn(input: { dx: number; vx: number; stageWidth: number; hasPrevious: boolean; hasNext: boolean }): -1 | 0 | 1 {
  const { dx, vx, stageWidth, hasPrevious, hasNext } = input
  if (Math.abs(dx) < PRESENTATION_SWIPE_MIN_PX) return 0
  const far = Math.abs(dx) >= swipeDistance(stageWidth)
  const flung = Math.abs(vx) >= PRESENTATION_SWIPE_FLING && Math.sign(vx) === Math.sign(dx)
  if (!far && !flung) return 0
  if (dx < 0) return hasNext ? 1 : 0
  return hasPrevious ? -1 : 0
}

/** The pages worth rendering ahead: the neighbours of the one on screen, next first. */
export function pagesToPrepare(pageIndex: number, pageCount: number): number[] {
  return [pageIndex + 1, pageIndex - 1].filter((index) => index >= 0 && index < pageCount)
}

/**
 * Where the strip of pages rests with a page on screen: page i has its own
 * place at i stage widths (and a gap each), so turning only moves the strip.
 */
export function stripRest(pageIndex: number, stageWidth: number): number {
  if (stageWidth <= 0 || pageIndex <= 0) return 0
  return -pageIndex * (stageWidth + PRESENTATION_PAGE_GAP)
}

/** Dots under the counter only while they still read as dots. */
export const PRESENTATION_DOTS_MAX = 15
