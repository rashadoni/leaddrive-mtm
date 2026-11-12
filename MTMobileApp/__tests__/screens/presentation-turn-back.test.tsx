/**
 * Turning the pages of a presentation on a visit, the way the agent does it on
 * the tablet (client of the owner, 2026-11-12, video from the field:
 * «slaydları çevirdikcə flash atır elə bil + geriyə çevirdikdə donur»).
 *
 * - Back to a page already shown: the page stayed under «Səhifə hazırlanır…»
 *   for good — the journal had counted it once, and the screen took «already
 *   counted» for «not drawn yet».
 * - Every turn: the strip went back to rest the moment the new page was
 *   chosen, before its picture was drawn, so the dark stage showed between the
 *   slid-in picture and the page's own (and Android faded it in over 300 ms).
 *
 * The real screen, with the native file module and the server replaced: a
 * picture is «drawn» when the test fires its onLoad, as the device would.
 */
import React from "react"
import { BackHandler, Image, Text } from "react-native"
import TestRenderer, { act } from "react-test-renderer"

const PAGES = 7

// One route and one navigation for the whole life of the screen, as the
// navigator gives them: a fresh params object on every render would reload the
// deck on every render.
jest.mock("@react-navigation/native", () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() }
  const route = {
    params: {
      visitId: "visit-1",
      product: {
        id: "product-1",
        name: "Makroqol",
        downloadUrl: "/api/v1/mtm/mobile/products/product-1/file",
        presentationVersion: 1,
        document: { title: "Makroqol", fileName: "makroqol.pdf", mimeType: "application/pdf" },
      },
    },
  }
  return { useNavigation: () => navigation, useRoute: () => route }
})
jest.mock("@react-native-community/geolocation", () => ({
  getCurrentPosition: (_ok: unknown, fail: () => void) => fail(),
}))
jest.mock("react-native-safe-area-context", () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 }
  return { useSafeAreaInsets: () => insets }
})
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-i18next", () => {
  const translation = { i18n: { language: "az" }, t: (key: string) => key }
  return { useTranslation: () => translation }
})
jest.mock("../../src/services/api", () => ({
  api: {
    authorizedDocumentSource: jest.fn(() => ({ uri: "https://example.test/file", headers: {} })),
    startPresentationSession: jest.fn(() => Promise.resolve({ success: true, data: { id: "session-1" } })),
    savePresentationSession: jest.fn(() => Promise.resolve({ success: true })),
  },
}))
jest.mock("../../src/services/presentation-file", () => ({
  presentationFormat: () => "pdf",
  downloadPresentationFile: jest.fn(() => Promise.resolve("/data/deck.pdf")),
  renderPdfPage: jest.fn((_file: string, pageIndex: number) => Promise.resolve({
    uri: `file:///data/page-${pageIndex}.jpg`,
    width: 1600,
    height: 900,
    pageCount: 7,
  })),
  cleanupPresentationFiles: jest.fn(() => Promise.resolve()),
  openExternalPresentation: jest.fn(() => Promise.resolve()),
  setPresentationImmersive: jest.fn(() => Promise.resolve()),
}))

// eslint-disable-next-line import/first
import PresentationViewerScreen from "../../src/screens/visit/PresentationViewerScreen"

const LOADER = "Səhifə hazırlanır…"
const pageUri = (zeroBased: number) => `file:///data/page-${zeroBased}.jpg`

let tree: TestRenderer.ReactTestRenderer

/**
 * Promises (download, render, evidence) and the 200 ms slide of the strip —
 * well under the 800 ms after which a turn lands without its picture.
 */
async function settle() {
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      jest.advanceTimersByTime(40)
      await Promise.resolve()
    })
  }
}

const STAGE = { width: 1200, height: 700 }

const images = () => tree.root.findAllByType(Image)
const uris = () => images().map((image) => (image.props.source as { uri: string }).uri)
/** The page itself: the one picture that names its page to the screen reader. */
const pagePicture = () => images().find((image) => typeof image.props.accessibilityLabel === "string")!
const counter = () => tree.root.findAllByType(Text).map((text) => text.props.children).find((children) => (
  Array.isArray(children) && children.length === 3 && children[1] === " / "
))
const loaderShown = () => tree.root.findAllByType(Text).some((text) => text.props.children === LOADER)

/** The device draws every picture it was given. */
async function drawAll() {
  await act(async () => {
    for (const image of images()) image.props.onLoad?.({ nativeEvent: {} })
  })
  await settle()
}

/** The device draws the neighbours beside the page, but not yet the page itself. */
async function drawNeighbours() {
  await act(async () => {
    for (const image of images()) {
      if (image !== pagePicture()) image.props.onLoad?.({ nativeEvent: {} })
    }
  })
}

async function press(testID: string) {
  const button = tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === "function")[0]
  await act(async () => {
    button.props.onPress()
  })
  await settle()
}

/** What the phone's «Назад» reaches: the screen's own handler, newest first. */
let backHandlers: Array<() => boolean | null | undefined> = []

/** The phone's «Назад»: true when the screen kept it, false when the navigator gets it and closes. */
async function pressBack() {
  let kept = false
  await act(async () => {
    kept = [...backHandlers].reverse().some((handler) => handler() === true)
  })
  await settle()
  return kept
}

