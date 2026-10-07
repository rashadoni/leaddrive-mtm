package com.mtmobileapp

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Lets the app say what only it knows: that a request got no answer, or that
 * it is back on the screen. What happens to the connections is [FieldHttp]'s.
 */
class FieldNetworkModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "FieldNetwork"

  @ReactMethod
  fun dropConnections(includeBusy: Boolean, reason: String) {
    FieldHttp.reset(includeBusy, reason)
  }
}
