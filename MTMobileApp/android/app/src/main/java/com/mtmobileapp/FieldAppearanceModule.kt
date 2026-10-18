package com.mtmobileapp

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Starts the app's JS again, so that every screen takes the phone's new day
 * or night colours (src/services/color-scheme-reload.ts decides when that is
 * safe). The session, the outbox and the workday live in storage and survive
 * it; nothing on the native side is touched.
 */
class FieldAppearanceModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FieldAppearance"

  @ReactMethod
  fun reload() {
    val application = reactApplicationContext.applicationContext as? ReactApplication ?: return
    UiThreadUtil.runOnUiThread {
      application.reactHost?.reload("phone colour scheme changed")
    }
  }
}
