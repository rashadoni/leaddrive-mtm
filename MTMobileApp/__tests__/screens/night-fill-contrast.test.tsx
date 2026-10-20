import fs from "fs"
import path from "path"
import React from "react"
import { StyleSheet } from "react-native"
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer"
import ts from "typescript"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import en from "../../src/i18n/locales/en.json"

jest.mock("../../src/services/api", () => ({ api: { pingServer: jest.fn(), setServer: jest.fn() } }))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")

import ServerScreen from "../../src/screens/server/ServerScreen"
import { DayLineRail } from "../../src/components/DayLine"
import { FIELD_PALETTES, setFieldColorScheme, type FieldColorScheme, type FieldPalette } from "../../src/theme/fieldTheme"

/**
 * White text and icons on a filled colour read in both palettes. On the
 * emulator with 3.11.37 the night «Connect» on the first screen was white on
 * the night coral #F08A70, about 2.4:1: the night accents are light, to read
 * as text on the dark ground, and every one of them carried white somewhere.
 * Each accent now has a fill under white — the accent itself by day, a
 * deeper shade at night.
 */

const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
/** A host's style as one object: what it paints and in what colour it writes. */
const flat = (style: unknown) => (StyleSheet.flatten(style as any) ?? {}) as { color?: unknown; backgroundColor?: unknown }

const SCHEMES: FieldColorScheme[] = ["light", "dark"]
const ACCENTS = ["coral", "amber", "blue", "violet", "success"] as const
/** WCAG AA for text; icons on the same fills are held to it too. */
const TEXT = 4.5
/**
 * The night green and red stay at about 4:1: one colour is both the accent
 * text on dark and the fill under white (3.11.29, night-mode.test.ts).
 */
const NIGHT_GREEN_AND_RED = 3.9
const floorFor = (scheme: FieldColorScheme, fill: string) =>
  scheme === "dark" && (fill === FIELD_PALETTES.dark.primary || fill === FIELD_PALETTES.dark.danger) ? NIGHT_GREEN_AND_RED : TEXT

describe("the fills under white", () => {
  it("are the accents themselves by day, so the day screens look as before", () => {
    const day = FIELD_PALETTES.light
    for (const accent of ACCENTS) expect(day[`${accent}Fill` as const]).toBe(day[accent])
  })

  it.each(SCHEMES)("carry white at 4.5:1 or more in the %s palette", (scheme) => {
    const palette = FIELD_PALETTES[scheme]
    for (const accent of ACCENTS) {
      expect({ accent, ratio: contrast(palette.onColor, palette[`${accent}Fill` as const]) >= TEXT }).toEqual({ accent, ratio: true })
    }
  })
})

/** Every white text or icon on the rendered tree, with the fill nearest behind it. */
function whiteOnFills(tree: TestRenderer.ReactTestRenderer, palette: FieldPalette) {
  const found: { fill: string; ink: string }[] = []
  const hosts = tree.root.findAll((node) => typeof node.type === "string")
  for (const node of hosts) {
    const ink = node.props.color ?? flat(node.props.style).color
    if (ink !== palette.onColor) continue
    let behind: ReactTestInstance | null = node.parent
    while (behind && !(typeof behind.type === "string" && flat(behind.props.style).backgroundColor)) behind = behind.parent
    if (behind) found.push({ fill: String(flat(behind.props.style).backgroundColor), ink })
  }
  return found
}

