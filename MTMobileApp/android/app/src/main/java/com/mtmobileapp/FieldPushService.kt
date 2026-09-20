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
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val notification = message.notification
    val title = notification?.title ?: message.data["title"] ?: return
    val body = notification?.body ?: message.data["body"].orEmpty()
    val id = message.data["id"] ?: message.messageId ?: title
    val channel = message.data["channel"] ?: FieldNotificationReceiver.DEFAULT_CHANNEL
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

  override fun getName(): String = "FieldPush"

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
