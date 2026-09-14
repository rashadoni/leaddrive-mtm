import fs from "fs"
import path from "path"

// Redmi Pad SE in landscape, 2026-09-14: the buttons beside the text squeezed
// it to three lines. The panel is a column on every width.
const today = fs.readFileSync(path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"), "utf8")

describe("Today: the workday panel stacks its buttons under the text", () => {
  it("is a column on phones and tablets alike", () => {
    expect(today).toContain("<View style={styles.workdayPanel}>")
    expect(today).toContain('workdayPanel: {\n    minHeight: 126,\n    padding: fieldTheme.space.lg,\n    flexDirection: "column",')
    expect(today).not.toContain("workdayPanelSingle")
  })
})
