/**
 * Signing in with a code from WhatsApp, rendered for real (owner, 2026-10-15:
 * «чтоб через WhatsApp приходил OTP-пароль, чтоб сами назначали, а кадровик не
 * занимался этой рутиной»): number → six digits → one's own password, and
 * every refusal said in words.
 */
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

const mockRequest = jest.fn()
const mockVerify = jest.fn()
const mockLoginWithCode = jest.fn()

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    i18n: { language: "ru-RU" },
  }),
}))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("../../src/services/api", () => ({
  api: {
    requestLoginCode: (...args: unknown[]) => mockRequest(...args),
    verifyLoginCode: (...args: unknown[]) => mockVerify(...args),
  },
}))
jest.mock("../../src/store/auth", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ loginWithCode: (...args: unknown[]) => mockLoginWithCode(...args) }),
}))

import LoginCodeFlow, { maskPhone, passwordRules } from "../../src/screens/auth/LoginCodeFlow"

type Tree = TestRenderer.ReactTestRenderer
type Node = TestRenderer.ReactTestInstance

const byTestId = (tree: Tree, testID: string): Node => tree.root.findAll((node) => node.props.testID === testID, { deep: false })[0]
const has = (tree: Tree, testID: string) => tree.root.findAll((node) => node.props.testID === testID, { deep: false }).length > 0
function textsOf(node: Node): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}
async function type(tree: Tree, testID: string, value: string) {
  await act(async () => { byTestId(tree, testID).props.onChangeText(value) })
}
async function press(tree: Tree, testID: string) {
  await act(async () => { byTestId(tree, testID).props.onPress() })
}
async function render(initialPhone = "", purpose: "first" | "reset" = "reset") {
  let tree!: Tree
  const onCancel = jest.fn()
  await act(async () => { tree = TestRenderer.create(<LoginCodeFlow initialPhone={initialPhone} onCancel={onCancel} purpose={purpose} />) })
  return { tree, onCancel }
}
const errorText = (tree: Tree) => textsOf(byTestId(tree, "login-code-error")).join("")

beforeEach(() => {
  jest.useFakeTimers()
  mockRequest.mockReset().mockResolvedValue({ resendAfterSeconds: 60, expiresInSeconds: 600 })
  mockVerify.mockReset().mockResolvedValue({ setupToken: "setup-1", name: "Fictional Employee", organizationName: "Fictional Company" })
  mockLoginWithCode.mockReset().mockResolvedValue(undefined)
})
afterEach(() => jest.useRealTimers())

