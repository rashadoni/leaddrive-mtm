jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-vector-icons/MaterialCommunityIcons", () => "TapIcon")
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 30, bottom: 16, left: 0, right: 0 }) }))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key) }),
}))
// No useIsFocused here: a spot then counts as on screen (GuideSpot).
jest.mock("@react-navigation/native", () => ({}))
const mockOpenGuideScreen = jest.fn()
jest.mock("../../src/navigation/navigation-ref", () => ({
  openGuideScreen: (screen: string) => mockOpenGuideScreen(screen),
  currentRouteName: () => null,
}))
jest.mock("../../src/store/auth", () => ({
  useAuthStore: require("zustand").create(() => ({
    agent: { id: "agent-fixture", organizationId: "org-fixture", role: "AGENT", name: "Fictional Agent" },
  })),
}))
jest.mock("../../src/store/bootstrap", () => ({
  useBootstrapStore: require("zustand").create(() => ({ data: null, routeFieldAccess: "enabled" })),
}))

import React from "react"
import { View } from "react-native"
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer"
import AsyncStorage from "@react-native-async-storage/async-storage"
import GuideOverlay from "../../src/components/guide/GuideOverlay"
import GuideSpot from "../../src/components/guide/GuideSpot"
import { armGuideAfterSignIn, useGuideStore } from "../../src/store/guide"

/**
 * The first-run guide as the agent meets it after signing in (fictional
 * people and places): the welcome card on «Bu gün», a lit control that cannot
 * be pressed, a step that waits for a real press, and «Keç».
 */

const SCOPE = "org-fixture:agent-fixture"
const SCREEN = { width: 384, height: 823 }
const WORKDAY = { x: 16, y: 180, width: 352, height: 150 }

type Measured = (x: number, y: number, width: number, height: number) => void

function nodeMock(element: React.ReactElement) {
  const testID = (element.props as { testID?: string }).testID
  return {
    measureInWindow: (callback: Measured) => {
      if (testID === "guide-spot-today.workday") callback(WORKDAY.x, WORKDAY.y, WORKDAY.width, WORKDAY.height)
      else callback(0, 0, SCREEN.width, SCREEN.height)
    },
  }
}

function Today() {
  return (
    <View>
      <View>
        <GuideSpot id="today.workday" />
      </View>
    </View>
  )
}

let tree: ReactTestRenderer | undefined

const byTestID = (id: string): ReactTestInstance[] => tree!.root.findAll((item) => item.props.testID === id, { deep: false })
const texts = (): string[] => tree!.root.findAllByType("Text" as never).map((item) => [item.props.children].flat().join(""))
async function flush() {
  await act(async () => {
    for (let tick = 0; tick < 20; tick++) await Promise.resolve()
  })
}
function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms)
  })
}
/** The overlay learns its own size from its first layout, as on the phone. */
function layOut() {
  const root = tree!.root.findAll((item) => item.props.pointerEvents === "box-none" && typeof item.props.onLayout === "function", { deep: false })[0]
  act(() => root.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, ...SCREEN } } }))
  const bubble = byTestID("guide-bubble")[0]
  if (bubble) act(() => bubble.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 356, height: 210 } } }))
}

beforeEach(async () => {
  jest.useFakeTimers()
  mockOpenGuideScreen.mockClear()
  await AsyncStorage.clear()
  useGuideStore.setState({ scope: null, record: {}, loaded: false, armedScope: null, run: null, route: "Today", spots: {} })
})

afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
  jest.useRealTimers()
})

async function mount() {
  await act(async () => {
    tree = TestRenderer.create(
      <>
        <Today />
        <GuideOverlay />
      </>,
      { createNodeMock: nodeMock },
    )
  })
  await flush()
}

it("opens by itself on «Bu gün» after a sign-in, with the way the tour goes", async () => {
  armGuideAfterSignIn(SCOPE)
  await mount()
  expect(byTestID("guide-start")).toHaveLength(0)
  advance(1300)
  expect(byTestID("guide-start")).toHaveLength(1)
  expect(byTestID("guide-skip")).toHaveLength(1)
  expect(texts()).toEqual(expect.arrayContaining([
    'guide.welcomeTitle {"name":"Fictional"}',
    "navV2.today",
    "guide.pathVisit",
    "navV2.more",
    'guide.welcomeLength {"count":8}',
  ]))
})

it("stays closed for a session restored at start", async () => {
  await mount()
  advance(5000)
  expect(useGuideStore.getState().run).toBeNull()
  expect(byTestID("guide-start")).toHaveLength(0)
})

it("lights the day's card without letting the tour press it, then waits for a real press on «Marşrut»", async () => {
  armGuideAfterSignIn(SCOPE)
  await mount()
  advance(1300)
  act(() => byTestID("guide-start")[0].props.onPress())
  advance(1000)
  layOut()

  // Step one, «look»: four blockers around the card and one over it.
  const hole = { left: WORKDAY.x - 6, top: WORKDAY.y - 6, width: WORKDAY.width + 12, height: WORKDAY.height + 12 }
  const blockers = byTestID("guide-block")
  const styles = blockers.map((item) => Object.assign({}, ...[item.props.style].flat()))
  expect(styles).toEqual(expect.arrayContaining([expect.objectContaining(hole)]))
  expect(blockers).toHaveLength(5)
  expect(texts()).toEqual(expect.arrayContaining(["guide.field.workday.title", 'guide.stepOf {"step":1,"total":8}']))

  // Step two, «tap»: the tab is not on this test screen, so after a moment the
  // bubble says so and «Növbəti» does the press for the agent.
  act(() => byTestID("guide-next")[0].props.onPress())
  expect(useGuideStore.getState().run?.step).toBe(1)
  advance(1600)
  act(() => byTestID("guide-next")[0].props.onPress())
  expect(mockOpenGuideScreen).toHaveBeenCalledWith("Route")
  expect(useGuideStore.getState().run?.step).toBe(1)

  // The real press is what counts: «Marşrut» opened.
  act(() => useGuideStore.getState().setRoute("Route"))
  expect(useGuideStore.getState().run?.step).toBe(2)
})

it("«Keç» closes it for good for this person", async () => {
  armGuideAfterSignIn(SCOPE)
  await mount()
  advance(1300)
  act(() => byTestID("guide-skip")[0].props.onPress())
  await flush()
  expect(useGuideStore.getState().run).toBeNull()
  expect(byTestID("guide-start")).toHaveLength(0)
  expect(JSON.parse((await AsyncStorage.getItem(`@mtm_guide_v1:${SCOPE}`)) ?? "{}")).toEqual({ field: "skipped" })
  advance(5000)
  expect(useGuideStore.getState().run).toBeNull()
})
