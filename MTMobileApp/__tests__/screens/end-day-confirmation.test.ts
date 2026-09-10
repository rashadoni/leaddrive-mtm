import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B17 and defect M-22.
 *
 * The one irreversible action in the app — closing the working day — asked for
 * confirmation through the system Alert: uppercase buttons in a screen drawn
 * entirely in the app's own style, and on Android the destructive choice lands
 * on the right, under the thumb, while "keep working" sits far left. The app
 * already owns a sheet that orders them the other way round.
 */
const today = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"),
  "utf8",
)
const sheet = fs.readFileSync(
  path.resolve(__dirname, "../../src/components/ConfirmSheet.tsx"),
  "utf8",
)

describe("B17: the day is closed in the app's own dialog", () => {
  it("asks in the app's sheet, not the system alert", () => {
    expect(today).not.toContain("Alert.alert")
    expect(today).not.toContain("  Alert,")
    expect(today).toContain('import ConfirmSheet from "../../components/ConfirmSheet"')
    expect(today).toContain("visible={endDayConfirm}")
  })

  it("marks the choice destructive and keeps the day open until it is taken", () => {
    const dialog = today.slice(today.indexOf("visible={endDayConfirm}"), today.indexOf("visible={notice !== null}"))
    expect(dialog).toContain("destructive")
    expect(dialog).toContain('t("todayV2.endDayConfirmCancel")')
    expect(dialog).toContain("syncWorkday()")
    // Dismissing must not close the day.
    expect(dialog).toContain("onCancel={() => setEndDayConfirm(false)}")
  })

  it("offers the way back before the way out", () => {
    // The sheet renders cancel first and confirm second, so "продолжить
    // работу" is the leftmost control, not the one nearest the thumb.
    const actions = sheet.slice(sheet.indexOf("<View style={styles.actions}>"), sheet.indexOf("</Animated.View>", sheet.indexOf("<View style={styles.actions}>")))
    expect(actions.indexOf("cancelText")).toBeLessThan(actions.indexOf("confirmText"))
    expect(sheet).not.toContain("toUpperCase")
    expect(sheet).not.toContain("textTransform")
  })

  it("reports route-start outcomes in the same style", () => {
    // Three more system alerts lived on this screen; a one-button sheet is
    // what `hideCancel` was written for.
    expect(today).toContain("visible={notice !== null}")
    expect(today).toContain("hideCancel")
    for (const key of ["todayV2.startRouteQueuedTitle", "todayV2.dayNotStarted", "todayV2.startRouteFailed"]) {
      expect(today).toContain(key)
    }
  })
})
