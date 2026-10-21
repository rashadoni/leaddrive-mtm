jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
)
// Every spot here stands in a screen that is not the one in front.
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => false }))

import React from "react"
import { View } from "react-native"
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer"
import GuideSpot from "../../src/components/guide/GuideSpot"
import { useGuideStore } from "../../src/store/guide"

/**
 * SM-S918B, 2026-10-18, build 3.11.24-589: the manager's tour said «Bu düymə
 * indi ekranda yoxdur» on «Təsdiqlər», «Planlama» and «Daha çox». The tab bar
 * puts each button in the focus of its own tab, so the button of a tab not
 * open yet never counted as on screen. A spot in a screen behind still keeps
 * quiet: the bell of a hidden tab must not answer for the one in front.
 */

type Measured = (x: number, y: number, width: number, height: number) => void
type MeasuredView = { props: { testID?: string }; measureInWindow: (callback: Measured) => void }

const viewPrototype = (View as unknown as { prototype: MeasuredView }).prototype
const silentMeasure = viewPrototype.measureInWindow
beforeAll(() => {
  viewPrototype.measureInWindow = function measureInWindow(callback: Measured) {
    callback(438 / 2.625, 2004 / 2.625, 204 / 2.625, 155 / 2.625)
  }
})
afterAll(() => {
  viewPrototype.measureInWindow = silentMeasure
})

let tree: ReactTestRenderer | undefined
afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
})

function target(spot: "tab.Approvals" | "bell") {
  // Step 3 of the manager's tour points at «Təsdiqlər»; step 7 at the bell.
  useGuideStore.setState({
    scope: "org-fixture:manager-fixture",
    record: {},
    loaded: true,
    armedScope: null,
    route: "Team",
    spots: {},
    run: { scope: "org-fixture:manager-fixture", tour: "manager", step: spot === "bell" ? 6 : 2 },
  })
}

it("finds the button of a tab that is not open yet", () => {
  target("tab.Approvals")
  act(() => {
    tree = TestRenderer.create(<View><GuideSpot id="tab.Approvals" anyScreen /></View>)
  })
  expect(useGuideStore.getState().spots["tab.Approvals"]).toEqual(expect.objectContaining({ x: 438 / 2.625, y: 2004 / 2.625 }))
})

it("leaves a control of a screen behind out", () => {
  target("bell")
  act(() => {
    tree = TestRenderer.create(<View><GuideSpot id="bell" /></View>)
  })
  expect(useGuideStore.getState().spots.bell).toBeUndefined()
})
