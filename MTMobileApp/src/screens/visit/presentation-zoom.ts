/**
 * Zoom and pan maths for the in-app PDF presentation viewer.
 *
 * A rendered page is shown "contain"-fitted inside the viewer stage, which on
 * a phone in portrait leaves a 16:9 slide about a third of the screen tall.
 * The agent then cannot read a price table over the doctor's shoulder, and
 * before this module there was no way to enlarge it at all.
 *
 * Everything here is pure: the screen owns the gesture wiring and the Animated
 * values, these functions own the arithmetic that decides what is on screen.
 * Keeping them apart is what makes the behaviour testable without a device.
 */

export interface ZoomPoint {
  x: number
  y: number
}

export interface ZoomSize {
  width: number
  height: number
}

export interface ZoomTransform {
  scale: number
  x: number
  y: number
}

/** A fitted page fills the stage; anything below 1 would show less than that. */
export const PRESENTATION_ZOOM_MIN = 1
/** Four times fit is already past the rendered resolution of a slide. */
export const PRESENTATION_ZOOM_MAX = 4
/** One double tap should reach "read the table", not "see one word". */
export const PRESENTATION_ZOOM_DOUBLE_TAP = 2.5
/** Two taps further apart than this are two taps, not a double tap (ms). */
export const PRESENTATION_DOUBLE_TAP_MS = 300

export function clampZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return PRESENTATION_ZOOM_MIN
  return Math.min(PRESENTATION_ZOOM_MAX, Math.max(PRESENTATION_ZOOM_MIN, scale))
}

export function isZoomed(scale: number): boolean {
  return clampZoomScale(scale) > PRESENTATION_ZOOM_MIN + 0.01
}

/** A double tap zooms in from fit, and returns to fit from anywhere else. */
export function nextDoubleTapScale(current: number): number {
  return isZoomed(current) ? PRESENTATION_ZOOM_MIN : PRESENTATION_ZOOM_DOUBLE_TAP
}

export function isDoubleTap(previousTapAt: number | null, tapAt: number): boolean {
  if (previousTapAt == null) return false
  const gap = tapAt - previousTapAt
  return gap >= 0 && gap <= PRESENTATION_DOUBLE_TAP_MS
}

export function pinchDistance(first: ZoomPoint, second: ZoomPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function pinchFocus(first: ZoomPoint, second: ZoomPoint): ZoomPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

/**
 * The page box at scale 1: the rendered bitmap "contain"-fitted into the
 * stage. Both sides are capped by the stage, so a wide slide is limited by
 * width and a tall one by height, exactly like `resizeMode="contain"`.
 */
export function fittedPageBox(stage: ZoomSize, page: ZoomSize): ZoomSize {
  const stageWidth = Math.max(0, stage.width)
  const stageHeight = Math.max(0, stage.height)
  if (stageWidth === 0 || stageHeight === 0) return { width: 0, height: 0 }
  if (!(page.width > 0) || !(page.height > 0)) return { width: stageWidth, height: stageHeight }
  const ratio = Math.min(stageWidth / page.width, stageHeight / page.height)
  return { width: page.width * ratio, height: page.height * ratio }
}

/**
 * How far the page may be dragged at this scale. Panning must never reveal a
 * gap beside the page: once a side is smaller than the stage it stays centred.
 */
export function panBounds(fitted: ZoomSize, stage: ZoomSize, scale: number): ZoomSize {
  const safeScale = clampZoomScale(scale)
  return {
    width: Math.max(0, (fitted.width * safeScale - stage.width) / 2),
    height: Math.max(0, (fitted.height * safeScale - stage.height) / 2),
  }
}

export function clampPan(offset: ZoomPoint, fitted: ZoomSize, stage: ZoomSize, scale: number): ZoomPoint {
  const bounds = panBounds(fitted, stage, scale)
  const clamp = (value: number, limit: number) => {
    if (!Number.isFinite(value)) return 0
    const bounded = Math.min(limit, Math.max(-limit, value))
    // `Math.max(-0, -0)` is -0, and a transform of -0 compares unequal to 0
    // in both Object.is and the tests that pin this behaviour.
    return bounded === 0 ? 0 : bounded
  }
  return { x: clamp(offset.x, bounds.width), y: clamp(offset.y, bounds.height) }
}

/**
 * Zoom around the point the fingers (or the double tap) are on, so the slide
 * grows where the agent is looking instead of jumping to its centre. The stage
 * centre is the origin, which is where the page sits at scale 1.
 */
export function zoomAroundFocus(input: {
  transform: ZoomTransform
  nextScale: number
  focus: ZoomPoint
  stage: ZoomSize
  fitted: ZoomSize
}): ZoomTransform {
  const current = clampZoomScale(input.transform.scale)
  const next = clampZoomScale(input.nextScale)
  const focusFromCentre = {
    x: input.focus.x - input.stage.width / 2,
    y: input.focus.y - input.stage.height / 2,
  }
  const ratio = current === 0 ? 1 : next / current
  const moved = {
    x: focusFromCentre.x - (focusFromCentre.x - input.transform.x) * ratio,
    y: focusFromCentre.y - (focusFromCentre.y - input.transform.y) * ratio,
  }
  const bounded = clampPan(moved, input.fitted, input.stage, next)
  return { scale: next, x: bounded.x, y: bounded.y }
}

export const PRESENTATION_RENDER_WIDTH_MIN = 1_200
/** The native renderer refuses more than this; asking for more wastes memory. */
export const PRESENTATION_RENDER_WIDTH_MAX = 2_600

/**
 * Render each page above the screen resolution so a zoomed slide stays sharp.
 * At fit the extra pixels cost nothing visible; at 2.5x they are the whole
 * difference between a readable price table and a blur.
 */
export function presentationRenderWidth(widthDp: number, pixelRatio: number): number {
  const screenPixels = Math.round(Math.max(0, widthDp) * Math.max(1, pixelRatio))
  const wanted = screenPixels * 2
  return Math.min(PRESENTATION_RENDER_WIDTH_MAX, Math.max(PRESENTATION_RENDER_WIDTH_MIN, wanted))
}
