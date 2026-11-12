import { PRESENTATION_PAGE_GAP, pagesToPrepare, stripRest, swipeDistance, swipeOffset, swipeTurn } from "../../src/screens/visit/presentation-swipe"

describe("swiping between presentation pages", () => {
  const stage = { stageWidth: 1200, hasPrevious: true, hasNext: true }

  it("turns the page when the finger went a fifth of the stage, capped on a tablet", () => {
    expect(swipeDistance(1200)).toBe(160)
    expect(swipeDistance(400)).toBe(80)
    expect(swipeTurn({ ...stage, dx: -170, vx: 0 })).toBe(1)
    expect(swipeTurn({ ...stage, dx: 170, vx: 0 })).toBe(-1)
    expect(swipeTurn({ ...stage, dx: -100, vx: 0 })).toBe(0)
  })

  it("turns on a quick flick even when short — but not on a wobble, nor a flick the other way", () => {
    expect(swipeTurn({ ...stage, dx: -50, vx: -0.8 })).toBe(1)
    expect(swipeTurn({ ...stage, dx: -10, vx: -2 })).toBe(0)
    expect(swipeTurn({ ...stage, dx: -50, vx: 0.8 })).toBe(0)
  })

  it("has nowhere to go past the first and the last page: the page gives a little and comes back", () => {
    expect(swipeTurn({ stageWidth: 1200, hasPrevious: false, hasNext: true, dx: 300, vx: 1 })).toBe(0)
    expect(swipeTurn({ stageWidth: 1200, hasPrevious: true, hasNext: false, dx: -300, vx: -1 })).toBe(0)
    expect(swipeOffset(200, false, true)).toBe(50)
    expect(swipeOffset(-200, true, false)).toBe(-50)
    expect(swipeOffset(-200, true, true)).toBe(-200)
  })

  it("prepares the next page first, then the previous one, inside the deck", () => {
    expect(pagesToPrepare(0, 7)).toEqual([1])
    expect(pagesToPrepare(3, 7)).toEqual([4, 2])
    expect(pagesToPrepare(6, 7)).toEqual([5])
    expect(pagesToPrepare(0, 1)).toEqual([])
  })

  it("rests the strip at the page on screen: each page has its own place, a gap apart", () => {
    expect(stripRest(0, 1200)).toBe(0)
    expect(stripRest(3, 1200)).toBe(-3 * (1200 + PRESENTATION_PAGE_GAP))
    // Before the stage is laid out there is nowhere to stand but the start.
    expect(stripRest(3, 0)).toBe(0)
  })
})
