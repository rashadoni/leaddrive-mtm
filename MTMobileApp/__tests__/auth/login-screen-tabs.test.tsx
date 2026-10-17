/**
 * The sign-in screen's two doors (owner, 2026-10-17, on the screen where the
 * WhatsApp button sat below the fold: «регистрация или вход… регистрация — то
 * номер и кнопка WhatsApp, которая выдаёт OTP, а вход — логин и пароль, и там
 * также, если забыл пароль, то через OTP вход и дальше новый пароль с
 * повтором»). Shown to him as a picture first («да, как на картинке»).
 * Rendered for real; only the network and the store are stubbed.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockSaved = jest.fn()
const mockClearRevoked = jest.fn()
let mockRevoked: string | null = null

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    i18n: { language: "ru-RU" },
  }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock("../../src/services/api", () => ({
  REVOKED_REASON: "REVOKED",
  api: {
    getSavedCredentials: () => mockSaved(),
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
    revokedReason: mockRevoked,
    clearRevokedReason: () => mockClearRevoked(),
  }),
}))

import LoginScreen from "../../src/screens/auth/LoginScreen"

type Tree = TestRenderer.ReactTestRenderer
const has = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false }).length > 0
const byTestId = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
function texts(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : texts(child)))
}
async function render() {
  let tree!: Tree
  await act(async () => {
    tree = TestRenderer.create(<LoginScreen serverDomain="fictional.leaddrivecrm.org" companyName="Fictional Company" onSwitchServer={jest.fn()} />)
  })
  return tree
}
async function press(tree: Tree, testID: string) {
  await act(async () => { byTestId(tree, testID).props.onPress() })
}

beforeEach(() => {
  mockSaved.mockReset()
  mockClearRevoked.mockReset()
  mockRevoked = null
})

describe("the sign-in screen's two tabs", () => {
  it("opens a phone that remembers a number on «Вход»: number, password, and «Забыли пароль?» right under the password", async () => {
    mockSaved.mockResolvedValue({ email: "+994501112233" })
    const tree = await render()
    expect(byTestId(tree, "login-tab-signin").props.accessibilityState).toEqual({ selected: true })
    expect(byTestId(tree, "login-email").props.value).toBe("+994501112233")
    // The way to a code is beside the password, not below the sign-in button.
    const order = tree.root.findAll((node) => ["login-password", "login-forgot", "login-submit"].includes(node.props.testID), { deep: false }).map((node) => node.props.testID)
    expect(order).toEqual(["login-password", "login-forgot", "login-submit"])
    expect(has(tree, "login-code-start")).toBe(false)
    expect(texts(tree.root).join(" ")).toContain("auth.forgotPassword")
  })

  it("opens a new phone on «Первый вход»: the number and one WhatsApp button, nothing else to fill", async () => {
    mockSaved.mockResolvedValue(null)
    const tree = await render()
    expect(byTestId(tree, "login-tab-first").props.accessibilityState).toEqual({ selected: true })
    expect(has(tree, "login-code-step-phone")).toBe(true)
    expect(has(tree, "login-password")).toBe(false)
    expect(texts(byTestId(tree, "login-code-send")).join("")).toBe("auth.codeStart")
    expect(texts(tree.root).join(" ")).toContain("auth.firstBody")
    // The tabs are the way back here: no second «back» link.
    expect(has(tree, "login-code-cancel")).toBe(false)
  })

  it("switches between the tabs, and the choice is not undone by the saved number arriving late", async () => {
    let resolve!: (value: unknown) => void
    mockSaved.mockReturnValue(new Promise((done) => { resolve = done }))
    const tree = await render()
    await press(tree, "login-tab-first")
    await act(async () => { resolve(null) })
    expect(byTestId(tree, "login-tab-first").props.accessibilityState).toEqual({ selected: true })
    await press(tree, "login-tab-signin")
    expect(has(tree, "login-password")).toBe(true)
  })

  it("«Забыли пароль?» asks for the number, takes the one typed as login, and comes back", async () => {
    mockSaved.mockResolvedValue({ email: "+994501112233" })
    const tree = await render()
    await press(tree, "login-forgot")
    expect(texts(tree.root).join(" ")).toContain("auth.resetTitle")
    expect(byTestId(tree, "login-code-phone").props.value).toBe("+994501112233")
    expect(has(tree, "login-tab-signin")).toBe(false)
    await press(tree, "login-code-cancel")
    expect(has(tree, "login-password")).toBe(true)
  })

  it("says «sign in again» after the session ended, and drops it once typing starts", async () => {
    mockSaved.mockResolvedValue({ email: "+994501112233" })
    mockRevoked = "REVOKED"
    const tree = await render()
    expect(texts(byTestId(tree, "login-revoked")).join(" ")).toContain("auth.accessRevokedTitle")
    await act(async () => { byTestId(tree, "login-password").props.onChangeText("a") })
    expect(mockClearRevoked).toHaveBeenCalled()
  })
})
