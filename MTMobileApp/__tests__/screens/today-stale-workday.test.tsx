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
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
import StaleWorkdayCard, { type StaleWorkdayCardMode } from "../../src/components/StaleWorkdayCard"
import StaleWorkdayCloseSheet from "../../src/components/StaleWorkdayCloseSheet"

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

async function card(mode: StaleWorkdayCardMode, language = "ru", sentFinish: string | null = null) {
  await act(async () => { await locale.changeLanguage(language) })
  const onCloseDay = jest.fn()
  let tree!: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(
      <I18nextProvider i18n={locale}>
        <StaleWorkdayCard day="2026-10-13" startedAt="2026-10-13T06:21:58.533Z" timezone="Asia/Baku" mode={mode} sentFinish={sentFinish} busy={false} error={null} onCloseDay={onCloseDay} />
      </I18nextProvider>,
    )
  })
  roots.push(tree)
  const button = (id: string) => tree.root.findAll((item) => item.props.testID === id, { deep: false })[0]
  return { tree, onCloseDay, button, text: JSON.stringify(tree.toJSON()) }
}

describe("«Bu gün» for a day left open since 13 October", () => {
  it("says the date and the start, and has one button — «Закрыть день»", async () => {
    const { text, button, onCloseDay } = await card("request")
    expect(text).toContain("Рабочий день с 13 октября не закрыт")
    expect(text).toContain("Начат 13 октября в 10:21.")
    expect(text).toContain("Закрыть день")
    act(() => { button("today-stale-close-day").props.onPress() })
    expect(onCloseDay).toHaveBeenCalledTimes(1)
    // The first version's two buttons and its trip to «Мои заявки» are gone.
    expect(text).not.toContain("Указать время ухода")
    expect(text).not.toContain("Закрыть сейчас")
  })

  it("reads «Günü bağla» in Azerbaijani on the agent's phone", async () => {
    const { text } = await card("request", "az")
    expect(text).toContain("13 oktyabr tarixli iş günü bağlanmayıb")
    expect(text).toContain("Günü bağla")
    expect(text).not.toContain("Bitmə vaxtını göstər")
  })

  it("once sent, names the finish time and offers nothing — closing now would void the request", async () => {
    const { text, button } = await card("sent", "ru", "22:19")
    expect(text).toContain("Вы указали окончание в 22:19.")
    expect(button("today-stale-close-day")).toBeUndefined()
  })

  it("once approved — at once where the company allows it — says the day is closed while the screen reads it again", async () => {
    const { text, button } = await card("approved", "ru", "22:19")
    expect(text).toContain("День закрыт: окончание в 22:19.")
    expect(button("today-stale-close-day")).toBeUndefined()
  })

  it("where the company takes no requests from the phone, says before the press what closing now means", async () => {
    const { text, button } = await card("closeOnly")
    expect(text).toContain("Если закрыть сейчас, день закроется текущим временем")
    expect(button("today-stale-close-day")).toBeDefined()
  })

  it("never leaves a key on screen", async () => {
    for (const language of ["ru", "az", "en"]) {
      for (const mode of ["request", "sent", "approved", "closeOnly"] as const) {
        expect((await card(mode, language, "22:19")).text).not.toContain("todayV2.")
      }
    }
  })
})

