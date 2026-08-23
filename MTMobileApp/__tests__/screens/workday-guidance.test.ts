import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

describe("field workday guidance", () => {
  const todaySource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"),
    "utf8",
  )
  const dashboardSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/dashboard/DashboardScreen.android.tsx"),
    "utf8",
  )
  const runtimeSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/runtime/AndroidApp.tsx"),
    "utf8",
  )

  it("requires explicit confirmation before ending the day from either entry point", () => {
    for (const source of [todaySource, dashboardSource]) {
      expect(source).toContain("endDayConfirmVisible")
      expect(source).toContain("<ConfirmSheet")
      expect(source).toContain('title={t("todayV2.endDayConfirmTitle")}')
      expect(source).toContain("onConfirm={confirmEndDay}")
    }
  })

  it("does not allow the dashboard action before the saved workday is restored", () => {
    expect(dashboardSource).toContain("const workdayHydrated = useWorkdayStore")
    expect(dashboardSource).toContain("disabled={workdayBusy || workdayEnding || !workdayHydrated}")
  })

  it("stops GPS immediately while FINISH awaits server confirmation", () => {
    expect(runtimeSource).toContain('activeWorkday.syncState !== "FINISH_PENDING"')
    expect(runtimeSource).toContain("await useBootstrapStore.getState().fetchBootstrap()")
  })

  it.each(["ru", "en", "az"] as const)("ships clear %s end-day consequences", (locale) => {
    const copy = mobileResources[locale].todayV2
    expect(copy.endDayConfirmTitle).toBeTruthy()
    expect(copy.endDayConfirmBody).toBeTruthy()
    expect(copy.endDayConfirmCancel).toBeTruthy()
    expect(copy.endDayConfirmAction).toBeTruthy()
    expect(copy.dayStartingBody).toBeTruthy()
    expect(copy.dayEndingBody).toBeTruthy()
    expect(copy.endDayPendingButton).toBeTruthy()
  })
})
