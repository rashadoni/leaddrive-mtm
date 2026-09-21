import { NativeModules, PermissionsAndroid, Platform } from "react-native"

/**
 * On-device notifications for the field app.
 *
 * Until now the app could only tell an agent something while they were looking
 * at it: team messages arrive by polling a focused screen, and a visit left
 * open all day said nothing at all. These reminders need neither a Google
 * account nor a server — the phone already knows when a visit started.
 * Server-sent pushes (a manager's message, a changed route) are a separate
 * piece of work that does need Firebase.
 *
 * Every call is best effort: notifications are a courtesy, and no failure here
 * may break the screen that asked for one.
 */

export const FIELD_REMINDER_CHANNEL = "field-reminders"

interface FieldNotificationsNativeModule {
  ensureChannel(channelId: string, name: string, description: string): Promise<boolean>
  areNotificationsEnabled(): Promise<boolean>
  notifyNow(id: string, title: string, body: string, channelId: string): Promise<boolean>
  scheduleAt(id: string, triggerAtMs: number, title: string, body: string, channelId: string): Promise<boolean>
  cancel(id: string): Promise<boolean>
  isIgnoringBatteryOptimizations(): Promise<boolean>
  requestIgnoreBatteryOptimizations(): Promise<boolean>
}

function nativeModule(): FieldNotificationsNativeModule | null {
  if (Platform.OS !== "android") return null
  const native = NativeModules.FieldNotifications as FieldNotificationsNativeModule | undefined
  return native ?? null
}

/** True when the phone will actually show what we post. */
export async function notificationsEnabled(): Promise<boolean> {
  const native = nativeModule()
  if (!native) return false
  try {
    return await native.areNotificationsEnabled()
  } catch {
    return false
  }
}

/**
 * Android 13 asks for POST_NOTIFICATIONS at runtime. Asking at app start, out
 * of context, is how permission dialogs get denied for ever; callers ask when
 * the agent has just seen what the reminder is for.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  try {
    if (Platform.Version >= 33) {
      const permission = "android.permission.POST_NOTIFICATIONS" as Parameters<typeof PermissionsAndroid.request>[0]
      const result = await PermissionsAndroid.request(permission)
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false
    }
    return await notificationsEnabled()
  } catch {
    return false
  }
}

export async function ensureReminderChannel(name: string, description: string): Promise<void> {
  const native = nativeModule()
  if (!native) return
  try {
    await native.ensureChannel(FIELD_REMINDER_CHANNEL, name, description)
  } catch {}
}

export async function scheduleReminder(input: {
  id: string
  at: Date | number
  title: string
  body: string
}): Promise<void> {
  const native = nativeModule()
  if (!native) return
  const triggerAt = input.at instanceof Date ? input.at.getTime() : input.at
  if (!Number.isFinite(triggerAt)) return
  try {
    await native.scheduleAt(input.id, triggerAt, input.title, input.body, FIELD_REMINDER_CHANNEL)
  } catch {}
}

export async function cancelReminder(id: string): Promise<void> {
  const native = nativeModule()
  if (!native) return
  try {
    await native.cancel(id)
  } catch {}
}

export async function notifyNow(input: { id: string; title: string; body: string }): Promise<void> {
  const native = nativeModule()
  if (!native) return
  try {
    await native.notifyNow(input.id, input.title, input.body, FIELD_REMINDER_CHANNEL)
  } catch {}
}

/**
 * Whether Android has stopped putting this app to sleep.
 *
 * On a stationary phone with the screen off the system suspends the app's
 * network, and the day's route stops being recorded until something wakes it.
 * The outbox keeps those coordinates, so nothing is lost — but they arrive
 * twenty minutes late, and a manager watching the live map sees an agent who
 * has apparently stopped moving.
 *
 * Unknown counts as fine: a reading we cannot trust must not turn into a
 * banner an agent sees every morning.
 */
export async function batterySleepExempt(): Promise<boolean> {
  const native = nativeModule()
  if (!native?.isIgnoringBatteryOptimizations) return true
  try {
    return await native.isIgnoringBatteryOptimizations()
  } catch {
    return true
  }
}

/** Opens the system dialog. The answer is the agent's, and it is not assumed. */
export async function askBatterySleepExemption(): Promise<boolean> {
  const native = nativeModule()
  if (!native?.requestIgnoreBatteryOptimizations) return false
  try {
    return await native.requestIgnoreBatteryOptimizations()
  } catch {
    return false
  }
}
