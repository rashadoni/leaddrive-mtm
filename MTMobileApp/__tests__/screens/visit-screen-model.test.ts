import {
  filterVisitCustomers,
  visitDurationLabel,
  visitEndsSameDay,
  visitScreenLanguage,
  visitScreenLayout,
} from "../../src/screens/visit/visit-screen-model"

describe("friendly visit screen model", () => {
  it("uses a focused phone flow and a split tablet flow", () => {
    expect(visitScreenLayout(599)).toBe("phone")
    expect(visitScreenLayout(600)).toBe("tablet")
    expect(visitScreenLayout(1024)).toBe("tablet")
  })

  it("selects Azerbaijani, English and Russian fallback copy", () => {
    expect(visitScreenLanguage("az-AZ")).toBe("az")
    expect(visitScreenLanguage("en-US")).toBe("en")
    expect(visitScreenLanguage("ru-RU")).toBe("ru")
    expect(visitScreenLanguage("de-DE")).toBe("ru")
  })

  it("filters clients by name and limits the visible choice list", () => {
    const customers = [
      { id: "1", name: "Central Clinic" },
      { id: "2", name: "North Pharmacy" },
      { id: "3", name: "Central Hospital" },
    ]

    expect(filterVisitCustomers(customers, " central ")).toEqual([
      customers[0],
      customers[2],
    ])
    expect(filterVisitCustomers(customers, "", 2)).toEqual(customers.slice(0, 2))
  })

  // Owner-approved mockup, 2026-10-31: the history wrote «12 окт., 21:21 –
  // 23:23 · 7321 мин» for a visit closed five days later.
  it("says a visit's length in minutes, hours or days, as a person would", () => {
    expect(visitDurationLabel(15, "ru")).toBe("15 мин")
    expect(visitDurationLabel(60, "ru")).toBe("1 ч")
    expect(visitDurationLabel(142, "ru")).toBe("2 ч 22 мин")
    expect(visitDurationLabel(798, "ru")).toBe("13 ч 18 мин")
    expect(visitDurationLabel(7321, "ru")).toBe("5 дн 2 ч")
    expect(visitDurationLabel(2 * 24 * 60, "ru")).toBe("2 дн")
    expect(visitDurationLabel(142, "az")).toBe("2 saat 22 dəq")
    expect(visitDurationLabel(7321, "az")).toBe("5 gün 2 saat")
    expect(visitDurationLabel(7321, "en")).toBe("5 d 2 h")
    expect(visitDurationLabel(-3, "ru")).toBe("0 мин")
  })

  it("knows when a visit ended on another day, on the phone's own clock", () => {
    const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).toISOString()
    expect(visitEndsSameDay(at(20, 20, 23), at(20, 20, 38))).toBe(true)
    expect(visitEndsSameDay(at(12, 21, 21), at(17, 23, 23))).toBe(false)
    expect(visitEndsSameDay(at(7, 22, 14), at(8, 11, 33))).toBe(false)
    expect(visitEndsSameDay(at(7, 23, 59), at(8, 0, 1))).toBe(false)
    // Still open, or a time that does not parse: the end shows as before.
    expect(visitEndsSameDay(at(20, 20, 23), undefined)).toBe(true)
    expect(visitEndsSameDay(at(20, 20, 23), "nonsense")).toBe(true)
  })
})
