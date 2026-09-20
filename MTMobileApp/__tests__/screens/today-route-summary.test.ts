import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

const today = fs.readFileSync(path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"), "utf8")

describe("Today: route summary stays compact and unambiguous", () => {
  it("does not repeat the next customer as a hero title", () => {
    expect(today).not.toContain("const nextName = route?.nextPoint?.customer?.name")
    expect(today).not.toContain("const nextAddress = route?.nextPoint?.customer?.address")
    expect(today).toContain('<Text style={styles.routeSummaryTitle}>{t("todayV2.routeTitle")}</Text>')
  })

  it("renders the route point list once and marks only the selected next point", () => {
    expect(today.match(/route\.points\.map/g)).toHaveLength(1)
    expect(today).toContain("const isNext = point.id === route.nextPoint?.id")
    expect(today).toContain('t("todayV2.nextStopShort")')
  })

  it("shows the remaining count only in the compact route header", () => {
    expect(today.match(/t\("todayV2\.routeRemaining"/g)).toHaveLength(1)
    expect(today).toContain('<Text style={styles.routeSummaryMeta}>{routeSummaryText}</Text>')
    expect(today).toContain("supporting: null")
  })

  it("has a short next-stop label in every supported language", () => {
    for (const locale of ["ru", "en", "az"] as const) {
      expect(mobileResources[locale].todayV2.nextStopShort.trim().length).toBeGreaterThan(0)
    }
  })
})
