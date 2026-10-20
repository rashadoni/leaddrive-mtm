package com.mtmobileapp

import android.content.res.Configuration
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The phone's day or night theme, asked of Android at the moment the app
 * comes back to the screen (src/services/follow-phone-color-scheme.ts).
 * React Native's Appearance answers from the last change it heard of; this
 * reads the configuration the app's window is drawn with now.
 */
class FieldAppearanceModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FieldAppearance"

  @ReactMethod
  fun colorScheme(promise: Promise) {
    val context = reactApplicationContext.currentActivity ?: reactApplicationContext
    val night = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    promise.resolve(if (night == Configuration.UI_MODE_NIGHT_YES) "dark" else "light")
  }
}
