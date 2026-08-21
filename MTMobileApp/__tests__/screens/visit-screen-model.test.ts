import {
  filterVisitCustomers,
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
})