describe.each(SCHEMES)("drawn in the %s palette", (scheme) => {
  const palette = FIELD_PALETTES[scheme]
  const locale = i18next.createInstance()
  let tree: TestRenderer.ReactTestRenderer | null = null

  beforeAll(async () => {
    await locale.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } })
  })
  beforeEach(() => setFieldColorScheme(scheme))
  afterEach(() => {
    if (tree) act(() => tree!.unmount())
    tree = null
    setFieldColorScheme("light")
  })

  it("reads «Connect» and every white label on the first screen", async () => {
    await act(async () => {
      tree = TestRenderer.create(<I18nextProvider i18n={locale}><ServerScreen onServerSelected={jest.fn()} /></I18nextProvider>)
    })
    const connect = tree!.root.findAll((node) => typeof node.type === "string" && node.props.testID === "tenant-continue")[0]
    expect(flat(connect.props.style).backgroundColor).toBe(palette.coralFill)
    const labels = connect.findAll((node) => typeof node.type === "string" && (node.props.color ?? flat(node.props.style).color) === palette.onColor)
    expect(labels.length).toBeGreaterThanOrEqual(2)

    const pairs = whiteOnFills(tree!, palette).filter(({ fill }) => isHex(fill))
    expect(pairs.length).toBeGreaterThanOrEqual(4)
    for (const { fill, ink } of pairs) {
      expect({ fill, readable: contrast(ink, fill) >= floorFor(scheme, fill) }).toEqual({ fill, readable: true })
    }
  })

  it("reads the check on a finished stop, which stands in the green of the line behind it", () => {
    act(() => {
      tree = TestRenderer.create(<DayLineRail state="done" first={false} last={false} filledAbove filledBelow />)
    })
    const [check] = whiteOnFills(tree!, palette)
    expect(check).toBeDefined()
    expect(contrast(check.ink, check.fill)).toBeGreaterThanOrEqual(TEXT)
    const fills = tree!.root
      .findAll((node) => typeof node.type === "string")
      .map((node) => flat(node.props.style).backgroundColor)
      .filter(Boolean)
    // The piece above, the stop, the piece below: one green.
    expect(fills).toHaveLength(3)
    expect(new Set(fills)).toEqual(new Set([check.fill]))
  })
})

/**
 * Every white label on a coloured fill the code draws, read from the source:
 * a fill from a style, an inline object or a shared part's colour prop, and
 * the white text, icon or spinner inside it. A style list like
 * `[styles.tile, today && styles.tileToday]` counts as each of its fills.
 */