beforeEach(async () => {
  jest.useFakeTimers()
  backHandlers = []
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backHandlers.push(handler)
    return { remove: () => { backHandlers = backHandlers.filter((known) => known !== handler) } }
  })
  await act(async () => {
    tree = TestRenderer.create(<PresentationViewerScreen />, {
      createNodeMock: () => ({
        measureInWindow: (done: (x: number, y: number, width: number, height: number) => void) => done(0, 0, STAGE.width, STAGE.height),
      }),
    })
  })
  await settle()
  // The stage is laid out: the neighbours have somewhere to stand.
  const stage = tree.root.findAll((node) => typeof node.props.onLayout === "function" && Boolean(node.props.onResponderMove || node.props.onMoveShouldSetResponder))[0]
  await act(async () => {
    stage.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, ...STAGE } } })
  })
  await settle()
  await drawAll()
})

afterEach(() => {
  act(() => tree.unmount())
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("turning presentation pages on a visit", () => {
  it("shows a page turned back to, instead of leaving it under «Səhifə hazırlanır…»", async () => {
    expect(counter()).toEqual([1, " / ", PAGES])
    expect(loaderShown()).toBe(false)

    await press("presentation-fullscreen-next")
    await drawAll()
    await press("presentation-fullscreen-next")
    await drawAll()
    expect(counter()).toEqual([3, " / ", PAGES])

    // Back, twice: both pages were shown already in this opening.
    await press("presentation-fullscreen-previous")
    await drawAll()
    expect(counter()).toEqual([2, " / ", PAGES])
    expect(loaderShown()).toBe(false)

    await press("presentation-fullscreen-previous")
    await drawAll()
    expect(counter()).toEqual([1, " / ", PAGES])
    expect(loaderShown()).toBe(false)

    // And forward again onto a page shown before.
    await press("presentation-fullscreen-next")
    await drawAll()
    expect(counter()).toEqual([2, " / ", PAGES])
    expect(loaderShown()).toBe(false)
  })

  it("keeps the slid-in picture on screen until the new page's own picture is drawn", async () => {
    await drawNeighbours()
    expect(uris()).toContain(pageUri(1))

    await press("presentation-fullscreen-next")
    expect(counter()).toEqual([2, " / ", PAGES])
    // The page itself now asks for page 2's picture, which is not drawn yet.
    // The strip still stands where the slide left it, on the neighbour's
    // picture of page 2, drawn already — it is not swapped for page 3 yet.
    expect((pagePicture().props.source as { uri: string }).uri).toBe(pageUri(1))
    expect(uris().filter((uri) => uri === pageUri(1))).toHaveLength(2)
    expect(uris()).not.toContain(pageUri(2))

    await drawAll()
    // Drawn: the neighbours move round the new page.
    expect(uris()).toEqual(expect.arrayContaining([pageUri(0), pageUri(1), pageUri(2)]))
    expect(uris().filter((uri) => uri === pageUri(1))).toHaveLength(1)
  })

  it("does not fade the pictures in from the dark stage", () => {
    for (const image of images()) expect(image.props.fadeDuration).toBe(0)
  })

  it("lets the agent go on when a picture never reports itself drawn", async () => {
    await press("presentation-fullscreen-next")
    // Nothing drawn; after the fallback the strip rests and the next turn works.
    await act(async () => {
      jest.advanceTimersByTime(1_000)
    })
    expect(counter()).toEqual([2, " / ", PAGES])
    await press("presentation-fullscreen-next")
    expect(counter()).toEqual([3, " / ", PAGES])
  })

  it("goes to the previous slide on the phone's «Назад», and closes only on the first", async () => {
    await press("presentation-fullscreen-next")
    await drawAll()
    await press("presentation-fullscreen-next")
    await drawAll()
    expect(counter()).toEqual([3, " / ", PAGES])

    expect(await pressBack()).toBe(true)
    await drawAll()
    expect(counter()).toEqual([2, " / ", PAGES])
    expect(loaderShown()).toBe(false)

    expect(await pressBack()).toBe(true)
    await drawAll()
    expect(counter()).toEqual([1, " / ", PAGES])

    // On the first slide «Назад» is the navigator's: the viewer closes.
    expect(await pressBack()).toBe(false)
    expect(counter()).toEqual([1, " / ", PAGES])
  })

  it("closes with the ✕ at the bottom, beside the arrows — in full screen and with the panels", async () => {
    const { goBack } = jest.requireMock("@react-navigation/native").useNavigation()
    goBack.mockClear()
    const pressable = (match: (props: Record<string, unknown>) => boolean) => tree.root.findAll((node) => (
      typeof node.props.onPress === "function" && match(node.props)
    ))[0]
    /** The row the previous-page arrow sits in holds the close too. */
    const closeBesideArrows = (closeTestID: string) => {
      const previous = pressable((props) => props.accessibilityLabel === "Əvvəlki səhifə")
      return previous.parent!.findAll((node) => node.props.testID === closeTestID).length > 0
    }

    expect(closeBesideArrows("presentation-fullscreen-close")).toBe(true)
    await act(async () => {
      pressable((props) => props.testID === "presentation-fullscreen-close").props.onPress()
    })
    expect(goBack).toHaveBeenCalledTimes(1)

    await press("presentation-chrome-chip")
    expect(closeBesideArrows("presentation-panels-close")).toBe(true)
    await act(async () => {
      pressable((props) => props.testID === "presentation-panels-close").props.onPress()
    })
    expect(goBack).toHaveBeenCalledTimes(2)
  })
})

