/**
 * What went wrong reads at night. The line under the red title of an error
 * box — «could not connect» on the first screen, a refused sign-in, a code
 * that did not go — was the literal #762A2A on dangerSoft, which at night is
 * #3D1E1E: about 1.5:1, so an agent who could not connect at night could not
 * read why. Each box is drawn for real here, in both palettes, and the text
 * is measured against the fill behind it.
 */
import React from "react"
import { StyleSheet } from "react-native"
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
jest.mock("../../src/services/api", () => ({
  REVOKED_REASON: "REVOKED",
  api: {
    pingServer: jest.fn(),
    setServer: jest.fn(),
    getSavedCredentials: jest.fn(),
    saveCredentials: jest.fn(),
    clearCredentials: jest.fn(),
    requestLoginCode: jest.fn(),
    verifyLoginCode: jest.fn(),
  },
}))
jest.mock("../../src/store/auth", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({
    login: jest.fn(),
    loginWithCode: jest.fn(),
    revokedReason: "REVOKED",
    clearRevokedReason: jest.fn(),
  }),
}))

import { api } from "../../src/services/api"
import ServerScreen from "../../src/screens/server/ServerScreen"
import LoginScreen from "../../src/screens/auth/LoginScreen"
import LoginCodeFlow from "../../src/screens/auth/LoginCodeFlow"
import { FIELD_PALETTES, setFieldColorScheme, type FieldColorScheme } from "../../src/theme/fieldTheme"

type Tree = TestRenderer.ReactTestRenderer

const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const flat = (style: unknown) => (StyleSheet.flatten(style as any) ?? {}) as { color?: string; backgroundColor?: string }
/** WCAG AA for body text. */
const TEXT = 4.5
/** The error line as it looked by day before night mode: the day stays as it was. */
const DAY_ERROR_TEXT = "#762A2A"

const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]

/** The words on the screen, the colour they are written in, and the fill nearest behind them. */
function inkAndFill(tree: Tree, words: string) {
  const [label] = tree.root.findAll((node) => typeof node.type === "string" && node.children.includes(words))
  expect(label).toBeDefined()
  let behind: ReactTestInstance | null = label.parent
  while (behind && !(typeof behind.type === "string" && flat(behind.props.style).backgroundColor)) behind = behind.parent
  return { ink: flat(label.props.style).color, fill: behind ? flat(behind.props.style).backgroundColor : undefined }
}

const BOXES: { box: string; words: string; draw: () => Promise<Tree> }[] = [
  {
    box: "the first screen, when the company's server does not answer",
    words: "server.couldNotConnectHelp",
    draw: async () => {
      ;(api.pingServer as jest.Mock).mockResolvedValue({ success: false, domain: "app.leaddrivecrm.org", reason: "unreachable", error: "offline" })
      let tree!: Tree
      await act(async () => { tree = TestRenderer.create(<ServerScreen onServerSelected={jest.fn()} />) })
      await act(async () => byTestId(tree, "tenant-input").props.onChangeText("app"))
      await act(async () => { byTestId(tree, "tenant-continue").props.onPress(); await Promise.resolve() })
      return tree
    },
  },
  {
    box: "sign-in, when it is refused",
    words: "auth.validationMissing",
    draw: async () => {
      let tree!: Tree
      await act(async () => {
        tree = TestRenderer.create(<LoginScreen serverDomain="fictional.leaddrivecrm.org" companyName="Fictional Company" onSwitchServer={jest.fn()} />)
      })
      // With no saved number the screen opens on first sign-in; the agent turns to «Sign in».
      await act(async () => { byTestId(tree, "login-tab-signin").props.onPress() })
      await act(async () => { byTestId(tree, "login-submit").props.onPress() })
      return tree
    },
  },
  {
    box: "sign-in, when the phone's access was taken away",
    words: "auth.accessRevokedBody",
    draw: async () => {
      let tree!: Tree
      await act(async () => {
        tree = TestRenderer.create(<LoginScreen serverDomain="fictional.leaddrivecrm.org" companyName="Fictional Company" onSwitchServer={jest.fn()} />)
      })
      return tree
    },
  },
  {
    box: "the WhatsApp code, when the number is not whole",
    words: "auth.codePhoneMissing",
    draw: async () => {
      let tree!: Tree
      await act(async () => { tree = TestRenderer.create(<LoginCodeFlow initialPhone="" onCancel={jest.fn()} purpose="reset" />) })
      await act(async () => { byTestId(tree, "login-code-send").props.onPress() })
      return tree
    },
  },
]

let tree: Tree | null = null
let warn: jest.SpyInstance

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  ;(api.getSavedCredentials as jest.Mock).mockResolvedValue(null)
})
afterEach(() => {
  if (tree) act(() => tree!.unmount())
  tree = null
  setFieldColorScheme("light")
  warn.mockRestore()
})

describe.each(["light", "dark"] as FieldColorScheme[])("the error line in the %s palette", (scheme) => {
  const palette = FIELD_PALETTES[scheme]

  it.each(BOXES)("reads on $box", async ({ words, draw }) => {
    setFieldColorScheme(scheme)
    tree = await draw()
    const { ink, fill } = inkAndFill(tree, words)
    expect(fill).toBe(palette.dangerSoft)
    expect(ink).toBe(palette.onDangerSoft)
    expect(contrast(ink!, fill!)).toBeGreaterThanOrEqual(TEXT)
    if (scheme === "light") expect(ink).toBe(DAY_ERROR_TEXT)
  })
})
