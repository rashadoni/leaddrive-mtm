/**
 * The phone switches day and night with a screen open (owner, 2026-10-20:
 * «если я меняю тему на телефоне на светлую, то приложение не меняется на
 * светлую тему»). The screen draws itself again in the new palette — though
 * the navigator holds it still, with its list rows, and with what is typed
 * in its field — without being mounted again.
 */
import React, { useCallback, useEffect, useState } from "react"
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native"
import TestRenderer, { act } from "react-test-renderer"
import {
  FIELD_PALETTES,
  fieldTheme,
  setFieldColorScheme,
  themed,
  useFieldColorScheme,
  withFieldColorScheme,
} from "../../src/theme/fieldTheme"

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: fieldTheme.color.canvas },
  row: { backgroundColor: fieldTheme.color.surface },
}))

const mounted = { count: 0 }
const renderedTrees: TestRenderer.ReactTestRenderer[] = []

function Rows() {
  const colorScheme = useFieldColorScheme()
  const renderRow = useCallback(({ item }: { item: string }) => (
    <View testID={`row-${item}`} style={styles.row}>
      <Text>{item}</Text>
    </View>
  ), [])
  return <FlatList extraData={colorScheme} data={["a", "b"]} renderItem={renderRow} keyExtractor={(item) => item} />
}

/** A screen as screens are written: module styles, an inline colour, local state. */
function VisitNote() {
  const [note, setNote] = useState("")
  useEffect(() => {
    mounted.count += 1
  }, [])
  return (
    <View testID="screen" style={styles.screen}>
      <Text testID="title" style={{ color: fieldTheme.color.ink }}>Visit</Text>
      <TextInput value={note} onChangeText={setNote} />
      <Rows />
    </View>
  )
}

/** What the navigator does to a screen: it never draws it again from above. */
const heldStill = (Screen: React.ComponentType) => React.memo(() => <Screen />, () => true)

function render(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(element)
  })
  renderedTrees.push(tree)
  const host = (testID: string) => tree.root.findAll((node) => typeof node.type === "string" && node.props.testID === testID)[0]
  return {
    tree,
    background: (testID: string) => (StyleSheet.flatten(host(testID).props.style) as { backgroundColor?: unknown }).backgroundColor,
    color: (testID: string) => (StyleSheet.flatten(host(testID).props.style) as { color?: unknown }).color,
    note: () => tree.root.findByType(TextInput).props.value,
    type: (text: string) => act(() => {
      tree.root.findByType(TextInput).props.onChangeText(text)
    }),
  }
}

beforeEach(() => {
  mounted.count = 0
  act(() => setFieldColorScheme("light"))
})

afterEach(() => {
  act(() => { renderedTrees.splice(0).forEach(tree => tree.unmount()) })
  act(() => setFieldColorScheme("light"))
})

describe("a switch with the screen open", () => {
  it("redraws the screen, its rows and its text in the night palette, keeping what is typed", () => {
    const Held = heldStill(withFieldColorScheme(VisitNote))
    const screen = render(<Held />)
    screen.type("Called back after lunch")
    expect(screen.background("screen")).toBe(FIELD_PALETTES.light.canvas)
    expect(screen.background("row-a")).toBe(FIELD_PALETTES.light.surface)

    act(() => setFieldColorScheme("dark"))
    expect(screen.background("screen")).toBe(FIELD_PALETTES.dark.canvas)
    expect(screen.background("row-a")).toBe(FIELD_PALETTES.dark.surface)
    expect(screen.background("row-b")).toBe(FIELD_PALETTES.dark.surface)
    expect(screen.color("title")).toBe(FIELD_PALETTES.dark.ink)
    expect(screen.note()).toBe("Called back after lunch")
    expect(mounted.count).toBe(1)

    act(() => setFieldColorScheme("light"))
    expect(screen.background("screen")).toBe(FIELD_PALETTES.light.canvas)
    expect(screen.color("title")).toBe(FIELD_PALETTES.light.ink)
    expect(screen.note()).toBe("Called back after lunch")
    expect(mounted.count).toBe(1)
  })

  /** Why the navigator registers every screen through withFieldColorScheme. */
  it("would stay in the old palette under the navigator's hold without it", () => {
    const Held = heldStill(VisitNote)
    const screen = render(<Held />)
    act(() => setFieldColorScheme("dark"))
    expect(screen.background("screen")).toBe(FIELD_PALETTES.light.canvas)
  })

  it("gives the navigator the same wrapper for the same screen, so it is not mounted afresh", () => {
    expect(withFieldColorScheme(VisitNote)).toBe(withFieldColorScheme(VisitNote))
  })
})
