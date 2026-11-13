/**
 * Zeytun 2026-11-13 (owner's mockup approved with «Давай»): «всё, что пишется
 * в заметки в конце визита, при следующем визите нужно, чтоб напоминало агенту
 * — в маршруте и в момент, когда он начинает визит. Легко открывающимся и
 * закрывающимся». The strip is rendered for real; the route screen is read
 * for where it puts the strip and the sheet.
 */
import fs from "fs"
import path from "path"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

jest.mock("react-i18next", () => {
  const ru = jest.requireActual("../../src/i18n/locales/ru.json")
  const t = (key: string, options?: Record<string, unknown>) => {
    const value = key.split(".").reduce((node: any, part: string) => node?.[part], ru)
    return typeof value === "string" ? value.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? "")) : key
  }
  return { useTranslation: () => ({ t, i18n: { language: "ru" } }) }
})
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")

import PreviousNoteStrip from "../../src/components/PreviousNoteStrip"
import { previousNoteBeforeVisit, readPreviousVisitNote } from "../../src/services/previous-visit-note"

const NOTE = {
  visitId: "v-6",
  text: "Просила образцы Ketonal гель и прайс на Mezim forte.\nВ пятницу её нет, лучше до 12:00.",
  at: "2026-11-06T08:00:00.000Z",
  agentName: "Rashad",
}
const ru = require("../../src/i18n/locales/ru.json")
const t = (key: string, options?: Record<string, unknown>) => {
  const value = key.split(".").reduce((node: any, part: string) => node?.[part], ru)
  return typeof value === "string" ? value.replace(/\{\{(\w+)\}\}/g, (_m: string, name: string) => String(options?.[name] ?? "")) : key
}

function textsOf(node: TestRenderer.ReactTestInstance): string[] {
  return node.children.flatMap((child) => (typeof child === "string" ? [child] : textsOf(child)))
}

describe("the note from the last visit on a route stop", () => {
  it("is one line folded, the whole note on a tap, and one line again on the next", async () => {
    let tree!: TestRenderer.ReactTestRenderer
    await act(async () => { tree = TestRenderer.create(<PreviousNoteStrip note={NOTE} testID="strip" />) })
    const strip = () => tree.root.find((node) => node.props.testID === "strip" && typeof node.props.onPress === "function")
    const body = () => tree.root.findAll((node) => node.props.testID === "strip-text")[0]

    expect(textsOf(strip()).join(" ")).toContain("Заметка с прошлого визита")
    expect(textsOf(strip()).join(" ")).toContain("Rashad")
    expect(body().props.numberOfLines).toBe(1)
    expect(strip().props.accessibilityState).toEqual({ expanded: false })

    await act(async () => { strip().props.onPress() })
    expect(body().props.numberOfLines).toBeUndefined()
    expect(strip().props.accessibilityState).toEqual({ expanded: true })

    await act(async () => { strip().props.onPress() })
    expect(body().props.numberOfLines).toBe(1)
  })

  it("draws nothing for a stop with no note, or on a server that sends none", async () => {
    for (const note of [null, undefined, { text: "   ", at: NOTE.at }, { text: "x", at: "not a date" }]) {
      let tree!: TestRenderer.ReactTestRenderer
      await act(async () => { tree = TestRenderer.create(<PreviousNoteStrip note={note} testID="strip" />) })
      expect(tree.toJSON()).toBeNull()
    }
    expect(readPreviousVisitNote({ ...NOTE, agentName: " " })?.agentName).toBeNull()
  })
})

describe("the note when the agent starts the visit", () => {
  it("opens one sheet with the note and «Понятно»", () => {
    const sheet = previousNoteBeforeVisit({ previousNote: NOTE }, "Dr. Məmmədova Leyla", t, "ru")
    expect(sheet?.title).toBe("Перед визитом: Dr. Məmmədova Leyla")
    expect(sheet?.message).toContain("Rashad")
    expect(sheet?.message).toContain(NOTE.text)
    expect(sheet?.buttons).toEqual([{ text: "Понятно", value: true }])
  })

  it("opens nothing when there is nothing to remind", () => {
    expect(previousNoteBeforeVisit({}, "Aptek 15", t, "ru")).toBeNull()
  })

  it("is shown on stops still ahead, in the visit, and after a check-in on the route screen", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")
    const stopRow = route.slice(route.indexOf("function StopRow("), route.indexOf("function ChangePlanButton("))
    expect(stopRow).toContain("{done ? null : <PreviousNoteStrip note={point.previousNote}")
    const panel = route.slice(route.indexOf("function PointActionPanel("), route.indexOf("export default function RouteScreen("))
    expect(panel).toContain('<PreviousNoteStrip note={point.previousNote} testID="route-visit-previous-note" />')
    const checkIn = route.slice(route.indexOf("const handleCheckIn = async"), route.indexOf("const handleCheckOut = "))
    expect(checkIn.indexOf("previousNoteBeforeVisit(point")).toBeGreaterThan(checkIn.indexOf("await queueVisitCheckIn("))
    expect(checkIn).toContain("if (reminder) void ask({ ...reminder")
  })

  it("speaks every language", () => {
    for (const language of ["ru", "az", "en"]) {
      const strings = require(`../../src/i18n/locales/${language}.json`).previousNote
      expect(Object.keys(strings).sort()).toEqual(["beforeVisit", "gotIt", "hide", "show", "title"])
    }
  })
})
