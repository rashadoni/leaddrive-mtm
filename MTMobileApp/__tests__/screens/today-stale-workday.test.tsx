import fs from "fs"
import path from "path"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import { mobileResources } from "../../src/i18n/mobile-resources"
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
import StaleWorkdayCard, { type StaleWorkdayCardMode } from "../../src/components/StaleWorkdayCard"

/**
 * Owner's phone, 2026-10-18 04:06: a workday started on 13 October was still
 * shown as «İş günü davam edir», with «Fasilə» and «Günü bitir». The owner
 * chose a red card that asks for the real finish time (services/stale-workday.ts).
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const locale = i18next.createInstance()
const roots: TestRenderer.ReactTestRenderer[] = []
beforeAll(async () => {
  await locale.init({
    lng: "ru",
    fallbackLng: "ru",
    resources: {
      ru: { translation: { ...ru, ...mobileResources.ru } },
      az: { translation: { ...az, ...mobileResources.az } },
      en: { translation: { ...en, ...mobileResources.en } },
    },
    interpolation: { escapeValue: false },
  })
})
afterEach(() => { act(() => { roots.splice(0).forEach((tree) => tree.unmount()) }) })

async function card(mode: StaleWorkdayCardMode, language = "ru") {
  await locale.changeLanguage(language)
  const handlers = { onSetFinish: jest.fn(), onOpenRequest: jest.fn(), onCloseNow: jest.fn() }
  let tree!: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={locale}>
        <StaleWorkdayCard day="2026-10-13" startedAt="2026-10-13T06:21:58.533Z" timezone="Asia/Baku" mode={mode} busy={false} error={null} {...handlers} />
      </I18nextProvider>,
    )
  })
  roots.push(tree)
  const button = (id: string) => tree.root.findAll((item) => item.props.testID === id, { deep: false })[0]
  return { tree, handlers, button, text: JSON.stringify(tree.toJSON()) }
}

describe("«Bu gün» for a day left open since 13 October", () => {
  it("says the date and the start, and asks for the finish time first", async () => {
    const { text, button, handlers } = await card("request")
    expect(text).toContain("Рабочий день с 13 октября не закрыт")
    expect(text).toContain("Начат 13 октября в 10:21.")
    expect(button("today-stale-set-finish")).toBeDefined()
    expect(button("today-stale-close-now")).toBeDefined()
    act(() => { button("today-stale-set-finish").props.onPress() })
    expect(handlers.onSetFinish).toHaveBeenCalledTimes(1)
    act(() => { button("today-stale-close-now").props.onPress() })
    expect(handlers.onCloseNow).toHaveBeenCalledTimes(1)
  })

  it("reads in Azerbaijani on the agent's phone", async () => {
    const { text } = await card("request", "az")
    expect(text).toContain("13 oktyabr tarixli iş günü bağlanmayıb")
    expect(text).toContain("Bitmə vaxtını göstər")
  })

  it("once the finish time is sent, only shows the request — closing now would void it", async () => {
    const { text, button } = await card("sent")
    expect(text).toContain(mobileResources.ru.todayV2.staleDaySent)
    expect(button("today-stale-open-request")).toBeDefined()
    expect(button("today-stale-set-finish")).toBeUndefined()
    expect(button("today-stale-close-now")).toBeUndefined()
  })

  it("where the company takes no requests from the phone, closing now is the one way, said before it is pressed", async () => {
    const { text, button } = await card("closeOnly")
    expect(text).toContain("Если закрыть сейчас, день закроется текущим временем")
    expect(button("today-stale-close-now")).toBeDefined()
    expect(button("today-stale-set-finish")).toBeUndefined()
  })

  it("never leaves a key on screen", async () => {
    for (const language of ["ru", "az", "en"]) {
      for (const mode of ["request", "sent", "closeOnly"] as const) {
        expect((await card(mode, language)).text).not.toContain("todayV2.")
      }
    }
  })
})

describe("the Today screen wires the card in", () => {
  const today = read("screens/today/TodayScreen.tsx")

  it("replaces the ordinary card — no «Fasilə», no QR finish — for a stale day only", () => {
    expect(today).toContain("workdayOpenSinceEarlierDay(currentWorkday.startedAt, new Date(), companyTimezone)")
    expect(today.indexOf("{staleDay && currentWorkday ? (")).toBeLessThan(today.indexOf("<View style={styles.workdayPanel}>"))
    expect(today).toContain("qr.available && !staleDay && !workdayPaused")
  })

  it("opens the filled-in request under the «Ещё» menu, not in place of it", () => {
    const open = today.slice(today.indexOf("const openFinishTimeRequest"), today.indexOf("useEffect(()=>", today.indexOf("const openFinishTimeRequest")))
    expect(open).toContain('screen: "AttendanceRequests"')
    expect(open).toContain("staleWorkdayCorrection(currentWorkday.startedAt, companyTimezone)")
    expect(open).toContain("initial: false")
  })

  it("asks before «Закрыть сейчас», saying how many hours go into that day", () => {
    const dialog = today.slice(today.indexOf("visible={endDayConfirm}"), today.indexOf("visible={notice !== null}"))
    expect(dialog).toContain('t("todayV2.staleEndConfirmBody", staleClose)')
    expect(dialog).toContain('t("todayV2.staleEndNow")')
    expect(today).toContain("hours: Math.max(0, Math.floor((Date.now() - new Date(currentWorkday.startedAt).getTime()) / 3_600_000))")
  })

  it("offers the request only where the server takes it", () => {
    expect(today).toContain('agent?.role === "AGENT" && agentMayAttendanceRequests(state.data?.policies))')
    expect(read("navigation/AppNavigatorAndroidV2.tsx")).toContain("AttendanceRequests: AttendanceRequestsParams | undefined")
  })
})

describe("the words exist in all three languages with the same placeholders", () => {
  const keys = [
    "staleDayTitle", "staleDayBody", "staleDayBodyNoRequest", "staleDaySent", "staleSetFinish",
    "staleEndNow", "staleOpenRequest", "staleEndConfirmTitle", "staleEndConfirmBody", "staleEndConfirmHint",
  ] as const
  const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(",")

  it("in «Bu gün»", () => {
    const wrong: string[] = []
    for (const key of keys) {
      const russian = (mobileResources.ru.todayV2 as Record<string, string>)[key]
      for (const language of ["ru", "az", "en"] as const) {
        const value = (mobileResources[language].todayV2 as Record<string, string>)[key]
        if (!value || placeholders(value) !== placeholders(russian ?? "")) wrong.push(`${language}.${key}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it("in the request's reason", () => {
    const missing = (["ru", "az", "en"] as const).filter((language) =>
      !{ ru, az, en }[language].attendanceRequests.staleWorkdayReason)
    expect(missing).toEqual([])
  })
})