describe("signing in with a code from WhatsApp", () => {
  it("walks from the number to the code to one's own password, in the app's language", async () => {
    const { tree } = await render("+994 50 123 45 67")
    expect(has(tree, "login-code-step-phone")).toBe(true)
    expect(byTestId(tree, "login-code-phone").props.value).toBe("+994 50 123 45 67")
    await press(tree, "login-code-send")
    expect(mockRequest).toHaveBeenCalledWith("+994 50 123 45 67", "ru")

    expect(has(tree, "login-code-step-code")).toBe(true)
    expect(textsOf(tree.root).join(" ")).toContain('auth.codeEnterBody {"phone":"+994 50 ••• 45 67"}')
    // A minute before another code; then the button is back.
    expect(textsOf(byTestId(tree, "login-code-wait")).join("")).toContain('"time":"1:00"')
    await act(async () => { jest.advanceTimersByTime(61_000) })
    expect(has(tree, "login-code-resend")).toBe(true)

    // Pasted with spaces or extra characters: only six digits are kept.
    await type(tree, "login-code-input", "48 29 13 7")
    expect(byTestId(tree, "login-code-input").props.value).toBe("482913")
    await press(tree, "login-code-confirm")
    expect(mockVerify).toHaveBeenCalledWith("+994 50 123 45 67", "482913")

    expect(has(tree, "login-code-step-password")).toBe(true)
    await type(tree, "login-code-newPassword", "Fictional-Pass-2026!")
    await type(tree, "login-code-repeatPassword", "Fictional-Pass-2026!")
    await press(tree, "login-code-save")
    expect(mockLoginWithCode).toHaveBeenCalledWith("setup-1", "Fictional-Pass-2026!")
  })

  it("starts with the country code when the number field is empty, and asks for a whole number", async () => {
    const { tree } = await render("")
    expect(byTestId(tree, "login-code-phone").props.value).toBe("+994 ")
    await press(tree, "login-code-send")
    expect(mockRequest).not.toHaveBeenCalled()
    expect(errorText(tree)).toBe("auth.codePhoneMissing")
  })

  it.each([
    ["MTM_LOGIN_CODE_UNAVAILABLE", "auth.codeUnavailable"],
    ["MTM_LOGIN_CODE_TOO_MANY", "auth.codeTooMany"],
    ["MTM_LOGIN_CODE_NO_COMPANY", "auth.codeNoCompany"],
    ["MTM_LOGIN_CODE_SEND_FAILED", "auth.codeSendFailed"],
    [undefined, "auth.codeNetwork"],
  ])("says %s in words and stays on the number", async (code, text) => {
    mockRequest.mockRejectedValue(Object.assign(new Error("refused"), { code }))
    const { tree } = await render("+994501234567")
    await press(tree, "login-code-send")
    expect(has(tree, "login-code-step-phone")).toBe(true)
    expect(errorText(tree)).toBe(text)
  })

  it.each([
    ["MTM_LOGIN_CODE_INVALID", "auth.codeInvalid"],
    ["MTM_LOGIN_CODE_EXPIRED", "auth.codeExpired"],
    ["MTM_LOGIN_CODE_LOCKED", "auth.codeLocked"],
  ])("refuses a code with %s and keeps the code step", async (code, text) => {
    mockVerify.mockRejectedValue(Object.assign(new Error("refused"), { code }))
    const { tree } = await render("+994501234567")
    await press(tree, "login-code-send")
    await type(tree, "login-code-input", "000000")
    await press(tree, "login-code-confirm")
    expect(has(tree, "login-code-step-code")).toBe(true)
    expect(errorText(tree)).toBe(text)
  })

  it("does not send a password that breaks the rules, and goes back to the number when time is up", async () => {
    const { tree } = await render("+994501234567")
    await press(tree, "login-code-send")
    await type(tree, "login-code-input", "123456")
    await press(tree, "login-code-confirm")
    await type(tree, "login-code-newPassword", "short")
    await type(tree, "login-code-repeatPassword", "short")
    await press(tree, "login-code-save")
    expect(mockLoginWithCode).not.toHaveBeenCalled()
    expect(errorText(tree)).toBe("auth.passwordWeak")

    mockLoginWithCode.mockRejectedValue(new Error("SESSION_EXPIRED"))
    await type(tree, "login-code-newPassword", "Fictional-Pass-2026!")
    await type(tree, "login-code-repeatPassword", "Fictional-Pass-2026!")
    await press(tree, "login-code-save")
    expect(has(tree, "login-code-step-phone")).toBe(true)
    expect(errorText(tree)).toBe("auth.setupExpired")
  })

  it("goes back to the password form", async () => {
    const { tree, onCancel } = await render("")
    expect(textsOf(tree.root).join(" ")).toContain("auth.resetTitle")
    await press(tree, "login-code-cancel")
    expect(onCancel).toHaveBeenCalled()
  })

  // Owner, 2026-10-17: «Первый вход» is a tab; the tabs are its way out.
  it("on the first sign-in tab asks only for the number, and «Назад» from the code returns to it", async () => {
    const { tree, onCancel } = await render("+994501234567", "first")
    expect(has(tree, "login-code-cancel")).toBe(false)
    expect(textsOf(tree.root).join(" ")).toContain("auth.firstBody")
    expect(textsOf(tree.root).join(" ")).not.toContain("auth.resetTitle")
    await press(tree, "login-code-send")
    expect(has(tree, "login-code-step-code")).toBe(true)
    await press(tree, "login-code-cancel")
    expect(has(tree, "login-code-step-phone")).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe("the password rules the screen ticks", () => {
  it.each([
    ["Fictional-Pass-2026!", true],
    ["Şirkət-Parol-2026!", true],
    ["Фиктивный-Пароль-1", true],
    ["fictional-pass-2026!", false],
    ["FICTIONAL-PASS-2026!", false],
    ["Fictional-Pass-word!", false],
    ["FictionalPass2026x", false],
    ["Short-1!", false],
    ["Fictional Pass 2026!", false],
  ])("judges %s as %s, like the server", (password, ok) => {
    expect(passwordRules(password, password).ok).toBe(ok)
  })

  it("wants the repeat to match", () => {
    expect(passwordRules("Fictional-Pass-2026!", "Fictional-Pass-2026?")).toMatchObject({ match: false, ok: false })
  })
})

describe("the number on screen", () => {
  it("hides the middle of the number", () => {
    expect(maskPhone("+994 50 123 45 67")).toBe("+994 50 ••• 45 67")
    expect(maskPhone("994501234567")).toBe("+994 50 ••• 45 67")
  })
})