describe("every white label on a coloured fill in the app", () => {
  type Pair = { file: string; line: number; fill: string; ink: string }
  const SRC = path.resolve(__dirname, "../../src")
  /**
   * Shared parts that paint a colour handed to them under their own white
   * label: ConfirmSheet's confirm button (`confirmColor`).
   */
  const PAINTED_UNDER_WHITE: Record<string, string> = { ConfirmSheet: "confirmColor" }
  /**
   * Fills that never carry white. The style-list reading pairs a white label
   * on a selected tile with the unselected tile's fill as well; white on
   * these would be invisible by day, so a real one would not get this far.
   */
  const NEUTRAL = new Set(["canvas", "surface", "surfaceStrong", "ink", "inkMuted", "border", "line", "scrim", "onColor"])

  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".tsx")) files.push(full)
    }
  }
  walk(SRC)

  /** Palette roles by name, colour literals as `#hex`, anything else as `?source`. */
  const coloursIn = (node: ts.Node, sf: ts.SourceFile): string[] => {
    const found: string[] = []
    const visit = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === "fieldTheme.color") found.push(n.name.text)
      else if (ts.isStringLiteral(n) && isHex(n.text)) found.push(n.text.toUpperCase())
      else ts.forEachChild(n, visit)
    }
    visit(node)
    return found.length ? found : [`?${node.getText(sf)}`]
  }

  const pairs: Pair[] = []
  for (const full of files) {
    const file = path.relative(SRC, full)
    const sf = ts.createSourceFile(file, fs.readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1

    type Entry = { fills: string[]; inks: string[] }
    /** The object of the `StyleSheet.create` a declaration makes, inside themed() or not. */
    const sheetBody = (n: ts.Node): ts.ObjectLiteralExpression | undefined => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "StyleSheet.create" && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) return n.arguments[0]
      return ts.forEachChild(n, sheetBody)
    }
    const sheets: Record<string, Record<string, Entry>> = {}
    const findSheets = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        const body = sheetBody(node.initializer)
        if (body) {
          const sheet: Record<string, Entry> = (sheets[node.name.text] = {})
          for (const prop of body.properties) {
            if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue
            const entry: Entry = { fills: [], inks: [] }
            for (const style of prop.initializer.properties) {
              if (!ts.isPropertyAssignment(style)) continue
              const key = style.name.getText(sf)
              if (key === "backgroundColor") entry.fills.push(...coloursIn(style.initializer, sf))
              if (key === "color") entry.inks.push(...coloursIn(style.initializer, sf))
            }
            sheet[prop.name.getText(sf)] = entry
          }
        }
      }
      ts.forEachChild(node, findSheets)
    }
    findSheets(sf)

    const styleOf = (expression: ts.Node): Entry => {
      const entry: Entry = { fills: [], inks: [] }
      const visit = (n: ts.Node) => {
        if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && sheets[n.expression.text]) {
          const known = sheets[n.expression.text][n.name.text]
          if (known) {
            entry.fills.push(...known.fills)
            entry.inks.push(...known.inks)
          }
          return
        }
        if (ts.isObjectLiteralExpression(n)) {
          for (const style of n.properties) {
            if (!ts.isPropertyAssignment(style)) continue
            const key = style.name.getText(sf)
            if (key === "backgroundColor") entry.fills.push(...coloursIn(style.initializer, sf))
            else if (key === "color") entry.inks.push(...coloursIn(style.initializer, sf))
            else visit(style.initializer)
          }
          return
        }
        ts.forEachChild(n, visit)
      }
      visit(expression)
      return entry
    }
    const attribute = (element: ts.JsxOpeningLikeElement, name: string) => {
      const found = element.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name)
      return found && ts.isJsxAttribute(found) && found.initializer ? found.initializer : null
    }

    const visitJsx = (node: ts.Node, behind: string[]) => {
      const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
      let here = behind
      if (element) {
        const style = attribute(element, "style")
        const { fills, inks } = style ? styleOf(style) : { fills: [], inks: [] }
        const color = attribute(element, "color")
        if (color) inks.push(...coloursIn(color, sf))
        if (fills.length) here = [...new Set(fills)]
        if (inks.includes("onColor")) for (const fill of here) pairs.push({ file, line: lineOf(element), fill, ink: "onColor" })
        const painted = PAINTED_UNDER_WHITE[element.tagName.getText(sf)]
        const paint = painted ? attribute(element, painted) : null
        if (paint) for (const fill of coloursIn(paint, sf)) pairs.push({ file, line: lineOf(element), fill, ink: "onColor" })
      }
      ts.forEachChild(node, (child) => visitJsx(child, here))
    }
    visitJsx(sf, [])
  }

  const hexIn = (colour: string, scheme: FieldColorScheme) =>
    colour.startsWith("#") ? colour : (FIELD_PALETTES[scheme] as Record<string, string | undefined>)[colour]
  const coloured = pairs.filter(({ fill }) => !fill.startsWith("?") && !NEUTRAL.has(fill) && !fill.endsWith("Soft"))

  it("finds them where they are", () => {
    const has = (file: string, fill: string) => coloured.some((pair) => pair.file === file && pair.fill === fill)
    expect(coloured.length).toBeGreaterThan(150)
    expect(has(path.join("screens", "server", "ServerScreen.tsx"), "coralFill")).toBe(true)
    expect(has(path.join("screens", "dashboard", "DashboardScreen.android.tsx"), "amberFill")).toBe(true)
    expect(has(path.join("screens", "planning", "PlanningWorkspaceCore.android.tsx"), "blueFill")).toBe(true)
    expect(has(path.join("components", "DayLine.tsx"), "successFill")).toBe(true)
    // ConfirmSheet still paints its confirmColor under its white label.
    expect(pairs.some((pair) => pair.file === path.join("components", "ConfirmSheet.tsx") && pair.fill === "?btnColor")).toBe(true)
    expect(fs.readFileSync(path.join(SRC, "components", "ConfirmSheet.tsx"), "utf8")).toContain("const btnColor = confirmColor ||")
  })

  it("reads every one of them in both palettes", () => {
    const unreadable: string[] = []
    for (const { file, line, fill } of coloured) {
      for (const scheme of SCHEMES) {
        const hex = hexIn(fill, scheme)
        if (!hex) {
          unreadable.push(`${file}:${line} ${fill} is not a colour of the palette`)
          continue
        }
        const ratio = contrast(FIELD_PALETTES[scheme].onColor, hex)
        if (ratio < floorFor(scheme, hex)) unreadable.push(`${file}:${line} white on ${fill}, ${scheme}: ${ratio.toFixed(2)}:1`)
      }
    }
    expect(unreadable).toEqual([])
  })
})
