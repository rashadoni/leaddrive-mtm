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

beforeEach(() => {
  shouldThrow = true
  mockCapture.mockClear()
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
    const retryBtn = tree.root.findAll(n => n.props?.accessibilityRole === "button")[0]
    act(() => { (retryBtn.props as { onPress: () => void }).onPress() })

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
})
