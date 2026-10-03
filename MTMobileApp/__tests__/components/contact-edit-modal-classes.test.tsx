/**
 * The class choice in a client's change request follows the organization's own
 * list (web setting `contactClasses`, e.g. "A, B, C, VIP") instead of a
 * hard-coded A–D: an agent can propose VIP, and a client who already is VIP —
 * or holds a class the organization stopped offering — opens with it selected.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/api", () => ({ api: { getBootstrap: jest.fn() } }))
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import ContactEditModal from "../../src/components/ContactEditModal"
import { toBootstrap } from "../../src/services/bootstrap"
import { toContactDetail } from "../../src/services/contact-detail"
import { useBootstrapStore } from "../../src/store/bootstrap"

type Node = TestRenderer.ReactTestInstance

function textsOf(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}

/** Every button on the form, outermost component only. */
function buttons(tree: TestRenderer.ReactTestRenderer): Node[] {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === "button" && typeof node.props.onPress === "function",
    { deep: false },
  )
}

function button(tree: TestRenderer.ReactTestRenderer, label: string): Node {
  const found = buttons(tree).find((node) => textsOf(node).join("") === label)
  if (!found) throw new Error(`No button "${label}"`)
  return found
}

/** The chips under «class», in the order they are shown. */
function classChips(tree: TestRenderer.ReactTestRenderer): string[] {
  const texts = textsOf(tree.root)
  const from = texts.indexOf("contacts.fieldCategory")
  const to = texts.indexOf("contacts.fieldStatus")
  return from >= 0 && to > from ? texts.slice(from + 1, to) : []
}

function isSelected(node: Node): boolean {
  return Array.isArray(node.props.style) && Boolean(node.props.style[1])
}

function open(category: string | null, onSubmit = jest.fn()) {
  const detail = toContactDetail({ id: "c1", firstName: "Test", lastName: "Doctor", displayName: "Test Doctor", category })
  let tree!: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(
      <ContactEditModal visible detail={detail} agentRequest={false} busy={false} onCancel={() => {}} onSubmit={onSubmit} />,
    )
  })
  return { tree, onSubmit }
}

function serverSends(policies: Record<string, unknown> | undefined) {
  useBootstrapStore.setState({ data: policies === undefined ? null : toBootstrap({ policies }) })
}

afterEach(() => {
  useBootstrapStore.getState().clear()
})

describe("class choice in a client's change request", () => {
  it("offers the organization's classes and sends VIP when the agent picks it", () => {
    serverSends({ contactClasses: ["A", "B", "C", "VIP"] })
    const { tree, onSubmit } = open("B")
    expect(classChips(tree)).toEqual(["A", "B", "C", "VIP"])
    expect(isSelected(button(tree, "B"))).toBe(true)
    expect(isSelected(button(tree, "VIP"))).toBe(false)

    act(() => { button(tree, "VIP").props.onPress() })
    expect(isSelected(button(tree, "VIP"))).toBe(true)

    act(() => { button(tree, "common.save").props.onPress() })
    expect(onSubmit.mock.calls).toEqual([[{ category: "VIP" }, ""]])
  })

  it("opens a VIP client with VIP selected before the server sends the list", () => {
    serverSends(undefined)
    const { tree } = open("VIP")
    expect(classChips(tree)).toEqual(["A", "B", "C", "D", "VIP"])
    expect(isSelected(button(tree, "VIP"))).toBe(true)
  })

  it("stays on A–D for an older server and a client graded within it", () => {
    serverSends({})
    const { tree } = open("C")
    expect(classChips(tree)).toEqual(["A", "B", "C", "D"])
    expect(isSelected(button(tree, "C"))).toBe(true)
  })

  it("keeps a class the organization no longer offers on the client who has it", () => {
    serverSends({ contactClasses: ["A", "B", "C", "VIP"] })
    const { tree } = open("D")
    expect(classChips(tree)).toEqual(["A", "B", "C", "D", "VIP"])
    expect(isSelected(button(tree, "D"))).toBe(true)
  })
})
