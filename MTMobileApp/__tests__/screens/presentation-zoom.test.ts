import fs from "fs"
import path from "path"
import {
  PRESENTATION_RENDER_WIDTH_MAX,
  PRESENTATION_ZOOM_DOUBLE_TAP,
  PRESENTATION_ZOOM_MAX,
  clampPan,
  clampZoomScale,
  fittedPageBox,
  isDoubleTap,
  isZoomed,
  nextDoubleTapScale,
  panBounds,
  pinchDistance,
  pinchFocus,
  presentationRenderWidth,
  zoomAroundFocus,
} from "../../src/screens/visit/presentation-zoom"

const STAGE = { width: 400, height: 700 }
// A 16:9 slide on a portrait phone: this is the case the agent complained
// about — fitted, it uses 225 of 700 points of height.
const SLIDE = { width: 1_920, height: 1_080 }

describe("presentation zoom maths", () => {
  it("keeps the scale between a fitted page and the sharp-render ceiling", () => {
    expect(clampZoomScale(0.2)).toBe(1)
    expect(clampZoomScale(Number.NaN)).toBe(1)
    expect(clampZoomScale(2.5)).toBeCloseTo(2.5)
    expect(clampZoomScale(99)).toBe(PRESENTATION_ZOOM_MAX)
  })

  it("treats a double tap as zoom in, and the next one as back to the whole page", () => {
    expect(nextDoubleTapScale(1)).toBe(PRESENTATION_ZOOM_DOUBLE_TAP)
    expect(nextDoubleTapScale(PRESENTATION_ZOOM_DOUBLE_TAP)).toBe(1)
    expect(isZoomed(1)).toBe(false)
    expect(isZoomed(1.005)).toBe(false)
    expect(isZoomed(1.4)).toBe(true)
  })

  it("only pairs taps that are close in time", () => {
    expect(isDoubleTap(null, 1_000)).toBe(false)
    expect(isDoubleTap(1_000, 1_200)).toBe(true)
    expect(isDoubleTap(1_000, 1_900)).toBe(false)
  })

  it("fits a wide slide by width and a tall page by height", () => {
    const slide = fittedPageBox(STAGE, SLIDE)
    expect(slide.width).toBeCloseTo(400)
    expect(slide.height).toBeCloseTo(225)

    // A page taller than the stage is limited by height instead: a scanned
    // A4 at 1_240x1_754 is still width-limited here, so the case worth
    // pinning is a genuinely tall one.
    const tallPage = fittedPageBox(STAGE, { width: 1_000, height: 3_000 })
    expect(tallPage.height).toBeCloseTo(700)
    expect(tallPage.width).toBeCloseTo(233.33, 1)
  })

  it("refuses to pan a fitted page, and bounds a zoomed one to its own edges", () => {
    const fitted = fittedPageBox(STAGE, SLIDE)
    expect(panBounds(fitted, STAGE, 1)).toEqual({ width: 0, height: 0 })
    expect(clampPan({ x: 120, y: -90 }, fitted, STAGE, 1)).toEqual({ x: 0, y: 0 })

    // At 2.5x the slide is 1000x562 inside a 400x700 stage: it may slide
    // sideways by 300, and never vertically, because it is still shorter.
    const bounds = panBounds(fitted, STAGE, 2.5)
    expect(bounds.width).toBeCloseTo(300)
    expect(bounds.height).toBe(0)
    expect(clampPan({ x: 999, y: 999 }, fitted, STAGE, 2.5)).toEqual({ x: 300, y: 0 })
    expect(clampPan({ x: -999, y: 10 }, fitted, STAGE, 2.5)).toEqual({ x: -300, y: 0 })
  })

  it("measures a pinch by finger distance and midpoint", () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 30, y: 40 })).toBeCloseTo(50)
    expect(pinchFocus({ x: 0, y: 0 }, { x: 30, y: 40 })).toEqual({ x: 15, y: 20 })
  })

  it("zooms around the finger, not the centre of the screen", () => {
    const fitted = fittedPageBox(STAGE, SLIDE)
    // The left edge of a fitted slide, doubled: that edge must stay under the
    // finger, so the page moves right by a quarter of the stage width.
    const zoomed = zoomAroundFocus({
      transform: { scale: 1, x: 0, y: 0 },
      nextScale: 2,
      focus: { x: 0, y: STAGE.height / 2 },
      stage: STAGE,
      fitted,
    })
    expect(zoomed.scale).toBe(2)
    expect(zoomed.x).toBeCloseTo(200)
    expect(zoomed.y).toBe(0)
  })

  it("never leaves a gap beside the page when a pinch overshoots", () => {
    const fitted = fittedPageBox(STAGE, SLIDE)
    const zoomed = zoomAroundFocus({
      transform: { scale: 3, x: 400, y: 0 },
      nextScale: 1,
      focus: { x: 0, y: 0 },
      stage: STAGE,
      fitted,
    })
    expect(zoomed).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it("asks the native renderer for more pixels than the screen has", () => {
    expect(presentationRenderWidth(411, 2.625)).toBe(2_158)
    expect(presentationRenderWidth(1_600, 2)).toBe(PRESENTATION_RENDER_WIDTH_MAX)
    expect(presentationRenderWidth(320, 1)).toBe(1_200)
  })
})

describe("presentation viewer wiring", () => {
  const screenSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/visit/PresentationViewerScreen.tsx"),
    "utf8",
  )
  const nativeSource = fs.readFileSync(
    path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/PresentationFilesModule.kt"),
    "utf8",
  )

  it("drives the page layer with gestures instead of a fixed image", () => {
    expect(screenSource).toContain("PanResponder.create")
    expect(screenSource).toContain("panResponder.panHandlers")
    expect(screenSource).toContain("presentationRenderWidth(width, PixelRatio.get())")
  })

  it("opens every new page fitted", () => {
    expect(screenSource).toContain("resetZoom()")
  })

  it("renders pages above screen resolution so zoom stays readable", () => {
    expect(nativeSource).toContain("requestedWidth.coerceIn(320, 2_600)")
    expect(nativeSource).toContain("3_600.0 / page.height.toDouble()")
  })
})