describe("the close-the-day sheet: one field, the finish time", () => {
  async function sheet(language = "ru") {
    await act(async () => { await locale.changeLanguage(language) })
    const onSend = jest.fn()
    let tree!: TestRenderer.ReactTestRenderer
    act(() => {
      tree = TestRenderer.create(
        <I18nextProvider i18n={locale}>
          <StaleWorkdayCloseSheet visible correction={{ workDate: "2026-10-13", startTime: "10:21" }} timezone="Asia/Baku" sending={false} failed={false} onCancel={jest.fn()} onSend={onSend} />
        </I18nextProvider>,
      )
    })
    roots.push(tree)
    const node = (id: string) => tree.root.findAll((item) => item.props.testID === id, { deep: false })[0]
    const type = (value: string) => act(() => { node("today-stale-finish").props.onChangeText(value) })
    const send = () => act(() => { node("today-stale-close-send").props.onPress() })
    return { onSend, node, type, send, text: () => JSON.stringify(tree.toJSON()) }
  }

  it("shows the day and its start and asks only when the agent finished", async () => {
    const { text, node } = await sheet()
    expect(text()).toContain("Закрыть день 13 октября")
    expect(text()).toContain("Начало: 10:21")
    expect(text()).toContain("Во сколько вы закончили?")
    expect(node("today-stale-finish").props.keyboardType).toBe("number-pad")
    // Nothing of «Мои заявки»: no request kinds, documents or limits.
    expect(text()).not.toContain("attendance-kind-")
    expect(text()).not.toContain("attendance-quota")
  })

  it("sends the time-correction request for the time typed on the number pad", async () => {
    const { type, send, onSend, node } = await sheet()
    type("2219")
    expect(node("today-stale-finish").props.value).toBe("22:19")
    send()
    expect(onSend).toHaveBeenCalledWith({
      clientRequestId: expect.stringMatching(/^[a-f0-9-]{36}$/), kind: "TIME_CORRECTION", unit: "HOURS",
      startDate: "2026-10-13", endDate: "2026-10-13", startTime: "10:21", endTime: "22:19",
      reason: ru.attendanceRequests.staleWorkdayReason, attachmentIds: [],
    })
  })

  it("says when the finish falls after midnight", async () => {
    const { type, text } = await sheet()
    type("0130")
    expect(text()).toContain("После полуночи — 14 октября")
  })

  it("refuses what is not a time, and sends nothing", async () => {
    const { type, send, onSend, text } = await sheet()
    type("2519")
    send()
    expect(onSend).not.toHaveBeenCalled()
    expect(text()).toContain("Напишите время, например 18:30.")
  })
})

describe("the Today screen wires the card and the sheet in", () => {
  const today = read("screens/today/TodayScreen.tsx")

  it("replaces the ordinary card — no «Fasilə», no QR finish — for a stale day only", () => {
    expect(today).toContain("workdayOpenSinceEarlierDay(currentWorkday.startedAt, new Date(), companyTimezone)")
    expect(today.indexOf("{staleDay && currentWorkday ? (")).toBeLessThan(today.indexOf("<View style={styles.workdayPanel}>"))
    expect(today).toContain("qr.available && !staleDay && !workdayPaused")
  })

  it("closes the day on this screen, not in «Мои заявки»", () => {
    expect(today).toContain("onCloseDay={finishTimeRequestable ? openCloseSheet : requestWorkdayAction}")
    expect(today).toContain("<StaleWorkdayCloseSheet")
    expect(today).toContain("await queueAttendanceRequest(attendanceScope(), input, [])")
    expect(today).not.toContain('screen: "AttendanceRequests"')
  })

  it("asks before closing now where no request can be sent, saying how many hours go into that day", () => {
    const dialog = today.slice(today.indexOf("visible={endDayConfirm}"), today.indexOf("visible={notice !== null}"))
    expect(dialog).toContain('t("todayV2.staleEndConfirmBody", staleClose)')
    expect(dialog).toContain('t("todayV2.staleEndNow")')
    expect(today).toContain("hours: Math.max(0, Math.floor((Date.now() - new Date(currentWorkday.startedAt).getTime()) / 3_600_000))")
  })

  it("reads the day again once the close is approved, so the card gives way to «Günə başla»", () => {
    expect(today).toContain("if (finish?.approved) await refreshRouteFieldSession()")
    expect(today).toContain("runMobileSync().then(() => readFinishTimeSent())")
  })

  it("offers the request only where the server takes it", () => {
    expect(today).toContain('agent?.role === "AGENT" && agentMayAttendanceRequests(state.data?.policies))')
  })
})

describe("the words exist in all three languages with the same placeholders", () => {
  const keys = [
    "staleDayTitle", "staleDayBody", "staleDayBodyNoRequest", "staleDaySent", "staleDayApproved", "staleCloseDay",
    "staleEndNow", "staleEndConfirmTitle", "staleEndConfirmBody",
    "staleSheetTitle", "staleSheetStart", "staleSheetQuestion", "staleSheetHint", "staleSheetNextDay",
    "staleSheetSend", "staleSheetInvalid", "staleSheetFuture", "staleSheetFailed",
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
