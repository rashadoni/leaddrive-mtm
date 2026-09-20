package com.mtmobileapp

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.max

/**
 * Local notifications for the field app.
 *
 * The app had none: a visit could stay open for thirteen hours and nothing on
 * the phone said so, because the only thing that ever told an agent anything
 * was a screen they had to be looking at. These are on-device notifications —
 * no Google account, no server, nothing to install — so the reminders that
 * depend only on what the phone already knows work today. Server-sent pushes
 * (a manager's message, a route change) still need Firebase.
 *
 * Scheduling uses an inexact alarm on purpose: a reminder that the visit has
 * run long is useful within a couple of minutes and not worth the exact-alarm
 * permission Android 12+ asks for.
 */
class FieldNotificationsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FieldNotifications"

  private fun manager(): NotificationManager =
    reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun alarms(): AlarmManager =
    reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun requestCode(id: String): Int = id.hashCode()

  private fun alarmIntent(id: String, title: String, body: String, channelId: String): PendingIntent {
    val intent = Intent(reactContext, FieldNotificationReceiver::class.java).apply {
      action = "com.mtmobileapp.LOCAL_NOTIFICATION"
      // The id also namespaces the PendingIntent: rescheduling the same
      // reminder must replace the old alarm, never add a second one.
      data = android.net.Uri.parse("leaddrive-mtm://notification/$id")
      putExtra(EXTRA_ID, id)
      putExtra(EXTRA_TITLE, title)
      putExtra(EXTRA_BODY, body)
      putExtra(EXTRA_CHANNEL, channelId)
    }
    return PendingIntent.getBroadcast(
      reactContext,
      requestCode(id),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  @ReactMethod
  fun ensureChannel(channelId: String, name: String, description: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_DEFAULT).apply {
          this.description = description
        }
        manager().createNotificationChannel(channel)
      }
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("NOTIFICATION_CHANNEL_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun areNotificationsEnabled(promise: Promise) {
    try {
      promise.resolve(NotificationManagerCompat.from(reactContext).areNotificationsEnabled())
    } catch (error: Throwable) {
      promise.reject("NOTIFICATION_STATE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun notifyNow(id: String, title: String, body: String, channelId: String, promise: Promise) {
    try {
      FieldNotificationReceiver.post(reactContext, id, title, body, channelId)
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("NOTIFICATION_POST_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun scheduleAt(id: String, triggerAtMs: Double, title: String, body: String, channelId: String, promise: Promise) {
    try {
      val triggerAt = triggerAtMs.toLong()
      val delay = max(0L, triggerAt - System.currentTimeMillis())
      alarms().setWindow(
        AlarmManager.RTC_WAKEUP,
        System.currentTimeMillis() + delay,
        ALARM_WINDOW_MS,
        alarmIntent(id, title, body, channelId),
      )
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("NOTIFICATION_SCHEDULE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancel(id: String, promise: Promise) {
    try {
      alarms().cancel(alarmIntent(id, "", "", FieldNotificationReceiver.DEFAULT_CHANNEL))
      NotificationManagerCompat.from(reactContext).cancel(requestCode(id))
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject("NOTIFICATION_CANCEL_FAILED", error.message, error)
    }
  }

  companion object {
    const val EXTRA_ID = "notificationId"
    const val EXTRA_TITLE = "notificationTitle"
    const val EXTRA_BODY = "notificationBody"
    const val EXTRA_CHANNEL = "notificationChannel"
    /** Two minutes of slack; a long-visit reminder is not a stopwatch. */
    const val ALARM_WINDOW_MS = 2L * 60L * 1000L
  }
}

/**
 * Posts a scheduled reminder. Tapping it opens the app at its current screen;
 * the reminder never carries customer data in its text, so a locked screen
 * does not leak who the agent is visiting.
 */
class FieldNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(FieldNotificationsModule.EXTRA_ID) ?: return
    val title = intent.getStringExtra(FieldNotificationsModule.EXTRA_TITLE).orEmpty()
    val body = intent.getStringExtra(FieldNotificationsModule.EXTRA_BODY).orEmpty()
    val channel = intent.getStringExtra(FieldNotificationsModule.EXTRA_CHANNEL) ?: DEFAULT_CHANNEL
    post(context, id, title, body, channel)
  }

  companion object {
    const val DEFAULT_CHANNEL = "field-reminders"

    /**
     * Creating the channel before posting into it.
     *
     * On Android 8 and up `notify` into a channel that does not exist does
     * nothing at all — no error, no entry, nothing to see from the phone or
     * from the server, which already counted the push as delivered. The
     * channel used to be created by the Route screen, so a push that arrived
     * before an agent ever opened that tab, or after the system had dropped
     * the process, vanished. It is cheap to create: the call is a no-op when
     * the channel is already there, and it never overwrites what the agent
     * changed in Android settings.
     */
    fun ensureChannel(context: Context, channelId: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(channelId) != null) return
      manager.createNotificationChannel(
        NotificationChannel(
          channelId,
          context.getString(R.string.field_notifications_channel_name),
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = context.getString(R.string.field_notifications_channel_description) },
      )
    }

    fun post(context: Context, id: String, title: String, body: String, channelId: String) {
      val manager = NotificationManagerCompat.from(context)
      if (!manager.areNotificationsEnabled()) return
      ensureChannel(context, channelId)
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      val contentIntent = launch?.let {
        PendingIntent.getActivity(
          context,
          id.hashCode(),
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      }
      val notification = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .apply { contentIntent?.let { setContentIntent(it) } }
        .build()
      try {
        manager.notify(id.hashCode(), notification)
      } catch (_: SecurityException) {
        // POST_NOTIFICATIONS was revoked between the check and the post.
      }
    }
  }
}
