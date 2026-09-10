import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Field UX audit 2026-09-05, the date half of task B8.
 *
 * "Дата выбирается только стрелками по одному дню: на две недели вперёд 14
 * нажатий, выходные не помечены, по умолчанию стоит суббота." All three come
 * from the same control, so all three are fixed by replacing it.
 *
 * The arithmetic lives in `services/planning-month.ts` and is tested there
 * without a screen; this pins that the screen actually uses it.
 */
const core = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("B8: the planner picks a date from a month", () => {
  it("steps by month, not by one day", () => {
    expect(core).toContain("setMonthAnchor(shiftPlanningMonth(monthAnchor, -1))")
    expect(core).toContain("setMonthAnchor(shiftPlanningMonth(monthAnchor, 1))")
    expect(core).not.toContain("changeWindow(shiftPlanningDateKey(anchor, -horizon))")
    expect(core).not.toContain("changeWindow(shiftPlanningDateKey(anchor, horizon))")
  })

  it("draws the grid from the tested helper", () => {
    expect(core).toContain('import { planningMonthGrid, shiftPlanningMonth, nextPlanningWorkday } from "../../services/planning-month"')
    expect(core).toContain("const monthCells = useMemo(() => planningMonthGrid(monthAnchor, today)")
    expect(core).toContain('testID="planning-month-grid"')
  })

  it("marks the weekend and refuses the past", () => {
    expect(core).toContain("cell.weekend && styles.monthDayWeekend")
    expect(core).toContain("const disabled = saving || cell.past")
    expect(core).toContain("accessibilityState={{ selected, disabled }}")
  })

  it("opens the nearest working day, not whatever today is", () => {
    // The audit landed on a Saturday because that is when it was run.
    expect(core).toContain("const next = nextPlanningWorkday(today)")
  })

  it("names every day for a screen reader, since the cell shows a bare number", () => {
    expect(core).toContain("accessibilityLabel={formatPlanDate(cell.date, i18n.language)}")
  })

  it("keeps the month arrows labelled in all three languages", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const shell = mobileResources[locale].managerShell as Record<string, string>
      for (const key of ["planPreviousMonth", "planNextMonth"]) {
        if (typeof shell[key] !== "string" || !shell[key].trim()) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
