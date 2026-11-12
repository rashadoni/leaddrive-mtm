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
import { Image, Text } from "react-native"
import TestRenderer, { act } from "react-test-renderer"

const PAGES = 7

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({
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
  }),
}))
jest.mock("@react-native-community/geolocation", () => ({
  getCurrentPosition: (_ok: unknown, fail: () => void) => fail(),
}))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "az" }, t: (key: string) => key }) }))
jest.mock("../../src/services/api", () => ({
  api: {
    authorizedDocumentSource: () => ({ uri: "https://example.test/file", headers: {} }),
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

beforeEach(async () => {
  jest.useFakeTimers()
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
})
