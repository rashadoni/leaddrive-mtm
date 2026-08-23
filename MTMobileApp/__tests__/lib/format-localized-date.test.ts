import { formatLocalizedDate } from "../../src/lib/format-localized-date"

describe("formatLocalizedDate", () => {
  it("renders Azerbaijani month and weekday names instead of M08", () => {
    expect(formatLocalizedDate("2026-08-24", "az", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })).toBe("24 avqust, bazar ertəsi")
  })

  it("renders a human Azerbaijani month heading", () => {
    expect(formatLocalizedDate("2026-08-01", "az-AZ", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })).toBe("avqust 2026")
  })
})
