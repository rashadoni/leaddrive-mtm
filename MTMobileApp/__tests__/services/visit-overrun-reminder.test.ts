import fs from "fs"
import path from "path"
import {
  VISIT_LONG_OVERRUN_MINUTES,
  VISIT_OVERRUN_MINUTES,
  visitOverrunPlan,
  visitReminderIds,
  visitReminderLanguage,
} from "../../src/services/visit-overrun-reminder"

const CHECK_IN = "2026-09-20T03:52:00.000Z"
const startedAt = Date.parse(CHECK_IN)

describe("visit overrun reminders", () => {
  it("schedules the half-hour nudge and the two-hour one from check-in", () => {
    const plans = visitOverrunPlan({ visitId: "v1", checkInAt: CHECK_IN, language: "ru", now: startedAt + 60_000 })
    expect(plans.map((plan) => plan.id)).toEqual(visitReminderIds("v1"))
    expect(plans[0].at).toBe(startedAt + VISIT_OVERRUN_MINUTES * 60_000)
    expect(plans[1].at).toBe(startedAt + VISIT_LONG_OVERRUN_MINUTES * 60_000)
  })

  /**
   * The visit found open at 787 minutes: opening the app on it must not fire
   * both reminders at once, hours after they would have helped.
   */
  it("drops a reminder whose moment has already passed", () => {
    const plans = visitOverrunPlan({
      visitId: "v1",
      checkInAt: CHECK_IN,
      language: "ru",
      now: startedAt + 787 * 60_000,
    })
    expect(plans).toEqual([])

    const midway = visitOverrunPlan({
      visitId: "v1",
      checkInAt: CHECK_IN,
      language: "ru",
      now: startedAt + 45 * 60_000,
    })
    expect(midway.map((plan) => plan.id)).toEqual([visitReminderIds("v1")[1]])
  })

  it("never puts the customer's name on a locked screen", () => {
    const plans = visitOverrunPlan({ visitId: "v1", checkInAt: CHECK_IN, language: "ru", now: startedAt })
    for (const plan of plans) {
      expect(plan.title).not.toMatch(/ADV|Store|клиент[а-я]* «/i)
      expect(plan.body.length).toBeGreaterThan(10)
    }
  })

  it("speaks the agent's language and falls back to Russian", () => {
    expect(visitReminderLanguage("az-AZ")).toBe("az")
    expect(visitReminderLanguage("en")).toBe("en")
    expect(visitReminderLanguage("ru-RU")).toBe("ru")
    expect(visitReminderLanguage("tr")).toBe("ru")
    const az = visitOverrunPlan({ visitId: "v1", checkInAt: CHECK_IN, language: "az", now: startedAt })
    expect(az[0].title).toBe("Ziyarət 30 dəqiqədir davam edir")
  })

  it("ignores a broken check-in time instead of scheduling nonsense", () => {
    expect(visitOverrunPlan({ visitId: "v1", checkInAt: "not-a-date", language: "ru" })).toEqual([])
  })
})

describe("local notifications wiring", () => {
  const native = fs.readFileSync(
    path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/FieldNotificationsModule.kt"),
    "utf8",
  )
  const manifest = fs.readFileSync(
    path.resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml"),
    "utf8",
  )
  const packageSource = fs.readFileSync(
    path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/PresentationFilesPackage.kt"),
    "utf8",
  )
  const routeScreen = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
    "utf8",
  )

  it("registers the module and its receiver", () => {
    expect(packageSource).toContain("FieldNotificationsModule(reactContext)")
    expect(manifest).toContain('android:name=".FieldNotificationReceiver"')
    expect(manifest).toContain('android:exported="false"')
    expect(manifest).toContain("android.permission.POST_NOTIFICATIONS")
  })

  it("replaces an alarm for the same reminder instead of stacking them", () => {
    expect(native).toContain("PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE")
    expect(native).toContain("leaddrive-mtm://notification/$id")
  })

  it("asks for nothing exact: a long-visit nudge is not a stopwatch", () => {
    expect(native).toContain("alarms().setWindow(")
    expect(native).not.toContain("setExactAndAllowWhileIdle")
    expect(native).not.toContain("SCHEDULE_EXACT_ALARM")
  })

  it("schedules from the open visit and cancels when it closes", () => {
    expect(routeScreen).toContain("scheduleVisitOverrunReminders({")
    expect(routeScreen).toContain("void cancelVisitOverrunReminders(previous)")
    expect(routeScreen).toContain("if (!previous) void requestNotificationPermission()")
  })
})
