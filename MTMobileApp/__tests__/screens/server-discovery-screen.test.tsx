import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

jest.mock("../../src/services/api", () => ({ api: { pingServer: jest.fn(), setServer: jest.fn() } }))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")

import { api } from "../../src/services/api"
import ServerScreen from "../../src/screens/server/ServerScreen"

const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const selected = jest.fn(), domain = "app.leaddrivecrm.org"
const node = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll(item => item.props.testID === id, { deep: false })[0]
const text = (tree: TestRenderer.ReactTestRenderer) => JSON.stringify(tree.toJSON())
let warn: jest.SpyInstance

beforeAll(async () => { await locale.init({ lng: "az", fallbackLng: "en", resources: { az: { translation: az }, ru: { translation: ru }, en: { translation: en } }, interpolation: { escapeValue: false } }) })
beforeEach(() => { jest.clearAllMocks(); (api.pingServer as jest.Mock).mockReset(); warn = jest.spyOn(console, "warn").mockImplementation(() => {}); (api.setServer as jest.Mock).mockResolvedValue(undefined) })
afterEach(async () => { await act(async () => roots.splice(0).forEach(tree => tree.unmount())); warn.mockRestore() })

async function render(language: string) {
  await locale.changeLanguage(language)
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><ServerScreen onServerSelected={selected} /></I18nextProvider>) })
  roots.push(tree)
  await act(async () => node(tree, "tenant-input").props.onChangeText("app"))
  return tree
}
async function connect(tree: TestRenderer.ReactTestRenderer) {
  await act(async () => { node(tree, "tenant-continue").props.onPress(); await Promise.resolve() })
}

it.each(["az", "ru", "en"] as const)("shows the %s connection message, keeps the company and permits retry", async language => {
  ;(api.pingServer as jest.Mock).mockResolvedValueOnce({ success: false, domain, reason: "unreachable", error: "Connection unavailable" })
    .mockResolvedValueOnce({ success: true, domain, name: "Fictional company" })
  const tree = await render(language), copy = { az, ru, en }[language].server
  await connect(tree)
  expect(text(tree)).toContain(copy.couldNotConnectHelp)
  expect(text(tree)).not.toContain(copy.serverNotFoundHelp)
  expect(node(tree, "tenant-input").props.value).toBe("app")
  expect(node(tree, "tenant-continue").props.disabled).toBe(false)
  expect(api.setServer).not.toHaveBeenCalled(); expect(selected).not.toHaveBeenCalled()
  await connect(tree)
  expect(api.setServer).toHaveBeenCalledWith(domain)
  expect(selected).toHaveBeenCalledWith(domain, "Fictional company")
})

it.each(["az", "ru", "en"] as const)("uses %s company-not-found copy only for a confirmed missing company", async language => {
  ;(api.pingServer as jest.Mock).mockResolvedValueOnce({ success: false, domain, reason: "not_found", error: "Company not found" })
  const tree = await render(language), copy = { az, ru, en }[language].server
  await connect(tree)
  expect(text(tree)).toContain(copy.serverNotFoundHelp)
  expect(text(tree)).not.toContain(copy.couldNotConnectHelp)
  expect(api.setServer).not.toHaveBeenCalled(); expect(selected).not.toHaveBeenCalled()
})
