package com.mtmobileapp

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.asterinet.react.bgactions.RNBackgroundActionsTask

/**
 * Tracking that comes back by itself when the phone restarts or the app is
 * updated, while the workday is still open.
 *
 * Owner 2026-09-29: his S23 switched off on 27.09 at 17:30 in Madrid and was
 * on again on 28.09 at 19:43 — and the route stayed empty for two days with
 * the workday open: nothing started the app again. Android ends every process
 * on a restart and on an update (exit-info on that phone: eleven «PACKAGE
 * UPDATED» stops in a week), and tracking lived only as long as the process.
 *
 * JS leaves the notification texts here when it starts tracking an open
 * workday and clears them when the day ends, is paused or the agent signs out
 * (src/services/location.android.ts). On BOOT_COMPLETED / MY_PACKAGE_REPLACED:
 * - with «Allow all the time» the tracking service is started at once, as the
 *   task FieldResumeTracking; that JS task (src/services/tracking-resume.ts)
 *   re-reads the session and the workday and records again, or stops;
 * - without it Android does not let a location service start in the
 *   background, so the agent is told to open the app.
 */
object FieldTrackingResume {
  const val TASK_NAME = "FieldResumeTracking"
  private const val PREFS = "field_tracking_resume"
  private const val KEY_WANTED = "wanted"
  private const val KEY_TITLE = "title"
  private const val KEY_DESC = "desc"
  private const val KEY_STOPPED_TITLE = "stoppedTitle"
  private const val KEY_STOPPED_BODY = "stoppedBody"
  private const val REMINDER_CHANNEL = "field-reminders"
  private const val STOPPED_NOTICE = "field-tracking-stopped"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun remember(context: Context, title: String, desc: String, stoppedTitle: String, stoppedBody: String) {
    clearStoppedNotice(context)
    prefs(context).edit()
      .putBoolean(KEY_WANTED, true)
      .putString(KEY_TITLE, title)
      .putString(KEY_DESC, desc)
      .putString(KEY_STOPPED_TITLE, stoppedTitle)
      .putString(KEY_STOPPED_BODY, stoppedBody)
      .apply()
  }

  fun forget(context: Context) {
    prefs(context).edit().clear().apply()
  }

  fun resume(context: Context) {
    val prefs = prefs(context)
    if (!prefs.getBoolean(KEY_WANTED, false)) return
    if (mayTrackInBackground(context) && startTrackingService(context)) {
      clearStoppedNotice(context)
      return
    }
    FieldNotificationReceiver.post(
      context,
      STOPPED_NOTICE,
      prefs.getString(KEY_STOPPED_TITLE, null) ?: return,
      prefs.getString(KEY_STOPPED_BODY, null) ?: return,
      REMINDER_CHANNEL,
    )
  }

  /**
   * «The route is not being recorded» must not outlive the stop: tried on the
   * owner's phone 2026-09-29, the notice stayed after recording came back.
   * FieldNotificationReceiver.post numbers a notice by its id's hash.
   */
  private fun clearStoppedNotice(context: Context) {
    NotificationManagerCompat.from(context).cancel(STOPPED_NOTICE.hashCode())
  }

  private fun granted(context: Context, permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  /** Location «all the time»: before Android 10 «while in use» was the same grant. */
  fun mayTrackInBackground(context: Context): Boolean {
    val foreground = granted(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
      granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (!foreground) return false
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
  }

  /**
   * The same service react-native-background-actions 4.1.0 starts from JS,
   * with the extras its BackgroundTaskOptions reads. Started from the
   * broadcast itself: the exemption for a background start lasts seconds, and
   * a JS engine that has to boot first would miss it.
   */
  private fun startTrackingService(context: Context): Boolean {
    val prefs = prefs(context)
    val extras = Bundle().apply {
      putString("taskName", TASK_NAME)
      putString("taskTitle", prefs.getString(KEY_TITLE, null) ?: "LeadDrive")
      putString("taskDesc", prefs.getString(KEY_DESC, null) ?: "")
      putInt("iconInt", context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName))
      putInt("color", Color.parseColor("#08705A"))
      putString("linkingURI", "mtm://")
      putStringArrayList("foregroundServiceType", arrayListOf("location"))
    }
    return try {
      ContextCompat.startForegroundService(context, Intent(context, RNBackgroundActionsTask::class.java).putExtras(extras))
      true
    } catch (_: Exception) {
      // ForegroundServiceStartNotAllowedException or a missing grant: tell the agent instead.
      false
    }
  }
}

class FieldTrackingResumeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> FieldTrackingResume.resume(context)
    }
  }
}
