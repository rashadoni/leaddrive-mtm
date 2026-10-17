import fs from "fs"
import path from "path"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const native = "android/app/src/main/java/com/mtmobileapp"
const notifications = read(`${native}/FieldNotificationsModule.kt`)
const pushService = read(`${native}/FieldPushService.kt`)
const application = read(`${native}/MainApplication.kt`)
const strings = read("android/app/src/main/res/values/strings.xml")

/**
 * Owner, 2026-10-18: the first message from a manager's phone reached the
 * employee, «но не всплывающий» — only in the shade; and it has to pop up on
 * other makes and on Lenovo tablets too. Only a channel of high importance
 * pops a notification up, on any make; the reminders channel is a default one
 * and Android never lets an app raise a channel it already created.
 */
describe("a manager's message pops up over the screen", () => {
  it("has a channel of its own, of high importance", () => {
    expect(notifications).toContain('const val TEAM_MESSAGES_CHANNEL = "team-messages"')
    const team = notifications.slice(notifications.indexOf("if (channelId == TEAM_MESSAGES_CHANNEL) {"), notifications.indexOf("} else {", notifications.indexOf("if (channelId == TEAM_MESSAGES_CHANNEL) {")))
    expect(team).toContain("NotificationManager.IMPORTANCE_HIGH")
    expect(team).toContain("R.string.team_messages_channel_name")
    // The reminders keep theirs.
    expect(notifications).toContain("NotificationManager.IMPORTANCE_DEFAULT,\n        ).apply { description = context.getString(R.string.field_notifications_channel_description) }")
    expect(strings).toContain('<string name="team_messages_channel_name">')
    expect(strings).toContain('<string name="team_messages_channel_description">')
  })

  it("exists before Firebase draws a push that arrived while the app was closed", () => {
    // A push naming a missing channel falls back to the default one.
    const created = application.indexOf("FieldNotificationReceiver.ensureTeamMessagesChannel(this)")
    expect(created).toBeGreaterThan(-1)
    expect(created).toBeLessThan(application.indexOf("loadReactNative(this)"))
    expect(application.indexOf("FieldHttp.install(this)")).toBeLessThan(application.indexOf("loadReactNative(this)"))
  })

  it("is used while the app is open too, and pops up on Android 7, which has no channels", () => {
    expect(pushService).toContain('if (message.data["target"] == "Messages") FieldNotificationReceiver.TEAM_MESSAGES_CHANNEL else FieldNotificationReceiver.DEFAULT_CHANNEL')
    expect(notifications).toContain(".setPriority(if (channelId == TEAM_MESSAGES_CHANNEL) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)")
  })
})
