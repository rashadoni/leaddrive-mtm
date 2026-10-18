package com.mtmobileapp

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

/**
 * Server-sent notifications.
 *
 * Firebase addresses a phone by a token it issues and rotates on its own, so
 * the app asks for the current token, sends it to the server, and re-sends it
 * whenever Firebase replaces it. A token is an address, not a credential: it
 * says which phone to knock on, and whatever the agent then reads still comes
 * from our server under their own session.
 *
 * The payload carries a title and a body and nothing else. A push can appear
 * on a locked screen in front of whoever the agent is visiting, so the
 * customer's name belongs in the app, not in the notification.
 */
class FieldPushService : FirebaseMessagingService() {

  override fun onNewToken(token: String) {
    // JS registers the token with the server on its next start; storing it
    // here keeps a token that arrived while the app was closed.
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PENDING_TOKEN, token).apply()
    // And tell the running app at once, so a token rotated while it is open
    // reaches the server now, not at the next start.
    FieldPushModule.announceToken(token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val notification = message.notification
    val title = notification?.title ?: message.data["title"] ?: return
    val body = notification?.body ?: message.data["body"].orEmpty()
    val id = message.data["id"] ?: message.messageId ?: title
    // While the app is open Firebase hands the push here instead of drawing it.
    // A team message pops up like a chat message; the rest stay reminders.
    val channel = message.data["channel"]
      ?: if (message.data["target"] == "Messages") FieldNotificationReceiver.TEAM_MESSAGES_CHANNEL else FieldNotificationReceiver.DEFAULT_CHANNEL
    // The bell in the open app asks the server again, whether or not the
    // phone is allowed to draw the notification.
    FieldPushModule.announceMessage()
    if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return
    FieldNotificationReceiver.post(this, id, title, body, channel)
  }

  companion object {
    const val PREFS = "field_push"
    const val KEY_PENDING_TOKEN = "pending_token"
  }
}

/** The JS side of the same thing: read the token, read what arrived while closed. */
class FieldPushModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  init {
    active = WeakReference(reactContext)
  }

  override fun getName(): String = "FieldPush"

  /** NativeEventEmitter bookkeeping; the event goes out through DeviceEventEmitter. */
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    const val TOKEN_REFRESH_EVENT = "FieldPushTokenRefresh"
    const val MESSAGE_EVENT = "FieldPushMessage"
    @Volatile private var active: WeakReference<ReactApplicationContext>? = null

    /** Best effort: with no live JS the token waits in prefs for the next start. */
    fun announceToken(token: String) {
      val context = active?.get() ?: return
      try {
        if (!context.hasActiveReactInstance()) return
        val payload = Arguments.createMap()
        payload.putString("token", token)
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(TOKEN_REFRESH_EVENT, payload)
      } catch (error: Throwable) {
        // The pending token in prefs is still there.
      }
    }

    /** Best effort, no payload: what arrived is read from the server under the session. */
    fun announceMessage() {
      val context = active?.get() ?: return
      try {
        if (!context.hasActiveReactInstance()) return
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(MESSAGE_EVENT, null)
      } catch (error: Throwable) {
        // The bell refreshes on its own at the next focus.
      }
    }
  }

  @ReactMethod
  fun getToken(promise: Promise) {
    try {
      FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token -> promise.resolve(token) }
        // A device without Play services, or offline at the wrong moment,
        // simply has no token yet. That is not an error worth showing an
        // agent standing in a clinic.
        .addOnFailureListener { promise.resolve(null) }
    } catch (error: Throwable) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun consumePendingToken(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(FieldPushService.PREFS, Context.MODE_PRIVATE)
      val token = prefs.getString(FieldPushService.KEY_PENDING_TOKEN, null)
      if (token != null) prefs.edit().remove(FieldPushService.KEY_PENDING_TOKEN).apply()
      promise.resolve(token)
    } catch (error: Throwable) {
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun deleteToken(promise: Promise) {
    try {
      FirebaseMessaging.getInstance().deleteToken()
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { promise.resolve(false) }
    } catch (error: Throwable) {
      promise.resolve(false)
    }
  }
}
