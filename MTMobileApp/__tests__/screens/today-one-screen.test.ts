import fs from "fs"
import path from "path"

/**
 * B7 device acceptance, 2026-09-13 (Samsung S23 Ultra, build56): "Today"
 * without a route did not fit one screen. With the workday running, the
 * "Təqvimi aç" button sat at y=1944–2079 while the screen area ended at 1981.
 * Two things pushed it there: the break and end-day buttons were stacked
 * (48 dp each plus the gap), and the list reserved the tab bar's 63 dp again
 * under content the bar never covers.
 */
const today = fs.readFileSync(path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"), "utf8")

describe("B7: Today keeps its workday actions in one row on a phone", () => {
  it("wraps both workday buttons in one row container", () => {
    const row = today.indexOf("<View style={[styles.workdayActions, !twoPane && styles.workdayActionsPhone]}>")
    const breakButton = today.indexOf('"todayV2.resumeDay" : "todayV2.breakDay"')
    const endButton = today.indexOf('"todayV2.endDay"')
    expect(row).toBeGreaterThan(-1)
    expect(breakButton).toBeGreaterThan(row)
    expect(endButton).toBeGreaterThan(breakButton)
    expect(today).toContain('workdayActions: {\n    flexDirection: "row",')
  })

  it("lets each button take half the row and keeps long captions on one line", () => {
    expect(today.match(/!twoPane && styles\.workdayButtonPhone/g)?.length).toBe(2)
    expect(today).toContain("workdayButtonPhone: {\n    flex: 1,")
    // Russian "Завершить день" is the longest caption; it shrinks rather than wraps.
    expect(today.match(/numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}/g)?.length).toBe(2)
  })

  it("drops the icons in the phone row so the longest caption has room", () => {
    // On the phone, "Завершить день" ran to x=980 in a button ending at 987.
    expect(today).toContain('{twoPane ? (\n                    <Icon\n                      name={workdayPaused ? "play-circle-outline" : "pause-circle-outline"}')
    expect(today).toContain(") : twoPane || !workdayOpen || workdayEnding ? (")
  })

  it("does not spend the header's first line on a label that says nothing", () => {
    // "Bu gün üçün köməkçi" / "Помощник на сегодня" above the greeting. With the
    // row above in place the screen still scrolled 22 px (content 2003 px in a
    // 1981 px area); the label and its gap were about 60 px.
    expect(today).not.toContain('t("todayV2.eyebrow")')
    expect(today).not.toContain("styles.eyebrow")
  })
})
