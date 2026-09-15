import fs from "fs"
import path from "path"
import { pharmacyPromotionsEnabled } from "../../src/lib/pharmacy-promotions-policy"
import {
  defaultWidgetIds,
  sanitizeWidgetIds,
  widgetsForWorkspace,
} from "../../src/screens/dashboard/dashboard-layout"

describe("pharmacyPromotionsEnabled", () => {
  it("shows promotions when the answer is missing (older server, cached bootstrap)", () => {
    expect(pharmacyPromotionsEnabled(undefined)).toBe(true)
    expect(pharmacyPromotionsEnabled(null)).toBe(true)
    expect(pharmacyPromotionsEnabled({})).toBe(true)
    expect(pharmacyPromotionsEnabled({ pharmacyPromotionsEnabled: undefined })).toBe(true)
  })

  it("follows an explicit answer", () => {
    expect(pharmacyPromotionsEnabled({ pharmacyPromotionsEnabled: true })).toBe(true)
    expect(pharmacyPromotionsEnabled({ pharmacyPromotionsEnabled: false })).toBe(false)
  })
})

describe("agent dashboard follows the promotions switch", () => {
  const ids = (list: { id: string }[]) => list.map((widget) => widget.id)

  it("offers the Aksiyalar card unless promotions are explicitly off", () => {
    expect(ids(widgetsForWorkspace("agent"))).toContain("promotions")
    expect(ids(widgetsForWorkspace("agent", { pharmacyPromotionsEnabled: true }))).toContain("promotions")
    const off = ids(widgetsForWorkspace("agent", { pharmacyPromotionsEnabled: false }))
    expect(off).not.toContain("promotions")
    expect(off).toEqual(["todayRoute", "weekPlan", "tasks", "coverage", "gps"])
    // The manager workspace never had it.
    expect(ids(widgetsForWorkspace("manager", { pharmacyPromotionsEnabled: false })))
      .toEqual(ids(widgetsForWorkspace("manager")))
  })

  it("drops a saved promotions card while the switch is off and keeps the rest", () => {
    const saved = ["promotions", "tasks", "gps"]
    expect(sanitizeWidgetIds("agent", saved)).toEqual(saved)
    expect(sanitizeWidgetIds("agent", saved, { pharmacyPromotionsEnabled: false })).toEqual(["tasks", "gps"])
    // A layout of only the hidden card falls back to the defaults, never empty.
    expect(sanitizeWidgetIds("agent", ["promotions"], { pharmacyPromotionsEnabled: false }))
      .toEqual(defaultWidgetIds("agent", { pharmacyPromotionsEnabled: false }))
    expect(defaultWidgetIds("agent", { pharmacyPromotionsEnabled: false })).not.toContain("promotions")
  })

  it("reads the switch through the tolerant helper on the dashboard screen", () => {
    const screen = fs.readFileSync(
      path.resolve(__dirname, "../../src/screens/dashboard/DashboardScreen.android.tsx"),
      "utf8",
    )
    expect(screen).toContain('import { pharmacyPromotionsEnabled } from "../../lib/pharmacy-promotions-policy"')
    expect(screen).toContain("useBootstrapStore((state) => pharmacyPromotionsEnabled(state.data?.policies))")
    expect(screen).toContain("sanitizeWidgetIds(workspace, layouts[layoutKey] ?? defaultWidgetIds(workspace, widgetPolicy), widgetPolicy)")
    expect(screen).toContain("widgetsForWorkspace(workspace, widgetPolicy)")
  })
})
