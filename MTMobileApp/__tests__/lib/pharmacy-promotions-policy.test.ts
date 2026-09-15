import fs from "fs"
import path from "path"
import { pharmacyPromotionsEnabled } from "../../src/lib/pharmacy-promotions-policy"
import {
  defaultWidgetIds,
  sanitizeWidgetIds,
  widgetIdsToSave,
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

  it("keeps a stored promotions card when the agent edits the layout while it is hidden", () => {
    const off = { pharmacyPromotionsEnabled: false }
    const stored = ["todayRoute", "promotions", "tasks"]
    // The agent sees [todayRoute, tasks] and removes tasks.
    expect(widgetIdsToSave("agent", ["todayRoute"], stored, off)).toEqual(["todayRoute", "promotions"])
    // Adds gps: the hidden card keeps its stored position.
    expect(widgetIdsToSave("agent", ["todayRoute", "tasks", "gps"], stored, off))
      .toEqual(["todayRoute", "promotions", "tasks", "gps"])
    // Switched back on, the card is shown again.
    expect(sanitizeWidgetIds("agent", widgetIdsToSave("agent", ["todayRoute"], stored, off)))
      .toEqual(["todayRoute", "promotions"])
  })

  it("adds nothing when there is nothing hidden to carry over", () => {
    expect(widgetIdsToSave("agent", ["tasks"], undefined, { pharmacyPromotionsEnabled: false })).toEqual(["tasks"])
    expect(widgetIdsToSave("agent", ["tasks"], ["tasks", "gps"], { pharmacyPromotionsEnabled: false })).toEqual(["tasks"])
    // With the switch on, an explicit removal of the card is respected.
    expect(widgetIdsToSave("agent", ["tasks"], ["promotions", "tasks"], { pharmacyPromotionsEnabled: true })).toEqual(["tasks"])
    expect(widgetIdsToSave("agent", ["tasks"], ["promotions", "tasks"])).toEqual(["tasks"])
    // Junk in storage is ignored.
    expect(widgetIdsToSave("agent", ["tasks"], [42, "nope", null], { pharmacyPromotionsEnabled: false })).toEqual(["tasks"])
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
    expect(screen).toContain("const toSave = widgetIdsToSave(workspace, ids, layouts[layoutKey], widgetPolicy)")
    expect(screen).toContain("setLayout(context, toSave)")
  })
})
