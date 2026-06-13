/**
 * ErrorBoundary — converts a render-phase throw (which would silently close a
 * release build) into a recoverable fallback + a Sentry capture.
 *
 * Native bridge is mocked so the suite runs in Node (jest/RN preset).
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import { Text } from "react-native" // used in JSX children below

// Flatten a react-test-renderer toJSON() tree to its text content.
// Avoids walking live Fiber nodes (which are circular and break JSON.stringify).
function textOf(json: unknown): string {
  if (json == null) return ""
  if (typeof json === "string") return json
  if (Array.isArray(json)) return json.map(textOf).join(" ")
  const node = json as { children?: unknown }
  return textOf(node.children)
}

const mockCapture = jest.fn()
jest.mock("../../src/services/sentry", () => ({
  Sentry: { captureException: (...a: unknown[]) => mockCapture(...a) },
}))
jest.mock("../../src/i18n", () => ({
  i18n: { t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key },
}))
const mockSetItem = jest.fn((..._a: unknown[]) => Promise.resolve())
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { setItem: (...a: unknown[]) => mockSetItem(...a) },
}))

import { ErrorBoundary } from "../../src/components/ErrorBoundary"

// A child whose throwing is toggled via a module-level flag so we can test
// recovery: throw on first mount, then render cleanly after reset.
let shouldThrow = true
function Boom(): React.ReactElement {
  if (shouldThrow) throw new Error("kaboom")
  return <Text>recovered</Text>
}

function findByText(tree: TestRenderer.ReactTestRenderer, text: string): boolean {
  return textOf(tree.toJSON()).includes(text)
}

// TouchableOpacity forwards testID to its inner View, so findByProps would match
// >1. Pick the instance that actually carries the onPress handler.
function pressByTestId(tree: TestRenderer.ReactTestRenderer, testID: string): void {
  const node = tree.root
    .findAllByProps({ testID })
    .find(n => typeof (n.props as { onPress?: unknown }).onPress === "function")
  act(() => { (node!.props as { onPress: () => void }).onPress() })
}

beforeEach(() => {
  shouldThrow = true
  mockCapture.mockClear()
  mockSetItem.mockClear()
  jest.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  ;(console.error as jest.Mock).mockRestore?.()
})

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    shouldThrow = false
    let tree!: TestRenderer.ReactTestRenderer
    act(() => {
      tree = TestRenderer.create(
        <ErrorBoundary><Text>all good</Text></ErrorBoundary>,
      )
    })
    expect(findByText(tree, "all good")).toBe(true)
  })

  it("renders the fallback and reports to Sentry when a child throws", () => {
    const onError = jest.fn()
    let tree!: TestRenderer.ReactTestRenderer
    act(() => {
      tree = TestRenderer.create(
        <ErrorBoundary onError={onError}><Boom /></ErrorBoundary>,
      )
    })
    // fallback uses the default-value title (i18n mock returns defaultValue)
    expect(findByText(tree, "Что-то пошло не так")).toBe(true)
    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockCapture.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("recovers to children after retry is pressed", () => {
    let tree!: TestRenderer.ReactTestRenderer
    act(() => {
      tree = TestRenderer.create(<ErrorBoundary><Boom /></ErrorBoundary>)
    })
    expect(findByText(tree, "Что-то пошло не так")).toBe(true)

    // child is "fixed", then the user taps Retry → boundary resets → children render
    shouldThrow = false
    pressByTestId(tree, "error-retry")

    expect(findByText(tree, "recovered")).toBe(true)
  })

  it("does not let a Sentry failure escape (capture throws → boundary still renders)", () => {
    mockCapture.mockImplementationOnce(() => { throw new Error("sentry down") })
    let tree!: TestRenderer.ReactTestRenderer
    expect(() => {
      act(() => {
        tree = TestRenderer.create(<ErrorBoundary><Boom /></ErrorBoundary>)
      })
    }).not.toThrow()
    expect(findByText(tree, "Что-то пошло не так")).toBe(true)
  })

  it("hides the error text by default, reveals it when Details is tapped (release-diagnosable)", () => {
    let tree!: TestRenderer.ReactTestRenderer
    act(() => {
      tree = TestRenderer.create(<ErrorBoundary><Boom /></ErrorBoundary>)
    })
    // the raw error message is NOT shown until the user opts in
    expect(findByText(tree, "kaboom")).toBe(false)

    pressByTestId(tree, "error-details-toggle")

    expect(findByText(tree, "kaboom")).toBe(true)
  })

  it("persists the last crash to AsyncStorage for offline diagnosis", () => {
    act(() => {
      TestRenderer.create(<ErrorBoundary><Boom /></ErrorBoundary>)
    })
    expect(mockSetItem).toHaveBeenCalledTimes(1)
    expect(mockSetItem.mock.calls[0][0]).toBe("@mtm_last_crash")
    const payload = JSON.parse(mockSetItem.mock.calls[0][1] as string)
    expect(payload.message).toBe("kaboom")
    expect(typeof payload.at).toBe("string")
  })
})
